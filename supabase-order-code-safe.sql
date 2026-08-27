-- WEB3 — CẤP MÃ ĐƠN TUẦN TỰ, KHÔNG GẮN TRIGGER VÀO SOURCE CŨ
--
-- AN TOÀN KHI TRIỂN KHAI:
-- 1. File này không thay đổi order_code của lệnh INSERT cũ.
-- 2. Website source cũ vẫn tạo đơn/thanh toán như trước nếu SQL chạy trước.
-- 3. Source mới gọi RPC này và nhận đúng mã thực tế đã lưu trong database.
-- 4. Không đụng invoices, contracts, PayOS, webhook, Account hoặc Admin.

begin;

-- Bảo đảm trigger gây lệch mã của migration cũ không còn hoạt động.
drop trigger if exists a_assign_next_order_code on public.orders;

create or replace function public.create_order_with_sequential_code(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max numeric(30,0) := 0;
  v_next numeric(30,0);
  v_width integer := 10;
  v_digits text;
  v_order_code text;
  v_customer_name text := nullif(trim(p_order ->> 'customer_name'),'');
  v_service_type text := nullif(trim(p_order ->> 'service_type'),'');
begin
  if v_customer_name is null then
    raise exception 'Vui lòng nhập họ tên.' using errcode = '22023';
  end if;
  if v_service_type is null then
    raise exception 'Vui lòng chọn dịch vụ.' using errcode = '22023';
  end if;

  -- Khóa riêng bảng orders trong đúng transaction tạo đơn. Vì vậy hai request
  -- đồng thời không thể cùng đọc một mã lớn nhất, nhưng không cần trigger.
  lock table public.orders in share row exclusive mode;

  select
    coalesce(max(digits::numeric),0),
    greatest(coalesce(max(length(digits)),10),10)
  into v_max,v_width
  from (
    select regexp_replace(coalesce(order_code,''),'[^0-9]','','g') as digits
    from public.orders
  ) parsed
  where digits ~ '^[0-9]{1,30}$';

  v_next := v_max + 1;
  v_width := greatest(v_width,length(v_next::text));
  v_digits := lpad(v_next::text,v_width,'0');

  if length(v_digits) > 4 then
    v_order_code := 'DH-' || left(v_digits,length(v_digits)-4)
      || '-' || right(v_digits,4);
  else
    v_order_code := 'DH-' || v_digits;
  end if;

  insert into public.orders (
    order_code,customer_name,email,phone,service_type,description,budget,deadline,
    amount,payment_type,total_price,payment_method,user_id,
    order_group,platform,server_name,server_note,interaction_type,
    quantity,post_link,start_date
  ) values (
    v_order_code,
    v_customer_name,
    nullif(trim(p_order ->> 'email'),''),
    nullif(trim(p_order ->> 'phone'),''),
    v_service_type,
    coalesce(p_order ->> 'description',''),
    nullif(p_order ->> 'budget',''),
    nullif(p_order ->> 'deadline','')::date,
    nullif(p_order ->> 'amount','')::numeric,
    nullif(p_order ->> 'payment_type',''),
    nullif(p_order ->> 'total_price','')::numeric,
    nullif(p_order ->> 'payment_method',''),
    auth.uid(),
    nullif(p_order ->> 'order_group',''),
    nullif(p_order ->> 'platform',''),
    nullif(p_order ->> 'server_name',''),
    nullif(p_order ->> 'server_note',''),
    nullif(p_order ->> 'interaction_type',''),
    nullif(p_order ->> 'quantity','')::integer,
    nullif(p_order ->> 'post_link',''),
    nullif(p_order ->> 'start_date','')::date
  );

  return jsonb_build_object('order_code',v_order_code);
end;
$$;

revoke all on function public.create_order_with_sequential_code(jsonb) from public;
grant execute on function public.create_order_with_sequential_code(jsonb) to anon,authenticated;

commit;
