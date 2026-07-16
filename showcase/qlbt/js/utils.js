// ============================================================
// TIỆN ÍCH DÙNG CHUNG
// ============================================================

/**
 * Escape HTML để chống XSS khi chèn dữ liệu người dùng vào DOM.
 * LUÔN dùng hàm này (hoặc textContent) — KHÔNG BAO GIỜ nội suy chuỗi
 * người dùng nhập trực tiếp vào innerHTML.
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso) return "Không có hạn";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add("show");
}
function hideError(el) {
  el.textContent = "";
  el.classList.remove("show");
}
function showSuccess(el, msg) {
  el.textContent = msg;
  el.classList.add("show");
}

/**
 * Kiểm tra độ mạnh mật khẩu phía client (UX). Việc thực thi thật sự
 * (độ dài tối thiểu, leaked-password check) do Supabase Auth đảm nhiệm phía server.
 */
function passwordStrengthOk(pw) {
  return (
    pw.length >= 12 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw)
  );
}

/** Sinh mã ngẫu nhiên (dùng cho mã lớp) — không dùng cho mục đích bảo mật cao */
function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ ký tự dễ nhầm
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function setButtonLoading(btn, loading, loadingText = "Đang xử lý...") {
  if (loading) {
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${loadingText}`;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}
