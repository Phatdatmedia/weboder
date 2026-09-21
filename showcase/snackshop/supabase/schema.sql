-- ============================================================
-- SNACK SHOP - SUPABASE SCHEMA
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "pgcrypto";

-- ---------- TABLES ----------

-- Hồ sơ người dùng (mở rộng auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Danh mục đồ ăn vặt
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Sản phẩm / món ăn vặt
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  short_desc text,
  description text,
  price numeric(12,0) not null default 0,
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  stock int not null default 100,
  created_at timestamptz not null default now()
);

-- Đơn hàng (hỗ trợ cả khách vãng lai lẫn tài khoản)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_name text,
  guest_phone text,
  guest_address text,
  note text,
  status text not null default 'pending', -- pending | confirmed | shipping | done | cancelled
  total numeric(12,0) not null default 0,
  created_at timestamptz not null default now()
);

-- Cột thanh toán (idempotent — an toàn khi chạy lại trên project đã có sẵn bảng orders)
alter table public.orders add column if not exists payment_method text not null default 'cod'; -- cod | bank_transfer | payos
alter table public.orders add column if not exists payment_status text not null default 'unpaid'; -- unpaid | paid

-- Chi tiết đơn hàng
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  price numeric(12,0) not null,
  quantity int not null default 1
);

