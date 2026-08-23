


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
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig",
  BANK_ID: "970407",
  BANK_NAME: "Techcombank",
  ACCOUNT_NUMBER: "3838648888",
  ACCOUNT_NAME: "LE PHAT DAT",
  PAYOS_RETURN_URL: "https://phatdatagency.id.vn/payment-success",
  PAYOS_CANCEL_URL: "https://phatdatagency.id.vn/payment-cancel",
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* Luồng tài khoản bị khoá.
   Giữ nguyên session để trang kháng nghị xác định đúng người đang đăng nhập. */
const ACCOUNT_HOME_URL = '/account/index.html';
const LOCKED_ACCOUNT_URL = '/account/locked_account/';

/* Nạp cấu hình thanh toán thật từ site_config (đồng bộ với admin tab "Thanh toán") */
(async () => {
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', 'payment_config').single();
    const c = data?.value;
    if(!c) return;
    if(c.bankName)  CONFIG.BANK_NAME      = c.bankName;
    if(c.bankId)    CONFIG.BANK_ID        = c.bankId;
    if(c.accNum)    CONFIG.ACCOUNT_NUMBER = c.accNum;
    if(c.accName)   CONFIG.ACCOUNT_NAME   = c.accName;
    if(c.returnUrl) CONFIG.PAYOS_RETURN_URL = c.returnUrl;
    if(c.cancelUrl) CONFIG.PAYOS_CANCEL_URL = c.cancelUrl;
  } catch(e){ /* giữ mặc định nếu chưa cấu hình */ }
})();

/* Vẫn giữ listener này như lớp bảo vệ thứ 2 (đăng xuất tự động khi user
   đăng xuất ở tab khác) — nhưng không còn dùng để phát hiện recovery nữa. */
sb.auth.onAuthStateChange((event) => {
  if(event === 'SIGNED_OUT'){ exitDashboard(); }
});

/* ============================================================
   STATE
============================================================ */
let currentUser = null;   // { id, name, email }

/* Thanh tìm kiếm trên dashboard chỉ điều hướng tới khu vực dịch vụ,
   không can thiệp vào dữ liệu hay luồng xác thực hiện có. */
const dashServiceSearch = document.getElementById('dashServiceSearch');
if(dashServiceSearch){
  dashServiceSearch.addEventListener('keydown', e => {
    if(e.key === 'Enter') window.location.href = '/#services';
  });
  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && document.body.classList.contains('dashboard-active')){
      e.preventDefault();
      dashServiceSearch.focus();
    }
  });
}

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
  const { data: profile, error: profileError } = await sb
    .from('profiles')
    .select('full_name, email, is_locked, is_priority')
    .eq('id', session.user.id)
    .single();

  // Không mở dashboard khi chưa kiểm tra được trạng thái tài khoản.
  if(profileError){
    exitDashboard();
    const errBox = document.getElementById('loginErr');
    errBox.textContent = 'Chưa thể kiểm tra trạng thái tài khoản. Vui lòng thử lại.';
    errBox.classList.add('show');
    return;
  }

  // Tài khoản bị khoá -> giữ session và chuyển tới trang kháng nghị.
  if(profile?.is_locked){
    window.location.replace(LOCKED_ACCOUNT_URL);
    return;
  }

  currentUser = {
    id: session.user.id,
    name: profile?.full_name || session.user.email,
    email: profile?.email || session.user.email,
    isPriority: !!profile?.is_priority,
    createdAt: session.user.created_at || null,
    emailVerified: !!session.user.email_confirmed_at
  };

  document.getElementById("authWrap").style.display = "none";
  document.getElementById("dashWrap").classList.add("show");
  document.getElementById("dashWrap").classList.toggle("vip-mode", currentUser.isPriority);
  document.body.classList.add("dashboard-active");

  const initial = (currentUser.name || "U")[0].toUpperCase();
  document.getElementById("sideAvatar").textContent = initial;
  document.getElementById("sideName").innerHTML = escHtml(currentUser.name || "Người dùng")
    + (currentUser.isPriority ? '<span class="vip-badge-pill">✨ Ưu tiên</span>' : '');
  document.getElementById("sideEmail").textContent  = currentUser.email || "";
  document.getElementById("p_name").value  = currentUser.name  || "";
  document.getElementById("p_email").value = currentUser.email || "";

  document.getElementById("ovAvatar").textContent = initial;
  document.getElementById("ovName").innerHTML = escHtml(currentUser.name || "Người dùng")
    + ' <span class="verified-badge" title="Đã xác thực">✔️</span>'
    + (currentUser.isPriority ? '<span class="vip-badge-pill">✨ Ưu tiên</span>' : '');
  document.getElementById("ovEmail").textContent = currentUser.email || "";
  renderAccountProfile();

  switchDashTab("profile");
  loadUserOrders();
  refreshWalletBalance();

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

