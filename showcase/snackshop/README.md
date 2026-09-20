# Vặt Ơi — Website bán đồ ăn vặt

Website tĩnh (HTML/CSS/JS) dùng Supabase làm backend (database, auth, storage).
Không cần build tool — deploy trực tiếp lên GitHub Pages hoặc bất kỳ static hosting nào.

## Cấu trúc thư mục

```
snackshop/
├── index.html              # Trang chủ: danh sách món, modal chi tiết, giỏ hàng
├── checkout.html           # Trang đặt hàng
├── order-success.html      # Xác nhận đặt hàng thành công
├── track-order.html        # Tra cứu đơn hàng (không cần đăng nhập)
├── css/style.css
├── js/
│   ├── supabase-client.js  # Cấu hình Supabase + hàm giỏ hàng dùng chung
│   ├── main.js              # Logic trang chủ
│   └── checkout.js
├── account/                # KHU VỰC KHÁCH HÀNG
│   ├── login.html
│   ├── register.html
│   ├── profile.html        # Hồ sơ + lịch sử đơn hàng
│   └── account.js
├── admin/                  # KHU VỰC QUẢN TRỊ (tách riêng hoàn toàn)
│   ├── index.html           # Đăng nhập admin
│   ├── products.html        # Quản lý sản phẩm (thêm/sửa/xoá, upload ảnh)
│   ├── orders.html           # Quản lý đơn hàng, cập nhật trạng thái
│   ├── admin.js
│   └── admin.css
└── supabase/
    └── schema.sql            # Toàn bộ schema + RLS + RPC
```

## Cài đặt

### 1. Tạo project Supabase
- Vào https://supabase.com → tạo project mới.
- Vào **SQL Editor**, dán toàn bộ nội dung file `supabase/schema.sql` và chạy (Run).
  - Lệnh này tạo bảng `profiles, categories, products, orders, order_items`,
    hàm `is_admin()`, RPC `track_order()`, bucket ảnh `product-images`, và toàn bộ RLS policy.

### 2. Kết nối frontend với Supabase
Mở file `js/supabase-client.js`, thay 2 dòng đầu bằng thông tin project của bạn
(lấy ở **Project Settings → API**):

```js
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

### 3. Tạo tài khoản admin đầu tiên
1. Vào trang `account/register.html` trên website (hoặc bảng Authentication trong
   Supabase Dashboard) để tạo 1 tài khoản.
2. Trong Supabase SQL Editor, chạy lệnh sau (thay email của bạn):
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'admin@example.com');
   ```
3. Đăng nhập tại `admin/index.html` bằng tài khoản đó.

### 4. Thêm sản phẩm
Vào `admin/products.html` → **+ Thêm sản phẩm** → upload ảnh, nhập tên, giá,
mô tả ngắn (hiện ở danh sách) và mô tả chi tiết (hiện khi khách click vào ảnh).

## Thanh toán

Có 3 phương thức khi khách đặt hàng:
- **COD** — thanh toán khi nhận hàng (mặc định).
- **Chuyển khoản QR** — dùng mã QR VietQR (miễn phí, không cần đăng ký gì thêm).
  Mở file `js/payment-config.js`, điền `BANK_ID` (mã BIN ngân hàng), `ACCOUNT_NO`,
  `ACCOUNT_NAME` của bạn. Tra mã BIN tại https://api.vietqr.io/v2/banks.
  Vì chưa có webhook xác nhận tự động, admin cần vào **Đơn hàng** trong trang
  quản trị, đối chiếu lịch sử ngân hàng rồi đổi mục "Thanh toán" của đơn đó
  sang **Đã thanh toán** thủ công.
- **PayOS** — hiện đang để nút disabled trong `checkout.html` (`value="payos"`
  bị `disabled`) để bạn tự tích hợp sau. Khi tích hợp xong:
  1. Bỏ `disabled` ở option đó trong `checkout.html`.
  2. `orders.payment_method` và `orders.payment_status` (cột `unpaid`/`paid`)
     đã có sẵn trong schema — chỉ cần webhook PayOS gọi Supabase (qua Edge
     Function hoặc service role key) để `update` `payment_status = 'paid'`
     theo `order_id` sau khi xác nhận thanh toán thành công.

## Trang quản trị

- `admin/products.html` — quản lý sản phẩm.
- `admin/orders.html` — quản lý đơn hàng, cập nhật trạng thái giao hàng.
- `admin/payments.html` — quản lý thanh toán: lọc theo trạng thái/phương thức,
  đánh dấu đã thu tiền, xem tổng tiền chưa thu / đã thu.
- `admin/revenue.html` — tổng doanh thu toàn bộ, doanh thu tháng hiện tại,
  biểu đồ và bảng doanh thu theo từng tháng. Chỉ tính các đơn có trạng thái
  thanh toán **Đã thanh toán** — nên cần đánh dấu đúng ở trang Thanh toán
  hoặc Đơn hàng thì số liệu doanh thu mới chính xác.

## Trang chi tiết sản phẩm

Click vào ảnh hoặc tên món ở trang chủ giờ dẫn tới `product.html?id=...` thay vì mở popup, gồm:
- **Gallery ảnh** — ảnh chính + ảnh phụ, click thumbnail để đổi ảnh lớn.
- **Phân loại** — nếu sản phẩm có nhiều lựa chọn (vd: Hộp 4 bánh / Hộp 8 bánh),
  khách chọn 1 loại trước khi thêm vào giỏ; giá cập nhật theo lựa chọn.