-- Ảnh phụ (gallery) cho sản phẩm — ảnh chính vẫn nằm ở products.image_url
create table if not exists public.product_gallery (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Phân loại sản phẩm (ví dụ: Hộp 4 bánh / Hộp 8 bánh, size, vị...)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  price numeric(12,0) not null default 0,
  stock int not null default 100,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Đánh giá sản phẩm
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  reviewer_name text not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ---------- HELPER: is_admin() ----------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- RPC: tạo đơn hàng (khách vãng lai hoặc đã đăng nhập) ----------
-- Dùng RPC thay vì insert trực tiếp vì: (1) khách vãng lai không có quyền
-- SELECT lại đơn vừa tạo (RLS chặn), khiến .select().single() phía client lỗi;
-- (2) giá được tra lại từ bảng products ở server, tránh khách sửa giá trong localStorage.
-- Xoá phiên bản cũ (5 tham số) vì đổi chữ ký hàm không thể "create or replace" trực tiếp
drop function if exists public.create_order(text, text, text, text, jsonb);
create or replace function public.create_order(
  p_guest_name text,
  p_guest_phone text,
  p_guest_address text,
  p_note text,
  p_items jsonb, -- [{"product_id": "...", "quantity": 2}, ...]
  p_payment_method text default 'cod' -- cod | bank_transfer | payos
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid := gen_random_uuid();
  v_total numeric := 0;
  v_item jsonb;
  v_product record;
  v_variant record;
  v_qty int;
  v_line_name text;
  v_line_price numeric;
  v_payment_method text := coalesce(nullif(p_payment_method, ''), 'cod');
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Giỏ hàng đang trống';
  end if;

  insert into public.orders (id, user_id, guest_name, guest_phone, guest_address, note, total, status, payment_method, payment_status)
  values (v_order_id, auth.uid(), p_guest_name, p_guest_phone, p_guest_address, p_note, 0, 'pending', v_payment_method, 'unpaid');

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(1, coalesce((v_item->>'quantity')::int, 1));

    if (v_item->>'variant_id') is not null then
      -- Dòng có chọn phân loại: giá và tên lấy từ product_variants (kèm tên sản phẩm gốc)
      select pv.id, pv.name, pv.price, p.name as product_name
      into v_variant
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.id = (v_item->>'variant_id')::uuid;

      if v_variant.id is null then
        continue; -- phân loại không tồn tại
      end if;

      v_line_name := v_variant.product_name || ' - ' || v_variant.name;
      v_line_price := v_variant.price;
    else
      select id, name, price into v_product
      from public.products
      where id = (v_item->>'product_id')::uuid and is_available = true;

      if v_product.id is null then
        continue; -- bỏ qua sản phẩm không tồn tại / đã ngừng bán
      end if;

      v_line_name := v_product.name;
      v_line_price := v_product.price;
    end if;

    insert into public.order_items (order_id, product_id, product_name, price, quantity)
    values (v_order_id, (v_item->>'product_id')::uuid, v_line_name, v_line_price, v_qty);

    v_total := v_total + v_line_price * v_qty;
  end loop;

  if v_total = 0 then
    raise exception 'Không có sản phẩm hợp lệ trong đơn hàng';
  end if;

  update public.orders set total = v_total where id = v_order_id;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(text, text, text, text, jsonb, text) to anon, authenticated;

-- ---------- RPC: tra cứu đơn hàng cho khách (không cần đăng nhập) ----------
-- Xoá phiên bản cũ vì thay đổi cột trả về (return table) không thể "create or replace" trực tiếp
drop function if exists public.track_order(uuid, text);
create or replace function public.track_order(p_order_id uuid, p_phone text)
returns table (
  id uuid,
  status text,
  total numeric,
  payment_method text,
  payment_status text,
  created_at timestamptz,
  items jsonb
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.status, o.total, o.payment_method, o.payment_status, o.created_at,
    (select jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'price', oi.price,
        'quantity', oi.quantity
      )) from public.order_items oi where oi.order_id = o.id)
  from public.orders o
  where o.id = p_order_id
    and (o.guest_phone = p_phone or exists (
      select 1 from public.profiles p where p.id = o.user_id and p.phone = p_phone
    ));
$$;

grant execute on function public.track_order(uuid, text) to anon, authenticated;

-- ---------- RPC: thống kê doanh thu theo tháng (chỉ đơn đã thanh toán) ----------
create or replace function public.admin_revenue_summary()
returns table (
  month text,        -- 'YYYY-MM'
  order_count bigint,
  revenue numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Không có quyền truy cập';
  end if;

  return query
    select
      to_char(date_trunc('month', o.created_at), 'YYYY-MM') as month,
      count(*)::bigint as order_count,
      sum(o.total) as revenue
    from public.orders o
    where o.payment_status = 'paid'
    group by date_trunc('month', o.created_at)
    order by date_trunc('month', o.created_at) desc;
end;
$$;

grant execute on function public.admin_revenue_summary() to authenticated;

-- ---------- ENABLE RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.product_gallery enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_reviews enable row level security;

-- ---------- POLICIES: profiles ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- POLICIES: categories (đọc công khai, admin ghi) ----------
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all" on public.categories
  for select using (true);

drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- POLICIES: products (đọc công khai, admin ghi) ----------
drop policy if exists "products_select_all" on public.products;
create policy "products_select_all" on public.products
  for select using (true);

drop policy if exists "products_write_admin" on public.products;
create policy "products_write_admin" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- POLICIES: orders ----------
-- Đơn hàng được tạo qua RPC create_order() (chạy với quyền bypass RLS),
-- nên insert trực tiếp qua API chỉ dành cho admin.
drop policy if exists "orders_insert_anyone" on public.orders;
drop policy if exists "orders_insert_admin" on public.orders;
create policy "orders_insert_admin" on public.orders
  for insert with check (public.is_admin());

-- Chỉ chủ đơn (đã đăng nhập) hoặc admin mới xem được qua select trực tiếp
drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin" on public.orders
  for select using (auth.uid() = user_id or public.is_admin());

-- Chỉ admin được cập nhật trạng thái đơn
drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin" on public.orders
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------- POLICIES: order_items ----------
drop policy if exists "order_items_insert_anyone" on public.order_items;
drop policy if exists "order_items_insert_admin" on public.order_items;
create policy "order_items_insert_admin" on public.order_items
  for insert with check (public.is_admin());

drop policy if exists "order_items_select_own_or_admin" on public.order_items;
create policy "order_items_select_own_or_admin" on public.order_items
  for select using (
    public.is_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()
    )
  );

-- ---------- POLICIES: product_gallery / product_variants (đọc công khai, admin ghi) ----------
drop policy if exists "product_gallery_select_all" on public.product_gallery;
create policy "product_gallery_select_all" on public.product_gallery
  for select using (true);

drop policy if exists "product_gallery_write_admin" on public.product_gallery;
create policy "product_gallery_write_admin" on public.product_gallery
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "product_variants_select_all" on public.product_variants;
create policy "product_variants_select_all" on public.product_variants
  for select using (true);

drop policy if exists "product_variants_write_admin" on public.product_variants;
create policy "product_variants_write_admin" on public.product_variants
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- POLICIES: product_reviews (đọc công khai, ai cũng đánh giá được, admin xoá) ----------
drop policy if exists "product_reviews_select_all" on public.product_reviews;
create policy "product_reviews_select_all" on public.product_reviews
  for select using (true);

drop policy if exists "product_reviews_insert_anyone" on public.product_reviews;
create policy "product_reviews_insert_anyone" on public.product_reviews
  for insert with check (
    char_length(trim(reviewer_name)) > 0
    and rating between 1 and 5
    and char_length(coalesce(comment, '')) <= 1000
  );

drop policy if exists "product_reviews_delete_admin" on public.product_reviews;
create policy "product_reviews_delete_admin" on public.product_reviews
  for delete using (public.is_admin());

-- ---------- STORAGE (ảnh sản phẩm) ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_write" on storage.objects;
create policy "product_images_admin_write" on storage.objects
  for all using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

-- ============================================================
-- CẤU HÌNH CHUNG (logo, banner, thanh toán) — trang admin/settings.html
-- ============================================================

-- Cấu hình công khai: logo, banner mặc định, thông tin ngân hàng để tạo mã QR
-- (thông tin STK vốn đã hiển thị công khai cho khách khi chuyển khoản nên để select công khai)
create table if not exists public.site_settings (
  id int primary key default 1,
  logo_url text,
  logo_text text not null default 'Vặt Ơi',
  bank_id text not null default '970436',
  bank_account_no text not null default '0000000000',
  bank_account_name text not null default 'NGUYEN VAN A',
  payos_enabled boolean not null default false,
  about_text text not null default 'Đồ ăn vặt online — tuyển chọn những món ngon, đóng gói cẩn thận và giao tận nơi.',
  contact_address text,
  contact_phone text,
  contact_email text,
  contact_hours text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  zalo_url text,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 1)
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings add column if not exists about_text text not null default 'Đồ ăn vặt online — tuyển chọn những món ngon, đóng gói cẩn thận và giao tận nơi.';
alter table public.site_settings add column if not exists contact_address text;
alter table public.site_settings add column if not exists contact_phone text;
alter table public.site_settings add column if not exists contact_email text;
alter table public.site_settings add column if not exists contact_hours text;
alter table public.site_settings add column if not exists facebook_url text;
alter table public.site_settings add column if not exists instagram_url text;
alter table public.site_settings add column if not exists tiktok_url text;
alter table public.site_settings add column if not exists zalo_url text;

-- Khoá bí mật PayOS — KHÔNG được đọc công khai, chỉ admin (và service role trong Edge Function)
create table if not exists public.site_settings_secret (
  id int primary key default 1,
  payos_client_id text,
  payos_api_key text,
  payos_checksum_key text,
  updated_at timestamptz not null default now(),
  constraint site_settings_secret_singleton check (id = 1)
);

insert into public.site_settings_secret (id) values (1) on conflict (id) do nothing;

-- Banner trang chủ (hero carousel) — thay cho 3 ảnh Unsplash hardcode trước đây
create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  eyebrow text,
  title text,
  subtitle text,
  button_text text,
  button_link text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.site_settings_secret enable row level security;
alter table public.site_banners enable row level security;

drop policy if exists "site_settings_select_all" on public.site_settings;
create policy "site_settings_select_all" on public.site_settings
  for select using (true);

drop policy if exists "site_settings_write_admin" on public.site_settings;
create policy "site_settings_write_admin" on public.site_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site_settings_secret_admin_only" on public.site_settings_secret;
create policy "site_settings_secret_admin_only" on public.site_settings_secret
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "site_banners_select_all" on public.site_banners;
create policy "site_banners_select_all" on public.site_banners
  for select using (true);

drop policy if exists "site_banners_write_admin" on public.site_banners;
create policy "site_banners_write_admin" on public.site_banners
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- STORAGE (ảnh logo + banner) ----------
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "site_images_public_read" on storage.objects;
create policy "site_images_public_read" on storage.objects
  for select using (bucket_id = 'site-images');

drop policy if exists "site_images_admin_write" on storage.objects;
create policy "site_images_admin_write" on storage.objects
  for all using (bucket_id = 'site-images' and public.is_admin())
  with check (bucket_id = 'site-images' and public.is_admin());



-- ---------- THỐNG KÊ LƯỢT TRUY CẬP ----------
create table if not exists public.traffic_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  session_id text not null,
  page_url text not null,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists traffic_events_created_at_idx on public.traffic_events(created_at desc);
create index if not exists traffic_events_visitor_id_idx on public.traffic_events(visitor_id);

alter table public.traffic_events enable row level security;
drop policy if exists "traffic_events_no_direct_insert" on public.traffic_events;
drop policy if exists "traffic_events_admin_read" on public.traffic_events;
create policy "traffic_events_admin_read" on public.traffic_events
  for select using (public.is_admin());

create or replace function public.record_traffic_visit(
  p_visitor_id text,
  p_session_id text,
  p_page_url text,
  p_referrer text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_visitor_id), '') = '' or coalesce(trim(p_session_id), '') = '' or coalesce(trim(p_page_url), '') = '' then
    return false;
  end if;
  insert into public.traffic_events(visitor_id, session_id, page_url, referrer)
  values (left(trim(p_visitor_id), 120), left(trim(p_session_id), 120), left(trim(p_page_url), 500), left(coalesce(p_referrer,''), 1000));
  return true;
