/* ============================================================
   KIỂM TRA CHẾ ĐỘ BẢO TRÌ — chạy NGAY LẬP TỨC, TRƯỚC mọi lệnh gọi
   dữ liệu khác trên trang. Nếu đang bảo trì: hiện màn hình bảo trì,
   ẩn toàn bộ nội dung trang, và CHẶN các hàm tải dữ liệu khác chạy tiếp.
============================================================ */
window._maintenanceActive = false;

async function checkMaintenanceMode(){
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', 'maintenance_mode').single();
    const cfg = data?.value;
    if(cfg?.enabled){
      window._maintenanceActive = true;
      document.getElementById('maintenanceOverlayTitle').textContent = cfg.title || 'Website đang bảo trì';
      document.getElementById('maintenanceOverlayMsg').textContent = cfg.message || 'Chúng tôi đang nâng cấp hệ thống, vui lòng quay lại sau.';
      document.getElementById('maintenanceOverlay').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Ẩn toàn bộ nội dung trang gốc (nhưng vẫn giữ trong DOM, không xoá)
      Array.from(document.body.children).forEach(el => {
        if(el.id !== 'maintenanceOverlay') el.style.display = 'none';
      });
    }
  } catch(e){
    // Không đọc được cấu hình -> coi như không bảo trì, cho web chạy bình thường
  }
  return window._maintenanceActive;
}

/* ============================================================
   PHÁT HIỆN LINK KHÔI PHỤC MẬT KHẨU
   Đọc thẳng URL hash NGAY LÚC NÀY (trước khi tạo Supabase client),
   vì Supabase sẽ tự xử lý và XOÁ token khỏi URL rất nhanh sau đó —
   nếu chờ tới lúc bắt event onAuthStateChange thì có thể đã bị trôi mất.
============================================================ */
const isRecoveryFlow = /type=recovery/.test(window.location.hash);

/* ============================================================
   CONFIG
============================================================ */
const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig"
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* Vẫn giữ listener này như lớp bảo vệ thứ 2 (đăng xuất tự động khi user
   đăng xuất ở tab khác) — nhưng không còn dùng để phát hiện recovery nữa. */
sb.auth.onAuthStateChange((event) => {
  if(event === 'SIGNED_OUT'){ exitDashboard(); }
});

/* ============================================================
   STATE
============================================================ */
let currentUser = null;   // { id, name, email }

/* ============================================================
   HELPERS
============================================================ */
function isConfigured(){
  return CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("PASTE_YOUR")
      && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes("PASTE_YOUR");
}

let toastTimer;
function showToast(msg){
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function esc(s){
  if(!s) return "";
  return String(s).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

function setBtn(id, loading, label){
  const btn = document.getElementById(id);
  if(!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? "Đang xử lý..." : label;
}

function togglePass(inputId, btn){
  const input = document.getElementById(inputId);
  if(!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.style.opacity = show ? "1" : "0.5";
}

/* ============================================================
   AUTH SCREENS SWITCHING
============================================================ */
function showLogin(){
  document.getElementById("loginWrap").style.display    = "flex";
  document.getElementById("registerWrap").style.display = "none";
  document.getElementById("forgotWrap").style.display   = "none";
  document.getElementById("resetWrap").style.display    = "none";
  document.getElementById("loginErr").classList.remove("show");
}
function showRegister(){
  document.getElementById("loginWrap").style.display    = "none";
  document.getElementById("registerWrap").style.display = "flex";
  document.getElementById("forgotWrap").style.display   = "none";
  document.getElementById("resetWrap").style.display    = "none";
  document.getElementById("registerErr").classList.remove("show");
  document.getElementById("registerOk").classList.remove("show");
}
function showForgot(){
  document.getElementById("loginWrap").style.display    = "none";
  document.getElementById("registerWrap").style.display = "none";
  document.getElementById("forgotWrap").style.display   = "flex";
  document.getElementById("resetWrap").style.display    = "none";
  document.getElementById("forgotErr").classList.remove("show");
  document.getElementById("forgotOk").classList.remove("show");
}

/* ============================================================
   ENTER KEY SUPPORT
============================================================ */
["login_email","login_pass"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if(e.key === "Enter") handleLogin();
  });
});
document.getElementById("forgot_email").addEventListener("keydown", e => {
  if(e.key === "Enter") handleForgotPassword();
});
["reset_pass","reset_pass2"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if(e.key === "Enter") handleResetPassword();
  });
});
["reg_name","reg_email","reg_pass","reg_pass2"].forEach(id => {
  document.getElementById(id).addEventListener("keydown", e => {
    if(e.key === "Enter") handleRegister();
  });
});