- **Tab Mô tả / Đánh giá** — đánh giá gồm sao (1–5) + tên + nhận xét, ai cũng
  gửi được (không cần đăng nhập), hiển thị điểm trung bình.
- **Sản phẩm liên quan** — 4 sản phẩm cùng danh mục, hiện ở cuối trang.

Quản lý ảnh phụ và phân loại ở `admin/products.html` khi thêm/sửa sản phẩm:
- **Ảnh phụ**: chọn nhiều ảnh cùng lúc, ✕ để xoá ảnh đã có.
- **Phân loại**: nhập tên + giá từng dòng, bấm "+ Thêm phân loại"; để trống
  nếu sản phẩm không có phân loại. Lưu ý: mỗi lần lưu sản phẩm sẽ ghi đè toàn
  bộ danh sách phân loại theo đúng các dòng đang hiển thị trên form.
- Đánh giá của khách chưa có màn kiểm duyệt riêng — nếu cần ẩn/xoá đánh giá
  không phù hợp, xoá trực tiếp trong Supabase Table Editor (bảng `product_reviews`).

## Trang Cấu hình (admin/settings.html)

Gom về 1 chỗ các cấu hình trước đây phải sửa trực tiếp trong code:

- **Thương hiệu** — tải ảnh logo (thay chữ "Vặt Ơi" mặc định), đổi tên hiển thị.
  Áp dụng cho mọi trang (khách + admin) qua thẻ `[data-site-logo]`.
- **Banner trang chủ** — thêm/sửa/xoá banner cho khu hero-carousel ở trang chủ
  (ảnh, nhãn nhỏ, tiêu đề, mô tả, nút bấm). Không thêm banner nào thì trang chủ
  dùng lại 3 ảnh mặc định có sẵn trong `index.html`.
- **Chuyển khoản QR** — nhập mã BIN ngân hàng / số tài khoản / tên chủ tài khoản
  thay vì sửa `js/payment-config.js`. Trang `payment-qr.html` sẽ tự lấy dữ liệu
  này để tạo mã QR.
- **PayOS & Webhook** — bật/tắt lựa chọn PayOS ở trang đặt hàng, nhập Client ID /
  API Key / Checksum Key (chỉ admin xem được, lưu ở bảng riêng
  `site_settings_secret`, không public).

### Cập nhật schema nếu đã tạo project từ trước
Bản cập nhật này thêm các bảng `site_settings`, `site_settings_secret`,
`site_banners` và bucket ảnh `site-images`. Vào SQL Editor và chạy lại toàn bộ
`supabase/schema.sql` (an toàn, không mất dữ liệu cũ — dùng `create table if
not exists` / `create or replace` / `drop policy if exists`).

### Deploy Edge Function xác minh webhook PayOS
File `supabase/functions/payos-webhook/index.ts` xác minh chữ ký PayOS (bằng
Checksum Key đã lưu ở trang Cấu hình) rồi tự động đổi đơn hàng liên quan sang
**Đã thanh toán**.

```bash
supabase functions deploy payos-webhook --no-verify-jwt
```

Sau khi deploy, copy URL function (cũng được hiển thị sẵn ở trang Cấu hình,
dạng `https://<project-ref>.supabase.co/functions/v1/payos-webhook`) và khai
báo trong PayOS Dashboard → Webhook.

⚠️ Hàm này chỉ xử lý phần **xác minh + cập nhật trạng thái** khi PayOS gọi về.
Phần **tạo link thanh toán PayOS khi khách bấm "Đặt hàng"** (gọi API PayOS để
lấy link/QR) chưa được dựng — bạn cần tự thêm bước đó (thường qua 1 Edge
Function khác gọi API PayOS bằng Client ID/API Key), và đặt nội dung
`description` của giao dịch theo đúng quy ước `DH <8 ký tự đầu của order id>`
(giống cách `payment-qr.html` đang làm với chuyển khoản QR) để webhook tìm
đúng đơn hàng cần cập nhật.

## Deploy lên GitHub Pages
1. Đẩy toàn bộ thư mục `snackshop/` lên một repo GitHub.
2. Vào **Settings → Pages** → chọn nhánh và thư mục gốc → Save.
3. Website sẽ có tại `https://<username>.github.io/<repo>/`.

## Nếu đã chạy schema.sql từ trước
Bản cập nhật này thêm hàm `create_order()` và sửa lại policy insert của
`orders`/`order_items`. Vào SQL Editor và chạy lại toàn bộ file `schema.sql`
(các lệnh đều dùng `create or replace` / `drop policy if exists` nên chạy lại
an toàn, không mất dữ liệu cũ).

## Ghi chú bảo mật
- Khách vãng lai (chưa đăng nhập) vẫn đặt hàng được — đơn được lưu với `user_id = null`
  và tra cứu lại qua RPC `track_order` (kiểm tra đúng số điện thoại mới trả kết quả).
- Chỉ tài khoản có `is_admin = true` trong bảng `profiles` mới sửa được sản phẩm/đơn hàng
  — được kiểm soát bằng RLS ở tầng database, không chỉ ở giao diện.
- Bucket `product-images` cho phép đọc công khai, nhưng chỉ admin mới upload/xoá được.
