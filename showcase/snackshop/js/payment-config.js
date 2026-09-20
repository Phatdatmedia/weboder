// ============================================================
// CẤU HÌNH THANH TOÁN CHUYỂN KHOẢN QR (VietQR)
// Thông tin ngân hàng giờ lấy từ bảng site_settings (cấu hình ở
// admin/settings.html) thay vì sửa trực tiếp file này. Các giá trị dưới đây
// chỉ dùng làm mặc định dự phòng nếu chưa cấu hình gì trong Supabase.
// ============================================================
const BANK_CONFIG_FALLBACK = {
  BANK_ID: "970436",
  ACCOUNT_NO: "0000000000",
  ACCOUNT_NAME: "NGUYEN VAN A",
};

// Tạo link ảnh mã QR chuyển khoản (dùng dịch vụ miễn phí VietQR.io)
async function buildVietQRUrl(amount, orderId) {
  const settings = await getSiteSettings();
  const bank = {
    BANK_ID: settings.bank_id || BANK_CONFIG_FALLBACK.BANK_ID,
    ACCOUNT_NO: settings.bank_account_no || BANK_CONFIG_FALLBACK.ACCOUNT_NO,
    ACCOUNT_NAME: settings.bank_account_name || BANK_CONFIG_FALLBACK.ACCOUNT_NAME,
  };
  const info = `DH ${orderId.slice(0, 8).toUpperCase()}`;
  const params = new URLSearchParams({
    amount: Math.round(amount),
    addInfo: info,
    accountName: bank.ACCOUNT_NAME,
  });
  return `https://img.vietqr.io/image/${bank.BANK_ID}-${bank.ACCOUNT_NO}-compact2.png?${params.toString()}`;
}
