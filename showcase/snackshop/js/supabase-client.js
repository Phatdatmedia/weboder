// ============================================================
// CẤU HÌNH SUPABASE
// Thay 2 giá trị dưới đây bằng thông tin dự án Supabase của bạn
// (Project Settings > API)
// ============================================================
const SUPABASE_URL = "https://fnmiumlzrsvmursapqrk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZubWl1bWx6cnN2bXVyc2FwcXJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MDgxNDgsImV4cCI6MjEwNTE4NDE0OH0.ztJDqAYMHaRbfWgg6pq-kqB6UAUuxb2ydZQuR1S-yZs";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Định dạng tiền VNĐ
function formatVND(n) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

// Lấy giỏ hàng từ localStorage
function getCart() {
  try {
    return JSON.parse(localStorage.getItem("snack_cart") || "[]");
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem("snack_cart", JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(item, qty = 1) {
  // item: { product_id, variant_id (nullable), name, price, image_url }
  const key = `${item.product_id}_${item.variant_id || "base"}`;
  const cart = getCart();
  const existing = cart.find((i) => i.key === key);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      key,
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      name: item.name,
      price: item.price,
      image_url: item.image_url,
      quantity: qty,
    });
  }
  saveCart(cart);
}

function removeFromCart(key) {
  saveCart(getCart().filter((i) => i.key !== key));
}

function cartTotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function cartCount() {
  return getCart().reduce((sum, i) => sum + i.quantity, 0);
}

function updateCartBadge() {
  document.querySelectorAll("[data-cart-badge]").forEach((el) => {
    el.textContent = cartCount();
  });
}

document.addEventListener("DOMContentLoaded", updateCartBadge);

// ---------- CẤU HÌNH CHUNG (logo, banner, thanh toán) ----------
// Dùng chung cho mọi trang: lấy 1 lần rồi cache lại trong phiên duyệt web.
let __siteSettingsPromise = null;

function getSiteSettings() {
  if (!__siteSettingsPromise) {
    __siteSettingsPromise = supabaseClient
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }) => data || {})
      .catch(() => ({}));
  }
  return __siteSettingsPromise;
}

// Thay logo chữ mặc định bằng ảnh logo nếu admin đã tải lên (mục Cấu hình).
// Icon + tên shop hiển thị CÙNG NHAU (giống kiểu icon logo + brand name),
// không xoá mất chữ khi có ảnh. Áp dụng cho mọi thẻ có [data-site-logo];
// phần chữ phụ phía sau (vd " Admin") nằm trong thẻ riêng nên không bị ghi đè.
async function applySiteLogo() {
  const s = await getSiteSettings();
  const logoEls = document.querySelectorAll("[data-site-logo]");
  if (!logoEls.length) return;

  logoEls.forEach((el) => {
    el.innerHTML = "";

    if (s.logo_url) {
      const img = document.createElement("img");
      img.src = s.logo_url;
      img.alt = s.logo_text || "Logo";
      img.className = "site-logo-img";
      el.appendChild(img);
    }

    const nameText = (s.logo_text || "Vặt Ơi").trim();
    const nameEl = document.createElement("span");
    nameEl.className = "site-logo-text";
    if (nameText === "Vặt Ơi") {
      nameEl.innerHTML = `Vặt<span>Ơi</span>`;
    } else {
      nameEl.textContent = nameText;
    }
    el.appendChild(nameEl);
  });
}

document.addEventListener("DOMContentLoaded", applySiteLogo);