/* ============================================================
   REGISTER — dùng Supabase Auth (sb.auth.signUp)
============================================================ */
function updatePasswordStrength(){
  const pass = document.getElementById('reg_pass').value;
  const bar = document.getElementById('pwStrengthBar');
  const text = document.getElementById('pwStrengthText');

  let score = 0;
  if(pass.length >= 8) score++;
  if(pass.length >= 12) score++;
  if(/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++;
  if(/[0-9]/.test(pass)) score++;
  if(/[^a-zA-Z0-9]/.test(pass)) score++;

  const levels = [
    { pct: 0,   color: 'var(--line)',      label: 'Tối thiểu 8 ký tự, có ít nhất 1 chữ và 1 số' },
    { pct: 20,  color: 'var(--coral-deep)',label: 'Yếu' },
    { pct: 45,  color: 'var(--coral-deep)',label: 'Yếu' },
    { pct: 70,  color: '#D6A32E',          label: 'Trung bình' },
    { pct: 90,  color: '#3E9B4F',          label: 'Mạnh' },
    { pct: 100, color: '#2E8B57',          label: 'Rất mạnh' },
  ];
  const lvl = pass.length === 0 ? levels[0] : (levels[score] || levels[levels.length-1]);
  bar.style.width = lvl.pct + '%';
  bar.style.background = lvl.color;
  text.textContent = pass.length === 0 ? levels[0].label : 'Độ mạnh: ' + lvl.label;
}

async function handleRegister(){
  const name  = document.getElementById("reg_name").value.trim();
  const email = document.getElementById("reg_email").value.trim();
  const pass  = document.getElementById("reg_pass").value;
  const pass2 = document.getElementById("reg_pass2").value;
  const errBox = document.getElementById("registerErr");
  const okBox  = document.getElementById("registerOk");

  errBox.classList.remove("show");
  okBox.classList.remove("show");

  // Chống bot: honeypot bị điền -> chặn âm thầm
  if(document.getElementById("reg_website").value.trim()){
    console.warn('Register blocked: bot suspected.');
    return;
  }

  if(!name || !email || !pass || !pass2){
    errBox.textContent = "Vui lòng điền đầy đủ tất cả các trường.";
    errBox.classList.add("show"); return;
  }
  if(pass !== pass2){
    errBox.textContent = "Hai mật khẩu không khớp nhau.";
    errBox.classList.add("show"); return;
  }
  if(pass.length < 8 || !/[a-zA-Z]/.test(pass) || !/[0-9]/.test(pass)){
    errBox.textContent = "Mật khẩu phải có ít nhất 8 ký tự, gồm cả chữ và số.";
    errBox.classList.add("show"); return;
  }
  if(!isConfigured()){
    errBox.textContent = "Chưa cấu hình Supabase trong code.";
    errBox.classList.add("show"); return;
  }

  setBtn("registerBtn", true, "Tạo tài khoản");
  try{
    const { data, error } = await sb.auth.signUp({
      email, password: pass,
      options: { data: { full_name: name } }
    });

    if(error){
      errBox.textContent = translateAuthError(error.message);
      errBox.classList.add("show");
      return;
    }

    // Nếu project đang yêu cầu xác nhận email (mặc định của Supabase),
    // session sẽ là null cho tới khi người dùng bấm link trong email.
    if(data.session){
      okBox.textContent = "Đăng ký thành công! Đang vào tài khoản...";
      okBox.classList.add("show");
      setTimeout(() => location.reload(), 1200);
    } else {
      okBox.textContent = "Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.";
      okBox.classList.add("show");
      document.getElementById("reg_name").value  = "";
      document.getElementById("reg_email").value = "";
      document.getElementById("reg_pass").value  = "";
      document.getElementById("reg_pass2").value = "";
      setTimeout(() => {
        showLogin();
        document.getElementById("login_email").value = email;
      }, 2200);
    }
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase. Kiểm tra lại cấu hình.";
    errBox.classList.add("show");
  } finally { setBtn("registerBtn", false, "Tạo tài khoản"); }
}

/* ============================================================
   LOGIN — dùng Supabase Auth (sb.auth.signInWithPassword)
============================================================ */
/* ============================================================
   CHỐNG DÒ MẬT KHẨU (BRUTE-FORCE) — khoá tạm tăng dần theo trình duyệt.
   Đây là lớp bảo vệ bổ sung ở client (dễ vượt qua nếu xoá localStorage),
   Supabase Auth đã tự giới hạn tốc độ theo IP ở phía server; lớp này
   thêm ma sát để cản trở việc dò mật khẩu bằng UI thông thường.
============================================================ */
const LOGIN_LOCK_KEY = 'pda_login_attempts';

function getLoginLockState(){
  try{ return JSON.parse(localStorage.getItem(LOGIN_LOCK_KEY)) || { fails: 0, lockUntil: 0 }; }
  catch(e){ return { fails: 0, lockUntil: 0 }; }
}
function setLoginLockState(state){
  localStorage.setItem(LOGIN_LOCK_KEY, JSON.stringify(state));
}
function checkLoginLocked(errBoxId){
  const state = getLoginLockState();
  if(state.lockUntil > Date.now()){
    const secs = Math.ceil((state.lockUntil - Date.now()) / 1000);
    document.getElementById(errBoxId).textContent = `Bạn đã nhập sai nhiều lần. Vui lòng thử lại sau ${secs} giây.`;
    document.getElementById(errBoxId).classList.add('show');
    return true;
  }
  return false;
}
function registerLoginFail(){
  const state = getLoginLockState();
  state.fails = (state.fails || 0) + 1;
  // Khoá tăng dần: 5 lần sai -> khoá 30s, 6 lần -> 60s, 7 lần -> 120s... tối đa 10 phút
  if(state.fails >= 5){
    const lockSeconds = Math.min(30 * Math.pow(2, state.fails - 5), 600);
    state.lockUntil = Date.now() + lockSeconds * 1000;
  }
  setLoginLockState(state);
}
function registerLoginSuccess(){
  setLoginLockState({ fails: 0, lockUntil: 0 });
}

async function handleLogin(){
  const email  = document.getElementById("login_email").value.trim();
  const pass   = document.getElementById("login_pass").value;
  const errBox = document.getElementById("loginErr");
  errBox.classList.remove("show");

  if(checkLoginLocked("loginErr")) return;

  if(!email || !pass){
    errBox.textContent = "Vui lòng nhập email và mật khẩu.";
    errBox.classList.add("show"); return;
  }
  if(!isConfigured()){
    errBox.textContent = "Chưa cấu hình Supabase trong code.";
    errBox.classList.add("show"); return;
  }

  setBtn("loginBtn", true, "Đăng nhập");
  try{
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if(error){
      registerLoginFail();
      errBox.textContent = translateAuthError(error.message);
      errBox.classList.add("show");
      return;
    }
    registerLoginSuccess();
    await enterDashboard();
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase. Kiểm tra lại cấu hình.";
    errBox.classList.add("show");
  } finally { setBtn("loginBtn", false, "Đăng nhập"); }
}

/* ============================================================
   QUÊN MẬT KHẨU — gửi email reset qua Supabase Auth
============================================================ */
async function handleForgotPassword(){
  const email  = document.getElementById("forgot_email").value.trim();
  const errBox = document.getElementById("forgotErr");
  const okBox  = document.getElementById("forgotOk");
  errBox.classList.remove("show"); okBox.classList.remove("show");

  if(!email){
    errBox.textContent = "Vui lòng nhập email."; errBox.classList.add("show"); return;
  }
  if(!isConfigured()){
    errBox.textContent = "Chưa cấu hình Supabase."; errBox.classList.add("show"); return;
  }

  setBtn("forgotBtn", true, "Gửi email khôi phục");
  try{
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if(error){
      errBox.textContent = translateAuthError(error.message);
      errBox.classList.add("show");
      return;
    }
    okBox.textContent = "Đã gửi email khôi phục! Vui lòng kiểm tra hộp thư (kể cả mục spam) và bấm vào link để đặt lại mật khẩu.";
    okBox.classList.add("show");
    document.getElementById("forgot_email").value = "";
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase. Kiểm tra lại cấu hình.";
    errBox.classList.add("show");
  } finally { setBtn("forgotBtn", false, "Gửi email khôi phục"); }
}

/* ============================================================
   ĐẶT LẠI MẬT KHẨU — mở từ link trong email (event PASSWORD_RECOVERY)
============================================================ */
async function handleResetPassword(){
  const newP  = document.getElementById("reset_pass").value;
  const newP2 = document.getElementById("reset_pass2").value;
  const errBox = document.getElementById("resetErr");
  const okBox  = document.getElementById("resetOk");
  errBox.classList.remove("show"); okBox.classList.remove("show");

  if(!newP || !newP2){
    errBox.textContent = "Vui lòng điền đầy đủ các trường."; errBox.classList.add("show"); return;
  }
  if(newP !== newP2){
    errBox.textContent = "Hai mật khẩu không khớp nhau."; errBox.classList.add("show"); return;
  }
  if(newP.length < 6){
    errBox.textContent = "Mật khẩu phải có ít nhất 6 ký tự."; errBox.classList.add("show"); return;
  }

  setBtn("resetBtn", true, "Đặt lại mật khẩu");
  try{
    const { error } = await sb.auth.updateUser({ password: newP });
    if(error){
      errBox.textContent = translateAuthError(error.message);
      errBox.classList.add("show");
      return;
    }
    okBox.textContent = "Đặt lại mật khẩu thành công! Đang vào tài khoản...";
    okBox.classList.add("show");
    setTimeout(async () => { await enterDashboard(); }, 1200);
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase. Kiểm tra lại cấu hình.";
    errBox.classList.add("show");
  } finally { setBtn("resetBtn", false, "Đặt lại mật khẩu"); }
}

/**
 * Dịch các thông báo lỗi tiếng Anh phổ biến của Supabase Auth sang tiếng Việt.
 */
function translateAuthError(msg){
  const map = {
    "Invalid login credentials": "Email hoặc mật khẩu không đúng.",
    "User already registered": "Email này đã được đăng ký.",
    "Email not confirmed": "Email chưa được xác nhận. Vui lòng kiểm tra hộp thư.",
    "Password should be at least 6 characters": "Mật khẩu phải có ít nhất 6 ký tự."
  };
  return map[msg] || msg;
}

async function handleLogout(){
  if(isConfigured()){
    try{ await sb.auth.signOut(); } catch{}
  }
  currentUser = null;
  exitDashboard();
  showToast("Đã đăng xuất.");
}

/* ============================================================
   DASHBOARD
============================================================ */
async function enterDashboard(){
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if(!session?.user){ exitDashboard(); return; }

  // Lấy thông tin hiển thị từ bảng profiles
  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, email, is_locked, is_priority')
    .eq('id', session.user.id)
    .single();

  // Tài khoản bị admin khoá -> đăng xuất ngay, không cho vào dashboard
  if(profile?.is_locked){
    await sb.auth.signOut();
    showLogin();
    document.getElementById("loginErr").textContent = "Tài khoản của bạn đã bị khoá. Liên hệ admin để được hỗ trợ.";
    document.getElementById("loginErr").classList.add("show");
    return;
  }

  currentUser = {
    id: session.user.id,
    name: profile?.full_name || session.user.email,
    email: profile?.email || session.user.email,
    isPriority: !!profile?.is_priority
  };

  document.getElementById("authWrap").style.display = "none";
  document.getElementById("dashWrap").classList.add("show");
  document.getElementById("dashWrap").classList.toggle("vip-mode", currentUser.isPriority);

  const initial = (currentUser.name || "U")[0].toUpperCase();
  document.getElementById("sideAvatar").textContent = initial;
  document.getElementById("sideName").innerHTML = escHtml(currentUser.name || "Người dùng")
    + (currentUser.isPriority ? '<span class="vip-badge-pill">✨ Ưu tiên</span>' : '');
  document.getElementById("sideEmail").textContent  = currentUser.email || "";
  document.getElementById("p_name").value  = currentUser.name  || "";
  document.getElementById("p_email").value = currentUser.email || "";

  switchDashTab("orders");
  loadUserOrders();

  document.getElementById("notifBell").style.display = "flex";
  loadNotifications();

  // Khách hàng ưu tiên -> hiện hiệu ứng chào mừng, tự reset lại sau mỗi 3 tiếng
  if(currentUser.isPriority){
    const vipKey = 'vipWelcomeLastShown_' + currentUser.id;
    const lastShown = Number(localStorage.getItem(vipKey) || 0);
    const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
    if(Date.now() - lastShown > THREE_HOURS_MS){
      showVipWelcome(currentUser.name);
      localStorage.setItem(vipKey, String(Date.now()));
    }
  }
}

function showVipWelcome(name){
  const overlay = document.getElementById('vipWelcomeOverlay');
  document.getElementById('vipWelcomeName').textContent = 'Chào mừng trở lại, ' + (name || '');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }, 2600);
}

