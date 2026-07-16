// ============================================================
// Khởi tạo Supabase client dùng chung cho toàn bộ ứng dụng.
// Dùng Supabase JS SDK v2 tải qua CDN (xem thẻ <script> trong các trang .html)
// ============================================================
if (!window.SUPABASE_URL || window.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
  console.warn(
    "[Cấu hình] Bạn chưa điền SUPABASE_URL / SUPABASE_ANON_KEY trong js/config.js"
  );
}

const supabaseClient = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Giảm thời gian tồn tại phiên rảnh — buộc xác thực lại token định kỳ
      storageKey: "edu-system-auth",
    },
  }
);