/* Đồng bộ dữ liệu tài khoản hiện có vào giao diện hồ sơ mới.
   Không phát sinh cột dữ liệu hoặc truy vấn backend mới. */
function renderAccountProfile(){
  if(!currentUser) return;

  const name = currentUser.name || 'Người dùng';
  const email = currentUser.email || '';
  const initial = name.trim().charAt(0).toUpperCase() || 'U';
  const username = (email.split('@')[0] || name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if(el) el.textContent = value;
  };

  setText('profileAvatar', initial);
  setText('profileDisplayName', name);
  setText('profileEmailText', email);
  setText('profileRoleText', currentUser.isPriority ? 'Khách hàng ưu tiên' : 'Thành viên');
  setText('profileTierText', currentUser.isPriority ? 'Ưu tiên' : 'Khách hàng');
  setText('topAvatar', initial);
  setText('topUserName', name);

  const usernameInput = document.getElementById('p_username');
  if(usernameInput) usernameInput.value = username || 'tai-khoan';

  const created = currentUser.createdAt ? new Date(currentUser.createdAt) : null;
  setText('profileMemberSince', created && !Number.isNaN(created.getTime())
    ? created.toLocaleDateString('vi-VN')
    : 'Đang cập nhật');
  setText('profileLastUpdate', new Date().toLocaleString('vi-VN', {
    hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'
  }));

  const verified = currentUser.emailVerified;
  const emailState = document.getElementById('profileEmailState');
  if(emailState){
    emailState.textContent = verified ? 'Đã xác minh' : 'Chưa xác minh';
    emailState.className = verified ? 'state-ok' : 'state-warn';
  }
  setText('profileEmailStatusText', verified ? 'Đã xác minh' : 'Chưa xác minh');
  setText('profileEmailLabelState', verified ? 'Đã xác minh' : 'Chưa xác minh');

  const completed = [name, email, verified].filter(Boolean).length;
  const percent = Math.round((completed / 3) * 100);
  setText('profileCompletionValue', percent + '%');
  const ring = document.getElementById('profileCompletionRing');
  if(ring) ring.style.setProperty('--progress', percent + '%');
}

function exitDashboard(){
  document.getElementById("dashWrap").classList.remove("show");
  document.getElementById("dashWrap").classList.remove("vip-mode");
  document.body.classList.remove("dashboard-active");
  document.getElementById("authWrap").style.display = "block";
  document.getElementById("notifBell").style.display = "none";
  document.getElementById("notifDropdown").classList.remove("show");
  showLogin();
}

