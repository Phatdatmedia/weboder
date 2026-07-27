# PC.STORE — Bản single-file (mỗi trang 1 file HTML độc lập)

Mỗi trang HTML trong bộ này đã gồm sẵn CSS + JS nhúng thẳng trong file
(chỉ còn 1 dòng import CDN cho thư viện `@supabase/supabase-js` — bắt buộc
phải tải qua CDN vì đây là thư viện ngoài, không thể nhúng "cứng" vào HTML).

## Trước khi dùng — bắt buộc
Trong **MỖI file HTML**, tìm đoạn sau ở đầu thẻ `<script type="module">` và điền
thông tin Supabase của bạn (lấy tại Project Settings → API):

```js
const SUPABASE_URL = "https://ajodavrshmkunztjjbot.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqb2RhdnJzaG1rdW56dGpqYm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjAyODcsImV4cCI6MjA5OTkzNjI4N30.IxQJLP7xX6CqBsobJeubQunzssDSwF0Rjucj1pwRk08";
```

Vì mỗi file giờ độc lập, bạn cần sửa 2 dòng này trong **cả 13 file** (index.html,
product.html, cart.html, checkout.html, order-success.html, track-order.html,
account.html, login.html, register.html, admin/index.html, admin/products.html,
admin/orders.html, admin/staff.html).

Mẹo: dùng find-and-replace hàng loạt trong VS Code (Ctrl+Shift+H) trên toàn bộ
thư mục để sửa 1 lần cho tất cả file.

## Chạy schema.sql
Giống bản gốc — dán `schema.sql` vào Supabase SQL Editor và Run.

## Chạy local
```bash
python3 -m http.server 8080
```
rồi mở http://localhost:8080

## Lưu ý
Bản này thuận tiện để copy từng file riêng lẻ (VD: chỉ cần gửi account.html
cho ai đó xem là đủ, không cần kèm css/js). Nếu bạn cần sửa logic dùng chung
(vd. đổi cách format tiền tệ), bản gốc có tách file css/js riêng
(thư mục `pcstore/`) sẽ dễ bảo trì hơn vì không phải sửa lặp lại ở 13 nơi.