/* Escape HTML nhỏ gọn dùng cho tên hiển thị kèm badge (khác với hàm esc() dùng cho text thuần) */
function escHtml(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function exitDashboard(){
  document.getElementById("dashWrap").classList.remove("show");
  document.getElementById("dashWrap").classList.remove("vip-mode");
  document.getElementById("authWrap").style.display = "block";
  document.getElementById("notifBell").style.display = "none";
  document.getElementById("notifDropdown").classList.remove("show");
  showLogin();
}

function switchDashTab(tab){
  ["orders","profile","app"].forEach(t => {
    document.getElementById("sec"   + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("active", t===tab);
    document.getElementById("nav"   + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("active", t===tab);
    document.getElementById("mTab"  + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("active", t===tab);
  });
  if(tab === 'app') refreshPushStatus();
}

/* ============================================================
   USER ORDERS — đọc trực tiếp từ bảng orders (RLS tự lọc theo user_id)
============================================================ */
const STATUS_MAP = {
  "Chờ xác nhận":   "s-pending",
  "Đã xác nhận":    "s-progress",
  "Đang thực hiện": "s-progress",
  "Hoàn thành":     "s-done",
  "Đã huỷ":         "s-cancel"
};

async function loadUserOrders(){
  const body = document.getElementById("ordersTableBody");
  if(!isConfigured()){
    body.innerHTML = `<div class="orders-empty">Chưa cấu hình Supabase.</div>`; return;
  }
  if(!currentUser){ exitDashboard(); return; }

  body.innerHTML = `<div class="orders-loading">Đang tải đơn hàng...</div>`;
  try{
    const { data, error } = await sb
      .from('orders')
      .select('order_code, service_type, budget, description, amount, payment_type, total_price, payment_method, created_at, status')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false });

    if(error){
      body.innerHTML = `<div class="orders-empty">${esc(error.message)}</div>`;
      return;
    }

    const mapped = (data||[]).map(o => ({
      "Mã đơn": o.order_code,
      "Loại dịch vụ": o.service_type,
      "Ngân sách": o.budget,
      "Mô tả yêu cầu": o.description,
      "Số tiền": o.amount,
      "Loại TT": o.payment_type,
      "Giá trị đơn": o.total_price,
      "Phương thức TT": o.payment_method,
      "Thời gian đặt": new Date(o.created_at).toLocaleString('vi-VN'),
      "Trạng thái": o.status
    }));
    renderUserOrders(mapped);
  } catch(err){
    body.innerHTML = `<div class="orders-empty">Không thể kết nối Supabase.</div>`;
  }
}

function renderUserOrders(orders){
  document.getElementById("uStatTotal").textContent    = orders.length;
  document.getElementById("uStatProgress").textContent = orders.filter(o => ["Đã xác nhận","Đang thực hiện"].includes(o["Trạng thái"])).length;
  document.getElementById("uStatDone").textContent     = orders.filter(o => o["Trạng thái"] === "Hoàn thành").length;

  const body = document.getElementById("ordersTableBody");
  if(orders.length === 0){
    body.innerHTML = `<div class="orders-empty">Bạn chưa có đơn hàng nào.<br><a href="/#services" style="color:var(--coral-deep);font-weight:600;">Đặt đơn đầu tiên →</a></div>`;
    return;
  }

  let html = `<table class="orders-table"><thead><tr>
    <th>Mã đơn</th><th>Dịch vụ</th><th>Ngân sách</th><th>Mô tả yêu cầu</th><th>Số tiền</th><th>Phương thức TT</th><th>Thời gian</th><th>Trạng thái</th>
  </tr></thead><tbody>`;

  orders.forEach(o => {
    const st = o["Trạng thái"] || "Chờ xác nhận";
    const descFull = o["Mô tả yêu cầu"] || '';
    const descShort = descFull.length > 60 ? descFull.slice(0,60) + '…' : descFull;
    const amountVal = o["Số tiền"] != null ? Number(o["Số tiền"]).toLocaleString('vi-VN') + 'đ' : '—';
    const totalVal = o["Giá trị đơn"] != null ? ` / ${Number(o["Giá trị đơn"]).toLocaleString('vi-VN')}đ` : '';
    html += `<tr>
      <td class="order-code">${esc(o["Mã đơn"])}</td>
      <td>${esc(o["Loại dịch vụ"]||"")}</td>
      <td style="font-size:12.5px;font-family:var(--font-mono);color:var(--ink-soft);white-space:nowrap;">${esc(o["Ngân sách"]||"—")}</td>
      <td style="font-size:12.5px;color:var(--ink-soft);max-width:220px;" title="${esc(descFull)}">${esc(descShort||"—")}</td>
      <td style="font-size:12.5px;font-family:var(--font-mono);white-space:nowrap;">${amountVal}${totalVal}<br><span style="color:var(--ink-soft);font-size:10.5px;">${esc(o["Loại TT"]||"")}</span></td>
      <td style="font-size:12.5px;color:var(--ink-soft);">${esc(o["Phương thức TT"]||"—")}</td>
      <td style="font-size:12px;color:var(--ink-soft);">${esc(o["Thời gian đặt"]||"")}</td>
      <td><span class="status-pill ${STATUS_MAP[st]||'s-pending'}">${esc(st)}</span></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  body.innerHTML = html;
}

/* ============================================================
   UPDATE PROFILE — sửa bảng profiles
============================================================ */
async function handleUpdateProfile(){
  const name   = document.getElementById("p_name").value.trim();
  const errBox = document.getElementById("profileErr");
  const okBox  = document.getElementById("profileOk");
  errBox.classList.remove("show"); okBox.classList.remove("show");

  if(!name){ errBox.textContent = "Tên không được để trống."; errBox.classList.add("show"); return; }
  if(!isConfigured()){ errBox.textContent = "Chưa cấu hình Supabase."; errBox.classList.add("show"); return; }

  try{
    const { error } = await sb
      .from('profiles')
      .update({ full_name: name })
      .eq('id', currentUser.id);

    if(error){
      errBox.textContent = error.message; errBox.classList.add("show");
      return;
    }
    currentUser.name = name;
    document.getElementById("sideName").innerHTML = escHtml(name)
      + (currentUser.isPriority ? '<span class="vip-badge-pill">✨ Ưu tiên</span>' : '');
    document.getElementById("sideAvatar").textContent = name[0].toUpperCase();
    okBox.textContent = "Đã cập nhật thông tin."; okBox.classList.add("show");
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase."; errBox.classList.add("show");
  }
}

/* ============================================================
   CHANGE PASSWORD — dùng sb.auth.updateUser
   (Supabase không yêu cầu xác nhận mật khẩu cũ ở client vì
   user đã có session hợp lệ — đủ điều kiện an toàn để đổi mật khẩu)
============================================================ */
async function handleChangePassword(){
  const oldP  = document.getElementById("p_old_pass").value;
  const newP  = document.getElementById("p_new_pass").value;
  const newP2 = document.getElementById("p_new_pass2").value;
  const errBox = document.getElementById("passErr");
  const okBox  = document.getElementById("passOk");
  errBox.classList.remove("show"); okBox.classList.remove("show");

  if(!oldP || !newP || !newP2){ errBox.textContent = "Vui lòng điền đầy đủ các trường."; errBox.classList.add("show"); return; }
  if(newP !== newP2){ errBox.textContent = "Mật khẩu mới và xác nhận không khớp."; errBox.classList.add("show"); return; }
  if(newP.length < 6){ errBox.textContent = "Mật khẩu mới phải có ít nhất 6 ký tự."; errBox.classList.add("show"); return; }
  if(!isConfigured()){ errBox.textContent = "Chưa cấu hình Supabase."; errBox.classList.add("show"); return; }

  try{
    // Xác minh mật khẩu cũ bằng cách thử đăng nhập lại (Supabase không có API verify password riêng)
    const { error: verifyError } = await sb.auth.signInWithPassword({
      email: currentUser.email, password: oldP
    });
    if(verifyError){
      errBox.textContent = "Mật khẩu hiện tại không đúng."; errBox.classList.add("show");
      return;
    }

    const { error } = await sb.auth.updateUser({ password: newP });
    if(error){
      errBox.textContent = error.message; errBox.classList.add("show");
      return;
    }
    okBox.textContent = "Đổi mật khẩu thành công!"; okBox.classList.add("show");
    document.getElementById("p_old_pass").value = "";
    document.getElementById("p_new_pass").value = "";
    document.getElementById("p_new_pass2").value = "";
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase."; errBox.classList.add("show");
  }
}

/* ============================================================
   INIT — kiểm tra session Supabase hiện có (tự khôi phục, không
   cần tự quản lý token vì supabase-js tự lưu trong localStorage)
============================================================ */
/* ============================================================
   CHUÔNG THÔNG BÁO — đọc từ bảng `notifications` (admin đăng ở
   admin.html, tab "Thông báo KH"). Trạng thái "đã đọc" lưu theo
   trình duyệt (localStorage), không cần bảng riêng cho từng user.
============================================================ */
const NOTIF_SEEN_KEY = 'pda_notif_last_seen';
let cachedNotifs = [];

async function loadNotifications(){
  if(!isConfigured()) return;
  try{
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30);
    if(error) throw error;
    cachedNotifs = data || [];
  } catch(e){
    document.getElementById('notifDropdownBody').innerHTML =
      `<div style="padding:18px; font-size:12.5px; color:var(--ink-soft);">Không tải được thông báo.</div>`;
    return;
  }
  renderNotifBadge();
  renderNotifDropdown();
}

function renderNotifBadge(){
  const lastSeen = localStorage.getItem(NOTIF_SEEN_KEY);
  const unread = lastSeen
    ? cachedNotifs.filter(n => new Date(n.created_at) > new Date(lastSeen)).length
    : cachedNotifs.length;

  const badge = document.getElementById('notifBadge');
  if(unread > 0){
    badge.style.display = 'block';
    badge.textContent = unread > 9 ? '9+' : unread;
  } else {
    badge.style.display = 'none';
  }
}

function renderNotifDropdown(){
  const body = document.getElementById('notifDropdownBody');
  if(!cachedNotifs.length){
    body.innerHTML = `<div style="padding:18px; font-size:12.5px; color:var(--ink-soft);">Chưa có thông báo nào.</div>`;
    return;
  }
  const lastSeen = localStorage.getItem(NOTIF_SEEN_KEY);
  body.innerHTML = cachedNotifs.map(n => {
    const isUnread = !lastSeen || new Date(n.created_at) > new Date(lastSeen);
    return `<div class="notif-item ${isUnread ? 'unread' : ''}">
      <div class="ni-title">${isUnread ? '🔵 ' : ''}${esc(n.title)}</div>
      <div class="ni-msg">${esc(n.message)}</div>
      <div class="ni-time">${new Date(n.created_at).toLocaleString('vi-VN')}</div>
    </div>`;
  }).join('');
}

function toggleNotifDropdown(){
  const dd = document.getElementById('notifDropdown');
  const willShow = !dd.classList.contains('show');
  dd.classList.toggle('show', willShow);

  if(willShow){
    // Đánh dấu đã đọc tất cả khi mở dropdown
    if(cachedNotifs.length){
      localStorage.setItem(NOTIF_SEEN_KEY, cachedNotifs[0].created_at);
    }
    setTimeout(() => { renderNotifBadge(); renderNotifDropdown(); }, 300);
  }
}

document.addEventListener('click', (e) => {
  const dd = document.getElementById('notifDropdown');
  const bell = document.getElementById('notifBell');
  if(dd && dd.classList.contains('show') && !dd.contains(e.target) && !bell.contains(e.target)){
    dd.classList.remove('show');
  }
});

/* =====================================================================
   PWA + PUSH NOTIFICATIONS (KHÁCH HÀNG)
===================================================================== */
const VAPID_PUBLIC_KEY = 'BG-05O8BGI8t3nAP5u4kyGqglq4okyWhzqAFb30zYigLxW8q7MlP13C7ZKN-MpqfnqVFWMTl81WJRWgDp9NPoGs';

function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW đăng ký lỗi:', e));
}

async function refreshPushStatus(){
  const box = document.getElementById('pushStatusBox');
  const btn = document.getElementById('pushActionBtn');
  if(!box || !btn) return;

  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    box.innerHTML = '<span style="color:var(--coral-deep);">⚠️ Trình duyệt này không hỗ trợ thông báo đẩy.</span>';
    btn.style.display = 'none';
    return;
  }
  if(Notification.permission === 'denied'){
    box.innerHTML = '<span style="color:var(--coral-deep);">⚠️ Bạn đã chặn thông báo trước đó. Vào cài đặt trình duyệt để bật lại.</span>';
    btn.style.display = 'none';
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if(sub){
    box.innerHTML = '<span style="color:#3E9B4F;">✅ Thông báo đang BẬT trên thiết bị này.</span>';
    btn.textContent = 'Tắt thông báo';
    btn.dataset.mode = 'disable';
  } else {
    box.textContent = 'Chưa bật thông báo trên thiết bị này.';
    btn.textContent = 'Bật thông báo';
    btn.dataset.mode = 'enable';
  }
  btn.style.display = 'inline-flex';
}

async function handlePushAction(){
  const btn = document.getElementById('pushActionBtn');
  const reg = await navigator.serviceWorker.ready;

  if(btn.dataset.mode === 'disable'){
    const sub = await reg.pushManager.getSubscription();
    if(sub){
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    showToast('Đã tắt thông báo.');
    return refreshPushStatus();
  }

  try{
    const permission = await Notification.requestPermission();
    if(permission !== 'granted'){
      showToast('Bạn cần cho phép thông báo để dùng tính năng này.');
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    const subJson = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: currentUser.id,
      is_admin: false,
      endpoint: subJson.endpoint,
      p256dh: subJson.keys.p256dh,
      auth_key: subJson.keys.auth,
    }, { onConflict: 'endpoint' });
    if(error) throw error;

    showToast('✅ Đã bật thông báo!');
    refreshPushStatus();
  } catch(e){
    showToast('Lỗi: ' + e.message);
  }
}

(async function init(){
  const inMaintenance = await checkMaintenanceMode();
  if(inMaintenance) return; // Dừng hẳn — không tải/gửi thêm bất kỳ dữ liệu nào khác

  if(isRecoveryFlow){
    // Link khôi phục mật khẩu -> hiện form đặt mật khẩu mới, không vào dashboard.
    document.getElementById("authWrap").style.display     = "block";
    document.getElementById("loginWrap").style.display    = "none";
    document.getElementById("registerWrap").style.display = "none";
    document.getElementById("forgotWrap").style.display   = "none";
    document.getElementById("resetWrap").style.display    = "flex";
    document.getElementById("dashWrap").classList.remove("show");
    return;
  }

  if(!isConfigured()){ showLogin(); return; }

  const { data } = await sb.auth.getSession();
  if(data?.session){
    await enterDashboard();
  } else {
    showLogin();
  }
})();
