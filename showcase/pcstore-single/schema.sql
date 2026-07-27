-- =========================================================
-- PC STORE — SUPABASE SCHEMA
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- =========================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- =========================================================
-- 2. BẢNG HỒ SƠ NGƯỜI DÙNG (mở rộng auth.users)
-- role: customer | staff | admin
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  role text not null default 'customer' check (role in ('customer','staff','admin')),
  created_at timestamptz not null default now()
);

-- Tự tạo profile khi có user mới đăng ký
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'customer');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- 3. DANH MỤC & SẢN PHẨM
-- =========================================================
create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  category_id uuid references public.categories(id),
  brand text,
  price numeric(12,0) not null default 0,      -- giá VND
  sale_price numeric(12,0),                     -- giá khuyến mãi (nullable)
  stock int not null default 0,
  image_url text,
  specs jsonb default '{}'::jsonb,               -- {"CPU":"i7-14700K","RAM":"32GB",...}
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_category on public.products(category_id);

-- =========================================================
-- 4. GIỎ HÀNG
-- =========================================================
create table if not exists public.cart_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
);

-- =========================================================
-- 5. ĐƠN HÀNG
-- status: pending -> confirmed -> packing -> shipping -> delivered / cancelled
-- =========================================================
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null default ('PC' || to_char(now(),'YYMMDDHH24MISS') || substr(md5(random()::text),1,4)),
  user_id uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending','confirmed','packing','shipping','delivered','cancelled')),
  payment_method text not null default 'cod' check (payment_method in ('cod','bank_transfer','card')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  subtotal numeric(12,0) not null default 0,
  shipping_fee numeric(12,0) not null default 0,
  total numeric(12,0) not null default 0,
  receiver_name text not null,
  receiver_phone text not null,
  receiver_address text not null,
  note text,
  assigned_staff uuid references auth.users(id),   -- nhân viên xử lý đơn
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,      -- lưu lại tên/giá tại thời điểm mua
  unit_price numeric(12,0) not null,
  quantity int not null check (quantity > 0)
);

-- Lịch sử trạng thái đơn hàng (để "theo dõi đơn hàng")
create table if not exists public.order_status_history (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.log_order_status()
returns trigger as $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into public.order_status_history(order_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_order_status on public.orders;
create trigger trg_order_status
  before insert or update on public.orders
  for each row execute procedure public.log_order_status();

-- =========================================================
-- 6. THANH TOÁN (bản ghi giao dịch, mô phỏng cổng thanh toán)
-- =========================================================
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,0) not null,
  method text not null,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  transaction_ref text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 7. HÀM TIỆN ÍCH: kiểm tra vai trò
-- =========================================================
create or replace function public.is_staff_or_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff','admin')
  );
$$ language sql security definer stable;

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- =========================================================
-- 8. ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;

-- PROFILES
create policy "profiles_select_own_or_staff" on public.profiles
  for select using (id = auth.uid() or public.is_staff_or_admin());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());
create policy "profiles_admin_update_any" on public.profiles
  for update using (public.is_admin());

-- CATEGORIES & PRODUCTS (ai cũng xem được, chỉ staff/admin sửa)
create policy "categories_public_read" on public.categories for select using (true);
create policy "categories_staff_write" on public.categories for all using (public.is_staff_or_admin());

create policy "products_public_read" on public.products for select using (is_active = true or public.is_staff_or_admin());
create policy "products_staff_write" on public.products for all using (public.is_staff_or_admin());

-- CART (chỉ chủ sở hữu)
create policy "cart_owner_all" on public.cart_items for all using (user_id = auth.uid());

-- ORDERS
create policy "orders_owner_select" on public.orders for select
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy "orders_owner_insert" on public.orders for insert
  with check (user_id = auth.uid());
create policy "orders_staff_update" on public.orders for update
  using (public.is_staff_or_admin() or (user_id = auth.uid() and status = 'pending'));

-- ORDER ITEMS
create policy "order_items_select" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff_or_admin())));
create policy "order_items_insert" on public.order_items for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- ORDER STATUS HISTORY
create policy "order_history_select" on public.order_status_history for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff_or_admin())));

-- PAYMENTS
create policy "payments_select" on public.payments for select
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_staff_or_admin())));
create policy "payments_insert" on public.payments for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "payments_staff_update" on public.payments for update using (public.is_staff_or_admin());

-- =========================================================
-- 9. DỮ LIỆU MẪU (tuỳ chọn — có thể xoá)
-- =========================================================
insert into public.categories (name, slug) values
  ('CPU','cpu'), ('Mainboard','mainboard'), ('VGA','vga'),
  ('RAM','ram'), ('Ổ cứng SSD','ssd'), ('PC Build sẵn','pc-build')
on conflict (slug) do nothing;

-- Ghi chú: sau khi tài khoản admin đầu tiên đăng ký, hãy nâng quyền thủ công:
-- update public.profiles set role = 'admin' where id = '<uuid-cua-ban>';
