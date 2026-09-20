// ============================================================
// KHU VỰC TÀI KHOẢN KHÁCH HÀNG
// ============================================================

function showMsg(el, msg, type) {
  el.textContent = msg;
  el.className = `alert show alert-${type}`;
}

// ---------- ĐĂNG KÝ ----------
const registerForm = document.getElementById("register-form");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById("register-alert");
    const name = document.getElementById("r-name").value.trim();
    const email = document.getElementById("r-email").value.trim();
    const password = document.getElementById("r-password").value;

    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (error) {
      showMsg(alertBox, error.message, "error");
      return;
    }
    showMsg(alertBox, "Đăng ký thành công! Đang chuyển đến trang đăng nhập...", "success");
    setTimeout(() => (window.location.href = "login.html"), 1500);
  });
}

// ---------- ĐĂNG NHẬP ----------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById("login-alert");
    const email = document.getElementById("l-email").value.trim();
    const password = document.getElementById("l-password").value;

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      showMsg(alertBox, "Sai email hoặc mật khẩu.", "error");
      return;
    }
    window.location.href = "profile.html";
  });
}

// ---------- TRANG HỒ SƠ (yêu cầu đăng nhập) ----------
const profilePage = document.getElementById("profile-page");
if (profilePage) {
  initProfilePage();
}

async function initProfilePage() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const user = session?.user;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  document.getElementById("profile-email").textContent = user.email;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profile) {
    document.getElementById("p-name").value = profile.full_name || "";
    document.getElementById("p-phone").value = profile.phone || "";
    document.getElementById("p-address").value = profile.address || "";
  }

  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById("profile-alert");
    const { error } = await supabaseClient
      .from("profiles")
      .update({
        full_name: document.getElementById("p-name").value.trim(),
        phone: document.getElementById("p-phone").value.trim(),
        address: document.getElementById("p-address").value.trim(),
      })
      .eq("id", user.id);

    if (error) {
      showMsg(alertBox, "Cập nhật thất bại.", "error");
      return;
    }
    showMsg(alertBox, "Đã lưu thông tin.", "success");
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
  });

  loadMyOrders(user.id);
}

async function loadMyOrders(userId) {
  const wrap = document.getElementById("my-orders");
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data || !data.length) {
    wrap.innerHTML = `<p class="empty-state">Bạn chưa có đơn hàng nào.</p>`;
    return;
  }

  const statusLabel = {
    pending: "Chờ xác nhận", confirmed: "Đã xác nhận",
    shipping: "Đang giao", done: "Hoàn tất", cancelled: "Đã huỷ",
  };

  wrap.innerHTML = data
    .map(
      (o) => `
    <div class="panel" style="margin:0 0 16px; max-width:none;">
      <div class="product-row">
        <strong>Đơn #${o.id.slice(0, 8)}</strong>
        <span class="status-pill status-${o.status}">${statusLabel[o.status] || o.status}</span>
      </div>
      <p style="font-size:0.85rem; color:rgba(58,42,26,0.7);">${new Date(o.created_at).toLocaleString("vi-VN")}</p>
      ${o.order_items.map((it) => `<div>${it.quantity} × ${it.product_name} — ${formatVND(it.price)}</div>`).join("")}
      <p style="font-weight:800; margin-top:8px;">Tổng: ${formatVND(o.total)}</p>
    </div>`
    )
    .join("");
}
