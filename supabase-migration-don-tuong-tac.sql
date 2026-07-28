-- =====================================================================
-- MIGRATION: Đơn tương tác MXH + Bảng giá
-- Chạy toàn bộ nội dung file này trong Supabase SQL Editor (1 lần).
-- =====================================================================

-- 1) Thêm cột chi tiết vào bảng "orders" đã có sẵn.
--    Không ảnh hưởng dữ liệu/đơn hàng cũ (mặc định NULL).
--    order_group = 'social_ads' dùng để tab "Đơn tương tác" trong admin.html
--    lọc riêng ra khỏi các đơn dịch vụ khác (web/slide/profile...).
alter table public.orders
  add column if not exists order_group     text,
  add column if not exists platform        text,
  add column if not exists interaction_type text,
  add column if not exists quantity        integer,
  add column if not exists post_link       text,
  add column if not exists start_date      date;

-- 2) Bảng giá tương tác (nền tảng x loại tương tác -> đơn giá / 1 lượt).
--    Trang đặt đơn công khai đọc bảng này để tự tính báo giá tạm tính.
--    Admin quản lý (thêm/sửa/xoá) trong admin.html, tab "Đơn tương tác".
create table if not exists public.social_ads_pricing (
  id                bigint generated always as identity primary key,
  platform          text not null,
  interaction_type  text not null,
  interaction_label text not null,
  unit_price        numeric not null default 0,
  sort_order        int default 0,
  updated_at        timestamptz not null default now(),
  unique (platform, interaction_type)
);

alter table public.social_ads_pricing enable row level security;

-- Ai cũng đọc được giá (trang đặt đơn công khai, kể cả khách vãng lai chưa đăng nhập)
drop policy if exists "Public can read pricing" on public.social_ads_pricing;
create policy "Public can read pricing" on public.social_ads_pricing
  for select using (true);

-- Chỉ admin (profiles.is_admin = true) mới được thêm/sửa/xoá giá
-- (dùng đúng pattern RLS admin đang áp dụng cho site_config)
drop policy if exists "Admin manage pricing" on public.social_ads_pricing;
create policy "Admin manage pricing" on public.social_ads_pricing
  for all using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- 3) Dữ liệu giá mẫu ban đầu (khớp với bộ giá tạm đang có trong code).
--    Sau khi chạy xong, vào admin.html > "Đơn tương tác" để chỉnh lại cho đúng giá thật.
insert into public.social_ads_pricing (platform, interaction_type, interaction_label, unit_price, sort_order) values
  ('Facebook',  'Like',    'Tăng like',      15, 1),
  ('Facebook',  'Follow',  'Tăng follow',    20, 2),
  ('Facebook',  'Comment', 'Tăng bình luận', 60, 3),
  ('Facebook',  'Share',   'Tăng chia sẻ',   25, 4),
  ('Facebook',  'View',    'Tăng lượt xem',   5, 5),
  ('Instagram', 'Like',    'Tăng like',      12, 1),
  ('Instagram', 'Follow',  'Tăng follow',    25, 2),
  ('Instagram', 'Comment', 'Tăng bình luận', 65, 3),
  ('Instagram', 'Share',   'Tăng chia sẻ',   20, 4),
  ('Instagram', 'View',    'Tăng lượt xem',   6, 5),
  ('TikTok',    'Like',    'Tăng like',      10, 1),
  ('TikTok',    'Follow',  'Tăng follow',    22, 2),
  ('TikTok',    'Comment', 'Tăng bình luận', 55, 3),
  ('TikTok',    'Share',   'Tăng chia sẻ',   18, 4),
  ('TikTok',    'View',    'Tăng lượt xem',   4, 5),
  ('YouTube',   'Like',    'Tăng like',      25, 1),
  ('YouTube',   'Follow',  'Tăng follow',    40, 2),
  ('YouTube',   'Comment', 'Tăng bình luận', 90, 3),
  ('YouTube',   'Share',   'Tăng chia sẻ',   30, 4),
  ('YouTube',   'View',    'Tăng lượt xem',   8, 5)
on conflict (platform, interaction_type) do nothing;

-- 4) (Khuyến nghị) Bật Realtime cho bảng social_ads_pricing và orders
--    trong Database > Replication, để admin.html cập nhật tức thời khi có đơn mới.