function switchDashTab(tab){
  ["overview","wallet","orders","profile","app"].forEach(t => {
    document.getElementById("sec"   + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("active", t===tab);
    document.getElementById("nav"   + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle("active", t===tab);
    const mTab = document.getElementById("mTab" + t.charAt(0).toUpperCase() + t.slice(1));
    if(mTab) mTab.classList.toggle("active", t===tab);
  });
  const breadcrumb = document.getElementById('dashBreadcrumbTitle');
  if(breadcrumb){
    breadcrumb.textContent = ({
      overview:'Tổng quan', wallet:'Nạp tiền', orders:'Nhật ký hoạt động',
      profile:'Tài khoản', app:'Cài ứng dụng'
    })[tab] || 'Tài khoản';
  }
  if(tab === 'app') refreshPushStatus();
  if(tab === 'wallet'){ refreshWalletBalance(); loadWalletHistoryAcc(); }
  if(tab === 'overview'){ refreshWalletBalance(); }
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

  // Đồng bộ sang tab Tổng quan
  const ovTotal = document.getElementById("ovStatTotal");
  const ovDone = document.getElementById("ovStatDone");
  if(ovTotal) ovTotal.textContent = orders.length;
  if(ovDone) ovDone.textContent = orders.filter(o => o["Trạng thái"] === "Hoàn thành").length;
  const profileOrderStatus = document.getElementById('profileOrderStatus');
  if(profileOrderStatus){
    profileOrderStatus.textContent = orders.length
      ? `${orders.length} đơn đã ghi nhận`
      : 'Chưa có đơn hàng';
  }
  renderRecentOrdersOverview(orders.slice(0, 4));

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
    document.getElementById("ovAvatar").textContent = name[0].toUpperCase();
    document.getElementById("ovName").innerHTML = escHtml(name)
      + ' <span class="verified-badge" title="Đã xác thực">✔️</span>'
      + (currentUser.isPriority ? '<span class="vip-badge-pill">✨ Ưu tiên</span>' : '');
    renderAccountProfile();
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

/* ============================================================
   TỔNG QUAN — danh sách đơn gần đây
============================================================ */
function renderRecentOrdersOverview(orders){
  const box = document.getElementById('ovRecentOrders');
  if(!box) return;
  if(!orders.length){
    box.innerHTML = `<div class="orders-empty">Chưa có đơn hàng nào.<br><a href="/#services" style="color:var(--coral-deep);font-weight:600;">Đặt đơn đầu tiên →</a></div>`;
    return;
  }
  box.innerHTML = orders.map(o => {
    const st = o["Trạng thái"] || "Chờ xác nhận";
    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; border-bottom:1px dashed var(--line); font-size:13px;">
      <div>
        <div class="order-code">${esc(o["Mã đơn"])}</div>
        <div style="color:var(--ink-soft); font-size:11.5px;">${esc(o["Loại dịch vụ"]||"")}</div>
      </div>
      <span class="status-pill ${STATUS_MAP[st]||'s-pending'}">${esc(st)}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   VÍ PHATDATAGENCY
============================================================ */
let accWalletBalance = 0;

async function refreshWalletBalance(){
  if(!currentUser) return;
  try{
    const { data, error } = await sb.rpc('get_my_wallet');
    if(error || !data?.ok) return;
    accWalletBalance = Number(data.balance) || 0;
    const a = document.getElementById('ovWalletBalance');
    const b = document.getElementById('walletHeroBalance');
    const c = document.getElementById('profileWalletBalance');
    if(a) a.textContent = accWalletBalance.toLocaleString('vi-VN') + 'đ';
    if(b) b.textContent = accWalletBalance.toLocaleString('vi-VN') + 'đ';
    if(c) c.textContent = accWalletBalance.toLocaleString('vi-VN') + 'đ';
  } catch(e){ /* bỏ qua lỗi mạng tạm thời */ }
}

async function loadWalletHistoryAcc(){
  const box = document.getElementById('walletHistoryBody');
  if(!box || !currentUser) return;
  box.innerHTML = `<div class="orders-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending:false })
      .limit(20);
    if(error) throw error;
    if(!data || !data.length){
      box.innerHTML = `<div class="orders-empty">Chưa có giao dịch nào.</div>`;
      return;
    }
    box.innerHTML = data.map(t => `
      <div class="wallet-history-row">
        <div>
          <span style="color:${t.type==='nap'?'var(--sage)':'var(--coral-deep)'}; font-weight:600;">
            ${t.type === 'nap' ? '+' : '−'}${Number(t.amount).toLocaleString('vi-VN')}đ
          </span>
          <div style="color:var(--ink-soft); font-size:11.5px; margin-top:2px;">${esc(t.note||'')}</div>
        </div>
        <div style="color:var(--ink-soft); font-size:11px; white-space:nowrap;">${new Date(t.created_at).toLocaleString('vi-VN')}</div>
      </div>`).join('');
  } catch(e){
    box.innerHTML = `<div class="orders-empty">Không tải được: ${esc(e.message)}</div>`;
  }
}

function toggleAccTopupPanel(){
  const panel = document.getElementById('accTopupPanel');
  panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
}

async function startAccTopup(){
  const amount = Number(document.getElementById('acc_topup_amount').value);
  const method = document.getElementById('acc_topup_method').value;
  const msg = document.getElementById('accTopupMsg');
  msg.className = '';

  if(!amount || amount < 10000){
    msg.textContent = 'Số tiền nạp tối thiểu là 10.000đ.';
    msg.className = 'err-msg show';
    return;
  }
  if(!currentUser) return;

  const now = new Date();
  const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
  const randPart = Math.floor(1000 + Math.random()*9000);
  const topupCode = `NAP-${datePart}-${randPart}`;

  try{
    const { error: insertErr } = await sb.from('wallet_topup_requests').insert({
      code: topupCode, user_id: currentUser.id, amount
    });
    if(insertErr) throw insertErr;

    const resultBox = document.getElementById('accTopupResult');
    resultBox.style.display = 'block';

    if(method === 'PayOS'){
      resultBox.innerHTML = `<div style="text-align:center; padding:16px 0;">Đang tạo mã thanh toán...</div>`;
      const { data, error } = await sb.functions.invoke('create-payos-link', {
        body: {
          orderCode: topupCode, amount, description: topupCode,
          returnUrl: CONFIG.PAYOS_RETURN_URL, cancelUrl: CONFIG.PAYOS_CANCEL_URL,
          buyerName: currentUser.name || '', buyerPhone: '',
        }
      });
      if(!error && data?.ok && data.checkoutUrl){
        const qrImgUrl = data.qrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.qrCode)}` : null;
        resultBox.innerHTML = `
          ${qrImgUrl ? `<img src="${qrImgUrl}" alt="QR nạp tiền" width="200" height="200" style="border-radius:12px; border:1px solid var(--line); background:#fff; padding:8px;">` : ''}
          <div style="margin-top:12px;"><a href="${data.checkoutUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">⚡ Mở trang thanh toán →</a></div>`;
        startAccTopupPolling();
      } else {
        resultBox.innerHTML = `<div class="ok-msg show err-msg">Không tạo được link, thử lại hoặc chọn VietQR.</div>`;
      }
    } else {
      const qrUrl = `https://img.vietqr.io/image/${CONFIG.BANK_ID}-${CONFIG.ACCOUNT_NUMBER}-compact2.png`
        + `?amount=${amount}&addInfo=${encodeURIComponent(topupCode)}&accountName=${encodeURIComponent(CONFIG.ACCOUNT_NAME)}`;
      resultBox.innerHTML = `
        <img src="${qrUrl}" alt="QR nạp tiền VietQR" width="200" height="200" style="border-radius:12px; border:1px solid var(--line); background:#fff; padding:8px;">
        <div style="margin-top:10px; font-size:12.5px; color:var(--ink-soft);">Chuyển khoản đúng nội dung <b>${topupCode}</b> để hệ thống tự nhận ra.</div>`;
      startAccTopupPolling();
    }
  } catch(err){
    msg.textContent = 'Lỗi: ' + err.message;
    msg.className = 'err-msg show';
  }
}

let _accTopupPollTimer = null;
function startAccTopupPolling(){
  if(_accTopupPollTimer) clearInterval(_accTopupPollTimer);
  let tries = 0;
  const before = accWalletBalance;
  _accTopupPollTimer = setInterval(async () => {
    tries++;
    if(tries > 225){ clearInterval(_accTopupPollTimer); return; }
    await refreshWalletBalance();
    if(accWalletBalance > before){
      clearInterval(_accTopupPollTimer);
      document.getElementById('accTopupResult').innerHTML =
        `<div style="font-size:14px; color:var(--sage); font-weight:600;">✅ Nạp tiền thành công! Số dư mới: ${accWalletBalance.toLocaleString('vi-VN')}đ</div>`;
      loadWalletHistoryAcc();
    }
  }, 4000);
}