end;
$$;

grant execute on function public.record_traffic_visit(text,text,text,text) to anon, authenticated;

create or replace function public.admin_traffic_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today bigint;
  v_7 bigint;
  v_30 bigint;
  v_unique bigint;
  v_daily jsonb;
begin
  if not public.is_admin() then raise exception 'Không có quyền quản trị'; end if;
  select count(*) into v_today from public.traffic_events where created_at >= date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
  select count(*) into v_7 from public.traffic_events where created_at >= now() - interval '7 days';
  select count(*) into v_30 from public.traffic_events where created_at >= now() - interval '30 days';
  select count(distinct visitor_id) into v_unique from public.traffic_events where created_at >= now() - interval '30 days';
  select coalesce(jsonb_agg(x order by x.day desc), '[]'::jsonb) into v_daily
  from (
    select (created_at at time zone 'Asia/Ho_Chi_Minh')::date::text as day,
           count(*)::bigint as views,
           count(distinct visitor_id)::bigint as unique_visitors
    from public.traffic_events
    where created_at >= now() - interval '30 days'
    group by 1
  ) x;
  return jsonb_build_object('today',v_today,'last7',v_7,'last30',v_30,'unique30',v_unique,'daily',v_daily);
end;
$$;

grant execute on function public.admin_traffic_summary() to authenticated;

-- ---------- SEED DỮ LIỆU MẪU (tuỳ chọn) ----------
insert into public.categories (name, slug, sort_order) values
  ('Bánh snack', 'banh-snack', 1),
  ('Trái cây sấy', 'trai-cay-say', 2),
  ('Đồ ăn vặt cay', 'do-an-vat-cay', 3),
  ('Kẹo & Mứt', 'keo-mut', 4)
on conflict (slug) do nothing;

-- Sau khi tạo tài khoản admin đầu tiên, chạy lệnh dưới (thay email của bạn):
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'admin@example.com');
