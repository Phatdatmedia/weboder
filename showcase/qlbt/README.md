# Hệ thống Giao bài tập / Bài kiểm tra (HTML + JS + CSS + Supabase)

Hệ thống cho giáo viên tạo lớp, giao bài tập/bài kiểm tra, chấm điểm; học sinh
tham gia lớp, nộp bài và xem điểm. **Ưu tiên số 1 là bảo mật khu vực giáo viên.**

## 1. Cấu trúc thư mục

```
edu-system/
├── index.html          Trang đăng nhập
├── register.html       Trang đăng ký (học sinh tự do, giáo viên cần mã mời)
├── schema.sql           <-- Chạy file này trong Supabase SQL Editor
├── css/style.css
├── js/
│   ├── config.js         Điền SUPABASE_URL + ANON_KEY tại đây
│   ├── supabaseClient.js
│   ├── utils.js           Escape HTML chống XSS, helper chung
│   └── auth-guard.js      Kiểm tra đăng nhập/vai trò, tự đăng xuất khi rảnh
├── teacher/
│   ├── dashboard.html
│   └── dashboard.js
└── student/
    ├── dashboard.html
    └── dashboard.js
```

## 2. Cài đặt Supabase (bắt buộc theo đúng thứ tự)

1. Tạo project mới tại https://supabase.com
2. Vào **SQL Editor** → dán toàn bộ nội dung `schema.sql` → **Run**.
   File này tạo bảng, bật Row Level Security (RLS) và toàn bộ policy bảo mật.
3. Vào **Authentication → Providers → Email**:
   - Bật **Confirm email** (bắt buộc xác nhận email trước khi đăng nhập)
   - Bật **Leaked password protection**
   - Đặt **Minimum password length** = 12
4. Vào **Authentication → Rate Limits**: giữ nguyên mặc định hoặc thắt chặt hơn
   (chống brute-force đăng nhập).
5. Vào **Project Settings → API**: copy **Project URL** và **anon public key**,
   dán vào `js/config.js`. **KHÔNG BAO GIỜ** dùng `service_role key` ở frontend.
6. (Tuỳ chọn, nếu muốn đính kèm file) Vào **Storage**: 2 bucket
   `assignment-attachments` và `submission-files` sẽ tự được tạo bởi `schema.sql`
   (private, không public).

## 3. Cấp quyền giáo viên (invite-only — cốt lõi của việc bảo mật trang admin)

Giáo viên **không thể tự đăng ký** thành công nếu không có mã mời hợp lệ.
Bạn (quản trị hệ thống / hiệu trưởng / IT) là người duy nhất tạo mã mời:

```sql
insert into public.teacher_invites (code)
values ('MOT-MA-NGAU-NHIEN-KHO-DOAN');
```

Gửi mã này cho giáo viên qua kênh riêng tư (email nội bộ, tin nhắn trực tiếp...).
Mã chỉ dùng được **1 lần** và tự hết hạn sau **7 ngày** (có thể chỉnh trong SQL).

> Vì sao làm vậy: nếu để client tự gửi `role: "teacher"` khi đăng ký, bất kỳ ai
> cũng có thể tự phong mình làm giáo viên bằng cách sửa request trong DevTools.
> Cách trên chặn đứng lỗi leo thang đặc quyền (privilege escalation) này.

## 4. Chạy thử cục bộ

Vì các trang dùng đường dẫn tuyệt đối (`/js/...`, `/teacher/...`), cần chạy qua
một static server thay vì mở file trực tiếp:

```bash
cd edu-system
python3 -m http.server 8080
# hoặc: npx serve .
```

Mở `http://localhost:8080`.

## 5. Triển khai (deploy)

Có thể deploy static site này lên Vercel, Netlify, Cloudflare Pages hoặc
Supabase Hosting. Sau khi deploy, **thêm domain đó** vào Supabase:
**Authentication → URL Configuration → Site URL / Redirect URLs**.

Đặt các HTTP header sau ở tầng hosting (Vercel/Netlify đều hỗ trợ qua file cấu hình):

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://*.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

## 6. Các lớp bảo mật đã áp dụng

| Lớp | Cơ chế |
|---|---|
| **Phân quyền dữ liệu** | Row Level Security (RLS) bật trên **mọi** bảng. Đây là lớp bảo mật *thật sự* — kể cả khi ai đó bypass toàn bộ JS frontend, Postgres vẫn từ chối truy vấn trái phép. |
| **Chống leo thang đặc quyền** | Vai trò (`role`) lưu ở bảng `user_roles` riêng, client **không có quyền ghi**. Chỉ được set qua function `complete_registration()` (security definer), và làm giáo viên bắt buộc mã mời hợp lệ dùng 1 lần. |
| **Cô lập dữ liệu giữa giáo viên** | Mọi policy trên `classes`, `assignments` đều so khớp `teacher_id = auth.uid()` — giáo viên A không đọc được lớp/bài của giáo viên B. |
| **Bảo vệ bài làm học sinh** | Trigger `protect_submission_content` chặn giáo viên sửa nội dung bài làm — chỉ được set điểm/nhận xét. Học sinh không sửa được bài sau khi đã bị chấm. |
| **Chống XSS** | Toàn bộ dữ liệu người dùng nhập được escape qua `escapeHTML()` trước khi chèn vào DOM, không dùng `innerHTML` với dữ liệu thô. |
| **Chống brute-force** | Rate limit của Supabase Auth + khuyến nghị bật leaked-password protection + mật khẩu tối thiểu 12 ký tự. |
| **Tự đăng xuất khi rảnh** | `auth-guard.js` tự đăng xuất sau 20 phút không thao tác — đặc biệt quan trọng cho tài khoản giáo viên dùng máy tính chung. |
| **Không lộ thông tin nhạy cảm** | Thông báo lỗi đăng nhập luôn chung chung ("email hoặc mật khẩu không đúng"), không tiết lộ email có tồn tại hay không. |
| **File đính kèm riêng tư** | Storage bucket không public, mỗi người chỉ đọc/ghi được thư mục gắn với `user_id` của chính mình (qua policy `storage.foldername`). |
| **Audit log** | Bảng `audit_log` (không ai đọc/ghi trực tiếp được) ghi lại hành động nhạy cảm qua function `log_action()`, phục vụ điều tra khi cần. |
| **robots.txt ngầm định** | Các trang admin có `<meta name="robots" content="noindex, nofollow">` để không bị index bởi công cụ tìm kiếm. |

## 7. Việc bạn cần tự làm thêm (khuyến nghị, không có trong code)

- **Bật MFA (2FA)** cho tài khoản giáo viên: Supabase Auth hỗ trợ TOTP —
  xem `supabaseClient.auth.mfa.enroll()` trong tài liệu Supabase.
- **Sao lưu định kỳ** database qua Supabase Dashboard → Database → Backups.
- **Theo dõi audit_log** định kỳ để phát hiện hành vi bất thường.
- Nếu triển khai thật, cân nhắc thêm **CAPTCHA** (hCaptcha/Turnstile) vào form
  đăng ký/đăng nhập — Supabase Auth hỗ trợ tích hợp sẵn.

## 8. Giới hạn đã biết

- Đây là bộ khung (starter) đầy đủ chức năng, không phải sản phẩm thương mại
  hoàn chỉnh — nên kiểm thử kỹ (đặc biệt các policy RLS) trước khi dùng thật.
- Chưa có tính năng đặt lại mật khẩu qua UI (dùng tính năng có sẵn của
  Supabase Auth: `resetPasswordForEmail`) — có thể bổ sung dễ dàng nếu cần.
