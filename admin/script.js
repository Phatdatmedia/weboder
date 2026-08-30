/* =====================================================================
   CẤU HÌNH — PHẢI giống hệt URL/key trong file index.html
===================================================================== */
const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig"
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* =====================================================================
   AUTH / LOGIN — dùng Supabase Auth, chỉ user có is_admin=true trong
   bảng profiles mới được coi là admin hợp lệ.
===================================================================== */
let currentAdmin = null; // { id, email }

function showLoginScreen(){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('dashShell').style.display = 'none';
  document.getElementById('adminPassword').value = '';
  document.getElementById('loginError').classList.remove('show');
  setTimeout(()=> document.getElementById('adminEmail').focus(), 100);
}
function showDashShell(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashShell').style.display = 'flex';
  loadDashboard();
  startAppealWatcher();
  startForceLogoutWatcher();
}

/* ============================================================
   CHỐNG DÒ MẬT KHẨU ADMIN — khoá tạm tăng dần, nghiêm ngặt hơn login
   khách vì đây là tài khoản có toàn quyền quản trị. Lớp bảo vệ bổ sung
   ở client; Supabase Auth đã tự giới hạn theo IP ở phía server.
============================================================ */
const ADMIN_LOGIN_LOCK_KEY = 'pda_admin_login_attempts';

function getAdminLoginLockState(){
  try{ return JSON.parse(localStorage.getItem(ADMIN_LOGIN_LOCK_KEY)) || { fails: 0, lockUntil: 0 }; }
  catch(e){ return { fails: 0, lockUntil: 0 }; }
}
function setAdminLoginLockState(state){ localStorage.setItem(ADMIN_LOGIN_LOCK_KEY, JSON.stringify(state)); }
function checkAdminLoginLocked(){
  const state = getAdminLoginLockState();
  if(state.lockUntil > Date.now()){
    const secs = Math.ceil((state.lockUntil - Date.now()) / 1000);
    document.getElementById('loginError').textContent = `Nhập sai quá nhiều lần. Vui lòng thử lại sau ${secs} giây.`;
    document.getElementById('loginError').classList.add('show');
    return true;
  }
  return false;
}
function registerAdminLoginFail(){
  const state = getAdminLoginLockState();
  state.fails = (state.fails || 0) + 1;
  // Nghiêm ngặt hơn khách: khoá từ lần sai thứ 3 -> 30s, tăng gấp đôi mỗi lần, tối đa 15 phút
  if(state.fails >= 3){
    const lockSeconds = Math.min(30 * Math.pow(2, state.fails - 3), 900);
    state.lockUntil = Date.now() + lockSeconds * 1000;
  }
  setAdminLoginLockState(state);
}
function registerAdminLoginSuccess(){ setAdminLoginLockState({ fails: 0, lockUntil: 0 }); }

async function handleAdminLogin(){
  const email    = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const errBox   = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if(checkAdminLoginLocked()) return;

  if(!email || !password){
    errBox.textContent = "Vui lòng nhập email và mật khẩu.";
    errBox.classList.add('show');
    return;
  }
  if(!isBackendConfigured()){
    errBox.textContent = "Chưa cấu hình Supabase trong code.";
    errBox.classList.add('show');
    return;
  }

  errBox.classList.remove('show');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang kiểm tra...";

  try{
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error){
      registerAdminLoginFail();
      errBox.textContent = "Sai email hoặc mật khẩu.";
      errBox.classList.add('show');
      return;
    }

    // Kiểm tra quyền admin qua bảng profiles
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('is_admin')
      .eq('id', data.user.id)
      .single();

    if(pErr || !profile?.is_admin){
      registerAdminLoginFail();
      await sb.auth.signOut();
      errBox.textContent = "Tài khoản này không có quyền quản trị.";
      errBox.classList.add('show');
      return;
    }
    registerAdminLoginSuccess();

    // Kiểm tra xem tài khoản đã bật 2FA chưa — nếu có, yêu cầu nhập mã trước khi vào dashboard
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aal && aal.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel){
      const { data: factors } = await sb.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.find(f => f.status === 'verified');
      if(totpFactor){
        window._pendingMfaFactorId = totpFactor.id;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mfaScreen').style.display = 'flex';
        document.getElementById('mfaCode').value = '';
        document.getElementById('mfaError').classList.remove('show');
        setTimeout(()=> document.getElementById('mfaCode').focus(), 100);
        return;
      }
    }

    currentAdmin = { id: data.user.id, email: data.user.email };
    showDashShell();
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase. Kiểm tra lại cấu hình.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleMfaVerifyLogin(){
  const code = document.getElementById('mfaCode').value.trim();
  const errBox = document.getElementById('mfaError');
  const btn = document.getElementById('mfaBtn');

  if(!code || code.length !== 6){
    errBox.textContent = "Vui lòng nhập đủ 6 số.";
    errBox.classList.add('show');
    return;
  }
  errBox.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Đang xác nhận...';

  try{
    const factorId = window._pendingMfaFactorId;
    const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId });
    if(chErr) throw chErr;

    const { data: verifyData, error: vErr } = await sb.auth.mfa.verify({
      factorId, challengeId: challenge.id, code
    });
    if(vErr) throw vErr;

    const { data: sessionData } = await sb.auth.getSession();
    currentAdmin = { id: sessionData.session.user.id, email: sessionData.session.user.email };
    document.getElementById('mfaScreen').style.display = 'none';
    showDashShell();
  } catch(e){
    errBox.textContent = "Mã không đúng hoặc đã hết hạn, thử lại.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Xác nhận';
  }
}

async function cancelMfaLogin(){
  try{ await sb.auth.signOut(); } catch{}
  window._pendingMfaFactorId = null;
  document.getElementById('mfaScreen').style.display = 'none';
  showLoginScreen();
}

document.getElementById('mfaCode').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') handleMfaVerifyLogin();
});

async function handleAdminLogout(){
  stopForceLogoutWatcher();
  stopAppealWatcher();
  if(isBackendConfigured()){
    try{ await sb.auth.signOut(); } catch{}
  }
  currentAdmin = null;
  showLoginScreen();
}

document.getElementById('adminPassword').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') handleAdminLogin();
});
document.getElementById('adminEmail').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') document.getElementById('adminPassword').focus();
});

/* =====================================================================
   TOAST
===================================================================== */
let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2600);
}

/* =====================================================================
   BACKEND COMMUNICATION (Supabase)
===================================================================== */
function isBackendConfigured(){
  return CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL.indexOf("PASTE_YOUR") !== 0
      && CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_ANON_KEY.indexOf("PASTE_YOUR") !== 0;
}

/* =====================================================================
   DASHBOARD DATA
===================================================================== */
const STATUS_MAP = {
  "Chờ xác nhận":     { cls: "status-pending",  step: 0 },
  "Đã xác nhận":      { cls: "status-progress", step: 1 },
  "Đang thực hiện":   { cls: "status-progress", step: 2 },
  "Hoàn thành":       { cls: "status-done",     step: 3 },
  "Đã huỷ":           { cls: "status-cancel",   step: -1 }
};

let allOrders = [];

async function loadDashboard(){
  const tableBody = document.getElementById('dashTableBody');

  if(!isBackendConfigured()){
    tableBody.innerHTML = `<div class="dash-empty">Chưa kết nối Supabase.<br>Hãy dán URL + anon key vào biến <code>CONFIG</code> trong code.</div>`;
    return;
  }
  if(!currentAdmin){
    showLoginScreen();
    return;
  }

  tableBody.innerHTML = `<div class="dash-loading">Đang tải dữ liệu...</div>`;

  try{
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if(error){
      tableBody.innerHTML = `<div class="dash-empty">Lỗi: ${escapeHtml(error.message)}</div>`;
      return;
    }

    allOrders = (data||[]).map(o => ({
      "Mã đơn": o.order_code,
      "Họ tên": o.customer_name,
      "SĐT": o.phone,
      "Email": o.email,
      "Loại dịch vụ": o.service_type,
      "Ngân sách": o.budget,
      "Mô tả yêu cầu": o.description,
      "Số tiền": o.amount,
      "Doanh thu thực": o.actual_revenue,
      "Loại TT": o.payment_type,
      "Giá trị đơn": o.total_price,
      "Phương thức TT": o.payment_method,
      "Thời gian đặt": new Date(o.created_at).toLocaleString('vi-VN'),
      "_createdAtRaw": o.created_at,
      "Trạng thái": o.status
    }));
    renderDashboard(allOrders);
    initRevenueDateRange();
  } catch(err){
    tableBody.innerHTML = `<div class="dash-empty">Không thể kết nối Supabase.</div>`;
  }
}

function renderDashboard(orders){
  renderGreeting();

  document.getElementById('statTotal').textContent = orders.length;
  const pendingCount = orders.filter(o=> o["Trạng thái"] === "Chờ xác nhận").length;
  document.getElementById('statPending').textContent = pendingCount;
  document.getElementById('statProgress').textContent = orders.filter(o=> ["Đã xác nhận","Đang thực hiện"].includes(o["Trạng thái"])).length;
  document.getElementById('statDone').textContent = orders.filter(o=> o["Trạng thái"] === "Hoàn thành").length;

  // Trend/sub-text cho từng KPI — chỉ hiển thị số liệu tính được thật, không bịa %.
  const now = new Date();
  const todayStr = now.toLocaleDateString('vi-VN');
  const ordersToday = orders.filter(o => o["_createdAtRaw"] && new Date(o["_createdAtRaw"]).toLocaleDateString('vi-VN') === todayStr);
  document.getElementById('trendTotal').innerHTML = `<span class="${ordersToday.length>0?'up':'flat'}">+${ordersToday.length} hôm nay</span>`;

  const pendingOrders = orders.filter(o => o["Trạng thái"] === "Chờ xác nhận" && o["_createdAtRaw"]);
  if(pendingOrders.length){
    const oldest = pendingOrders.reduce((a,b) => new Date(a["_createdAtRaw"]) < new Date(b["_createdAtRaw"]) ? a : b);
    const hoursWaiting = Math.round((Date.now() - new Date(oldest["_createdAtRaw"])) / 3600000);
    document.getElementById('trendPending').innerHTML = `<span class="${hoursWaiting>=24?'down':'flat'}">chờ lâu nhất: ${hoursWaiting}h</span>`;
  } else {
    document.getElementById('trendPending').innerHTML = `<span class="up">không có đơn chờ</span>`;
  }
  document.getElementById('trendProgress').innerHTML = `&nbsp;`;
  const doneCount = orders.filter(o=> o["Trạng thái"] === "Hoàn thành").length;
  document.getElementById('trendDone').innerHTML = orders.length ? `<span class="flat">${Math.round(doneCount/orders.length*100)}% tổng đơn</span>` : '&nbsp;';

  // Banner ưu tiên: chỉ hiện khi có đơn chờ xác nhận
  const banner = document.getElementById('attentionBanner');
  if(pendingCount > 0){
    banner.style.display = 'flex';
    document.getElementById('attentionText').textContent =
      `Có ${pendingCount} đơn đang chờ xác nhận`;
  } else {
    banner.style.display = 'none';
  }

  // Tất cả các mốc doanh thu đều tính theo "Doanh thu thực" (nhập tay) để đồng bộ
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
  const sumActual = (list) => list.reduce((s,o)=> s + (Number(o["Doanh thu thực"]) || 0), 0);

  const revToday = sumActual(ordersToday);
  const revWeek  = sumActual(orders.filter(o => o["_createdAtRaw"] && new Date(o["_createdAtRaw"]) >= weekAgo));
  const revMonth = sumActual(orders.filter(o => {
    if(!o["_createdAtRaw"]) return false;
    const d = new Date(o["_createdAtRaw"]);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }));
  const revTotal = sumActual(orders);

  document.getElementById('statRevenueToday').textContent = revToday.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueWeek').textContent  = revWeek.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueMonth').textContent = revMonth.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueTotal').textContent = revTotal.toLocaleString('vi-VN') + 'đ';

  loadTodayViewsQuickStat();
  renderRevenueBarChart(orders);
  renderStatusDonut(orders);
  renderTopServices(orders);
  renderRecentOrdersFeed(orders);

  const tableBody = document.getElementById('dashTableBody');
  if(orders.length === 0){
    tableBody.innerHTML = `<div class="dash-empty">Chưa có đơn hàng nào.</div>`;
    return;
  }

  let html = `<table class="dash-table"><thead><tr>
    <th>Mã đơn</th><th>Khách hàng</th><th>Dịch vụ</th><th>Ngân sách</th><th>Mô tả yêu cầu</th><th>Số tiền</th><th>Doanh thu thực</th><th>Thanh toán</th><th>Thời gian</th><th>Trạng thái</th>
  </tr></thead><tbody>`;

  orders.forEach(o=>{
    const status = o["Trạng thái"] || "Chờ xác nhận";
    const code = escapeHtml(o["Mã đơn"]);
    const descFull = o["Mô tả yêu cầu"] || '';
    const descShort = descFull.length > 60 ? descFull.slice(0,60) + '…' : descFull;
    const amountVal = o["Số tiền"] != null ? Number(o["Số tiền"]).toLocaleString('vi-VN') + 'đ' : '—';
    const totalVal = o["Giá trị đơn"] != null ? ` / ${Number(o["Giá trị đơn"]).toLocaleString('vi-VN')}đ` : '';
    const actualRevenueVal = o["Doanh thu thực"] != null ? o["Doanh thu thực"] : '';
    html += `<tr>
      <td class="dt-code">${code}</td>
      <td>${escapeHtml(o["Họ tên"])}<br><span style="color:var(--ink-soft); font-size:11.5px;">${escapeHtml(o["SĐT"]||'')}</span></td>
      <td>${escapeHtml(o["Loại dịch vụ"]||'')}</td>
      <td style="font-size:12px; font-family:var(--font-mono); color:var(--ink-soft); white-space:nowrap;">${escapeHtml(o["Ngân sách"]||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft); max-width:220px;" title="${escapeHtml(descFull)}">${escapeHtml(descShort||'—')}</td>
      <td style="font-size:12px; font-family:var(--font-mono); white-space:nowrap;">${amountVal}${totalVal}<br><span style="color:var(--ink-soft); font-size:10.5px;">${escapeHtml(o["Loại TT"]||'')}</span></td>
      <td>
        <input type="number" class="actual-revenue-input" data-code="${code}" value="${actualRevenueVal}" placeholder="Nhập số tiền"
          style="width:110px; padding:6px 8px; border:1.5px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-family:var(--font-mono); font-size:12px;">
      </td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(o["Phương thức TT"]||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(o["Thời gian đặt"]||'')}</td>
      <td>${renderStatusSelect(code, status)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  tableBody.innerHTML = html;

  tableBody.querySelectorAll('.status-select').forEach(sel=>{
    sel.addEventListener('change', (e)=> handleStatusChange(e.target.dataset.code, e.target.value, e.target));
  });
  tableBody.querySelectorAll('.actual-revenue-input').forEach(inp=>{
    inp.addEventListener('change', (e)=> handleActualRevenueChange(e.target.dataset.code, e.target.value, e.target));
  });
}

function renderStatusSelect(code, currentStatus){
  const meta = STATUS_MAP[currentStatus] || { cls: "status-pending" };
  const options = Object.keys(STATUS_MAP).map(s =>
    `<option value="${escapeHtml(s)}" ${s === currentStatus ? 'selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');
  return `<select class="status-select ${meta.cls}" data-code="${code}">${options}</select>`;
}

/* ── Lời chào theo giờ + ngày hôm nay ── */
function renderGreeting(){
  const h = new Date().getHours();
  const greet = h < 11 ? 'Chào buổi sáng' : h < 13 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const name = currentAdmin?.email ? currentAdmin.email.split('@')[0] : 'admin';
  document.getElementById('overviewGreeting').textContent = `${greet}, ${name} 👋`;
  document.getElementById('overviewDate').textContent =
    new Date().toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
}

/* ── Biểu đồ cột doanh thu 7 ngày gần nhất (SVG/CSS thuần, không cần thư viện) ── */
function renderRevenueBarChart(orders){
  const box = document.getElementById('revenueBarChart');
  const days = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date(); d.setDate(d.getDate() - i);
    const dStr = d.toLocaleDateString('vi-VN');
    const total = orders
      .filter(o => o["_createdAtRaw"] && new Date(o["_createdAtRaw"]).toLocaleDateString('vi-VN') === dStr)
      .reduce((s,o)=> s + (Number(o["Doanh thu thực"]) || 0), 0);
    days.push({ label: `${d.getDate()}/${d.getMonth()+1}`, total });
  }
  const max = Math.max(...days.map(d=>d.total), 1);

  box.innerHTML = days.map(d => `
    <div class="bar-col">
      <div class="bar-value">${d.total>0 ? (d.total>=1000000 ? (d.total/1000000).toFixed(1)+'tr' : Math.round(d.total/1000)+'k') : ''}</div>
      <div class="bar" style="height:${Math.max(d.total/max*110, d.total>0?4:2)}px;" title="${d.total.toLocaleString('vi-VN')}đ"></div>
      <div class="bar-label">${d.label}</div>
    </div>`).join('');
}

/* ── Donut tỷ lệ trạng thái đơn (vẽ bằng SVG conic thủ công qua stroke-dasharray) ── */
function renderStatusDonut(orders){
  const box = document.getElementById('statusDonutChart');
  const counts = {};
  Object.keys(STATUS_MAP).forEach(s => counts[s] = 0);
  orders.forEach(o => { const s = o["Trạng thái"] || "Chờ xác nhận"; if(counts[s] != null) counts[s]++; });

  const colorMap = {
    "Chờ xác nhận": "#FF5A3C", "Đã xác nhận": "#F5B85C", "Đang thực hiện": "#5CA8D6",
    "Hoàn thành": "#8FB07E", "Đã huỷ": "#5C5650"
  };
  const total = orders.length || 1;
  let offset = 0;
  const circumference = 2 * Math.PI * 40;

  const segments = Object.entries(counts).filter(([,c]) => c > 0).map(([status, count]) => {
    const frac = count / total;
    const dash = frac * circumference;
    const seg = `<circle cx="50" cy="50" r="40" fill="none" stroke="${colorMap[status]||'#888'}" stroke-width="14"
      stroke-dasharray="${dash} ${circumference-dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 50 50)"/>`;
    offset += dash;
    return seg;
  }).join('');

  const legend = Object.entries(counts).map(([status,count]) => `
    <div class="dl-item">
      <span class="dl-dot" style="background:${colorMap[status]||'#888'};"></span>
      <span>${escapeHtml(status)}</span>
      <span class="dl-count">${count}</span>
    </div>`).join('');

  box.innerHTML = `
    <svg viewBox="0 0 100 100" width="130" height="130">${segments}
      <text x="50" y="46" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)">${orders.length}</text>
      <text x="50" y="60" text-anchor="middle" font-size="8" fill="var(--ink-soft)">đơn</text>
    </svg>
    <div class="donut-legend">${legend}</div>`;
}

/* ── Top 5 dịch vụ theo doanh thu thực ── */
function renderTopServices(orders){
  const box = document.getElementById('topServicesList');
  const byService = {};
  orders.forEach(o => {
    const svc = o["Loại dịch vụ"] || 'Khác';
    byService[svc] = (byService[svc] || 0) + (Number(o["Doanh thu thực"]) || 0);
  });
  const top = Object.entries(byService).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]).slice(0,5);

  if(!top.length){
    box.innerHTML = `<div style="font-size:12.5px; color:var(--ink-soft);">Chưa có doanh thu thực được ghi nhận.</div>`;
    return;
  }
  const max = top[0][1];
  box.innerHTML = top.map(([svc, amount]) => `
    <div class="ts-row">
      <div class="ts-row-top"><span>${escapeHtml(svc)}</span><span class="ts-amount">${amount.toLocaleString('vi-VN')}đ</span></div>
      <div class="ts-bar-track"><div class="ts-bar-fill" style="width:${Math.max(amount/max*100,3)}%;"></div></div>
    </div>`).join('');
}

/* ── 5 đơn hàng mới nhất (feed hoạt động) ── */
function renderRecentOrdersFeed(orders){
  const box = document.getElementById('recentOrdersFeed');
  const recent = orders.slice(0, 5);
  if(!recent.length){
    box.innerHTML = `<div style="font-size:12.5px; color:var(--ink-soft);">Chưa có đơn nào.</div>`;
    return;
  }
  box.innerHTML = recent.map(o => {
    const meta = STATUS_MAP[o["Trạng thái"]] || { cls:'status-pending' };
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px dashed var(--line); font-size:12.5px;">
      <div style="min-width:0;">
        <div style="font-family:var(--font-mono); font-weight:600;">${escapeHtml(o["Mã đơn"])}</div>
        <div style="color:var(--ink-soft); font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(o["Họ tên"]||'')} — ${escapeHtml(o["Loại dịch vụ"]||'')}</div>
      </div>
      <span class="${meta.cls}" style="font-size:10.5px; padding:3px 9px; border-radius:20px; white-space:nowrap;">${escapeHtml(o["Trạng thái"]||'')}</span>
    </div>`;
  }).join('');
}

/* ── Tra cứu doanh thu thực theo khoảng ngày (bao gồm trọn hai ngày) ── */
function formatDateInputLocal(date){
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseRevenueDate(value, endOfDay = false){
  const parts = String(value || '').split('-').map(Number);
  if(parts.length !== 3 || parts.some(n => !Number.isInteger(n))) return null;
  const [year, month, day] = parts;
  const parsed = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if(parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function initRevenueDateRange(){
  const fromInput = document.getElementById('revenueDateFrom');
  const toInput = document.getElementById('revenueDateTo');
  if(!fromInput || !toInput) return;

  if(!fromInput.value || !toInput.value){
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    fromInput.value = formatDateInputLocal(firstDay);
    toInput.value = formatDateInputLocal(today);
  }
  lookupRevenueByDate();
}

function lookupRevenueByDate(){
  const fromInput = document.getElementById('revenueDateFrom');
  const toInput = document.getElementById('revenueDateTo');
  const errorBox = document.getElementById('revenueRangeError');
  const labelBox = document.getElementById('revenueRangeLabel');
  const metaBox = document.getElementById('revenueRangeMeta');
  const totalBox = document.getElementById('revenueRangeTotal');
  if(!fromInput || !toInput || !errorBox || !labelBox || !metaBox || !totalBox) return;

  errorBox.classList.remove('show');
  const fromDate = parseRevenueDate(fromInput.value, false);
  const toDate = parseRevenueDate(toInput.value, true);

  if(!fromDate || !toDate){
    errorBox.textContent = 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
    errorBox.classList.add('show');
    return;
  }
  if(fromDate > toDate){
    errorBox.textContent = 'Từ ngày không được lớn hơn Đến ngày.';
    errorBox.classList.add('show');
    return;
  }

  const matchedOrders = allOrders.filter(order => {
    if(!order["_createdAtRaw"]) return false;
    const createdAt = new Date(order["_createdAtRaw"]);
    return !Number.isNaN(createdAt.getTime()) && createdAt >= fromDate && createdAt <= toDate;
  });
  const ordersWithRevenue = matchedOrders.filter(order => Number(order["Doanh thu thực"]) > 0);
  const totalRevenue = matchedOrders.reduce(
    (sum, order) => sum + (Number(order["Doanh thu thực"]) || 0),
    0
  );

  labelBox.textContent = `Doanh thu từ ${fromDate.toLocaleDateString('vi-VN')} đến ${toDate.toLocaleDateString('vi-VN')}`;
  metaBox.textContent = `${matchedOrders.length} đơn trong khoảng · ${ordersWithRevenue.length} đơn đã ghi nhận doanh thu thực`;
  totalBox.textContent = totalRevenue.toLocaleString('vi-VN') + 'đ';
}

function resetRevenueDateRange(){
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const fromInput = document.getElementById('revenueDateFrom');
  const toInput = document.getElementById('revenueDateTo');
  if(!fromInput || !toInput) return;
  fromInput.value = formatDateInputLocal(firstDay);
  toInput.value = formatDateInputLocal(today);
  lookupRevenueByDate();
}

/* Cập nhật lại các thẻ tổng doanh thu (gọi sau khi sửa Doanh thu thực để không cần tải lại toàn trang) */
function refreshRevenueStats(){
  const now = new Date();
  const todayStr = now.toLocaleDateString('vi-VN');
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000);
  const sumActual = (list) => list.reduce((s,o)=> s + (Number(o["Doanh thu thực"]) || 0), 0);

  const revToday = sumActual(allOrders.filter(o => o["_createdAtRaw"] && new Date(o["_createdAtRaw"]).toLocaleDateString('vi-VN') === todayStr));
  const revWeek  = sumActual(allOrders.filter(o => o["_createdAtRaw"] && new Date(o["_createdAtRaw"]) >= weekAgo));
  const revMonth = sumActual(allOrders.filter(o => {
    if(!o["_createdAtRaw"]) return false;
    const d = new Date(o["_createdAtRaw"]);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }));
  const revTotal = sumActual(allOrders);

  document.getElementById('statRevenueToday').textContent = revToday.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueWeek').textContent  = revWeek.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueMonth').textContent = revMonth.toLocaleString('vi-VN') + 'đ';
  document.getElementById('statRevenueTotal').textContent = revTotal.toLocaleString('vi-VN') + 'đ';
  lookupRevenueByDate();
}

async function handleActualRevenueChange(code, rawValue, inputEl){
  const value = rawValue === '' ? null : Number(rawValue);
  if(value != null && (isNaN(value) || value < 0)){
    showToast('Doanh thu thực phải là số hợp lệ, không âm.');
    inputEl.value = allOrders.find(o => o["Mã đơn"] === code)?.["Doanh thu thực"] ?? '';
    return;
  }

  inputEl.disabled = true;
  try{
    const { error } = await sb
      .from('orders')
      .update({ actual_revenue: value })
      .eq('order_code', code);

    if(!error){
      const order = allOrders.find(o => o["Mã đơn"] === code);
      if(order) order["Doanh thu thực"] = value;
      showToast(`Đã lưu doanh thu thực cho đơn ${code}.`);
      logAdminAction('Cập nhật doanh thu thực', `${code} → ${value != null ? value.toLocaleString('vi-VN') + 'đ' : 'trống'}`);
      refreshRevenueStats();
    } else {
      showToast('Lỗi: ' + error.message);
    }
  } catch(err){
    showToast('Không thể kết nối Supabase.');
  } finally {
    inputEl.disabled = false;
  }
}

async function handleStatusChange(code, newStatus, selectEl){
  selectEl.disabled = true;
  try{
    const { error } = await sb
      .from('orders')
      .update({ status: newStatus })
      .eq('order_code', code);

    if(!error){
      showToast(`Đã cập nhật trạng thái đơn ${code}.`);
      logAdminAction('Đổi trạng thái đơn hàng', `${code} → ${newStatus}`);
      const order = allOrders.find(o => o["Mã đơn"] === code);
      if(order) order["Trạng thái"] = newStatus;
      const meta = STATUS_MAP[newStatus] || { cls: "status-pending" };
      selectEl.className = "status-select " + meta.cls;
      document.getElementById('statTotal').textContent = allOrders.length;
      const newPendingCount = allOrders.filter(o=> o["Trạng thái"] === "Chờ xác nhận").length;
      document.getElementById('statPending').textContent = newPendingCount;
      document.getElementById('statProgress').textContent = allOrders.filter(o=> ["Đã xác nhận","Đang thực hiện"].includes(o["Trạng thái"])).length;
      document.getElementById('statDone').textContent = allOrders.filter(o=> o["Trạng thái"] === "Hoàn thành").length;
      const banner2 = document.getElementById('attentionBanner');
      if(newPendingCount > 0){
        banner2.style.display = 'flex';
        document.getElementById('attentionText').textContent = `Có ${newPendingCount} đơn đang chờ xác nhận`;
      } else {
        banner2.style.display = 'none';
      }
    } else {
      showToast("Lỗi: " + error.message);
    }
  } catch(err){
    showToast("Không thể kết nối Supabase.");
  } finally {
    selectEl.disabled = false;
  }
}

/* Lấy nhanh số lượt truy cập hôm nay cho thẻ ở Tổng quan (không phụ thuộc tab Lượt truy cập) */
async function loadTodayViewsQuickStat(){
  const el = document.getElementById('statViewsToday');
  if(!isBackendConfigured() || !currentAdmin){ el.textContent = '—'; return; }
  try{
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const { count, error } = await sb
      .from('page_views')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfDay.toISOString());
    if(error) throw error;
    el.textContent = (count ?? 0).toLocaleString('vi-VN');
  } catch(e){
    el.textContent = '—';
  }
}

/* Cuộn xuống bảng đơn hàng và tự lọc theo "Chờ xác nhận" khi bấm nút ở banner ưu tiên */
function scrollToPendingOrders(){
  const input = document.getElementById('dashSearchInput');
  document.getElementById('dashOrdersTable').scrollIntoView({ behavior:'smooth', block:'start' });
  const pending = allOrders.filter(o => o["Trạng thái"] === "Chờ xác nhận");
  renderOrdersOnly(pending);
  if(input) input.value = '';
}

/* Render lại chỉ phần bảng (không đụng tới thống kê phía trên) — dùng khi lọc nhanh */
function renderOrdersOnly(orders){
  const tableBody = document.getElementById('dashTableBody');
  if(orders.length === 0){
    tableBody.innerHTML = `<div class="dash-empty">Không có đơn nào khớp.</div>`;
    return;
  }
  let html = `<table class="dash-table"><thead><tr>
    <th>Mã đơn</th><th>Khách hàng</th><th>Dịch vụ</th><th>Ngân sách</th><th>Mô tả yêu cầu</th><th>Số tiền</th><th>Doanh thu thực</th><th>Thanh toán</th><th>Thời gian</th><th>Trạng thái</th>
  </tr></thead><tbody>`;
  orders.forEach(o=>{
    const status = o["Trạng thái"] || "Chờ xác nhận";
    const code = escapeHtml(o["Mã đơn"]);
    const descFull = o["Mô tả yêu cầu"] || '';
    const descShort = descFull.length > 60 ? descFull.slice(0,60) + '…' : descFull;
    const amountVal = o["Số tiền"] != null ? Number(o["Số tiền"]).toLocaleString('vi-VN') + 'đ' : '—';
    const totalVal = o["Giá trị đơn"] != null ? ` / ${Number(o["Giá trị đơn"]).toLocaleString('vi-VN')}đ` : '';
    const actualRevenueVal = o["Doanh thu thực"] != null ? o["Doanh thu thực"] : '';
    html += `<tr>
      <td class="dt-code">${code}</td>
      <td>${escapeHtml(o["Họ tên"])}<br><span style="color:var(--ink-soft); font-size:11.5px;">${escapeHtml(o["SĐT"]||'')}</span></td>
      <td>${escapeHtml(o["Loại dịch vụ"]||'')}</td>
      <td style="font-size:12px; font-family:var(--font-mono); color:var(--ink-soft); white-space:nowrap;">${escapeHtml(o["Ngân sách"]||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft); max-width:220px;" title="${escapeHtml(descFull)}">${escapeHtml(descShort||'—')}</td>
      <td style="font-size:12px; font-family:var(--font-mono); white-space:nowrap;">${amountVal}${totalVal}<br><span style="color:var(--ink-soft); font-size:10.5px;">${escapeHtml(o["Loại TT"]||'')}</span></td>
      <td>
        <input type="number" class="actual-revenue-input" data-code="${code}" value="${actualRevenueVal}" placeholder="Nhập số tiền"
          style="width:110px; padding:6px 8px; border:1.5px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-family:var(--font-mono); font-size:12px;">
      </td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(o["Phương thức TT"]||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(o["Thời gian đặt"]||'')}</td>
      <td>${renderStatusSelect(code, status)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  tableBody.innerHTML = html;
  tableBody.querySelectorAll('.status-select').forEach(sel=>{
    sel.addEventListener('change', (e)=> handleStatusChange(e.target.dataset.code, e.target.value, e.target));
  });
  tableBody.querySelectorAll('.actual-revenue-input').forEach(inp=>{
    inp.addEventListener('change', (e)=> handleActualRevenueChange(e.target.dataset.code, e.target.value, e.target));
  });
}

function escapeHtml(str){
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

document.getElementById('dashSearchInput').addEventListener('input', (e)=>{
  const q = e.target.value.trim().toLowerCase();
  if(!q){ renderDashboard(allOrders); return; }
  const filtered = allOrders.filter(o=>
    String(o["Mã đơn"]||'').toLowerCase().includes(q) ||
    String(o["Họ tên"]||'').toLowerCase().includes(q) ||
    String(o["Loại dịch vụ"]||'').toLowerCase().includes(q)
  );
  renderDashboard(filtered);
});

/* =====================================================================
   TAB SWITCHING
===================================================================== */
const ALL_TABS = ['overview','services','projects','users','appeals','announce','payment','contact','traffic','notifs','marketing','coupons','security','pages','livechat','social','app','system','maintenance','boost','adsorders','partners','invoices','contracts'];

function switchTab(tab){
  ALL_TABS.forEach(t => {
    const capT = t.charAt(0).toUpperCase() + t.slice(1);
    document.getElementById('tab'    + capT)?.classList.toggle('active', tab === t);
    document.getElementById('navTab' + capT)?.classList.toggle('active', tab === t);
    const mobileBtn = document.getElementById('mobileTab' + capT);
    if(mobileBtn) mobileBtn.classList.toggle('active', tab === t);
  });

  if(tab === 'services' && allServices.length === 0) loadServicesTable();
  if(tab === 'projects' && allProjects.length === 0) loadProjectsTable();
  if(tab === 'users'    && allUsers.length    === 0) loadUsersTable();
  if(tab === 'appeals') loadAppealsTable();
  if(tab === 'announce') loadAnnounceConfig();
  if(tab === 'payment')  loadPaymentConfig();
  if(tab === 'contact')  loadContactConfig();
  if(tab === 'traffic')  loadTrafficStats();
  if(tab === 'notifs')   loadCustomerNotifs();
  if(tab === 'marketing') loadMarketingConfig();
  if(tab === 'coupons') loadCoupons();
  if(tab === 'security'){ loadSecurityTab(); loadMoneyPinStatus(); }
  if(tab === 'livechat') loadLiveChatTab();
  if(tab === 'social')   loadSocialCareTable();
  if(tab === 'app')      refreshPushStatus();
  if(tab === 'system')   loadAccountTierConfig();
  if(tab === 'maintenance') loadMaintenanceConfig();
  if(tab === 'boost') loadBoostTable();
  if(tab === 'adsorders'){ loadAdsOrders(); loadAdsPricing(); }
  if(tab === 'partners') loadPartners();
  if(tab === 'invoices'){ loadOrdersForInvoice(); loadInvoicesHistory(); }
  if(tab === 'contracts'){ loadContractsHistory(); initSignaturePad('ctSignCanvasA'); }
  if(tab === 'pages') initPagesTab();
}

/* =====================================================================
   SERVICES — CRUD
===================================================================== */
let allServices = [];
let editingServiceId = null;

async function loadServicesTable(){
  const body = document.getElementById('servicesTableBody');

  if(!isBackendConfigured()){
    body.innerHTML = `<div class="dash-empty">Chưa cấu hình Supabase.</div>`;
    return;
  }
  if(!currentAdmin){
    showLoginScreen();
    return;
  }

  body.innerHTML = `<div class="dash-loading">Đang tải dữ liệu...</div>`;

  try{
    const { data, error } = await sb
      .from('services')
      .select('*')
      .order('sort_order', { ascending: true });

    if(error){
      body.innerHTML = `<div class="dash-empty">Lỗi: ${escapeHtml(error.message)}</div>`;
      return;
    }
    allServices = (data||[]).map(s => ({
      "ID": s.id, "Tên dịch vụ": s.name, "Mô tả": s.description,
      "Giá hiển thị": s.price_label, "Trạng thái": s.status, "Thứ tự": s.sort_order,
      "Giá trị đơn": s.price_amount, "Cọc tối thiểu": s.min_deposit
    }));
    renderServicesTable(allServices);
  } catch(err){
    body.innerHTML = `<div class="dash-empty">Không thể kết nối Supabase.</div>`;
  }
}

function renderServicesTable(services){
  const body = document.getElementById('servicesTableBody');
  if(services.length === 0){
    body.innerHTML = `<div class="dash-empty">Chưa có dịch vụ nào. Bấm "+ Thêm dịch vụ" để tạo mới.</div>`;
    return;
  }

  const sorted = services.slice().sort((a,b)=> (Number(a["Thứ tự"])||0) - (Number(b["Thứ tự"])||0));

  let html = `<table class="dash-table"><thead><tr>
    <th>Thứ tự</th><th>Tên dịch vụ</th><th>Giá hiển thị</th><th>Trạng thái</th><th>Thao tác</th>
  </tr></thead><tbody>`;

  sorted.forEach(s=>{
    const isActive = s["Trạng thái"] === "Đang bán";
    html += `<tr>
      <td style="font-family:var(--font-mono); color:var(--ink-soft);">${escapeHtml(s["Thứ tự"])}</td>
      <td><b>${escapeHtml(s["Tên dịch vụ"])}</b><br><span style="font-size:12px; color:var(--ink-soft);">${escapeHtml((s["Mô tả"]||'').slice(0,60))}${(s["Mô tả"]||'').length>60?'…':''}</span></td>
      <td style="font-family:var(--font-mono); font-size:12.5px;">
        ${escapeHtml(s["Giá hiển thị"]||'—')}
        ${s["Giá trị đơn"] != null ? `<br><span style="font-size:11px; color:var(--sage);">${Number(s["Giá trị đơn"]).toLocaleString('vi-VN')}đ${s["Cọc tối thiểu"] != null ? ` · cọc từ ${Number(s["Cọc tối thiểu"]).toLocaleString('vi-VN')}đ` : ''}</span>` : `<br><span style="font-size:11px; color:var(--ink-soft);">Chưa có giá số (Liên hệ)</span>`}
      </td>
      <td><span class="svc-status-pill ${isActive ? 'svc-status-active' : 'svc-status-inactive'}">${escapeHtml(s["Trạng thái"])}</span></td>
      <td>
        <div class="svc-actions">
          <button onclick="openServiceModal('${s["ID"]}')">Sửa</button>
          <button onclick="handleToggleServiceStatus('${s["ID"]}', '${isActive ? 'Ngừng bán' : 'Đang bán'}')">${isActive ? 'Ngừng bán' : 'Mở bán'}</button>
          <button class="danger" onclick="handleDeleteService('${s["ID"]}', '${escapeHtml(s["Tên dịch vụ"]).replace(/'/g,"\\'")}')">Xoá</button>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  body.innerHTML = html;
}

function openServiceModal(id){
  editingServiceId = id || null;
  document.getElementById('serviceModalError').classList.remove('show');

  if(id){
    const svc = allServices.find(s => s["ID"] === id);
    document.getElementById('serviceModalTitle').textContent = "Sửa dịch vụ";
    document.getElementById('svc_name').value = svc ? svc["Tên dịch vụ"] : '';
    document.getElementById('svc_desc').value = svc ? svc["Mô tả"] : '';
    document.getElementById('svc_price').value = svc ? svc["Giá hiển thị"] : '';
    document.getElementById('svc_order').value = svc ? svc["Thứ tự"] : 1;
    document.getElementById('svc_price_amount').value = svc && svc["Giá trị đơn"] != null ? svc["Giá trị đơn"] : '';
    document.getElementById('svc_min_deposit').value = svc && svc["Cọc tối thiểu"] != null ? svc["Cọc tối thiểu"] : '';
    document.getElementById('svc_status').value = svc ? svc["Trạng thái"] : 'Đang bán';
  } else {
    document.getElementById('serviceModalTitle').textContent = "Thêm dịch vụ";
    document.getElementById('svc_name').value = '';
    document.getElementById('svc_desc').value = '';
    document.getElementById('svc_price').value = '';
    document.getElementById('svc_order').value = allServices.length + 1;
    document.getElementById('svc_price_amount').value = '';
    document.getElementById('svc_min_deposit').value = '';
    document.getElementById('svc_status').value = 'Đang bán';
  }

  document.getElementById('serviceModalOverlay').classList.add('show');
}

function closeServiceModal(){
  document.getElementById('serviceModalOverlay').classList.remove('show');
  editingServiceId = null;
}
document.getElementById('serviceModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'serviceModalOverlay') closeServiceModal();
});

async function handleSaveService(){
  const name = document.getElementById('svc_name').value.trim();
  const desc = document.getElementById('svc_desc').value.trim();
  const price = document.getElementById('svc_price').value.trim();
  const order = Number(document.getElementById('svc_order').value) || 1;
  const status = document.getElementById('svc_status').value;
  const priceAmountRaw = document.getElementById('svc_price_amount').value.trim();
  const minDepositRaw = document.getElementById('svc_min_deposit').value.trim();
  const priceAmount = priceAmountRaw === '' ? null : Number(priceAmountRaw);
  const minDeposit = minDepositRaw === '' ? null : Number(minDepositRaw);
  const errBox = document.getElementById('serviceModalError');

  if(!name){
    errBox.textContent = "Vui lòng nhập tên dịch vụ.";
    errBox.classList.add('show');
    return;
  }
  if(priceAmount != null && priceAmount < 0){
    errBox.textContent = "Giá trị đơn không được nhỏ hơn 0.";
    errBox.classList.add('show');
    return;
  }
  if(minDeposit != null && minDeposit < 0){
    errBox.textContent = "Cọc tối thiểu không được nhỏ hơn 0.";
    errBox.classList.add('show');
    return;
  }
  if(priceAmount != null && minDeposit != null && minDeposit > priceAmount){
    errBox.textContent = "Cọc tối thiểu không được lớn hơn giá trị đơn.";
    errBox.classList.add('show');
    return;
  }
  errBox.classList.remove('show');

  const btn = document.getElementById('serviceSaveBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  const row = {
    name, description: desc, price_label: price, status, sort_order: order,
    price_amount: priceAmount, min_deposit: minDeposit
  };

  try{
    let error;
    if(editingServiceId){
      ({ error } = await sb.from('services').update(row).eq('id', editingServiceId));
    } else {
      ({ error } = await sb.from('services').insert(row));
    }

    if(!error){
      showToast(editingServiceId ? "Đã cập nhật dịch vụ." : "Đã thêm dịch vụ mới.");
      closeServiceModal();
      loadServicesTable();
    } else {
      errBox.textContent = error.message;
      errBox.classList.add('show');
    }
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function handleToggleServiceStatus(id, newStatus){
  try{
    const { error } = await sb.from('services').update({ status: newStatus }).eq('id', id);
    if(!error){
      showToast(newStatus === 'Đang bán' ? "Đã mở bán dịch vụ." : "Đã ngừng bán dịch vụ.");
      loadServicesTable();
    } else {
      showToast("Lỗi: " + error.message);
    }
  } catch(err){
    showToast("Không thể kết nối Supabase.");
  }
}

async function handleDeleteService(id, name){
  if(!confirm(`Xoá dịch vụ "${name}"? Hành động này không thể hoàn tác.`)) return;

  try{
    const { error } = await sb.from('services').delete().eq('id', id);
    if(!error){
      showToast("Đã xoá dịch vụ.");
      logAdminAction('Xoá dịch vụ', name);
      loadServicesTable();
    } else {
      showToast("Lỗi: " + error.message);
    }
  } catch(err){
    showToast("Không thể kết nối máy chủ.");
  }
}

/* =====================================================================
   PROJECTS — CRUD
===================================================================== */
let allProjects = [];
let editingProjectId = null;

async function loadProjectsTable(){
  const body = document.getElementById('projectsTableBody');

  if(!isBackendConfigured()){
    body.innerHTML = `<div class="dash-empty">Chưa cấu hình Supabase.</div>`;
    return;
  }
  if(!currentAdmin){ showLoginScreen(); return; }

  body.innerHTML = `<div class="dash-loading">Đang tải dữ liệu...</div>`;

  try{
    const { data, error } = await sb
      .from('projects')
      .select('*')
      .order('sort_order', { ascending: true });

    if(error){
      body.innerHTML = `<div class="dash-empty">Lỗi: ${escapeHtml(error.message)}</div>`;
      return;
    }
    allProjects = (data||[]).map(p => ({
      "ID": p.id, "Tên dự án": p.name, "Mô tả": p.description, "Loại": p.type,
      "Tags": p.tags, "Link demo": p.demo_link,
      "Ảnh thumbnail (URL)": p.thumbnail_url, "Ảnh chi tiết (URL)": p.detail_image_url,
      "Trạng thái": p.status, "Thứ tự": p.sort_order
    }));
    renderProjectsTable(allProjects);
  } catch(err){
    body.innerHTML = `<div class="dash-empty">Không thể kết nối Supabase.</div>`;
  }
}

function renderProjectsTable(projects){
  const body = document.getElementById('projectsTableBody');
  if(projects.length === 0){
    body.innerHTML = `<div class="dash-empty">Chưa có dự án nào. Bấm "+ Thêm dự án" để tạo mới.</div>`;
    return;
  }
  const sorted = projects.slice().sort((a,b) => (Number(a["Thứ tự"])||0) - (Number(b["Thứ tự"])||0));
  let html = `<table class="dash-table"><thead><tr>
    <th>#</th><th>Dự án</th><th>Loại</th><th>Link demo</th><th>Trạng thái</th><th>Thao tác</th>
  </tr></thead><tbody>`;

  sorted.forEach(p => {
    const isVisible = p["Trạng thái"] === "Hiển thị";
    const demo = p["Link demo"] || "";
    html += `<tr>
      <td style="font-family:var(--font-mono);color:var(--ink-soft);">${escapeHtml(p["Thứ tự"])}</td>
      <td>
        <b>${escapeHtml(p["Tên dự án"])}</b><br>
        <span style="font-size:12px;color:var(--ink-soft);">${escapeHtml((p["Mô tả"]||"").slice(0,55))}${(p["Mô tả"]||"").length>55?"…":""}</span>
      </td>
      <td><span class="svc-status-pill svc-status-active" style="background:rgba(122,122,255,0.15);color:#A0A0FF;">${escapeHtml(p["Loại"]||"")}</span></td>
      <td style="font-size:12px;">${demo ? `<a href="${escapeHtml(demo)}" target="_blank" style="color:var(--coral);">Xem ↗</a>` : "—"}</td>
      <td><span class="svc-status-pill ${isVisible ? 'svc-status-active' : 'svc-status-inactive'}">${escapeHtml(p["Trạng thái"])}</span></td>
      <td>
        <div class="svc-actions">
          <button onclick="openProjectModal('${p["ID"]}')">Sửa</button>
          <button onclick="handleToggleProjectStatus('${p["ID"]}','${isVisible ? 'Ẩn' : 'Hiển thị'}')">${isVisible ? 'Ẩn' : 'Hiện'}</button>
          <button class="danger" onclick="handleDeleteProject('${p["ID"]}','${escapeHtml(p["Tên dự án"]).replace(/'/g,"\\'")}')">Xoá</button>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  body.innerHTML = html;
}

function openProjectModal(id){
  editingProjectId = id || null;
  document.getElementById('projectModalError').classList.remove('show');

  if(id){
    const p = allProjects.find(x => x["ID"] === id);
    document.getElementById('projectModalTitle').textContent = "Sửa dự án";
    document.getElementById('prj_name').value   = p ? p["Tên dự án"] : '';
    document.getElementById('prj_desc').value   = p ? p["Mô tả"] : '';
    document.getElementById('prj_type').value   = p ? p["Loại"] : 'Website';
    document.getElementById('prj_tags').value   = p ? p["Tags"] : '';
    document.getElementById('prj_link').value   = p ? p["Link demo"] : '';
    document.getElementById('prj_thumb').value  = p ? p["Ảnh thumbnail (URL)"] : '';
    document.getElementById('prj_detail').value = p ? p["Ảnh chi tiết (URL)"] : '';
    document.getElementById('prj_status').value = p ? p["Trạng thái"] : 'Hiển thị';
    document.getElementById('prj_order').value  = p ? p["Thứ tự"] : 1;
  } else {
    document.getElementById('projectModalTitle').textContent = "Thêm dự án";
    ['prj_name','prj_desc','prj_tags','prj_link','prj_thumb','prj_detail'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('prj_type').value   = 'Website';
    document.getElementById('prj_status').value = 'Hiển thị';
    document.getElementById('prj_order').value  = allProjects.length + 1;
    document.getElementById('prj_thumbStatus').textContent  = '';
    document.getElementById('prj_detailStatus').textContent = '';
  }

  document.getElementById('projectModalOverlay').classList.add('show');
}

function closeProjectModal(){
  document.getElementById('projectModalOverlay').classList.remove('show');
  editingProjectId = null;
}
document.getElementById('projectModalOverlay').addEventListener('click', e => {
  if(e.target.id === 'projectModalOverlay') closeProjectModal();
});

async function handleSaveProject(){
  const name   = document.getElementById('prj_name').value.trim();
  const errBox = document.getElementById('projectModalError');
  if(!name){
    errBox.textContent = "Vui lòng nhập tên dự án.";
    errBox.classList.add('show');
    return;
  }
  errBox.classList.remove('show');

  const btn   = document.getElementById('projectSaveBtn');
  btn.disabled = true; btn.textContent = "Đang lưu...";

  const row = {
    name,
    description       : document.getElementById('prj_desc').value.trim(),
    type              : document.getElementById('prj_type').value,
    tags              : document.getElementById('prj_tags').value.trim(),
    demo_link         : document.getElementById('prj_link').value.trim(),
    thumbnail_url     : document.getElementById('prj_thumb').value.trim(),
    detail_image_url  : document.getElementById('prj_detail').value.trim(),
    status            : document.getElementById('prj_status').value,
    sort_order        : Number(document.getElementById('prj_order').value) || 1
  };

  try{
    let error;
    if(editingProjectId){
      ({ error } = await sb.from('projects').update(row).eq('id', editingProjectId));
    } else {
      ({ error } = await sb.from('projects').insert(row));
    }

    if(!error){
      showToast(editingProjectId ? "Đã cập nhật dự án." : "Đã thêm dự án mới.");
      closeProjectModal();
      allProjects = []; // reset để force reload
      loadProjectsTable();
    } else {
      errBox.textContent = error.message;
      errBox.classList.add('show');
    }
  } catch(err){
    errBox.textContent = "Không thể kết nối Supabase.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = "Lưu dự án";
  }
}

async function handleToggleProjectStatus(id, newStatus){
  try{
    const { error } = await sb.from('projects').update({ status: newStatus }).eq('id', id);
    if(!error){
      showToast(newStatus === 'Hiển thị' ? "Đã hiện dự án." : "Đã ẩn dự án.");
      allProjects = [];
      loadProjectsTable();
    } else { showToast("Lỗi: " + error.message); }
  } catch{ showToast("Không thể kết nối."); }
}

async function handleDeleteProject(id, name){
  if(!confirm(`Xoá dự án "${name}"? Hành động này không thể hoàn tác.`)) return;
  try{
    const { error } = await sb.from('projects').delete().eq('id', id);
    if(!error){
      showToast("Đã xoá dự án.");
      logAdminAction('Xoá dự án', name);
      allProjects = [];
      loadProjectsTable();
    } else { showToast("Lỗi: " + error.message); }
  } catch{ showToast("Không thể kết nối."); }
}

/* =====================================================================
   USERS — Admin view
===================================================================== */
let allUsers = [];

async function loadUsersTable(){
  const body = document.getElementById('usersTableBody');
  if(!isBackendConfigured()){ body.innerHTML = `<div class="dash-empty">Chưa cấu hình Supabase.</div>`; return; }
  if(!currentAdmin){ showLoginScreen(); return; }
  body.innerHTML = `<div class="dash-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if(error){
      body.innerHTML = `<div class="dash-empty">Lỗi: ${escapeHtml(error.message)}</div>`;
      return;
    }
    allUsers = (data||[]).map(u => {
      const accountTier = ['standard','priority','private'].includes(u.account_tier)
        ? u.account_tier
        : (u.is_priority ? 'priority' : 'standard');
      return {
      id: u.id, name: u.full_name, email: u.email,
      registeredAt: new Date(u.created_at).toLocaleDateString('vi-VN'),
      status: u.is_locked ? (u.is_permanently_locked ? 'Khoá vĩnh viễn' : 'Đã khoá') : 'Hoạt động',
      isLocked: !!u.is_locked,
      isPermanent: !!u.is_permanently_locked,
      accountTier,
      isPriority: accountTier === 'priority' || accountTier === 'private',
      isPrivate: accountTier === 'private',
      totalSpent: Number(u.total_spent) || 0,
      walletBalance: Number(u.wallet_balance) || 0
    }});
    renderUsersTable(allUsers);
  } catch{ body.innerHTML = `<div class="dash-empty">Không thể kết nối Supabase.</div>`; }
}

function renderUsersTable(users){
  document.getElementById('uStatAll').textContent      = users.length;
  document.getElementById('uStatActive').textContent   = users.filter(u => u.status === 'Hoạt động').length;
  document.getElementById('uStatLocked').textContent   = users.filter(u => u.isLocked).length;
  document.getElementById('uStatPriority').textContent = users.filter(u => u.accountTier === 'priority').length;
  document.getElementById('uStatPrivate').textContent  = users.filter(u => u.accountTier === 'private').length;

  const body = document.getElementById('usersTableBody');
  if(!users.length){ body.innerHTML = `<div class="dash-empty">Chưa có tài khoản nào.</div>`; return; }

  let html = `<table class="dash-table"><thead><tr>
    <th>Họ tên</th><th>Email</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Hạng KH</th><th>Tổng chi tiêu</th><th>Số dư ví</th><th>Thao tác</th>
  </tr></thead><tbody>`;
  users.forEach(u => {
    const locked = u.isLocked;
    html += `<tr>
      <td>${escapeHtml(u.name||'')}</td>
      <td style="font-family:var(--font-mono);font-size:12.5px;">${escapeHtml(u.email||'')}</td>
      <td style="font-size:12px;color:var(--ink-soft);">${escapeHtml(u.registeredAt||'')}</td>
      <td><span class="svc-status-pill ${u.isPermanent?'appeal-status-permanent':locked?'svc-status-inactive':'svc-status-active'}">${escapeHtml(u.status||'')}</span></td>
      <td><span class="account-tier-badge tier-${u.accountTier}">${u.accountTier === 'private' ? '◆ Private' : u.accountTier === 'priority' ? '✦ Priority' : 'Tiêu chuẩn'}</span>
      </td>
      <td style="font-family:var(--font-mono); font-size:13px; font-weight:600;">${(u.totalSpent||0).toLocaleString('vi-VN')}đ</td>
      <td style="font-family:var(--font-mono); font-size:13px; font-weight:600;">${(u.walletBalance||0).toLocaleString('vi-VN')}đ</td>
      <td>
        <div class="svc-actions">
          <button onclick="handleToggleUser('${u.id}')" style="${locked?'color:var(--sage);':'color:#A8311A;'}">
            ${locked ? 'Mở khoá' : 'Khoá'}
          </button>
          <select class="tier-select tier-select-${u.accountTier}" aria-label="Chọn hạng khách hàng" onchange="handleSetUserTier('${u.id}', this.value, this)">
            <option value="standard" ${u.accountTier === 'standard' ? 'selected' : ''}>Tiêu chuẩn</option>
            <option value="priority" ${u.accountTier === 'priority' ? 'selected' : ''}>Priority</option>
            <option value="private" ${u.accountTier === 'private' ? 'selected' : ''}>Private</option>
          </select>
          <button onclick="openWalletAdjustModal('${u.id}')" style="color:var(--coral-deep);">
            💰 Điều chỉnh ví
          </button>
        </div>
      </td>
    </tr>`;
  });
  html += `</tbody></table>`;
  body.innerHTML = html;
}

async function handleSetUserTier(id, nextTier, selectEl){
  const user = allUsers.find(u => u.id === id);
  const previousTier = user?.accountTier || 'standard';
  const tierLabel = { standard:'Tiêu chuẩn', priority:'Priority', private:'Private' };
  if(!tierLabel[nextTier] || nextTier === previousTier) return;
  if(!confirm(`Chuyển tài khoản "${user?.email || id}" sang hạng ${tierLabel[nextTier]}?`)){
    if(selectEl) selectEl.value = previousTier;
    return;
  }
  if(selectEl) selectEl.disabled = true;
  try{
    const { error } = await sb.rpc('admin_set_account_tier', { p_user_id:id, p_tier:nextTier });
    if(!error){
      showToast(`Đã chuyển sang hạng ${tierLabel[nextTier]}.`);
      logAdminAction('Đổi hạng khách hàng', `${user?.email || id}: ${tierLabel[previousTier]} → ${tierLabel[nextTier]}`);
      allUsers = [];
      loadUsersTable();
    } else {
      if(selectEl) selectEl.value = previousTier;
      showToast('Lỗi: ' + error.message);
    }
  } catch{
    if(selectEl) selectEl.value = previousTier;
    showToast('Không thể kết nối.');
  } finally {
    if(selectEl) selectEl.disabled = false;
  }
}

// Giữ tương thích cho nơi cũ nếu vẫn còn gọi hàm này.
async function handleTogglePriority(id){
  const user = allUsers.find(u => u.id === id);
  return handleSetUserTier(id, user?.accountTier === 'standard' ? 'priority' : 'standard');
}

async function handleToggleUser(id){
  const user  = allUsers.find(u => u.id === id);
  const willLock = user && !user.isLocked;
  const actionLabel = willLock ? 'khoá' : 'mở khoá';
  const permanentWarning = !willLock && user?.isPermanent
    ? '\n\nTài khoản này đang khóa vĩnh viễn. Thao tác này sẽ xóa trạng thái khóa vĩnh viễn và mở lại toàn bộ quyền truy cập.'
    : '';
  if(!confirm(`Bạn muốn ${actionLabel} tài khoản "${user?.email || id}"?${permanentWarning}`)) return;
  try{
    const payload = willLock
      ? { is_locked:true, is_permanently_locked:false }
      : { is_locked:false, is_permanently_locked:false };
    const { error } = await sb.from('profiles').update(payload).eq('id', id);
    if(!error){
      showToast(`Đã ${actionLabel} tài khoản.`);
      logAdminAction(`${willLock ? 'Khoá' : 'Mở khoá'} tài khoản khách`, user?.email || id);
      allUsers = [];
      loadUsersTable();
    } else showToast('Lỗi: ' + error.message);
  } catch{ showToast('Không thể kết nối.'); }
}

document.getElementById('userSearchInput').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  if(!q){ renderUsersTable(allUsers); return; }
  renderUsersTable(allUsers.filter(u =>
    (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)
  ));
});

/* =====================================================================
   ACCOUNT APPEALS — tiếp nhận và duyệt kháng nghị tài khoản bị khóa
===================================================================== */
const APPEAL_STATUS_META = {
  pending:   { label:'Chờ duyệt',     cls:'appeal-status-pending' },
  reviewing: { label:'Đang xem xét',  cls:'appeal-status-reviewing' },
  needs_info:{ label:'Chờ khách bổ sung', cls:'appeal-status-needs-info' },
  approved:  { label:'Đã phê duyệt',  cls:'appeal-status-approved' },
  rejected:  { label:'Khóa vĩnh viễn', cls:'appeal-status-rejected' },
};

let allAccountAppeals = [];
let activeAppealFilter = 'all';
let currentAppealId = null;
let appealBadgeTimer = null;
let appealRealtimeChannel = null;

function formatAppealDate(value){
  if(!value) return '—';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('vi-VN', {
    hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'
  });
}

function renderAppealStatus(status){
  const meta = APPEAL_STATUS_META[status] || APPEAL_STATUS_META.pending;
  return `<span class="appeal-status ${meta.cls}">${meta.label}</span>`;
}

function updateAppealBadges(count){
  ['appealNavBadge','appealMobileBadge'].forEach(id => {
    const badge = document.getElementById(id);
    if(!badge) return;
    badge.hidden = count < 1;
    badge.textContent = count > 99 ? '99+' : String(count);
  });
}

async function loadAppealBadge(){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    const { count, error } = await sb
      .from('account_appeals')
      .select('id', { count:'exact', head:true })
      .in('status', ['pending','reviewing']);
    if(error) throw error;
    updateAppealBadges(Number(count) || 0);
  } catch(error){
    updateAppealBadges(0);
  }
}

function startAppealWatcher(){
  stopAppealWatcher();
  loadAppealBadge();
  appealBadgeTimer = setInterval(loadAppealBadge, 30000);

  try{
    appealRealtimeChannel = sb
      .channel('admin-account-appeals')
      .on('postgres_changes', {
        event:'*', schema:'public', table:'account_appeals'
      }, () => {
        loadAppealBadge();
        if(document.getElementById('tabAppeals')?.classList.contains('active')){
          loadAppealsTable({ silent:true });
        }
      })
      .subscribe();
  } catch(error){ /* Bộ đếm 30 giây vẫn hoạt động nếu Realtime chưa bật. */ }
}

function stopAppealWatcher(){
  if(appealBadgeTimer){ clearInterval(appealBadgeTimer); appealBadgeTimer = null; }
  if(appealRealtimeChannel){
    sb.removeChannel(appealRealtimeChannel);
    appealRealtimeChannel = null;
  }
}

async function loadAppealsTable({ silent = false } = {}){
  const body = document.getElementById('appealsTableBody');
  if(!body) return;
  if(!isBackendConfigured()){
    body.innerHTML = `<div class="dash-empty">Chưa cấu hình Supabase.</div>`;
    return;
  }
  if(!currentAdmin){ showLoginScreen(); return; }
  if(!silent) body.innerHTML = `<div class="dash-loading">Đang tải kháng nghị...</div>`;

  try{
    const { data, error } = await sb
      .from('account_appeals')
      .select('id, user_id, email, reason, contact, status, admin_note, submitted_at, reviewed_at')
      .order('submitted_at', { ascending:false });

    if(error) throw error;

    const userIds = [...new Set((data || []).map(row => row.user_id).filter(Boolean))];
    const profileMap = new Map();
    if(userIds.length){
      const { data: profiles, error: profileError } = await sb
      .from('profiles')
        .select('id, full_name, email, is_locked, is_permanently_locked')
        .in('id', userIds);
      if(!profileError){
        (profiles || []).forEach(profile => profileMap.set(profile.id, profile));
      }
    }

    allAccountAppeals = (data || []).map(row => {
      const profile = profileMap.get(row.user_id) || {};
      return {
        ...row,
        name: profile.full_name || 'Người dùng',
        email: row.email || profile.email || '',
        isLocked: profile.is_locked !== false,
        isPermanent: !!profile.is_permanently_locked,
      };
    });

    updateAppealStats();
    applyAppealFilters();
    updateAppealBadges(allAccountAppeals.filter(row => ['pending','reviewing'].includes(row.status)).length);
  } catch(error){
    body.innerHTML = `<div class="dash-empty">Không tải được kháng nghị: ${escapeHtml(error.message)}<br><small>Kiểm tra bảng <code>account_appeals</code> và quyền RLS dành cho admin.</small></div>`;
  }
}

function updateAppealStats(){
  document.getElementById('aStatPending').textContent = allAccountAppeals.filter(row => row.status === 'pending').length;
  document.getElementById('aStatReviewing').textContent = allAccountAppeals.filter(row => row.status === 'reviewing').length;
  document.getElementById('aStatNeedsInfo').textContent = allAccountAppeals.filter(row => row.status === 'needs_info').length;
  document.getElementById('aStatApproved').textContent = allAccountAppeals.filter(row => row.status === 'approved').length;
  document.getElementById('aStatRejected').textContent = allAccountAppeals.filter(row => row.status === 'rejected').length;
}

function setAppealFilter(status, button){
  activeAppealFilter = status;
  document.querySelectorAll('[data-appeal-filter]').forEach(item => item.classList.toggle('active', item === button));
  applyAppealFilters();
}

function applyAppealFilters(){
  const query = (document.getElementById('appealSearchInput')?.value || '').trim().toLowerCase();
  const filtered = allAccountAppeals.filter(row => {
    const statusMatch = activeAppealFilter === 'all' || row.status === activeAppealFilter;
    const searchMatch = !query || [row.name,row.email,row.reason,row.contact,row.admin_note]
      .some(value => String(value || '').toLowerCase().includes(query));
    return statusMatch && searchMatch;
  });
  renderAppealsTable(filtered);
}

function renderAppealsTable(appeals){
  const body = document.getElementById('appealsTableBody');
  const resultCount = document.getElementById('appealResultCount');
  if(resultCount) resultCount.textContent = `${appeals.length} kháng nghị được hiển thị`;

  if(!appeals.length){
    body.innerHTML = `<div class="dash-empty">Không có kháng nghị phù hợp.</div>`;
    return;
  }

  let html = `<table class="dash-table"><thead><tr>
    <th>Khách hàng</th><th>Nội dung</th><th>Liên hệ</th><th>Thời gian gửi</th><th>Trạng thái</th><th>Thao tác</th>
  </tr></thead><tbody>`;

  appeals.forEach(appeal => {
    const reason = appeal.reason || '';
    const preview = reason.length > 105 ? reason.slice(0,105) + '…' : reason;
    const initial = (appeal.name || appeal.email || 'A').trim().charAt(0).toUpperCase();
    html += `<tr>
      <td><div class="appeal-user-cell"><span class="appeal-user-avatar">${escapeHtml(initial)}</span><div><strong>${escapeHtml(appeal.name)}</strong><span>${escapeHtml(appeal.email)}</span>${appeal.isPermanent?'<span class="appeal-permanent-label">Khóa vĩnh viễn</span>':''}</div></div></td>
      <td><div class="appeal-reason-preview" title="${escapeHtml(reason)}">${escapeHtml(preview)}</div></td>
      <td style="font-size:11.5px;color:var(--ink-soft);">${escapeHtml(appeal.contact || '—')}</td>
      <td style="font-size:11px;color:var(--ink-soft);white-space:nowrap;">${formatAppealDate(appeal.submitted_at)}</td>
      <td>${renderAppealStatus(appeal.status)}</td>
      <td><button class="appeal-open-btn" onclick="openAppealModal('${appeal.id}')">Xem & xử lý</button></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  body.innerHTML = html;
}

function openAppealModal(id){
  const appeal = allAccountAppeals.find(row => row.id === id);
  if(!appeal) return;
  currentAppealId = id;

  const meta = APPEAL_STATUS_META[appeal.status] || APPEAL_STATUS_META.pending;
  const statusEl = document.getElementById('appealModalStatus');
  statusEl.className = `appeal-status ${meta.cls}`;
  statusEl.textContent = meta.label;

  document.getElementById('appealModalCode').textContent = `Mã yêu cầu: ${appeal.id}`;
  document.getElementById('appealModalAvatar').textContent = (appeal.name || appeal.email || 'A').trim().charAt(0).toUpperCase();
  document.getElementById('appealModalName').textContent = appeal.name || 'Người dùng';
  document.getElementById('appealModalEmail').textContent = appeal.email || '—';
  document.getElementById('appealModalSubmitted').textContent = formatAppealDate(appeal.submitted_at);
  document.getElementById('appealModalContact').textContent = appeal.contact || 'Không cung cấp';
  document.getElementById('appealModalAccountState').textContent = appeal.isPermanent
    ? 'Khóa vĩnh viễn'
    : appeal.isLocked ? 'Đang bị khóa' : 'Đang hoạt động';
  document.getElementById('appealModalReviewed').textContent = appeal.reviewed_at ? formatAppealDate(appeal.reviewed_at) : 'Chưa xử lý';
  document.getElementById('appealModalReason').textContent = appeal.reason || '—';
  document.getElementById('appealAdminNote').value = appeal.admin_note || '';
  document.getElementById('appealModalError').classList.remove('show');

  const isWaitingForCustomer = appeal.status === 'needs_info';
  const isClosed = appeal.isPermanent || isWaitingForCustomer || ['approved','rejected'].includes(appeal.status);
  document.getElementById('appealReviewActions').hidden = isClosed;
  document.getElementById('appealClosedNote').hidden = !isClosed;
  document.getElementById('appealClosedNote').textContent = appeal.isPermanent
    ? 'Tài khoản đang bị khóa vĩnh viễn. Chỉ có thể mở tại danh sách Người dùng hoặc thao tác thủ công trong Supabase.'
    : isWaitingForCustomer
      ? 'Đã gửi yêu cầu bổ sung. Hệ thống đang chờ khách cập nhật và gửi lại kháng nghị.'
      : 'Kháng nghị này đã được xử lý.';
  document.getElementById('appealReviewingBtn').style.display = appeal.status === 'pending' ? 'inline-flex' : 'none';
  document.getElementById('appealNeedsInfoBtn').style.display = appeal.status === 'reviewing' ? 'inline-flex' : 'none';
  document.getElementById('appealReviewOverlay').classList.add('show');
}

function closeAppealModal(){
  currentAppealId = null;
  document.getElementById('appealReviewOverlay').classList.remove('show');
  document.getElementById('appealModalError').classList.remove('show');
}

function setAppealActionLoading(loading){
  ['appealReviewingBtn','appealNeedsInfoBtn','appealRejectBtn','appealApproveBtn'].forEach(id => {
    const button = document.getElementById(id);
    if(button) button.disabled = loading;
  });
}

async function handleAppealAction(nextStatus){
  const appeal = allAccountAppeals.find(row => row.id === currentAppealId);
  if(!appeal || !currentAdmin) return;

  const note = document.getElementById('appealAdminNote').value.trim();
  const errorBox = document.getElementById('appealModalError');
  errorBox.classList.remove('show');

  if(['needs_info','rejected'].includes(nextStatus) && note.length < 5){
    errorBox.textContent = nextStatus === 'needs_info'
      ? 'Vui lòng ghi rõ thông tin khách cần bổ sung.'
      : 'Vui lòng nhập lý do từ chối và khóa vĩnh viễn tài khoản.';
    errorBox.classList.add('show');
    return;
  }

  if(nextStatus === 'approved' && appeal.isPermanent){
    errorBox.textContent = 'Tài khoản đang khóa vĩnh viễn. Chỉ được mở tại danh sách Người dùng hoặc trực tiếp trong Supabase.';
    errorBox.classList.add('show');
    return;
  }

  const confirmMessage = nextStatus === 'approved'
    ? `Phê duyệt kháng nghị và mở khóa tài khoản “${appeal.email}”?`
    : nextStatus === 'rejected'
      ? `Từ chối kháng nghị và khóa vĩnh viễn tài khoản “${appeal.email}”?\n\nTài khoản chỉ có thể được mở lại thủ công trong danh sách Người dùng hoặc Supabase.`
      : nextStatus === 'needs_info'
        ? `Gửi yêu cầu bổ sung thông tin cho “${appeal.email}”?`
        : `Chuyển kháng nghị của “${appeal.email}” sang trạng thái đang xem xét?`;
  if(!confirm(confirmMessage)) return;

  setAppealActionLoading(true);
  try{
    const payload = { status:nextStatus };
    if(note) payload.admin_note = note;
    if(['needs_info','approved','rejected'].includes(nextStatus)) payload.reviewed_at = new Date().toISOString();

    const { error } = await sb
      .from('account_appeals')
      .update(payload)
      .eq('id', appeal.id);
    if(error) throw error;

    const actionLabel = nextStatus === 'approved' ? 'Phê duyệt kháng nghị'
      : nextStatus === 'rejected' ? 'Từ chối và khóa vĩnh viễn tài khoản'
      : nextStatus === 'needs_info' ? 'Yêu cầu khách bổ sung thông tin'
      : 'Tiếp nhận kháng nghị';
    logAdminAction(actionLabel, `${appeal.email} — ${note || 'Không có ghi chú'}`);

    if(nextStatus === 'approved'){
      const { data: profile } = await sb
        .from('profiles')
        .select('is_locked, is_permanently_locked')
        .eq('id', appeal.user_id)
        .single();
      showToast(profile?.is_locked === false && profile?.is_permanently_locked !== true
        ? 'Đã phê duyệt và mở khóa tài khoản.'
        : 'Đã duyệt kháng nghị. Hãy kiểm tra trigger mở khóa trong SQL.');
    } else if(nextStatus === 'rejected'){
      const { data: profile } = await sb
        .from('profiles')
        .select('is_locked, is_permanently_locked')
        .eq('id', appeal.user_id)
        .single();
      showToast(profile?.is_locked === true && profile?.is_permanently_locked === true
        ? 'Đã từ chối kháng nghị và khóa vĩnh viễn tài khoản.'
        : 'Đã từ chối kháng nghị. Hãy kiểm tra lại trigger khóa vĩnh viễn trong SQL.');
    } else if(nextStatus === 'needs_info'){
      showToast('Đã yêu cầu khách bổ sung thông tin.');
    } else {
      showToast('Đã chuyển sang đang xem xét.');
    }

    closeAppealModal();
    allUsers = [];
    await loadAppealsTable({ silent:true });
  } catch(error){
    errorBox.textContent = error?.message?.includes('ACCOUNT_PERMANENTLY_LOCKED')
      ? 'Tài khoản đã bị khóa vĩnh viễn. Chỉ có thể mở tại danh sách Người dùng hoặc trực tiếp trong Supabase.'
      : `Không thể cập nhật: ${error.message}`;
    errorBox.classList.add('show');
  } finally {
    setAppealActionLoading(false);
  }
}

document.getElementById('appealSearchInput').addEventListener('input', applyAppealFilters);
document.getElementById('appealReviewOverlay').addEventListener('click', event => {
  if(event.target.id === 'appealReviewOverlay') closeAppealModal();
});

/* =====================================================================
   ANNOUNCE CONFIG — lưu vào bảng `site_config` trong Supabase
   Cấu trúc bảng:
     CREATE TABLE site_config (
       key   TEXT PRIMARY KEY,
       value JSONB NOT NULL,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );
===================================================================== */
const ANN_KEY = 'announce_popup';

async function loadAnnounceConfig(){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', ANN_KEY).single();
    if(data?.value){
      const c = data.value;
      document.getElementById('ann_enabled').checked    = c.enabled !== false;
      document.getElementById('ann_tag').value          = c.tag       || '';
      document.getElementById('ann_title').value        = c.title     || '';
      document.getElementById('ann_desc').value         = c.desc      || '';
      document.getElementById('ann_btnText').value      = c.btnText   || '';
      document.getElementById('ann_btnUrl').value       = c.btnUrl    || '';
      document.getElementById('ann_image').value        = c.image     || '';
      document.getElementById('ann_delay').value        = c.delay     ?? 900;
      document.getElementById('ann_storageKey').value   = c.storageKey|| 'announce_hide_v1';
      updateImagePreview(c.image || '');
    }
  } catch(e){ /* bảng chưa có row → bỏ qua */ }
}

async function saveAnnounceConfig(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }
  const title = document.getElementById('ann_title').value.trim();
  if(!title){ showToast('Vui lòng nhập tiêu đề thông báo.'); return; }

  const cfg = {
    enabled    : document.getElementById('ann_enabled').checked,
    tag        : document.getElementById('ann_tag').value.trim(),
    title,
    desc       : document.getElementById('ann_desc').value.trim(),
    btnText    : document.getElementById('ann_btnText').value.trim(),
    btnUrl     : document.getElementById('ann_btnUrl').value.trim(),
    image      : document.getElementById('ann_image').value.trim(),
    delay      : Number(document.getElementById('ann_delay').value) || 900,
    storageKey : document.getElementById('ann_storageKey').value.trim() || 'announce_hide_v1',
  };

  const btn = document.querySelector('#tabAnnounce .btn-primary');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { error } = await sb.from('site_config').upsert(
      { key: ANN_KEY, value: cfg, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;
    showToast('✅ Đã lưu cấu hình thông báo!');
  } catch(e){
    showToast('Lỗi: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* Upload ảnh dự án (thumbnail / ảnh chi tiết) từ máy lên Supabase Storage,
   dùng chung bucket "site-assets" đã tạo cho ảnh popup thông báo. */
async function handleProjectImageUpload(input, targetFieldId, statusElId){
  const file = input.files?.[0];
  if(!file) return;
  const statusEl = document.getElementById(statusElId);

  if(!isBackendConfigured()){
    statusEl.textContent = 'Chưa cấu hình Supabase.';
    return;
  }
  if(file.size > 5 * 1024 * 1024){
    statusEl.textContent = 'Ảnh quá lớn (tối đa 5MB).';
    input.value = '';
    return;
  }

  statusEl.textContent = 'Đang tải lên...';
  try{
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `projects/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

    const { error: upErr } = await sb.storage.from(ANNOUNCE_BUCKET).upload(path, file, {
      cacheControl: '3600', upsert: false
    });
    if(upErr) throw upErr;

    const { data: pub } = sb.storage.from(ANNOUNCE_BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if(!publicUrl) throw new Error('Không lấy được URL ảnh sau khi tải lên.');

    document.getElementById(targetFieldId).value = publicUrl;
    statusEl.textContent = '✅ Đã tải ảnh lên.';
  } catch(e){
    statusEl.textContent = 'Lỗi tải ảnh: ' + e.message
      + (e.message?.includes('not found') || e.message?.includes('Bucket')
        ? ' (kiểm tra bucket "site-assets" đã tạo public chưa)'
        : '');
  } finally {
    input.value = '';
  }
}

/* Xem trước ảnh khi paste URL */
document.getElementById('ann_image').addEventListener('input', e => {
  updateImagePreview(e.target.value.trim());
});
function updateImagePreview(url){
  const wrap = document.getElementById('ann_imgPreview');
  const img  = document.getElementById('ann_imgPreviewEl');
  if(url){ wrap.style.display='block'; img.src=url; }
  else   { wrap.style.display='none';  img.src=''; }
}

/* Upload ảnh minh hoạ từ máy lên Supabase Storage (bucket "site-assets", public)
   Nếu bucket chưa tồn tại, tạo trong Supabase Dashboard → Storage → New bucket
   → tên "site-assets" → tick "Public bucket". */
const ANNOUNCE_BUCKET = 'site-assets';

async function handleAnnounceImageUpload(input){
  const file = input.files?.[0];
  if(!file) return;
  const statusEl = document.getElementById('ann_uploadStatus');

  if(!isBackendConfigured()){
    statusEl.textContent = 'Chưa cấu hình Supabase.';
    return;
  }
  if(file.size > 5 * 1024 * 1024){
    statusEl.textContent = 'Ảnh quá lớn (tối đa 5MB).';
    input.value = '';
    return;
  }

  statusEl.textContent = 'Đang tải lên...';
  try{
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `announce/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`;

    const { error: upErr } = await sb.storage.from(ANNOUNCE_BUCKET).upload(path, file, {
      cacheControl: '3600', upsert: false
    });
    if(upErr) throw upErr;

    const { data: pub } = sb.storage.from(ANNOUNCE_BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if(!publicUrl) throw new Error('Không lấy được URL ảnh sau khi tải lên.');

    document.getElementById('ann_image').value = publicUrl;
    updateImagePreview(publicUrl);
    statusEl.textContent = '✅ Đã tải ảnh lên. Nhớ bấm "Lưu cấu hình" để áp dụng.';
  } catch(e){
    statusEl.textContent = 'Lỗi tải ảnh: ' + e.message
      + (e.message?.includes('not found') || e.message?.includes('Bucket')
        ? ' (kiểm tra đã tạo bucket "site-assets" là public trong Supabase Storage chưa)'
        : '');
  } finally {
    input.value = '';
  }
}

/* Tự động tăng version storage key */
function bumpStorageKey(){
  const el  = document.getElementById('ann_storageKey');
  const val = el.value.trim();
  const m   = val.match(/^(.+_v)(\d+)$/);
  if(m) el.value = m[1] + (parseInt(m[2]) + 1);
  else  el.value = val + '_v2';
  showToast('Đã tăng version → ' + el.value);
}

/* Preview popup */
function renderAnnouncePreview(){
  const enabled  = document.getElementById('ann_enabled').checked;
  const tag      = document.getElementById('ann_tag').value.trim();
  const title    = document.getElementById('ann_title').value.trim();
  const desc     = document.getElementById('ann_desc').value.trim();
  const btnText  = document.getElementById('ann_btnText').value.trim() || 'Xem ngay';
  const image    = document.getElementById('ann_image').value.trim();
  const box      = document.getElementById('annPreviewBox');

  if(!enabled){
    box.className = 'announce-preview';
    box.innerHTML = '⚫ Popup đang <b>tắt</b> — khách sẽ không thấy thông báo.';
    return;
  }
  if(!title){
    box.className = 'announce-preview';
    box.innerHTML = 'Nhập tiêu đề để xem preview.';
    return;
  }

  box.className = 'announce-preview has-content';
  box.innerHTML = `
    ${image ? `<img class="ap-img" src="${escapeHtml(image)}" alt="Banner" onerror="this.style.display='none'">` : ''}
    <div class="ap-body">
      ${tag   ? `<div class="ap-tag">${escapeHtml(tag)}</div>` : ''}
      <div class="ap-title">${escapeHtml(title)}</div>
      ${desc  ? `<div class="ap-desc">${desc}</div>` : ''}
    </div>
    <div class="ap-footer">
      <span style="font-size:12px;color:var(--ink-soft);text-decoration:underline;cursor:pointer;">Bỏ qua</span>
      <span class="ap-btn">${escapeHtml(btnText)}</span>
    </div>`;
}

/* =====================================================================
   PAYMENT CONFIG — lưu vào bảng `site_config`
===================================================================== */
const PAY_KEY = 'payment_config';
let payConfigHistory = [];

async function loadPaymentConfig(){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', PAY_KEY).single();
    if(data?.value){
      const c = data.value;
      document.getElementById('pay_depositAmount').value = c.depositAmount || 500000;
      document.getElementById('pay_depositDesc').value   = c.depositDesc   || 'Dat coc don hang';
      document.getElementById('pay_bankName').value      = c.bankName      || '';
      document.getElementById('pay_bankId').value        = c.bankId        || '';
      document.getElementById('pay_accNum').value        = c.accNum        || '';
      document.getElementById('pay_accName').value       = c.accName       || '';
      document.getElementById('pay_returnUrl').value     = c.returnUrl     || '';
      document.getElementById('pay_cancelUrl').value     = c.cancelUrl     || '';
    }
  } catch(e){ /* bảng chưa có row → bỏ qua */ }
}

async function savePaymentConfig(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }

  const depositAmount = Number(document.getElementById('pay_depositAmount').value) || 0;
  if(depositAmount < 1000){ showToast('Số tiền đặt cọc tối thiểu 1.000đ.'); return; }

  // PayOS BẮT BUỘC description không dấu, tối đa 25 ký tự -> tự động loại bỏ dấu
  // để tránh lỗi tạo link thanh toán dù admin có gõ dấu hay không.
  const rawDesc = document.getElementById('pay_depositDesc').value.trim();
  const cleanDesc = rawDesc
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '') // bỏ ký tự đặc biệt còn sót
    .slice(0, 25);
  document.getElementById('pay_depositDesc').value = cleanDesc; // cập nhật lại UI cho khớp giá trị thật sẽ lưu

  const cfg = {
    depositAmount,
    depositDesc : cleanDesc,
    bankName    : document.getElementById('pay_bankName').value.trim(),
    bankId      : document.getElementById('pay_bankId').value.trim(),
    accNum      : document.getElementById('pay_accNum').value.trim(),
    accName     : document.getElementById('pay_accName').value.trim().toUpperCase(),
    returnUrl   : document.getElementById('pay_returnUrl').value.trim(),
    cancelUrl   : document.getElementById('pay_cancelUrl').value.trim(),
  };

  const btn = document.querySelector('#tabPayment .btn-primary');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { error } = await sb.from('site_config').upsert(
      { key: PAY_KEY, value: cfg, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;

    // Ghi lịch sử
    payConfigHistory.unshift({
      time: new Date().toLocaleString('vi-VN'),
      by: currentAdmin.email,
      amount: depositAmount,
    });
    renderPayHistory();
    showToast('✅ Đã lưu cấu hình thanh toán!');
    logAdminAction('Lưu cấu hình thanh toán', `Cọc mặc định: ${depositAmount.toLocaleString('vi-VN')}đ`);

  } catch(e){
    showToast('Lỗi: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function renderPayHistory(){
  const el = document.getElementById('payConfigHistory');
  if(!payConfigHistory.length){
    el.textContent = 'Chưa có thay đổi nào trong phiên này.';
    return;
  }
  el.innerHTML = payConfigHistory.map(h =>
    `<div style="padding:8px 0; border-bottom:1px solid var(--line);">
       <span style="font-family:var(--font-mono);font-size:11.5px;color:var(--ink-soft);">${h.time}</span>
       &nbsp;·&nbsp; Lưu bởi <b>${escapeHtml(h.by)}</b>
       &nbsp;·&nbsp; Đặt cọc: <b>${Number(h.amount).toLocaleString('vi-VN')}đ</b>
     </div>`
  ).join('');
}

/* Xem thử QR VietQR */
function previewVietQR(){
  const bankId  = document.getElementById('pay_bankId').value.trim();
  const accNum  = document.getElementById('pay_accNum').value.trim();
  const accName = document.getElementById('pay_accName').value.trim();
  const amount  = document.getElementById('pay_depositAmount').value || 500000;
  if(!bankId || !accNum){ showToast('Nhập mã ngân hàng và số tài khoản trước.'); return; }

  const url = `https://img.vietqr.io/image/${bankId}-${accNum}-compact2.png`
            + `?amount=${amount}&addInfo=PREVIEW&accountName=${encodeURIComponent(accName)}`;
  const img  = document.getElementById('vietqrPreviewImg');
  const wrap = document.getElementById('vietqrPreview');
  img.src = url;
  wrap.style.display = 'block';
  showToast('Đang tải QR preview...');
}

/* =====================================================================
   CONTACT CONFIG — lưu vào bảng `site_config`
===================================================================== */
const CONTACT_KEY = 'contact_info';

async function loadContactConfig(){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', CONTACT_KEY).single();
    if(data?.value){
      const c = data.value;
      document.getElementById('ct_phone').value        = c.phone       || '';
      document.getElementById('ct_email').value        = c.email       || '';
      document.getElementById('ct_zalo').value          = c.zalo        || '';
      document.getElementById('ct_facebook').value      = c.facebook    || '';
      document.getElementById('ct_address').value       = c.address     || '';
      document.getElementById('ct_popupEnabled').checked = c.popupEnabled !== false;
    }
  } catch(e){ /* bảng/row chưa có → dùng giá trị trống mặc định */ }
  renderContactPreview();
}

async function saveContactConfig(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }

  const cfg = {
    phone       : document.getElementById('ct_phone').value.trim(),
    email       : document.getElementById('ct_email').value.trim(),
    zalo        : document.getElementById('ct_zalo').value.trim(),
    facebook    : document.getElementById('ct_facebook').value.trim(),
    address     : document.getElementById('ct_address').value.trim(),
    popupEnabled: document.getElementById('ct_popupEnabled').checked,
  };

  const btn = document.querySelector('#tabContact .btn-primary');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { error } = await sb.from('site_config').upsert(
      { key: CONTACT_KEY, value: cfg, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;
    showToast('✅ Đã lưu cấu hình liên hệ!');
    logAdminAction('Lưu cấu hình liên hệ', `Zalo: ${cfg.zalo || '—'}, Điện thoại: ${cfg.phone || '—'}`);
  } catch(e){
    showToast('Lỗi: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function renderContactPreview(){
  const box = document.getElementById('contactPreviewBox');
  const rows = [
    ['📞', document.getElementById('ct_phone').value.trim()],
    ['✉️', document.getElementById('ct_email').value.trim()],
    ['💬', document.getElementById('ct_zalo').value.trim() ? 'Zalo: ' + document.getElementById('ct_zalo').value.trim() : ''],
    ['📘', document.getElementById('ct_facebook').value.trim() ? 'Facebook: ' + document.getElementById('ct_facebook').value.trim() : ''],
    ['📍', document.getElementById('ct_address').value.trim()],
  ].filter(r => r[1]);

  if(!rows.length){
    box.textContent = 'Chưa có kênh liên hệ nào — trang chủ sẽ không hiện mục liên hệ.';
    return;
  }
  box.innerHTML = rows.map(r => `<div style="padding:4px 0;">${r[0]} ${escapeHtml(r[1])}</div>`).join('');
}
['ct_phone','ct_email','ct_zalo','ct_facebook','ct_address'].forEach(id=>{
  document.getElementById(id).addEventListener('input', renderContactPreview);
});

/* =====================================================================
   TRAFFIC STATS — đọc từ bảng `page_views` (ghi log từ index.html)
===================================================================== */
async function loadTrafficStats(){
  if(!isBackendConfigured() || !currentAdmin) return;

  const since30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  let rows = [];
  try{
    const { data, error } = await sb
      .from('page_views')
      .select('created_at, device, browser, referrer')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(20000);
    if(error) throw error;
    rows = data || [];
  } catch(e){
    document.getElementById('tfChart').innerHTML =
      `<span style="color:var(--coral-deep);">Không tải được dữ liệu: ${escapeHtml(e.message)}<br>
       (kiểm tra đã tạo bảng <code>page_views</code> và policy cho admin đọc chưa)</span>`;
    document.getElementById('tfDevice').textContent   = '—';
    document.getElementById('tfBrowser').textContent  = '—';
    document.getElementById('tfReferrer').textContent = '—';
    document.getElementById('tfToday').textContent = '—';
    document.getElementById('tfWeek').textContent  = '—';
    document.getElementById('tfTotal').textContent = '—';
    return;
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString('vi-VN');
  const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);

  document.getElementById('tfTotal').textContent = rows.length.toLocaleString('vi-VN');
  document.getElementById('tfToday').textContent = rows.filter(r =>
    new Date(r.created_at).toLocaleDateString('vi-VN') === todayStr
  ).length.toLocaleString('vi-VN');
  document.getElementById('tfWeek').textContent = rows.filter(r =>
    new Date(r.created_at) >= weekAgo
  ).length.toLocaleString('vi-VN');

  renderTrafficChart(rows);
  renderTrafficBreakdown(rows, 'device',   'tfDevice');
  renderTrafficBreakdown(rows, 'browser',  'tfBrowser');
  renderTrafficReferrer(rows, 'tfReferrer');
}

function renderTrafficChart(rows){
  const days = [];
  for(let i = 13; i >= 0; i--){
    const d = new Date(Date.now() - i*24*60*60*1000);
    days.push({ key: d.toLocaleDateString('vi-VN'), label: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`, count: 0 });
  }
  const map = {};
  days.forEach(d => map[d.key] = d);
  rows.forEach(r => {
    const key = new Date(r.created_at).toLocaleDateString('vi-VN');
    if(map[key]) map[key].count++;
  });

  const max = Math.max(1, ...days.map(d => d.count));
  const W = 700, H = 170, padB = 24, padL = 4, barGap = 6;
  const barW = (W - padL*2) / days.length - barGap;

  let bars = '';
  days.forEach((d, i) => {
    const h = Math.round((d.count / max) * (H - padB - 10));
    const x = padL + i * (barW + barGap);
    const y = H - padB - h;
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h,1)}" rx="3" fill="var(--coral)">
      <title>${d.label}: ${d.count} lượt</title>
    </rect>`;
    if(i % 2 === 0){
      bars += `<text x="${x + barW/2}" y="${H-6}" font-size="9.5" text-anchor="middle" fill="var(--ink-soft)">${d.label}</text>`;
    }
  });

  document.getElementById('tfChart').innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" style="width:100%; height:190px; --coral:#FF5A3C;">${bars}</svg>`;
}

const DEVICE_ICON  = { 'Mobile':'📱', 'Tablet':'💻', 'Desktop':'🖥️' };
function renderTrafficBreakdown(rows, field, elId){
  const box = document.getElementById(elId);
  if(!rows.length){ box.textContent = 'Chưa có dữ liệu.'; return; }
  const counts = {};
  rows.forEach(r => {
    const v = r[field] || 'Khác';
    counts[v] = (counts[v]||0) + 1;
  });
  const total = rows.length;
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);

  box.innerHTML = sorted.map(([label, n]) => {
    const pct = Math.round(n/total*100);
    const icon = field === 'device' ? (DEVICE_ICON[label]||'📟') : '';
    return `
      <div style="margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px;">
          <span>${icon} ${escapeHtml(label)}</span>
          <span style="color:var(--ink-soft);">${n.toLocaleString('vi-VN')} (${pct}%)</span>
        </div>
        <div style="height:7px; background:var(--paper-deep); border-radius:99px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:var(--coral); border-radius:99px;"></div>
        </div>
      </div>`;
  }).join('');
}

function renderTrafficReferrer(rows, elId){
  const box = document.getElementById(elId);
  if(!rows.length){ box.textContent = 'Chưa có dữ liệu.'; return; }
  const counts = {};
  rows.forEach(r => {
    const v = r.referrer || 'Trực tiếp';
    counts[v] = (counts[v]||0) + 1;
  });
  const total = rows.length;
  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 8);

  box.innerHTML = `<table style="width:100%; font-size:12.5px;">
    ${sorted.map(([label, n]) => `
      <tr style="border-bottom:1px solid var(--line);">
        <td style="padding:7px 0;">${escapeHtml(label)}</td>
        <td style="padding:7px 0; text-align:right; color:var(--ink-soft); white-space:nowrap;">${n.toLocaleString('vi-VN')} lượt (${Math.round(n/total*100)}%)</td>
      </tr>`).join('')}
  </table>`;
}

/* =====================================================================
   THÔNG BÁO KHÁCH HÀNG — bảng `notifications`, hiện dạng chuông ở account.html
===================================================================== */
let allNotifs = [];

async function loadCustomerNotifs(){
  if(!isBackendConfigured() || !currentAdmin) return;
  const listEl = document.getElementById('ntfList');
  try{
    const { data, error } = await sb
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if(error) throw error;
    allNotifs = data || [];
  } catch(e){
    listEl.innerHTML = `<span style="color:var(--coral-deep);">Không tải được: ${escapeHtml(e.message)}<br>
      (kiểm tra đã tạo bảng <code>notifications</code> chưa)</span>`;
    return;
  }
  renderNotifList();
}

function renderNotifList(){
  const listEl = document.getElementById('ntfList');
  if(!allNotifs.length){ listEl.textContent = 'Chưa đăng thông báo nào.'; return; }

  listEl.innerHTML = allNotifs.map(n => `
    <div style="padding:12px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-weight:600; color:var(--ink); font-size:14px; ${n.is_active ? '' : 'opacity:.5; text-decoration:line-through;'}">${escapeHtml(n.title)}</div>
        <div style="margin-top:3px; color:var(--ink-soft);">${escapeHtml(n.message)}</div>
        <div style="margin-top:4px; font-size:11px; color:var(--ink-soft);">${new Date(n.created_at).toLocaleString('vi-VN')}</div>
      </div>
      <div style="display:flex; gap:8px; flex-shrink:0;">
        <button class="btn btn-ghost btn-sm" onclick="toggleNotifActive(${n.id}, ${!n.is_active})">${n.is_active ? 'Ẩn' : 'Hiện lại'}</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--coral-deep);" onclick="deleteNotif(${n.id})">Xoá</button>
      </div>
    </div>
  `).join('');
}

async function handleCreateNotif(){
  const title   = document.getElementById('ntf_title').value.trim();
  const message = document.getElementById('ntf_message').value.trim();
  const errBox  = document.getElementById('ntfError');
  errBox.classList.remove('show');

  if(!title || !message){
    errBox.textContent = "Vui lòng nhập đầy đủ tiêu đề và nội dung.";
    errBox.classList.add('show');
    return;
  }

  const btn = document.getElementById('ntfSubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang đăng...';

  try{
    const { error } = await sb.from('notifications').insert({ title, message, is_active: true });
    if(error) throw error;
    document.getElementById('ntf_title').value = '';
    document.getElementById('ntf_message').value = '';
    showToast('✅ Đã đăng thông báo!');
    await loadCustomerNotifs();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function toggleNotifActive(id, newVal){
  try{
    const { error } = await sb.from('notifications').update({ is_active: newVal }).eq('id', id);
    if(error) throw error;
    await loadCustomerNotifs();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

async function deleteNotif(id){
  if(!confirm('Xoá thông báo này? Không thể hoàn tác.')) return;
  try{
    const { error } = await sb.from('notifications').delete().eq('id', id);
    if(error) throw error;
    await loadCustomerNotifs();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* =====================================================================
   MARKETING CONFIG — Facebook Pixel / TikTok Pixel, lưu vào `site_config`
===================================================================== */
const MARKETING_KEY = 'marketing_config';

async function loadMarketingConfig(){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', MARKETING_KEY).single();
    if(data?.value){
      document.getElementById('mk_fbPixelId').value = data.value.fbPixelId || '';
      document.getElementById('mk_ttPixelId').value = data.value.ttPixelId || '';
    }
  } catch(e){ /* chưa có row -> để trống mặc định */ }
}

async function saveMarketingConfig(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }
  const cfg = {
    fbPixelId: document.getElementById('mk_fbPixelId').value.trim(),
    ttPixelId: document.getElementById('mk_ttPixelId').value.trim(),
  };
  try{
    const { error } = await sb.from('site_config').upsert(
      { key: MARKETING_KEY, value: cfg, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;
    showToast('✅ Đã lưu cấu hình Marketing!');
    logAdminAction('Lưu cấu hình Marketing', `FB Pixel: ${cfg.fbPixelId ? 'có' : 'trống'}, TikTok Pixel: ${cfg.ttPixelId ? 'có' : 'trống'}`);
  } catch(e){
    showToast('Lỗi: ' + e.message);
  }
}

/* =====================================================================
   MÃ GIẢM GIÁ — bảng discount_codes, chỉ admin được CRUD qua RLS
===================================================================== */
let allCoupons = [];
let editingCouponId = null;

function updateCouponTypeFields(){
  const isPercent = document.getElementById('cp_type').value === 'percent';
  document.getElementById('cp_valueLabel').textContent = isPercent ? 'Mức giảm (%)' : 'Số tiền giảm (VNĐ)';
  document.getElementById('cp_value').max = isPercent ? '100' : '';
  document.getElementById('cp_value').step = isPercent ? '1' : '1000';
  document.getElementById('cp_maxDiscountGroup').style.display = isPercent ? 'flex' : 'none';
}

function couponDateTimeInput(value){
  if(!value) return '';
  const d = new Date(value);
  if(Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function resetCouponForm(){
  editingCouponId = null;
  document.getElementById('couponFormTitle').textContent = 'Tạo mã mới';
  document.getElementById('couponSaveBtn').textContent = 'Phát hành mã';
  document.getElementById('couponCancelEditBtn').style.display = 'none';
  document.getElementById('couponFormError').classList.remove('show');
  document.getElementById('cp_code').value = '';
  document.getElementById('cp_name').value = '';
  document.getElementById('cp_type').value = 'percent';
  document.getElementById('cp_value').value = '';
  document.getElementById('cp_minOrder').value = '0';
  document.getElementById('cp_maxDiscount').value = '';
  document.getElementById('cp_usageLimit').value = '';
  document.getElementById('cp_perCustomer').value = '1';
  document.getElementById('cp_startsAt').value = '';
  document.getElementById('cp_endsAt').value = '';
  document.getElementById('cp_active').checked = true;
  updateCouponTypeFields();
}

async function loadCoupons(){
  const body = document.getElementById('couponsTableBody');
  if(!body || !currentAdmin) return;
  body.innerHTML = '<div class="dash-loading">Đang tải...</div>';
  try{
    const { data, error } = await sb
      .from('discount_codes')
      .select('*')
      .order('created_at', { ascending:false });
    if(error) throw error;
    allCoupons = data || [];
    renderCoupons();
  } catch(e){
    body.innerHTML = `<div class="dash-empty">Không tải được mã giảm giá: ${escapeHtml(e.message)}<br><small>Kiểm tra đã chạy file <code>supabase-migration-discount-codes.sql</code>.</small></div>`;
  }
}

function couponStatus(coupon){
  const now = Date.now();
  if(!coupon.is_active) return { label:'Đã tắt', active:false };
  if(coupon.starts_at && new Date(coupon.starts_at).getTime() > now) return { label:'Sắp diễn ra', active:false };
  if(coupon.ends_at && new Date(coupon.ends_at).getTime() <= now) return { label:'Hết hạn', active:false };
  if(coupon.usage_limit != null && Number(coupon.used_count) >= Number(coupon.usage_limit)) return { label:'Hết lượt', active:false };
  return { label:'Đang áp dụng', active:true };
}

function renderCoupons(){
  const body = document.getElementById('couponsTableBody');
  if(!body) return;
  const q = (document.getElementById('couponSearchInput')?.value || '').trim().toLowerCase();
  const rows = allCoupons.filter(c =>
    !q || String(c.code || '').toLowerCase().includes(q) || String(c.name || '').toLowerCase().includes(q)
  );
  if(!rows.length){
    body.innerHTML = '<div class="dash-empty">Chưa có mã giảm giá phù hợp.</div>';
    return;
  }

  let html = `<table class="dash-table"><thead><tr>
    <th>Mã</th><th>Ưu đãi</th><th>Điều kiện</th><th>Lượt dùng</th><th>Thời hạn</th><th>Trạng thái</th><th>Thao tác</th>
  </tr></thead><tbody>`;
  rows.forEach(c => {
    const status = couponStatus(c);
    const benefit = c.discount_type === 'percent'
      ? `${Number(c.discount_value).toLocaleString('vi-VN')}%${c.max_discount_amount ? ` · tối đa ${Number(c.max_discount_amount).toLocaleString('vi-VN')}đ` : ''}`
      : `${Number(c.discount_value).toLocaleString('vi-VN')}đ`;
    const usage = `${Number(c.used_count || 0).toLocaleString('vi-VN')} / ${c.usage_limit == null ? '∞' : Number(c.usage_limit).toLocaleString('vi-VN')}`;
    const start = c.starts_at ? new Date(c.starts_at).toLocaleString('vi-VN') : 'Ngay khi bật';
    const end = c.ends_at ? new Date(c.ends_at).toLocaleString('vi-VN') : 'Không giới hạn';
    html += `<tr>
      <td><b style="font-family:var(--font-mono);">${escapeHtml(c.code)}</b><br><span style="font-size:11.5px;color:var(--ink-soft);">${escapeHtml(c.name || '—')}</span></td>
      <td><b>${escapeHtml(benefit)}</b></td>
      <td style="font-size:12px;">Đơn từ ${Number(c.min_order_amount || 0).toLocaleString('vi-VN')}đ<br><span style="color:var(--ink-soft);">${Number(c.per_customer_limit || 1)} lượt/khách</span></td>
      <td style="font-family:var(--font-mono);">${usage}</td>
      <td style="font-size:11.5px;white-space:nowrap;">${escapeHtml(start)}<br>→ ${escapeHtml(end)}</td>
      <td><span class="svc-status-pill ${status.active ? 'svc-status-active' : 'svc-status-inactive'}">${status.label}</span></td>
      <td><div class="svc-actions">
        <button onclick="editCoupon(${Number(c.id)})">Sửa</button>
        <button onclick="toggleCoupon(${Number(c.id)}, ${c.is_active ? 'false' : 'true'})">${c.is_active ? 'Tắt' : 'Bật'}</button>
      </div></td>
    </tr>`;
  });
  body.innerHTML = html + '</tbody></table>';
}

function editCoupon(id){
  const c = allCoupons.find(row => Number(row.id) === Number(id));
  if(!c) return;
  editingCouponId = Number(id);
  document.getElementById('couponFormTitle').textContent = `Sửa mã ${c.code}`;
  document.getElementById('couponSaveBtn').textContent = 'Lưu thay đổi';
  document.getElementById('couponCancelEditBtn').style.display = 'inline-flex';
  document.getElementById('cp_code').value = c.code || '';
  document.getElementById('cp_name').value = c.name || '';
  document.getElementById('cp_type').value = c.discount_type;
  document.getElementById('cp_value').value = Number(c.discount_value);
  document.getElementById('cp_minOrder').value = Number(c.min_order_amount || 0);
  document.getElementById('cp_maxDiscount').value = c.max_discount_amount == null ? '' : Number(c.max_discount_amount);
  document.getElementById('cp_usageLimit').value = c.usage_limit == null ? '' : Number(c.usage_limit);
  document.getElementById('cp_perCustomer').value = Number(c.per_customer_limit || 1);
  document.getElementById('cp_startsAt').value = couponDateTimeInput(c.starts_at);
  document.getElementById('cp_endsAt').value = couponDateTimeInput(c.ends_at);
  document.getElementById('cp_active').checked = Boolean(c.is_active);
  document.getElementById('couponFormError').classList.remove('show');
  updateCouponTypeFields();
  document.getElementById('tabCoupons').scrollIntoView({ behavior:'smooth', block:'start' });
}

async function saveCoupon(){
  const errBox = document.getElementById('couponFormError');
  const btn = document.getElementById('couponSaveBtn');
  const code = document.getElementById('cp_code').value.trim().toUpperCase();
  const type = document.getElementById('cp_type').value;
  const value = Number(document.getElementById('cp_value').value);
  const minOrder = Number(document.getElementById('cp_minOrder').value || 0);
  const maxDiscountRaw = document.getElementById('cp_maxDiscount').value;
  const usageLimitRaw = document.getElementById('cp_usageLimit').value;
  const perCustomer = Number(document.getElementById('cp_perCustomer').value || 1);
  const startsRaw = document.getElementById('cp_startsAt').value;
  const endsRaw = document.getElementById('cp_endsAt').value;

  errBox.classList.remove('show');
  if(!/^[A-Z0-9_-]{3,32}$/.test(code)){
    errBox.textContent = 'Mã phải dài 3–32 ký tự và chỉ gồm A–Z, 0–9, gạch ngang hoặc gạch dưới.';
    errBox.classList.add('show'); return;
  }
  if(!value || value <= 0 || (type === 'percent' && value > 100)){
    errBox.textContent = type === 'percent' ? 'Phần trăm giảm phải từ 1 đến 100.' : 'Số tiền giảm phải lớn hơn 0.';
    errBox.classList.add('show'); return;
  }
  if(minOrder < 0 || perCustomer < 1){
    errBox.textContent = 'Điều kiện giá trị đơn và lượt dùng không hợp lệ.';
    errBox.classList.add('show'); return;
  }
  if(startsRaw && endsRaw && new Date(endsRaw) <= new Date(startsRaw)){
    errBox.textContent = 'Thời gian kết thúc phải sau thời gian bắt đầu.';
    errBox.classList.add('show'); return;
  }

  const payload = {
    code,
    name: document.getElementById('cp_name').value.trim() || null,
    discount_type: type,
    discount_value: value,
    min_order_amount: minOrder,
    max_discount_amount: type === 'percent' && maxDiscountRaw ? Number(maxDiscountRaw) : null,
    usage_limit: usageLimitRaw ? Number(usageLimitRaw) : null,
    per_customer_limit: perCustomer,
    starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
    ends_at: endsRaw ? new Date(endsRaw).toISOString() : null,
    is_active: document.getElementById('cp_active').checked,
    updated_at: new Date().toISOString()
  };
  if(!editingCouponId) payload.created_by = currentAdmin?.id || null;

  btn.disabled = true;
  btn.textContent = 'Đang lưu...';
  try{
    const query = editingCouponId
      ? sb.from('discount_codes').update(payload).eq('id', editingCouponId)
      : sb.from('discount_codes').insert(payload);
    const { error } = await query;
    if(error) throw error;
    showToast(editingCouponId ? '✅ Đã cập nhật mã giảm giá.' : '✅ Đã phát hành mã giảm giá.');
    logAdminAction(editingCouponId ? 'Sửa mã giảm giá' : 'Phát hành mã giảm giá', code);
    resetCouponForm();
    await loadCoupons();
  } catch(e){
    errBox.textContent = e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = editingCouponId ? 'Lưu thay đổi' : 'Phát hành mã';
  }
}

async function toggleCoupon(id, nextActive){
  const c = allCoupons.find(row => Number(row.id) === Number(id));
  if(!c) return;
  try{
    const { error } = await sb.from('discount_codes').update({
      is_active: Boolean(nextActive), updated_at: new Date().toISOString()
    }).eq('id', id);
    if(error) throw error;
    showToast(nextActive ? '✅ Đã bật mã giảm giá.' : 'Đã tắt mã giảm giá.');
    logAdminAction(nextActive ? 'Bật mã giảm giá' : 'Tắt mã giảm giá', c.code);
    await loadCoupons();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* =====================================================================
   AUDIT LOG — ghi lại thao tác quan trọng của admin vào `admin_audit_log`
===================================================================== */
async function logAdminAction(action, details){
  if(!isBackendConfigured() || !currentAdmin) return;
  try{
    await sb.from('admin_audit_log').insert({
      admin_email: currentAdmin.email,
      action, details: details || null
    });
  } catch(e){ console.warn('Không ghi được audit log:', e.message); }
}

async function loadAuditLog(){
  const box = document.getElementById('auditLogBox');
  try{
    const { data, error } = await sb
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if(error) throw error;
    if(!data.length){ box.textContent = 'Chưa có hoạt động nào được ghi nhận.'; return; }
    box.innerHTML = data.map(l => `
      <div style="padding:10px 0; border-bottom:1px solid var(--line);">
        <div style="font-size:12.5px; color:var(--ink);"><strong>${escapeHtml(l.admin_email||'—')}</strong> — ${escapeHtml(l.action)}</div>
        ${l.details ? `<div style="font-size:12px; color:var(--ink-soft); margin-top:2px;">${escapeHtml(l.details)}</div>` : ''}
        <div style="font-size:10.5px; color:var(--ink-soft); margin-top:3px;">${new Date(l.created_at).toLocaleString('vi-VN')}</div>
      </div>`).join('');
  } catch(e){
    box.innerHTML = `<span style="color:var(--danger);">Không tải được nhật ký (kiểm tra đã tạo bảng <code>admin_audit_log</code> chưa): ${escapeHtml(e.message)}</span>`;
  }
}

/* =====================================================================
   2FA (TOTP) — dùng Supabase Auth MFA có sẵn, không cần bảng riêng
===================================================================== */
window._mfaEnrollFactorId = null;

async function refreshMfaStatus(){
  const box = document.getElementById('mfaStatusBox');
  const btn = document.getElementById('mfaActionBtn');
  try{
    const { data, error } = await sb.auth.mfa.listFactors();
    if(error) throw error;
    const verified = data?.totp?.find(f => f.status === 'verified');
    if(verified){
      box.innerHTML = `<span style="color:#8FD09E;">✅ 2FA đang BẬT</span> — tài khoản của bạn được bảo vệ thêm 1 lớp.`;
      btn.textContent = 'Tắt 2FA';
      btn.dataset.mode = 'disable';
      btn.dataset.factorId = verified.id;
    } else {
      box.innerHTML = `<span style="color:var(--danger);">⚠️ 2FA đang TẮT</span> — chỉ cần đúng mật khẩu là đăng nhập được, nên bật lên để an toàn hơn.`;
      btn.textContent = 'Bật 2FA';
      btn.dataset.mode = 'enable';
    }
  } catch(e){
    box.textContent = 'Không kiểm tra được trạng thái 2FA: ' + e.message;
  }
}

async function handleMfaAction(){
  const btn = document.getElementById('mfaActionBtn');

  // Luôn làm mới phiên đăng nhập trước khi gọi API MFA — tránh lỗi
  // "invalid claim: missing sub claim" do token cũ/gần hết hạn.
  try{
    const { data: refreshed, error: refreshErr } = await sb.auth.refreshSession();
    if(refreshErr || !refreshed?.session){
      showToast('Phiên đăng nhập đã hết hạn, vui lòng đăng xuất rồi đăng nhập lại.');
      return;
    }
  } catch(e){
    showToast('Không thể làm mới phiên đăng nhập, thử tải lại trang.');
    return;
  }

  if(btn.dataset.mode === 'disable'){
    if(!confirm('Tắt 2FA sẽ giảm bảo mật tài khoản admin. Chắc chắn tắt?')) return;
    try{
      const { error } = await sb.auth.mfa.unenroll({ factorId: btn.dataset.factorId });
      if(error) throw error;
      showToast('Đã tắt 2FA.');
      logAdminAction('Tắt 2FA', null);
      refreshMfaStatus();
    } catch(e){ showToast('Lỗi: ' + e.message); }
    return;
  }

  // Dọn các factor cũ còn "treo" (tạo dở nhưng chưa xác nhận từ lần trước) để tránh lỗi trùng tên
  try{
    const { data: existing } = await sb.auth.mfa.listFactors();
    const stale = existing?.totp?.filter(f => f.status !== 'verified') || [];
    for(const f of stale){
      await sb.auth.mfa.unenroll({ factorId: f.id }).catch(()=>{});
    }
  } catch(e){ /* không sao nếu bước dọn dẹp lỗi, vẫn thử enroll tiếp */ }

  // Bắt đầu enroll mới
  try{
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
    if(error) throw error;
    window._mfaEnrollFactorId = data.id;
    document.getElementById('mfaQrBox').innerHTML = data.totp.qr_code
      ? `<img src="${data.totp.qr_code}" style="width:100%;height:100%;object-fit:contain;">`
      : '';
    document.getElementById('mfaSecretBox').textContent = data.totp.secret;
    document.getElementById('mfaEnrollArea').style.display = 'block';
    document.getElementById('mfaActionBtn').style.display = 'none';
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

async function handleMfaEnrollConfirm(){
  const code = document.getElementById('mfaEnrollCode').value.trim();
  const errBox = document.getElementById('mfaEnrollError');
  if(!code || code.length !== 6){
    errBox.textContent = 'Nhập đủ 6 số.'; errBox.classList.add('show'); return;
  }
  try{
    await sb.auth.refreshSession();
    const { data: challenge, error: chErr } = await sb.auth.mfa.challenge({ factorId: window._mfaEnrollFactorId });
    if(chErr) throw chErr;
    const { error: vErr } = await sb.auth.mfa.verify({
      factorId: window._mfaEnrollFactorId, challengeId: challenge.id, code
    });
    if(vErr) throw vErr;

    showToast('✅ Đã bật 2FA thành công!');
    logAdminAction('Bật 2FA', null);
    document.getElementById('mfaEnrollArea').style.display = 'none';
    document.getElementById('mfaActionBtn').style.display = 'inline-flex';
    document.getElementById('mfaEnrollCode').value = '';
    errBox.classList.remove('show');
    refreshMfaStatus();
  } catch(e){
    errBox.textContent = 'Mã không đúng, thử lại.'; errBox.classList.add('show');
  }
}

async function cancelMfaEnroll(){
  try{ if(window._mfaEnrollFactorId) await sb.auth.mfa.unenroll({ factorId: window._mfaEnrollFactorId }); } catch(e){}
  window._mfaEnrollFactorId = null;
  document.getElementById('mfaEnrollArea').style.display = 'none';
  document.getElementById('mfaActionBtn').style.display = 'inline-flex';
}

/* =====================================================================
   ĐĂNG XUẤT TẤT CẢ THIẾT BỊ — kết hợp signOut global (chặn refresh token
   về sau) + ghi force_logout_at vào profiles để các tab/thiết bị khác
   đang mở nhận được tín hiệu realtime và tự đăng xuất gần như ngay lập tức,
   không cần chờ access token cũ hết hạn (~1 tiếng).
===================================================================== */
window._forceLogoutChannel = null;
window._sessionStartedAt = null;

function startForceLogoutWatcher(){
  if(!currentAdmin || !isBackendConfigured()) return;
  window._sessionStartedAt = new Date().toISOString();
  stopForceLogoutWatcher(); // tránh subscribe trùng nếu gọi lại

  window._forceLogoutChannel = sb
    .channel('force-logout-' + currentAdmin.id)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${currentAdmin.id}`
    }, (payload) => {
      const forcedAt = payload.new?.force_logout_at;
      if(forcedAt && new Date(forcedAt) > new Date(window._sessionStartedAt)){
        alert('Tài khoản của bạn vừa bị đăng xuất từ 1 thiết bị khác (yêu cầu "Đăng xuất tất cả thiết bị").');
        stopForceLogoutWatcher();
        sb.auth.signOut().finally(() => { currentAdmin = null; showLoginScreen(); });
      }
    })
    .subscribe();
}

function stopForceLogoutWatcher(){
  if(window._forceLogoutChannel){
    sb.removeChannel(window._forceLogoutChannel);
    window._forceLogoutChannel = null;
  }
}

async function handleLogoutAllDevices(){
  if(!confirm('Đăng xuất khỏi TẤT CẢ thiết bị đang đăng nhập (kể cả thiết bị này)?')) return;
  try{
    if(currentAdmin){
      await sb.from('profiles').update({ force_logout_at: new Date().toISOString() }).eq('id', currentAdmin.id);
      logAdminAction('Đăng xuất tất cả thiết bị', null);
    }
    stopForceLogoutWatcher();
    await sb.auth.signOut({ scope: 'global' });
    showToast('Đã đăng xuất tất cả thiết bị.');
    currentAdmin = null;
    showLoginScreen();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* =====================================================================
   KIỂM TRA RLS — gọi RPC check_rls_status() (cần tạo trong Supabase)
===================================================================== */
/* =====================================================================
   QUÉT LỖ HỔNG TOÀN DIỆN — gộp 4 kiểm tra: RLS, policy "mở toang",
   secret bị lộ trong code (tự tải lại các trang thật để soi), 2FA.
===================================================================== */
async function runFullVulnScan(){
  const btn = document.getElementById('vulnScanBtn');
  const summaryBox = document.getElementById('vulnScanSummary');
  const box = document.getElementById('vulnScanBox');
  btn.disabled = true; btn.textContent = 'Đang quét...';
  box.innerHTML = 'Đang chạy các kiểm tra...';
  summaryBox.textContent = '';

  const findings = []; // { level: 'critical'|'warning'|'ok', title, detail }

  // 1) RLS bật/tắt trên từng bảng
  try{
    const { data, error } = await sb.rpc('check_rls_status');
    if(error) throw error;
    (data||[]).forEach(r => {
      if(!r.rls_enabled){
        findings.push({ level:'critical', title:`Bảng "${r.table_name}" CHƯA bật RLS`, detail:'Bất kỳ ai cũng đọc/ghi được trực tiếp qua API. Bật RLS ngay cho bảng này.' });
      }
    });
  } catch(e){
    findings.push({ level:'warning', title:'Không kiểm tra được RLS', detail:e.message + ' — cần tạo hàm check_rls_status() trong Supabase.' });
  }

  // 2) Policy RLS "mở toang" (kiểu lỗi y hệt vụ rò rỉ chat trước đây)
  try{
    const { data, error } = await sb.rpc('check_policy_risks');
    if(error) throw error;
    (data||[]).forEach(r => {
      if(r.risk_level === 'critical'){
        findings.push({ level:'critical', title:`Policy "${r.policy_name}" trên bảng "${r.table_name}" (${r.command})`, detail:r.detail });
      } else if(r.risk_level === 'warning'){
        findings.push({ level:'warning', title:`Policy "${r.policy_name}" trên bảng "${r.table_name}" (${r.command})`, detail:r.detail });
      }
    });
  } catch(e){
    findings.push({ level:'warning', title:'Không quét được policy RLS', detail:e.message + ' — cần tạo hàm check_policy_risks() trong Supabase.' });
  }

  // 3) Tự tải lại các trang thật của web, soi tìm secret bị lộ (service_role key, mật khẩu cứng...)
  const pagesToScan = ['/','/account/','/showcase/','/payment-success/','/payment-cancel/'];
  for(const page of pagesToScan){
    try{
      const res = await fetch(page, { cache:'no-store' });
      if(!res.ok) continue;
      const text = await res.text();

      // Giải mã mọi JWT tìm thấy, cảnh báo nếu là service_role (cực kỳ nguy hiểm)
      const jwts = text.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || [];
      const uniqueJwts = [...new Set(jwts)];
      uniqueJwts.forEach(tok => {
        try{
          const payload = JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          if(payload.role === 'service_role'){
            findings.push({ level:'critical', title:`Service_role key bị lộ trong "${page}"`, detail:'Key này có TOÀN QUYỀN trên database, phải xoá khỏi code và đổi key ngay lập tức trong Supabase Dashboard.' });
          }
        } catch(e){ /* không giải mã được thì bỏ qua */ }
      });

      // Tìm các pattern secret viết cứng khác
      const suspiciousPatterns = [
        { re: /CHECKSUM_KEY['"]?\s*[:=]\s*['"][A-Za-z0-9]{10,}['"]/i, label:'PayOS CHECKSUM_KEY viết cứng trong code' },
        { re: /CLIENT_ID['"]?\s*[:=]\s*['"][A-Za-z0-9-]{15,}['"]/i, label:'CLIENT_ID viết cứng trong code' },
        { re: /sk_live_[A-Za-z0-9]{10,}/i, label:'Secret key dạng sk_live_... bị lộ' },
      ];
      suspiciousPatterns.forEach(p => {
        if(p.re.test(text)){
          findings.push({ level:'critical', title:`${p.label} (trong "${page}")`, detail:'Cần chuyển key này sang Supabase Edge Function Secrets, không để trong code phía client.' });
        }
      });
    } catch(e){ /* trang không tồn tại hoặc lỗi mạng, bỏ qua */ }
  }

  // 4) Trạng thái 2FA của admin đang đăng nhập
  try{
    const { data } = await sb.auth.mfa.listFactors();
    const verified = data?.totp?.find(f => f.status === 'verified');
    if(!verified){
      findings.push({ level:'warning', title:'2FA đang TẮT cho tài khoản admin này', detail:'Nên bật ở mục "Xác thực 2 lớp" phía trên để tăng bảo mật đăng nhập.' });
    }
  } catch(e){ /* bỏ qua */ }

  // Tổng hợp kết quả
  const critical = findings.filter(f => f.level === 'critical');
  const warning  = findings.filter(f => f.level === 'warning');

  if(!findings.length){
    summaryBox.innerHTML = `<span style="color:#8FD09E;">✅ Không phát hiện vấn đề nào — mọi kiểm tra đều đạt.</span>`;
  } else {
    summaryBox.innerHTML = `<span style="color:${critical.length ? 'var(--danger)' : '#E7C083'};">
      ${critical.length ? `🔴 ${critical.length} vấn đề NGHIÊM TRỌNG` : ''}
      ${critical.length && warning.length ? ' · ' : ''}
      ${warning.length ? `🟡 ${warning.length} cảnh báo` : ''}
    </span>`;
  }

  box.innerHTML = findings.length ? findings.map(f => `
    <div style="padding:12px 0; border-bottom:1px solid var(--line);">
      <div style="font-weight:600; color:${f.level === 'critical' ? 'var(--danger)' : '#E7C083'};">
        ${f.level === 'critical' ? '🔴' : '🟡'} ${escapeHtml(f.title)}
      </div>
      <div style="font-size:12.5px; color:var(--ink-soft); margin-top:4px;">${escapeHtml(f.detail)}</div>
    </div>`).join('') : `<span style="color:#8FD09E;">Tất cả các kiểm tra đều đạt yêu cầu. Nên quét lại định kỳ, đặc biệt sau khi thêm bảng/tính năng mới.</span>`;

  logAdminAction('Quét lỗ hổng bảo mật', `${critical.length} nghiêm trọng, ${warning.length} cảnh báo`);
  btn.disabled = false; btn.textContent = '🔎 Quét toàn diện ngay';
}

async function checkRlsStatus(){
  const box = document.getElementById('rlsCheckBox');
  box.textContent = 'Đang kiểm tra...';
  try{
    const { data, error } = await sb.rpc('check_rls_status');
    if(error) throw error;
    if(!data || !data.length){
      box.innerHTML = `<span style="color:var(--danger);">Không lấy được dữ liệu — có thể chưa tạo hàm <code>check_rls_status()</code> trong Supabase.</span>`;
      return;
    }
    box.innerHTML = data.map(r => `
      <div style="display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid var(--line); font-size:13px;">
        <span style="font-family:var(--font-mono);">${escapeHtml(r.table_name)}</span>
        <span style="color:${r.rls_enabled ? '#8FD09E' : 'var(--danger)'}; font-weight:600;">
          ${r.rls_enabled ? '✅ Đã bật RLS' : '⚠️ CHƯA bật RLS'}
        </span>
      </div>`).join('');
  } catch(e){
    box.innerHTML = `<span style="color:var(--danger);">Lỗi: ${escapeHtml(e.message)} — cần tạo hàm <code>check_rls_status()</code>, xem hướng dẫn SQL đã gửi.</span>`;
  }
}

function loadSecurityTab(){
  refreshMfaStatus();
  loadAuditLog();
  document.getElementById('rlsCheckBox').textContent = 'Bấm "Kiểm tra ngay" để quét trạng thái RLS các bảng chính.';
}

/* =====================================================================
   NỘI DUNG TRANG (CMS đơn giản) — Điều khoản / Bảo mật / Đặt cọc
   Lưu vào `site_config` với key policy_terms / policy_privacy / policy_deposit,
   value = { html: "...", updatedLabel: "Cập nhật lần cuối: ..." }
===================================================================== */
const POLICY_DEFAULTS = {"policy_terms": "<p>Điều khoản này áp dụng khi bạn sử dụng dịch vụ thiết kế Website, Tool, Slide, Profile và các dịch vụ liên quan (sau đây gọi là \"Dịch vụ\") do <strong>Phatdatagency</strong> (\"chúng tôi\") cung cấp qua website phatdatagency.id.vn. Khi đặt đơn hàng hoặc sử dụng Dịch vụ, bạn (\"khách hàng\") đồng ý với các điều khoản dưới đây.</p>\n\n  <h2>1. Phạm vi dịch vụ</h2>\n  <p>Chúng tôi cung cấp dịch vụ thiết kế theo yêu cầu (Website, Tool phần mềm nhỏ, Slide thuyết trình, Profile cá nhân/doanh nghiệp) và dịch vụ liên quan đến các nền tảng mạng xã hội (Facebook, TikTok, Instagram). Phạm vi công việc cụ thể, thời gian hoàn thành và chi phí sẽ được thống nhất trực tiếp với khách hàng trước khi bắt đầu thực hiện, dựa trên thông tin khách hàng cung cấp trong form đặt đơn.</p>\n\n  <h2>2. Đặt đơn và thanh toán</h2>\n  <ul>\n    <li>Khách hàng có thể lựa chọn đặt cọc một phần hoặc thanh toán toàn bộ giá trị đơn hàng tại thời điểm đặt đơn, tùy theo dịch vụ.</li>\n    <li>Thanh toán được thực hiện qua VietQR (chuyển khoản ngân hàng) hoặc PayOS (cổng thanh toán trực tuyến).</li>\n    <li>Đơn hàng chỉ được xác nhận xử lý sau khi khoản đặt cọc/thanh toán đã được ghi nhận thành công.</li>\n    <li>Với các dịch vụ chưa có bảng giá cụ thể, chúng tôi sẽ liên hệ tư vấn và báo giá trước khi khách hàng xác nhận đặt cọc.</li>\n  </ul>\n  <p>Chi tiết về hoàn cọc/hoàn tiền được quy định riêng tại <a href=\"chinh-sach-dat-coc.html\">Chính sách đặt cọc &amp; hoàn tiền</a>.</p>\n\n  <h2>3. Trách nhiệm của khách hàng</h2>\n  <ul>\n    <li>Cung cấp thông tin, nội dung, hình ảnh, tài khoản cần thiết (nếu có) đầy đủ và chính xác để chúng tôi thực hiện công việc.</li>\n    <li>Phản hồi các yêu cầu chỉnh sửa, xác nhận trong thời gian hợp lý để không ảnh hưởng tiến độ chung.</li>\n    <li>Đảm bảo nội dung/yêu cầu cung cấp không vi phạm pháp luật, không xâm phạm bản quyền hoặc quyền của bên thứ ba.</li>\n  </ul>\n\n  <h2>4. Bàn giao &amp; chỉnh sửa</h2>\n  <p>Sản phẩm sẽ được bàn giao theo tiến độ đã thống nhất. Số lần chỉnh sửa miễn phí (nếu có) sẽ được thông báo cụ thể theo từng gói dịch vụ. Các yêu cầu chỉnh sửa vượt phạm vi ban đầu đã thống nhất có thể phát sinh thêm chi phí, sẽ được trao đổi trước khi thực hiện.</p>\n\n  <h2>5. Quyền sở hữu trí tuệ</h2>\n  <p>Sau khi khách hàng thanh toán đầy đủ, quyền sử dụng sản phẩm bàn giao (mã nguồn, thiết kế, file...) thuộc về khách hàng cho mục đích sử dụng đã thỏa thuận. Phatdatagency có quyền giới thiệu sản phẩm (ẩn thông tin nhạy cảm nếu cần) trong portfolio/showcase, trừ khi khách hàng có yêu cầu khác bằng văn bản.</p>\n\n  <h2>6. Giới hạn trách nhiệm</h2>\n  <p>Chúng tôi nỗ lực đảm bảo chất lượng dịch vụ nhưng không chịu trách nhiệm với các thiệt hại gián tiếp phát sinh từ việc sử dụng sản phẩm (ví dụ: gián đoạn kinh doanh, mất dữ liệu do bên thứ ba, thay đổi chính sách nền tảng mạng xã hội...) nằm ngoài phạm vi công việc đã thống nhất.</p>\n\n  <h2>7. Thay đổi điều khoản</h2>\n  <p>Điều khoản này có thể được cập nhật theo thời gian. Phiên bản mới nhất luôn được đăng tại trang này.</p>\n\n  <h2>8. Liên hệ</h2>\n  <p>Mọi thắc mắc về điều khoản dịch vụ, vui lòng liên hệ qua thông tin ở cuối trang chủ.</p>", "policy_privacy": "<p><strong>Phatdatagency</strong> tôn trọng quyền riêng tư của khách hàng. Chính sách này giải thích chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân như thế nào khi bạn sử dụng website và dịch vụ của chúng tôi.</p>\n\n  <h2>1. Thông tin chúng tôi thu thập</h2>\n  <table>\n    <tr><th>Loại thông tin</th><th>Khi nào thu thập</th></tr>\n    <tr><td>Họ tên, số điện thoại, email</td><td>Khi đặt đơn hàng hoặc tạo tài khoản</td></tr>\n    <tr><td>Nội dung yêu cầu, ngân sách</td><td>Khi điền form đặt đơn</td></tr>\n    <tr><td>Lịch sử đơn hàng, trạng thái thanh toán</td><td>Trong quá trình sử dụng dịch vụ</td></tr>\n    <tr><td>Thiết bị, trình duyệt, nguồn truy cập</td><td>Tự động khi truy cập trang chủ (ẩn danh, không gắn với tài khoản)</td></tr>\n  </table>\n\n  <h2>2. Mục đích sử dụng</h2>\n  <ul>\n    <li>Liên hệ, tư vấn và thực hiện đơn hàng đã đặt.</li>\n    <li>Xử lý thanh toán qua đối tác VietQR/PayOS.</li>\n    <li>Gửi thông báo liên quan đến đơn hàng, tài khoản.</li>\n    <li>Cải thiện chất lượng dịch vụ và trải nghiệm website.</li>\n    <li>Đo lường hiệu quả quảng cáo (Facebook Pixel, TikTok Pixel) — chỉ ghi nhận hành vi tương tác trên trang, không thu thập thêm dữ liệu cá nhân ngoài mục đích quảng cáo.</li>\n  </ul>\n\n  <h2>3. Lưu trữ &amp; bảo mật</h2>\n  <p>Dữ liệu được lưu trữ trên hạ tầng Supabase với các lớp bảo vệ truy cập (Row Level Security), đảm bảo chỉ tài khoản của bạn hoặc quản trị viên được ủy quyền mới truy cập được thông tin đơn hàng/tài khoản của bạn. Mật khẩu tài khoản được mã hóa, chúng tôi không lưu trữ mật khẩu dưới dạng văn bản thô.</p>\n\n  <h2>4. Chia sẻ thông tin với bên thứ ba</h2>\n  <p>Chúng tôi không bán hoặc cho thuê thông tin cá nhân của bạn. Thông tin chỉ được chia sẻ với:</p>\n  <ul>\n    <li>Đối tác thanh toán (PayOS, ngân hàng liên kết VietQR) — để xử lý giao dịch.</li>\n    <li>Nền tảng quảng cáo (Meta/Facebook, TikTok) — chỉ dữ liệu sự kiện tương tác ẩn danh phục vụ đo lường quảng cáo.</li>\n    <li>Cơ quan nhà nước có thẩm quyền, khi có yêu cầu hợp pháp.</li>\n  </ul>\n\n  <h2>5. Quyền của bạn</h2>\n  <p>Bạn có quyền yêu cầu xem, chỉnh sửa hoặc xóa thông tin cá nhân của mình bất kỳ lúc nào bằng cách đăng nhập vào trang \"Tài khoản\" hoặc liên hệ trực tiếp với chúng tôi.</p>\n\n  <h2>6. Cookie</h2>\n  <p>Website có thể sử dụng cookie/localStorage để ghi nhớ trạng thái đăng nhập và cải thiện trải nghiệm sử dụng. Bạn có thể tắt cookie trong trình duyệt, tuy nhiên một số chức năng (như đăng nhập) có thể không hoạt động đầy đủ.</p>\n\n  <h2>7. Liên hệ</h2>\n  <p>Nếu có thắc mắc về chính sách bảo mật, vui lòng liên hệ qua thông tin ở cuối trang chủ.</p>", "policy_deposit": "<p>Chính sách này áp dụng cho tất cả đơn hàng đặt qua website phatdatagency.id.vn, thanh toán qua VietQR hoặc PayOS.</p>\n\n  <h2>1. Hình thức thanh toán</h2>\n  <p>Tùy theo dịch vụ, khách hàng có thể chọn:</p>\n  <div class=\"box good\">\n    <strong>Đặt cọc một phần</strong> — thanh toán trước một khoản (tối thiểu theo quy định từng dịch vụ), phần còn lại thanh toán khi nghiệm thu/bàn giao.\n  </div>\n  <div class=\"box good\">\n    <strong>Thanh toán toàn bộ</strong> — thanh toán 100% giá trị đơn ngay khi đặt, thường áp dụng cho gói giá trị nhỏ hoặc khách muốn hoàn tất một lần.\n  </div>\n\n  <h2>2. Khi nào được hoàn cọc</h2>\n  <ul>\n    <li>Chúng tôi từ chối nhận đơn sau khi khách đã thanh toán (do ngoài khả năng thực hiện) → hoàn <strong>100%</strong> số tiền đã thanh toán.</li>\n    <li>Khách hàng hủy đơn <strong>trước khi</strong> chúng tôi bắt đầu triển khai công việc → hoàn tối thiểu <strong>80%</strong>, phần còn lại là chi phí xử lý/tư vấn ban đầu.</li>\n    <li>Sản phẩm bàn giao sai hoàn toàn so với yêu cầu đã thống nhất bằng văn bản, và hai bên không thể thống nhất phương án chỉnh sửa → xem xét hoàn cọc theo tỷ lệ công việc chưa thực hiện.</li>\n  </ul>\n\n  <h2>3. Khi nào không hoàn cọc</h2>\n  <div class=\"box warn\">\n    <ul style=\"margin:0;\">\n      <li>Khách hàng hủy đơn <strong>sau khi</strong> công việc đã được triển khai (thiết kế, code, sản xuất nội dung...) — cọc được giữ lại tương ứng với phần công việc/thời gian đã thực hiện.</li>\n      <li>Khách hàng thay đổi yêu cầu nhiều lần vượt phạm vi ban đầu dẫn đến không thể hoàn thành trong thời hạn thỏa thuận.</li>\n      <li>Khách hàng ngưng phản hồi/liên lạc quá 15 ngày kể từ lần trao đổi cuối, không xác nhận tiếp tục hay hủy đơn.</li>\n    </ul>\n  </div>\n\n  <h2>4. Thời gian xử lý hoàn tiền</h2>\n  <p>Sau khi hai bên thống nhất phương án hoàn cọc, tiền sẽ được hoàn về đúng tài khoản/phương thức khách đã thanh toán trong vòng <strong>3–7 ngày làm việc</strong>, tùy thời gian xử lý của ngân hàng/PayOS.</p>\n\n  <h2>5. Cách yêu cầu hoàn tiền</h2>\n  <p>Khách hàng liên hệ qua thông tin ở cuối trang chủ (hoặc nhắn qua kênh liên hệ đã hiển thị), cung cấp <strong>mã đơn hàng</strong> (dạng DH-xxxxxx-xxxx, xem tại mục \"Đơn hàng của tôi\" hoặc email/màn hình xác nhận lúc đặt đơn) để chúng tôi tra cứu và xử lý.</p>\n\n  <h2>6. Tra cứu trạng thái đơn hàng</h2>\n  <p>Bạn có thể tự tra cứu trạng thái đơn hàng bất kỳ lúc nào tại mục <a href=\"/#lookup\">\"Tra cứu đơn\"</a> trên trang chủ, hoặc đăng nhập vào <a href=\"account.html\">trang Tài khoản</a> để xem đầy đủ lịch sử đơn hàng.</p>"};

const POLICY_PAGE_URLS = {
  policy_terms: '/dieu-khoan-dich-vu/',
  policy_privacy: '/chinh-sach-bao-mat/',
  policy_deposit: '/chinh-sach-dat-coc/',
};

let pgQuill = null;
let pgLoadedKey = null;

function initPagesTab(){
  if(!pgQuill){
    pgQuill = new Quill('#pg_editor', {
      theme: 'snow'
    });
  }
  switchPolicyPage();
}

async function switchPolicyPage(){
  const key = document.getElementById('pg_pageSelect').value;
  document.getElementById('pg_previewLink').href = POLICY_PAGE_URLS[key];
  document.getElementById('pg_statusText').textContent = 'Đang tải nội dung hiện tại...';

  if(!pgQuill){
    pgQuill = new Quill('#pg_editor', { theme: 'snow' });
  }

  let html = POLICY_DEFAULTS[key];
  let sourceLabel = 'nội dung mặc định (chưa từng chỉnh sửa)';

  if(isBackendConfigured() && currentAdmin){
    try{
      const { data, error } = await sb.from('site_config').select('value').eq('key', key).single();
      if(!error && data?.value?.html){
        html = data.value.html;
        sourceLabel = 'đã lưu lúc ' + (data.value.updatedLabel || '');
      }
    } catch(e){ /* dùng mặc định nếu lỗi */ }
  }

  pgQuill.root.innerHTML = html;
  pgLoadedKey = key;
  document.getElementById('pg_statusText').textContent = 'Đang sửa: ' + sourceLabel;
}

async function savePolicyContent(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }
  const key = document.getElementById('pg_pageSelect').value;
  const html = pgQuill.root.innerHTML;
  const updatedLabel = 'Cập nhật lần cuối: ' + new Date().toLocaleDateString('vi-VN', { year:'numeric', month:'long' });

  try{
    const { error } = await sb.from('site_config').upsert(
      { key, value: { html, updatedLabel }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;
    showToast('✅ Đã lưu nội dung trang!');
    logAdminAction('Sửa nội dung trang', POLICY_PAGE_URLS[key]);
    document.getElementById('pg_statusText').textContent = 'Đã lưu lúc ' + updatedLabel;
  } catch(e){
    showToast('Lỗi: ' + e.message);
  }
}

/* =====================================================================
   LIVE CHAT (ADMIN) — danh sách case, dọn dẹp tự động, xem/trả lời
===================================================================== */
let lcCases = [];
let lcActiveChannel = null;
let lcActiveCaseId = null;

async function loadLiveChatTab(){
  if(!isBackendConfigured() || !currentAdmin) return;

  // Dọn dẹp tự động: đóng case >3 ngày, xoá hẳn case >14 ngày
  // (chạy ngầm mỗi khi admin mở tab này — bù cho việc không có pg_cron)
  try{
    await sb.from('chat_cases')
      .update({ status: 'closed' })
      .eq('status', 'open')
      .lt('created_at', new Date(Date.now() - 3*24*60*60*1000).toISOString());

    await sb.from('chat_cases')
      .delete()
      .lt('created_at', new Date(Date.now() - 14*24*60*60*1000).toISOString());
  } catch(e){ console.warn('Dọn dẹp chat lỗi:', e.message); }

  const listEl = document.getElementById('lcCaseList');
  try{
    const { data, error } = await sb.from('chat_cases').select('*').order('last_message_at', { ascending: false }).limit(200);
    if(error) throw error;
    lcCases = data || [];
  } catch(e){
    listEl.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được (kiểm tra đã tạo bảng chat_cases chưa): ${escapeHtml(e.message)}</div>`;
    return;
  }

  const openCases = lcCases.filter(c => c.status === 'open' && (Date.now() - new Date(c.created_at).getTime()) < 3*24*60*60*1000);
  document.getElementById('lcOpenCount').textContent = openCases.length;
  document.getElementById('lcClosedCount').textContent = lcCases.length - openCases.length;
  document.getElementById('lcTotalCount').textContent = lcCases.length;

  if(!lcCases.length){
    listEl.innerHTML = `<div class="dash-empty">Chưa có case chat nào.</div>`;
    return;
  }

  listEl.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Mã case</th><th>Khách hàng</th><th>Liên hệ</th><th>Tin nhắn gần nhất</th><th>Trạng thái</th>
  </tr></thead><tbody>${lcCases.map(c => {
    const isOpen = c.status === 'open' && (Date.now() - new Date(c.created_at).getTime()) < 3*24*60*60*1000;
    return `<tr style="cursor:pointer;" onclick="openChatModal(${c.id})">
      <td class="dt-code">${escapeHtml(c.case_code)}</td>
      <td>${escapeHtml(c.customer_name)}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(c.customer_contact||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${new Date(c.last_message_at).toLocaleString('vi-VN')}</td>
      <td><span class="svc-status-pill ${isOpen ? 'svc-status-active' : 'svc-status-inactive'}">${isOpen ? 'Đang mở' : 'Đã đóng'}</span></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

async function openChatModal(caseId){
  const kase = lcCases.find(c => c.id === caseId);
  if(!kase) return;
  lcActiveCaseId = caseId;

  const isOpen = kase.status === 'open' && (Date.now() - new Date(kase.created_at).getTime()) < 3*24*60*60*1000;
  document.getElementById('chatModalTitle').textContent = kase.customer_name;
  document.getElementById('chatModalSub').textContent = `${kase.case_code} · ${kase.customer_contact || 'không có liên hệ'}`;
  document.getElementById('chatModalInputRow').style.display = isOpen ? 'flex' : 'none';
  document.getElementById('chatModalClosedNote').style.display = isOpen ? 'none' : 'block';
  document.getElementById('chatModalOverlay').classList.add('show');

  await loadChatModalMessages(caseId);

  if(lcActiveChannel) sb.removeChannel(lcActiveChannel);
  lcActiveChannel = sb.channel('admin-chat-' + caseId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`case_id=eq.${caseId}` }, (payload) => {
      const body = document.getElementById('chatModalBody');
      body.insertAdjacentHTML('beforeend', renderAdminChatBubble(payload.new));
      body.scrollTop = body.scrollHeight;
    })
    .subscribe();
}

function closeChatModal(){
  document.getElementById('chatModalOverlay').classList.remove('show');
  if(lcActiveChannel){ sb.removeChannel(lcActiveChannel); lcActiveChannel = null; }
  lcActiveCaseId = null;
}

async function loadChatModalMessages(caseId){
  const body = document.getElementById('chatModalBody');
  body.innerHTML = 'Đang tải...';
  const { data, error } = await sb.from('chat_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true });
  if(error){ body.innerHTML = 'Lỗi tải tin nhắn.'; return; }
  body.innerHTML = data.map(renderAdminChatBubble).join('');
  body.scrollTop = body.scrollHeight;
}

function renderAdminChatBubble(m){
  const time = new Date(m.created_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  const isAdmin = m.sender_type === 'admin';
  return `<div style="align-self:${isAdmin ? 'flex-end' : 'flex-start'}; max-width:80%; padding:9px 13px; border-radius:14px; font-size:13.5px;
    background:${isAdmin ? 'var(--coral)' : 'var(--surface-2)'}; color:${isAdmin ? 'var(--white)' : 'var(--ink)'};">
    ${escapeHtml(m.message)}
    <div style="font-size:9.5px; opacity:.7; margin-top:4px;">${time}</div>
  </div>`;
}

async function sendAdminChatReply(){
  const input = document.getElementById('chatModalInput');
  const text = input.value.trim();
  if(!text || !lcActiveCaseId) return;
  input.value = '';
  try{
    const { error } = await sb.from('chat_messages').insert({
      case_id: lcActiveCaseId, sender_type: 'admin',
      sender_name: currentAdmin?.email || 'Admin', message: text
    });
    if(error) throw error;
    await sb.from('chat_cases').update({ last_message_at: new Date().toISOString() }).eq('id', lcActiveCaseId);
  } catch(e){ showToast('Lỗi: ' + e.message); }
}
document.getElementById('chatModalInput').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') sendAdminChatReply();
});

/* =====================================================================
   CHĂM SÓC DỊCH VỤ MẠNG XÃ HỘI (Facebook/Instagram/Threads/TikTok)
===================================================================== */
let allSocialCare = [];
let socialCareFilter = 'all';
let editingSocialCareId = null;

const PLATFORM_ICON = { Facebook:'📘', Instagram:'📷', Threads:'🧵', TikTok:'🎵' };

async function handleCheckSocialLive(){
  const btn = document.getElementById('checkLiveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang kiểm tra...';

  try{
    const { data, error } = await sb.functions.invoke('check-social-live', { body: {} });
    if(error) throw error;
    if(data?.ok){
      showToast(`✅ Đã kiểm tra ${data.checked} tài khoản, ${data.changed} thay đổi trạng thái.`);
      await loadSocialCareTable();
    } else {
      showToast('Lỗi: ' + (data?.error || 'Không xác định'));
    }
  } catch(e){
    showToast('Lỗi: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function loadSocialCareTable(){
  const box = document.getElementById('socialCareTableBody');
  try{
    const { data, error } = await sb.from('social_care').select('*').order('created_at', { ascending:false });
    if(error) throw error;
    allSocialCare = data || [];
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được (kiểm tra đã tạo bảng social_care chưa): ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderSocialCareStats();
  renderSocialCareTable();
}

function renderSocialCareStats(){
  document.getElementById('scStatInProgress').textContent = allSocialCare.filter(s => s.task_status === 'Đang thực hiện').length;
  document.getElementById('scStatDone').textContent = allSocialCare.filter(s => s.task_status === 'Đã hoàn thành').length;
  document.getElementById('scStatUnpaid').textContent = allSocialCare.filter(s => s.payment_status === 'Chưa thanh toán').length;
  document.getElementById('scStatScam').textContent = allSocialCare.filter(s => s.payment_status === 'Bùng').length;
}

function filterSocialCare(platform, btnEl){
  socialCareFilter = platform;
  document.querySelectorAll('.filter-pill-btn').forEach(b => b.classList.remove('active'));
  btnEl.classList.add('active');
  renderSocialCareTable();
}

function renderSocialCareTable(){
  const box = document.getElementById('socialCareTableBody');
  const rows = socialCareFilter === 'all' ? allSocialCare : allSocialCare.filter(s => s.platform === socialCareFilter);

  if(!rows.length){
    box.innerHTML = `<div class="dash-empty">Chưa có mục nào${socialCareFilter !== 'all' ? ' cho ' + socialCareFilter : ''}.</div>`;
    return;
  }

  const taskBadge = (status) => {
    const map = { 'Đã nhận đơn':'svc-status-inactive', 'Đang thực hiện':'svc-status-active', 'Đã hoàn thành':'svc-status-active', 'Huỷ đơn':'svc-status-inactive' };
    const color = status === 'Đã hoàn thành' ? 'background:rgba(127,192,137,0.15);color:#8FD09E;'
      : status === 'Đang thực hiện' ? 'background:rgba(127,168,224,0.15);color:#93B8ED;'
      : status === 'Huỷ đơn' ? 'background:rgba(224,139,122,0.15);color:#F0A290;'
      : 'background:rgba(156,146,132,0.15);color:var(--ink-soft);';
    return `<span class="svc-status-pill" style="${color}">${escapeHtml(status)}</span>`;
  };
  const payBadge = (status) => {
    const color = status === 'Đã thanh toán' ? 'background:rgba(127,192,137,0.15);color:#8FD09E;'
      : status === 'Bùng' ? 'background:rgba(255,90,60,0.18);color:var(--danger);'
      : 'background:rgba(224,181,104,0.15);color:#E7C083;';
    return `<span class="svc-status-pill" style="${color}">${escapeHtml(status)}</span>`;
  };

  box.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Nền tảng</th><th>Chủ TK</th><th>Nguồn khách</th><th>TT tài khoản</th><th>Trạng thái</th><th>Giá</th><th>Thanh toán</th><th>Ngày nhận</th><th>Ghi chú</th><th></th>
  </tr></thead><tbody>${rows.map(s => `
    <tr>
      <td>${PLATFORM_ICON[s.platform]||''} ${escapeHtml(s.platform)}${s.link ? `<br><a href="${escapeHtml(s.link)}" target="_blank" rel="noopener" style="font-size:11px; color:var(--ink-soft); text-decoration:underline;">Xem link ↗</a>` : ''}</td>
      <td>${escapeHtml(s.account_owner||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(s.customer_source||'—')}</td>
      <td>${s.account_status === 'Die' ? '🔴 Die' : '🟢 Live'}</td>
      <td>${taskBadge(s.task_status)}</td>
      <td style="font-family:var(--font-mono); font-size:12.5px; white-space:nowrap;">${s.price != null ? Number(s.price).toLocaleString('vi-VN')+'đ' : '—'}</td>
      <td>${payBadge(s.payment_status)}</td>
      <td style="font-size:12px; color:var(--ink-soft); white-space:nowrap;">${s.received_date ? new Date(s.received_date).toLocaleDateString('vi-VN') : '—'}</td>
      <td style="font-size:12px; color:var(--ink-soft); max-width:160px;" title="${escapeHtml(s.notes||'')}">${escapeHtml((s.notes||'').slice(0,40))}${(s.notes||'').length > 40 ? '…' : ''}</td>
      <td class="svc-actions">
        <button onclick="openSocialCareForm(${s.id})">Sửa</button>
        <button class="danger" onclick="handleDeleteSocialCare(${s.id})">Xoá</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function openSocialCareForm(id){
  editingSocialCareId = id || null;
  const errBox = document.getElementById('socialCareModalError');
  errBox.classList.remove('show');

  if(id){
    const s = allSocialCare.find(x => x.id === id);
    document.getElementById('socialCareModalTitle').textContent = 'Sửa mục chăm sóc';
    document.getElementById('sc_platform').value = s.platform;
    document.getElementById('sc_link').value = s.link || '';
    document.getElementById('sc_accountOwner').value = s.account_owner || '';
    document.getElementById('sc_customerSource').value = s.customer_source || '';
    document.getElementById('sc_accountStatus').value = s.account_status || 'Live';
    document.getElementById('sc_taskStatus').value = s.task_status || 'Đã nhận đơn';
    document.getElementById('sc_price').value = s.price != null ? s.price : '';
    document.getElementById('sc_paymentStatus').value = s.payment_status || 'Chưa thanh toán';
    document.getElementById('sc_receivedDate').value = s.received_date || '';
    document.getElementById('sc_notes').value = s.notes || '';
  } else {
    document.getElementById('socialCareModalTitle').textContent = 'Thêm mục chăm sóc';
    document.getElementById('sc_platform').value = 'Facebook';
    document.getElementById('sc_link').value = '';
    document.getElementById('sc_accountOwner').value = '';
    document.getElementById('sc_customerSource').value = '';
    document.getElementById('sc_accountStatus').value = 'Live';
    document.getElementById('sc_taskStatus').value = 'Đã nhận đơn';
    document.getElementById('sc_price').value = '';
    document.getElementById('sc_paymentStatus').value = 'Chưa thanh toán';
    document.getElementById('sc_receivedDate').value = new Date().toISOString().slice(0,10);
    document.getElementById('sc_notes').value = '';
  }
  document.getElementById('socialCareModalOverlay').classList.add('show');
}

function closeSocialCareForm(){
  document.getElementById('socialCareModalOverlay').classList.remove('show');
  editingSocialCareId = null;
}

async function handleSaveSocialCare(){
  const errBox = document.getElementById('socialCareModalError');
  const row = {
    platform        : document.getElementById('sc_platform').value,
    link            : document.getElementById('sc_link').value.trim() || null,
    account_owner   : document.getElementById('sc_accountOwner').value.trim() || null,
    customer_source : document.getElementById('sc_customerSource').value.trim() || null,
    account_status  : document.getElementById('sc_accountStatus').value,
    task_status     : document.getElementById('sc_taskStatus').value,
    price           : document.getElementById('sc_price').value === '' ? null : Number(document.getElementById('sc_price').value),
    payment_status  : document.getElementById('sc_paymentStatus').value,
    received_date   : document.getElementById('sc_receivedDate').value || null,
    notes           : document.getElementById('sc_notes').value.trim() || null,
    updated_at      : new Date().toISOString(),
  };

  const btn = document.getElementById('socialCareSaveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    let error;
    if(editingSocialCareId){
      ({ error } = await sb.from('social_care').update(row).eq('id', editingSocialCareId));
    } else {
      ({ error } = await sb.from('social_care').insert(row));
    }
    if(error) throw error;

    showToast('✅ Đã lưu!');
    logAdminAction(editingSocialCareId ? 'Sửa mục chăm sóc MXH' : 'Thêm mục chăm sóc MXH', `${row.platform} — ${row.account_owner||''}`);
    closeSocialCareForm();
    await loadSocialCareTable();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function handleDeleteSocialCare(id){
  const s = allSocialCare.find(x => x.id === id);
  if(!confirm(`Xoá mục "${s?.account_owner || s?.platform}"? Không thể hoàn tác.`)) return;
  try{
    const { error } = await sb.from('social_care').delete().eq('id', id);
    if(error) throw error;
    showToast('Đã xoá.');
    logAdminAction('Xoá mục chăm sóc MXH', `${s?.platform} — ${s?.account_owner||''}`);
    await loadSocialCareTable();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* =====================================================================
   PWA + PUSH NOTIFICATIONS (ADMIN)
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

  if(!('serviceWorker' in navigator) || !('PushManager' in window)){
    box.innerHTML = '<span style="color:var(--danger);">⚠️ Trình duyệt này không hỗ trợ thông báo đẩy.</span>';
    btn.style.display = 'none';
    return;
  }
  if(Notification.permission === 'denied'){
    box.innerHTML = '<span style="color:var(--danger);">⚠️ Bạn đã chặn thông báo trước đó. Vào cài đặt trình duyệt để bật lại quyền thông báo cho trang này.</span>';
    btn.style.display = 'none';
    return;
  }

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();

  if(sub){
    box.innerHTML = '<span style="color:#8FD09E;">✅ Thông báo đẩy đang BẬT trên thiết bị này.</span>';
    btn.textContent = 'Tắt thông báo';
    btn.dataset.mode = 'disable';
  } else {
    box.innerHTML = 'Chưa bật thông báo trên thiết bị này.';
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
      is_admin: true,
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

/* =====================================================================
   CẤU HÌNH HẠNG TÀI KHOẢN — Standard → Priority → Private
===================================================================== */
const ACCOUNT_TIER_CONFIG_KEY = 'account_tier_config';
const DEFAULT_ACCOUNT_TIER_CONFIG = {
  auto_upgrade: true,
  priority_threshold: 5000000,
  private_threshold: 10000000
};
let accountTierConfigLoaded = false;

function formatTierMoney(value){
  return Math.max(0, Number(value) || 0).toLocaleString('vi-VN') + 'đ';
}

function updateAccountTierPreview(){
  const priority = Number(document.getElementById('tier_priority_threshold')?.value) || 0;
  const privateValue = Number(document.getElementById('tier_private_threshold')?.value) || 0;
  ['tierPriorityPreview','tierPriorityLadder'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = formatTierMoney(priority);
  });
  ['tierPrivatePreview','tierPrivateLadder'].forEach(id => {
    const el = document.getElementById(id); if(el) el.textContent = formatTierMoney(privateValue);
  });
}

async function loadAccountTierConfig(force = false){
  if(accountTierConfigLoaded && !force) return;
  const errorBox = document.getElementById('tierConfigError');
  if(errorBox) errorBox.classList.remove('show');
  try{
    const { data, error } = await sb.from('site_config').select('value').eq('key', ACCOUNT_TIER_CONFIG_KEY).maybeSingle();
    if(error) throw error;
    const cfg = { ...DEFAULT_ACCOUNT_TIER_CONFIG, ...(data?.value || {}) };
    document.getElementById('tier_auto_enabled').checked = cfg.auto_upgrade !== false;
    document.getElementById('tier_priority_threshold').value = Number(cfg.priority_threshold) || DEFAULT_ACCOUNT_TIER_CONFIG.priority_threshold;
    document.getElementById('tier_private_threshold').value = Number(cfg.private_threshold) || DEFAULT_ACCOUNT_TIER_CONFIG.private_threshold;
    accountTierConfigLoaded = true;
    updateAccountTierPreview();
  } catch(error){
    if(errorBox){
      errorBox.textContent = 'Không thể tải cấu hình: ' + (error.message || 'Lỗi kết nối');
      errorBox.classList.add('show');
    }
  }
}

function readAccountTierConfigForm(){
  const priority = Number(document.getElementById('tier_priority_threshold').value);
  const privateValue = Number(document.getElementById('tier_private_threshold').value);
  if(!Number.isFinite(priority) || priority <= 0) throw new Error('Mốc Priority phải lớn hơn 0.');
  if(!Number.isFinite(privateValue) || privateValue <= priority) throw new Error('Mốc Private phải lớn hơn mốc Priority.');
  return {
    auto_upgrade: document.getElementById('tier_auto_enabled').checked,
    priority_threshold: Math.round(priority),
    private_threshold: Math.round(privateValue)
  };
}

async function saveAccountTierConfig(){
  const btn = document.getElementById('tierConfigSaveBtn');
  const errorBox = document.getElementById('tierConfigError');
  errorBox.classList.remove('show');
  try{
    const value = readAccountTierConfigForm();
    btn.disabled = true; btn.textContent = 'Đang lưu...';
    const { error } = await sb.from('site_config').upsert({
      key: ACCOUNT_TIER_CONFIG_KEY,
      value,
      updated_at: new Date().toISOString()
    }, { onConflict:'key' });
    if(error) throw error;
    accountTierConfigLoaded = true;
    updateAccountTierPreview();
    showToast('Đã lưu cấu hình nâng hạng.');
    logAdminAction('Cập nhật cấu hình hạng tài khoản', `Priority ${formatTierMoney(value.priority_threshold)} · Private ${formatTierMoney(value.private_threshold)} · Tự động ${value.auto_upgrade ? 'bật' : 'tắt'}`);
    if(value.auto_upgrade) await recalculateAccountTiers(false);
  } catch(error){
    errorBox.textContent = error.message || 'Không thể lưu cấu hình.';
    errorBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Lưu cấu hình';
  }
}

async function recalculateAccountTiers(askConfirm = true){
  if(askConfirm && !confirm('Tính lại tổng chi tiêu và hạng cho toàn bộ tài khoản ngay bây giờ?')) return;
  const btn = document.getElementById('tierRecalculateBtn');
  if(btn){ btn.disabled = true; btn.textContent = 'Đang tính lại...'; }
  try{
    const { data, error } = await sb.rpc('admin_recalculate_account_tiers');
    if(error) throw error;
    allUsers = [];
    showToast(`Đã tính lại hạng cho ${Number(data) || 0} tài khoản.`);
  } catch(error){
    const errorBox = document.getElementById('tierConfigError');
    if(errorBox){ errorBox.textContent = 'Không thể tính lại hạng: ' + (error.message || 'Lỗi kết nối'); errorBox.classList.add('show'); }
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = 'Tính lại toàn bộ hạng'; }
  }
}

['tier_priority_threshold','tier_private_threshold'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', updateAccountTierPreview);
});

/* =====================================================================
   CHẾ ĐỘ BẢO TRÌ — lưu vào `site_config`, key 'maintenance_mode'
===================================================================== */
const MAINTENANCE_KEY = 'maintenance_mode';

async function loadMaintenanceConfig(){
  if(!isBackendConfigured() || !currentAdmin) return;
  const titleEl = document.getElementById('maintenanceStatusTitle');
  const subEl = document.getElementById('maintenanceStatusSub');
  const cardEl = document.getElementById('maintenanceStatusCard');

  try{
    const { data } = await sb.from('site_config').select('value').eq('key', MAINTENANCE_KEY).single();
    const cfg = data?.value || {};
    document.getElementById('mt_enabled').checked = !!cfg.enabled;
    document.getElementById('mt_title').value = cfg.title || 'Website đang bảo trì';
    document.getElementById('mt_message').value = cfg.message || 'Chúng tôi đang nâng cấp hệ thống, vui lòng quay lại sau. Xin lỗi vì sự bất tiện này.';

    updateMaintenanceStatusCard(!!cfg.enabled);
  } catch(e){
    document.getElementById('mt_enabled').checked = false;
    document.getElementById('mt_title').value = 'Website đang bảo trì';
    document.getElementById('mt_message').value = 'Chúng tôi đang nâng cấp hệ thống, vui lòng quay lại sau. Xin lỗi vì sự bất tiện này.';
    updateMaintenanceStatusCard(false);
  }
}

function updateMaintenanceStatusCard(enabled){
  const titleEl = document.getElementById('maintenanceStatusTitle');
  const subEl = document.getElementById('maintenanceStatusSub');
  const cardEl = document.getElementById('maintenanceStatusCard');
  if(enabled){
    titleEl.innerHTML = '🔴 ĐANG BẢO TRÌ — web khách hiện KHÔNG truy cập được';
    subEl.textContent = 'Nhớ tắt lại khi bảo trì xong, kẻo khách không đặt được đơn.';
    cardEl.style.borderColor = 'var(--danger)';
  } else {
    titleEl.innerHTML = '🟢 Bình thường — web khách đang hoạt động';
    subEl.textContent = '';
    cardEl.style.borderColor = 'var(--line)';
  }
}

async function saveMaintenanceConfig(){
  if(!isBackendConfigured() || !currentAdmin){ showToast('Chưa đăng nhập.'); return; }
  const errBox = document.getElementById('mt_error');
  errBox.classList.remove('show');

  const enabled = document.getElementById('mt_enabled').checked;
  const title = document.getElementById('mt_title').value.trim() || 'Website đang bảo trì';
  const message = document.getElementById('mt_message').value.trim();

  if(enabled && !confirm('Bạn chắc chắn muốn BẬT bảo trì? Toàn bộ khách sẽ không dùng được web cho tới khi bạn tắt lại.')){
    return;
  }

  const btn = document.getElementById('mt_saveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { error } = await sb.from('site_config').upsert(
      { key: MAINTENANCE_KEY, value: { enabled, title, message }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if(error) throw error;

    showToast(enabled ? '🚧 Đã BẬT chế độ bảo trì!' : '✅ Đã tắt bảo trì, web hoạt động bình thường.');
    logAdminAction(enabled ? 'BẬT chế độ bảo trì' : 'TẮT chế độ bảo trì', title);
    updateMaintenanceStatusCard(enabled);
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* =====================================================================
   FOLLOW & TƯƠNG TÁC — đồng bộ 2 chiều với Google Sheet qua Apps Script
===================================================================== */
let allBoost = [];
let editingBoostId = null;
let boostRealtimeChannel = null;

async function loadBoostTable(){
  const box = document.getElementById('boostTableBody');
  try{
    const { data, error } = await sb.from('social_boost').select('*').order('sheet_row', { ascending: true, nullsFirst: false });
    if(error) throw error;
    allBoost = data || [];
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được (kiểm tra đã tạo bảng social_boost chưa): ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderBoostTable();
  subscribeBoostRealtime();
}

function subscribeBoostRealtime(){
  if(boostRealtimeChannel) sb.removeChannel(boostRealtimeChannel);
  boostRealtimeChannel = sb.channel('social-boost-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'social_boost' }, () => {
      loadBoostTable(); // Có ai (kể cả từ Sheet) vừa sửa -> tự tải lại danh sách mới nhất
    })
    .subscribe();
}

function renderBoostTable(){
  const box = document.getElementById('boostTableBody');
  if(!allBoost.length){
    box.innerHTML = `<div class="dash-empty">Chưa có dòng nào. Bấm "+ Thêm dòng mới" hoặc thêm trực tiếp trên Google Sheet.</div>`;
    return;
  }

  const STATUS_COLORS = {
    ['Đã hoàn thành'.normalize('NFC')]: { bg:'rgba(127,192,137,0.15)', fg:'#8FD09E' },  // xanh lá
    ['Đang thực hiện'.normalize('NFC')]: { bg:'rgba(224,181,104,0.15)', fg:'#E7C083' }, // vàng
    ['Chưa bắt đầu'.normalize('NFC')]:   { bg:'rgba(127,168,224,0.15)', fg:'#93B8ED' }, // xanh dương
    ['Đã hủy'.normalize('NFC')]:         { bg:'rgba(255,90,60,0.18)',   fg:'var(--danger)' }, // đỏ
    ['Nổi đơn'.normalize('NFC')]:        { bg:'rgba(255,90,60,0.18)',   fg:'var(--danger)' }, // đỏ (coi như sự cố)
    ['Đã Bảo Hành'.normalize('NFC')]:    { bg:'rgba(122,122,255,0.15)', fg:'#A0A0FF' },
  };
  const normStatus = (s) => (s||'').trim().normalize('NFC');
  const getStatusColor = (status) => {
    const s = normStatus(status);
    if(s.includes('hoàn thành')) return { bg:'rgba(127,192,137,0.15)', fg:'#8FD09E' };   // xanh lá
    if(s.includes('hủy'))        return { bg:'rgba(255,90,60,0.18)',   fg:'var(--danger)' }; // đỏ
    if(s.includes('nổi đơn'))    return { bg:'rgba(255,90,60,0.18)',   fg:'var(--danger)' }; // đỏ
    if(s.includes('bảo hành'))   return { bg:'rgba(122,122,255,0.15)', fg:'#A0A0FF' };    // tím
    if(s.includes('chưa bắt đầu')) return { bg:'rgba(127,168,224,0.15)', fg:'#93B8ED' };  // xanh dương
    if(s.includes('đang thực hiện')) return { bg:'rgba(224,181,104,0.15)', fg:'#E7C083' }; // vàng
    return { bg:'rgba(156,146,132,0.15)', fg:'var(--ink-soft)' }; // không nhận diện được -> trung tính
  };

  const statusBadge = (status) => {
    const c = getStatusColor(status);
    return `<span class="svc-status-pill" style="background:${c.bg};color:${c.fg};">${escapeHtml(status||'—')}</span>`;
  };

  // Số "Còn lại" chỉ tô màu khi Đã hoàn thành (xanh lá) hoặc Đã hủy/Nổi đơn (đỏ);
  // các trạng thái khác giữ màu trung tính, không gây rối mắt.
  const remainingColor = (status) => {
    const s = normStatus(status);
    if(s.includes('hoàn thành')) return '#8FD09E';
    if(s.includes('hủy') || s.includes('nổi đơn')) return 'var(--danger)';
    return 'var(--ink)';
  };

  box.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Link</th><th>Trạng thái</th><th>Chủ sở hữu</th><th>Cần Lên</th><th>Đã lên</th><th>Còn lại</th><th>Note</th><th>Ngày</th><th></th>
  </tr></thead><tbody>${allBoost.map(b => `
    <tr>
      <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${b.link ? `<a href="${escapeHtml(b.link.startsWith('http') ? b.link : 'https://'+b.link)}" target="_blank" rel="noopener" style="color:var(--ink); text-decoration:underline;">${escapeHtml(b.link)}</a>` : '—'}
      </td>
      <td>${statusBadge(b.status)}</td>
      <td>${escapeHtml(b.owner||'—')}</td>
      <td style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(b.target_amount||'—')}</td>
      <td style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(b.current_amount||'—')}</td>
      <td style="font-family:var(--font-mono); font-size:12px; font-weight:600; color:${remainingColor(b.status)};">${escapeHtml(b.remaining||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft); max-width:140px;" title="${escapeHtml(b.note||'')}">${escapeHtml((b.note||'').slice(0,30))}${(b.note||'').length>30?'…':''}</td>
      <td style="font-size:12px; color:var(--ink-soft); white-space:nowrap;">${b.order_date ? new Date(b.order_date).toLocaleDateString('vi-VN') : '—'}</td>
      <td class="svc-actions">
        <button onclick="openBoostForm(${b.id})">Sửa</button>
        <button class="danger" onclick="handleDeleteBoost(${b.id})">Xoá</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

function openBoostForm(id){
  editingBoostId = id || null;
  document.getElementById('boostModalError').classList.remove('show');

  if(id){
    const b = allBoost.find(x => x.id === id);
    document.getElementById('boostModalTitle').textContent = 'Sửa dòng';
    document.getElementById('bs_link').value = b.link || '';
    document.getElementById('bs_status').value = b.status || 'Đang thực hiện';
    document.getElementById('bs_owner').value = b.owner || '';
    document.getElementById('bs_target').value = b.target_amount || '';
    document.getElementById('bs_current').value = b.current_amount || '';
    document.getElementById('bs_remaining').value = b.remaining || '';
    document.getElementById('bs_date').value = b.order_date || '';
    document.getElementById('bs_note').value = b.note || '';
    document.getElementById('bs_note2').value = b.note2 || '';
  } else {
    document.getElementById('boostModalTitle').textContent = 'Thêm dòng mới';
    ['bs_link','bs_owner','bs_target','bs_current','bs_remaining','bs_note','bs_note2'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('bs_status').value = 'Đang thực hiện';
    document.getElementById('bs_date').value = new Date().toISOString().slice(0,10);
  }
  document.getElementById('boostModalOverlay').classList.add('show');
}

function closeBoostForm(){
  document.getElementById('boostModalOverlay').classList.remove('show');
  editingBoostId = null;
}

async function handleSaveBoost(){
  const errBox = document.getElementById('boostModalError');
  const row = {
    link: document.getElementById('bs_link').value.trim() || null,
    status: document.getElementById('bs_status').value,
    owner: document.getElementById('bs_owner').value.trim() || null,
    target_amount: document.getElementById('bs_target').value.trim() || null,
    current_amount: document.getElementById('bs_current').value.trim() || null,
    remaining: document.getElementById('bs_remaining').value.trim() || null,
    order_date: document.getElementById('bs_date').value || null,
    note: document.getElementById('bs_note').value.trim() || null,
    note2: document.getElementById('bs_note2').value.trim() || null,
    source: 'admin',
    updated_at: new Date().toISOString(),
  };

  const btn = document.getElementById('boostSaveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    let error;
    if(editingBoostId){
      ({ error } = await sb.from('social_boost').update(row).eq('id', editingBoostId));
    } else {
      ({ error } = await sb.from('social_boost').insert(row));
    }
    if(error) throw error;

    showToast('✅ Đã lưu! (đang đồng bộ sang Sheet...)');
    logAdminAction(editingBoostId ? 'Sửa dòng Follow & Tương tác' : 'Thêm dòng Follow & Tương tác', row.link || row.owner || '');
    closeBoostForm();
    await loadBoostTable();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function handleDeleteBoost(id){
  const b = allBoost.find(x => x.id === id);
  if(!confirm(`Xoá dòng "${b?.link || b?.owner}"? Dòng tương ứng trên Sheet cũng sẽ bị xoá nội dung.`)) return;
  try{
    const { error } = await sb.from('social_boost').update({ source: 'admin' }).eq('id', id);
    const { error: delError } = await sb.from('social_boost').delete().eq('id', id);
    if(delError) throw delError;
    showToast('Đã xoá.');
    logAdminAction('Xoá dòng Follow & Tương tác', b?.link || b?.owner || '');
    await loadBoostTable();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* =====================================================================
   ĐƠN TƯƠNG TÁC — lọc riêng từ bảng "orders" (order_group = 'social_ads')
   Dùng lại renderStatusSelect() / handleStatusChange() đã có sẵn vì cùng
   thao tác trên bảng orders theo order_code.
===================================================================== */
let allAdsOrders = [];

async function loadAdsOrders(){
  const box = document.getElementById('adsOrdersTableBody');
  if(!isBackendConfigured() || !currentAdmin) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;

  try{
    const { data, error } = await sb
      .from('orders')
      .select('*')
      .eq('order_group', 'social_ads')
      .order('created_at', { ascending: false });
    if(error) throw error;
    allAdsOrders = data || [];
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được (kiểm tra đã thêm cột order_group/platform/... vào bảng orders chưa): ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderAdsOrdersTable();
}

function renderAdsOrdersTable(){
  const box = document.getElementById('adsOrdersTableBody');
  if(!allAdsOrders.length){
    box.innerHTML = `<div class="dash-empty">Chưa có đơn tương tác nào.</div>`;
    return;
  }

  box.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Mã đơn</th><th>Khách hàng</th><th>Nền tảng</th><th>Server</th><th>Loại</th><th>Link</th><th>Số lượng</th><th>Ngày BĐ</th><th>Tạm tính</th><th>Trạng thái</th><th>Thao tác</th>
  </tr></thead><tbody>${allAdsOrders.map(o => `
    <tr>
      <td class="dt-code">${escapeHtml(o.order_code)}</td>
      <td>${escapeHtml(o.customer_name||'')}<br><span style="color:var(--ink-soft); font-size:11.5px;">${escapeHtml(o.phone||o.email||'')}</span></td>
      <td>${escapeHtml(o.platform||'—')}</td>
      <td style="font-size:12px;">${escapeHtml(o.server_name||'Mặc định')}</td>
      <td>${escapeHtml(o.interaction_type||'—')}</td>
      <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${o.post_link ? `<a href="${escapeHtml(o.post_link)}" target="_blank" rel="noopener" style="color:var(--ink); text-decoration:underline;">${escapeHtml(o.post_link)}</a>` : '—'}
      </td>
      <td style="font-family:var(--font-mono); font-size:12px;">${o.quantity != null ? Number(o.quantity).toLocaleString('vi-VN') : '—'}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${o.start_date ? new Date(o.start_date).toLocaleDateString('vi-VN') : '—'}</td>
      <td style="font-family:var(--font-mono); font-size:12px;">${o.amount != null ? Number(o.amount).toLocaleString('vi-VN') + 'đ' : '—'}</td>
      <td>${renderStatusSelect(o.order_code, o.status || 'Chờ xác nhận')}</td>
      <td>
        ${(o.status === 'Đã huỷ' || o.status === 'Hoàn thành')
          ? `<span style="font-size:11.5px; color:var(--ink-soft);">${o.status === 'Đã huỷ' ? 'Đã huỷ' + (o.refund_amount!=null ? ' — hoàn '+Number(o.refund_amount).toLocaleString('vi-VN')+'đ' : '') : 'Đã hoàn thành'}</span>`
          : `<button class="svc-actions" style="border:1.5px solid var(--danger); color:var(--danger); background:none; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer;" onclick="openCancelOrderModal('${o.order_code}')">Huỷ đơn</button>`}
      </td>
    </tr>`).join('')}</tbody></table>`;

  box.querySelectorAll('.status-select').forEach(sel=>{
    sel.addEventListener('change', (e)=> handleStatusChange(e.target.dataset.code, e.target.value, e.target).then(()=>{
      const o = allAdsOrders.find(x => x.order_code === e.target.dataset.code);
      if(o) o.status = e.target.value;
    }));
  });
}

/* =====================================================================
   BẢNG GIÁ TƯƠNG TÁC — CRUD bảng social_ads_pricing
===================================================================== */
let allAdsPricing = [];
let editingPriceId = null;

async function loadAdsPricing(){
  const box = document.getElementById('adsPricingTableBody');
  if(!isBackendConfigured() || !currentAdmin) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;

  try{
    const { data, error } = await sb
      .from('social_ads_pricing')
      .select('*')
      .order('platform', { ascending: true })
      .order('sort_order', { ascending: true });
    if(error) throw error;
    allAdsPricing = data || [];
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được (kiểm tra đã tạo bảng social_ads_pricing chưa): ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderAdsPricingTable();
}

function renderAdsPricingTable(){
  const box = document.getElementById('adsPricingTableBody');
  if(!allAdsPricing.length){
    box.innerHTML = `<div class="dash-empty">Chưa có dòng giá nào. Bấm "+ Thêm dòng giá".</div>`;
    return;
  }

  box.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Server</th><th>Nền tảng</th><th>Loại</th><th>Tên hiển thị</th><th>Đơn giá / lượt</th><th></th>
  </tr></thead><tbody>${allAdsPricing.map(p => `
    <tr>
      <td>
        <div style="font-weight:600;">${escapeHtml(p.server_name||'Mặc định')}</div>
        ${p.server_note ? `<div style="font-size:11px; color:var(--ink-soft); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(p.server_note)}">${escapeHtml(p.server_note)}</div>` : ''}
      </td>
      <td>${escapeHtml(p.platform)}</td>
      <td style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(p.interaction_type)}</td>
      <td>${escapeHtml(p.interaction_label||'')}</td>
      <td>
        <input type="number" class="price-inline-input" data-id="${p.id}" value="${p.unit_price}" min="0" step="1"
          style="width:100px; padding:6px 8px; border:1.5px solid var(--line); border-radius:6px; background:var(--surface-2); color:var(--ink); font-family:var(--font-mono); font-size:12px;">
      </td>
      <td class="svc-actions">
        <button onclick="openPriceForm(${p.id})">Sửa</button>
        <button onclick="handleDeletePrice(${p.id})" class="danger">Xoá</button>
      </td>
    </tr>`).join('')}</tbody></table>`;

  box.querySelectorAll('.price-inline-input').forEach(inp=>{
    inp.addEventListener('change', (e)=> handlePriceInlineChange(Number(e.target.dataset.id), e.target.value, e.target));
  });
}

async function handlePriceInlineChange(id, rawValue, inputEl){
  const value = Number(rawValue);
  if(isNaN(value) || value < 0){
    showToast('Đơn giá phải là số hợp lệ, không âm.');
    return;
  }
  inputEl.disabled = true;
  try{
    const { error } = await sb.from('social_ads_pricing').update({ unit_price: value, updated_at: new Date().toISOString() }).eq('id', id);
    if(error) throw error;
    const row = allAdsPricing.find(p => p.id === id);
    if(row) row.unit_price = value;
    showToast('Đã lưu đơn giá.');
    logAdminAction('Cập nhật giá tương tác', `#${id} → ${value.toLocaleString('vi-VN')}đ`);
  } catch(e){
    showToast('Lỗi: ' + e.message);
  } finally {
    inputEl.disabled = false;
  }
}

function openPriceForm(id){
  editingPriceId = id || null;
  const p = id ? allAdsPricing.find(x => x.id === id) : null;
  document.getElementById('priceModalTitle').textContent = p ? 'Sửa dòng giá' : 'Thêm dòng giá';
  document.getElementById('priceModalError').classList.remove('show');
  document.getElementById('pr_server').value = p?.server_name || '';
  document.getElementById('pr_platform').value = p?.platform || 'Facebook';
  document.getElementById('pr_type').value = p?.interaction_type || 'Like';
  document.getElementById('pr_label').value = p?.interaction_label || 'Tăng like';
  document.getElementById('pr_price').value = p?.unit_price ?? '';
  document.getElementById('pr_server_note').value = p?.server_note || '';
  document.getElementById('priceModalOverlay').classList.add('show');
}

function closePriceForm(){
  document.getElementById('priceModalOverlay').classList.remove('show');
}

async function handleSavePrice(){
  const errBox = document.getElementById('priceModalError');
  const serverName = document.getElementById('pr_server').value.trim() || 'Mặc định';
  const row = {
    server_name: serverName,
    server_note: document.getElementById('pr_server_note').value.trim() || null,
    platform: document.getElementById('pr_platform').value,
    interaction_type: document.getElementById('pr_type').value,
    interaction_label: document.getElementById('pr_label').value.trim() || document.getElementById('pr_type').value,
    unit_price: Number(document.getElementById('pr_price').value) || 0,
    updated_at: new Date().toISOString(),
  };
  if(editingPriceId) row.id = editingPriceId;

  const btn = document.getElementById('priceSaveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { error } = await sb.from('social_ads_pricing').upsert(row, { onConflict: 'platform,server_name,interaction_type' });
    if(error) throw error;
    showToast('✅ Đã lưu dòng giá.');
    logAdminAction('Thêm/sửa giá tương tác', `${serverName} — ${row.platform} - ${row.interaction_type} → ${row.unit_price}đ`);
    closePriceForm();
    await loadAdsPricing();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function handleDeletePrice(id){
  if(!confirm('Xoá dòng giá này?')) return;
  try{
    const { error } = await sb.from('social_ads_pricing').delete().eq('id', id);
    if(error) throw error;
    showToast('Đã xoá.');
    logAdminAction('Xoá giá tương tác', `#${id}`);
    await loadAdsPricing();
  } catch(e){
    showToast('Lỗi: ' + e.message);
  }
}

/* =====================================================================
   SQL HELPER — hiển thị SQL tạo bảng site_config nếu chưa có
===================================================================== */
(function injectSqlHint(){
  // Chỉ log ra console, không làm phiền UI
  console.info(`%c[Phatdatagency Admin] Nếu lưu config bị lỗi "relation site_config does not exist",
chạy SQL sau trong Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS site_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
-- Cho phép admin đọc/ghi
ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON site_config
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
`, 'color:#FF4B2E; font-size:12px;');
})();


(async function init(){
  if(!isBackendConfigured()){ showLoginScreen(); return; }

  const { data } = await sb.auth.getSession();
  if(data?.session?.user){
    const { data: profile } = await sb
      .from('profiles')
      .select('is_admin')
      .eq('id', data.session.user.id)
      .single();

    if(profile?.is_admin){
      currentAdmin = { id: data.session.user.id, email: data.session.user.email };
      showDashShell();
      return;
    }
    // Có session nhưng không phải admin -> đăng xuất, về màn login
    await sb.auth.signOut();
  }
  showLoginScreen();

  sb.auth.onAuthStateChange((event) => {
    if(event === 'SIGNED_OUT'){ stopAppealWatcher(); currentAdmin = null; showLoginScreen(); }
  });
})();

/* =====================================================================
   ĐIỀU CHỈNH VÍ KHÁCH HÀNG (tay) — dùng khi có sự cố/tranh chấp.
   Gọi RPC admin_adjust_wallet, bản thân RPC tự kiểm tra quyền is_admin
   và tự ghi lịch sử ai đã điều chỉnh, không cho sửa thẳng cột wallet_balance.
===================================================================== */
let _walletAdjustUserId = null;

function openWalletAdjustModal(userId){
  const user = allUsers.find(u => u.id === userId);
  if(!user) return;
  _walletAdjustUserId = userId;

  document.getElementById('waUserName').textContent = user.name || user.email || userId;
  document.getElementById('waCurrentBalance').textContent = (user.walletBalance||0).toLocaleString('vi-VN') + 'đ';
  document.getElementById('wa_amount').value = '';
  document.getElementById('wa_note').value = '';
  document.getElementById('walletAdjustError').classList.remove('show');
  document.getElementById('walletAdjustOverlay').classList.add('show');
  loadWalletHistory(userId);
}

function closeWalletAdjustModal(){
  document.getElementById('walletAdjustOverlay').classList.remove('show');
  _walletAdjustUserId = null;
}

async function loadWalletHistory(userId){
  const box = document.getElementById('waHistory');
  box.innerHTML = `<div class="dash-loading" style="padding:10px 0;">Đang tải lịch sử...</div>`;
  try{
    const { data, error } = await sb.rpc('admin_get_wallet_history', { p_user_id: userId });
    if(error) throw error;
    if(!data || !data.length){
      box.innerHTML = `<div style="font-size:12.5px; color:var(--ink-soft);">Chưa có giao dịch nào.</div>`;
      return;
    }
    box.innerHTML = data.slice(0, 15).map(t => `
      <div style="display:flex; justify-content:space-between; gap:10px; padding:8px 0; border-bottom:1px dashed var(--line); font-size:12px;">
        <div>
          <span style="color:${t.type==='nap'?'var(--sage)':'var(--danger)'}; font-weight:600;">
            ${t.type === 'nap' ? '+' : '−'}${Number(t.amount).toLocaleString('vi-VN')}đ
          </span>
          <div style="color:var(--ink-soft); margin-top:2px;">${escapeHtml(t.note||'')}</div>
        </div>
        <div style="color:var(--ink-soft); white-space:nowrap; font-family:var(--font-mono);">
          ${new Date(t.created_at).toLocaleString('vi-VN')}
        </div>
      </div>`).join('');
  } catch(e){
    box.innerHTML = `<div style="font-size:12px; color:var(--danger);">Lỗi tải lịch sử: ${escapeHtml(e.message)}</div>`;
  }
}

async function submitWalletAdjust(direction){
  // direction: 1 = cộng tiền, -1 = trừ tiền
  const errBox = document.getElementById('walletAdjustError');
  const rawAmount = Number(document.getElementById('wa_amount').value);
  const note = document.getElementById('wa_note').value.trim();

  if(!rawAmount || rawAmount <= 0){
    errBox.textContent = 'Nhập số tiền hợp lệ (lớn hơn 0).';
    errBox.classList.add('show');
    return;
  }
  if(!note){
    errBox.textContent = 'Vui lòng ghi rõ lý do điều chỉnh (để tra soát sau này).';
    errBox.classList.add('show');
    return;
  }

  const amount = rawAmount * direction;
  const actionLabel = direction > 0 ? 'CỘNG' : 'TRỪ';
  if(!confirm(`Xác nhận ${actionLabel} ${rawAmount.toLocaleString('vi-VN')}đ vào ví khách này?\nLý do: ${note}`)) return;

  const pin = await requestMoneyPin(`Xác nhận ${actionLabel} ${rawAmount.toLocaleString('vi-VN')}đ vào ví khách`);
  if(!pin) return; // admin huỷ nhập mã

  try{
    const { data, error } = await sb.rpc('admin_adjust_wallet', {
      p_user_id: _walletAdjustUserId, p_amount: amount, p_note: note, p_pin: pin
    });
    if(error || !data?.ok){
      errBox.textContent = data?.error || error?.message || 'Có lỗi xảy ra.';
      errBox.classList.add('show');
      return;
    }
    showToast(`Đã ${actionLabel === 'CỘNG' ? 'cộng' : 'trừ'} ${rawAmount.toLocaleString('vi-VN')}đ. Số dư mới: ${Number(data.balance).toLocaleString('vi-VN')}đ`);
    logAdminAction(`${actionLabel} tiền ví khách`, `${_walletAdjustUserId} — ${rawAmount.toLocaleString('vi-VN')}đ — ${note}`);

    const user = allUsers.find(u => u.id === _walletAdjustUserId);
    if(user) user.walletBalance = Number(data.balance);
    document.getElementById('waCurrentBalance').textContent = Number(data.balance).toLocaleString('vi-VN') + 'đ';
    document.getElementById('wa_amount').value = '';
    document.getElementById('wa_note').value = '';
    renderUsersTable(allUsers);
    loadWalletHistory(_walletAdjustUserId);
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  }
}

/* =====================================================================
   HUỶ ĐƠN & HOÀN TIỀN (Đơn tương tác)
   Toàn bộ tính toán số tiền hoàn được HIỂN THỊ ở client để admin xem trước,
   nhưng số tiền cuối cùng được RPC admin_cancel_order tự kiểm tra lại
   (không vượt quá số tiền đơn, không âm) trước khi cộng vào ví khách.
===================================================================== */
let _cancelOrderCode = null;
let _cancelOrderData = null;

function openCancelOrderModal(orderCode){
  const order = allAdsOrders.find(o => o.order_code === orderCode);
  if(!order) return;
  _cancelOrderCode = orderCode;
  _cancelOrderData = order;

  document.getElementById('coOrderCode').textContent = orderCode;
  document.getElementById('coOrderAmount').textContent = (Number(order.amount)||0).toLocaleString('vi-VN') + 'đ';
  document.getElementById('coOrderQty').textContent = order.quantity != null ? Number(order.quantity).toLocaleString('vi-VN') : '—';

  document.getElementById('co_type').value = 'admin';
  document.getElementById('co_customerRate').value = '100';
  document.getElementById('co_delivered').value = '';
  document.getElementById('co_extraFee').checked = false;
  document.getElementById('co_reason').value = '';
  document.getElementById('cancelOrderError').classList.remove('show');

  onCancelTypeChange();
  document.getElementById('cancelOrderOverlay').classList.add('show');
}

function closeCancelOrderModal(){
  document.getElementById('cancelOrderOverlay').classList.remove('show');
  _cancelOrderCode = null;
  _cancelOrderData = null;
}

function onCancelTypeChange(){
  const type = document.getElementById('co_type').value;
  document.getElementById('co_customerBlock').style.display = type === 'customer' ? 'block' : 'none';
  document.getElementById('co_partialBlock').style.display = type === 'partial' ? 'block' : 'none';
  recalcRefund();
}

// Tính số tiền hoàn dự kiến — CHỈ để hiển thị preview cho admin xem trước,
// số tiền thật sẽ được gửi lên và RPC tự kiểm tra lại tính hợp lệ.
function recalcRefund(){
  const order = _cancelOrderData;
  if(!order){ return 0; }
  const amount = Number(order.amount) || 0;
  const totalQty = Number(order.quantity) || 0;
  const type = document.getElementById('co_type').value;
  let refund = 0;

  if(type === 'admin'){
    refund = amount; // Admin tự huỷ -> hoàn 100%
  } else if(type === 'customer'){
    const rate = Number(document.getElementById('co_customerRate').value) / 100;
    refund = amount * rate;
  } else if(type === 'partial'){
    const delivered = Number(document.getElementById('co_delivered').value) || 0;
    const deliveredClamped = Math.min(delivered, totalQty);
    const costUsed = totalQty > 0 ? (amount * deliveredClamped / totalQty) : 0;
    let refundBeforeFee = Math.max(amount - costUsed, 0);
    if(document.getElementById('co_extraFee').checked){
      refundBeforeFee = refundBeforeFee * 0.97; // trừ thêm 3% phí phát sinh
    }
    refund = refundBeforeFee;
  }

  refund = Math.round(Math.max(0, Math.min(refund, amount)));
  document.getElementById('co_refundPreview').textContent = refund.toLocaleString('vi-VN') + 'đ';
  return refund;
}

async function submitCancelOrder(){
  const errBox = document.getElementById('cancelOrderError');
  errBox.classList.remove('show');

  const type = document.getElementById('co_type').value;
  const reason = document.getElementById('co_reason').value.trim();
  const refundAmount = recalcRefund();
  const deliveredQty = type === 'partial' ? (Number(document.getElementById('co_delivered').value) || 0) : null;

  const typeLabel = { admin:'Admin huỷ', customer:'Khách yêu cầu huỷ', partial:'Huỷ dở dang' }[type];
  if(!confirm(`Xác nhận HUỶ đơn ${_cancelOrderCode}?\nLoại: ${typeLabel}\nSố tiền hoàn vào ví khách: ${refundAmount.toLocaleString('vi-VN')}đ\n\nHành động này không thể hoàn tác.`)) return;

  const pin = await requestMoneyPin(`Xác nhận huỷ đơn & hoàn ${refundAmount.toLocaleString('vi-VN')}đ`);
  if(!pin) return; // admin huỷ nhập mã

  const btn = document.getElementById('cancelOrderSubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xử lý...';

  try{
    const { data, error } = await sb.rpc('admin_cancel_order', {
      p_order_code: _cancelOrderCode,
      p_cancel_type: type,
      p_refund_amount: refundAmount,
      p_delivered_quantity: deliveredQty,
      p_reason: reason || null,
      p_pin: pin
    });

    if(error || !data?.ok){
      errBox.textContent = data?.error || error?.message || 'Có lỗi xảy ra.';
      errBox.classList.add('show');
      return;
    }

    if(data.refunded_to_wallet){
      showToast(`✅ Đã huỷ đơn và hoàn ${Number(data.refund_amount).toLocaleString('vi-VN')}đ vào ví khách.`);
    } else if(data.refund_amount > 0){
      showToast(`⚠️ Đã huỷ đơn. Khách vãng lai không có ví — cần TỰ chuyển khoản hoàn ${Number(data.refund_amount).toLocaleString('vi-VN')}đ thủ công.`);
    } else {
      showToast('Đã huỷ đơn (không phát sinh hoàn tiền).');
    }

    logAdminAction('Huỷ đơn tương tác', `${_cancelOrderCode} — ${typeLabel} — hoàn ${refundAmount.toLocaleString('vi-VN')}đ — ${reason || '(không ghi chú)'}`);

    closeCancelOrderModal();
    await loadAdsOrders();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

/* =====================================================================
   MÃ BẢO MẬT GIAO DỊCH (6 số) — bắt buộc cho mọi thao tác liên quan tiền.
   Mã được băm bằng bcrypt hoàn toàn phía Postgres (pgcrypto), không lưu
   hay so sánh dạng chữ thường ở bất kỳ đâu trong code, kể cả tạm thời.
===================================================================== */

async function loadMoneyPinStatus(){
  const box = document.getElementById('moneyPinStatusBox');
  if(!box) return;
  box.textContent = 'Đang kiểm tra...';
  try{
    const { data, error } = await sb.rpc('admin_has_money_pin');
    if(error) throw error;
    box.innerHTML = data
      ? `<span style="color:var(--sage);">✅ Đã thiết lập mã bảo mật.</span> Nhập mã mới bên dưới nếu muốn đổi.`
      : `<span style="color:var(--danger);">⚠️ Chưa thiết lập mã bảo mật — mọi thao tác cộng/trừ tiền hoặc huỷ đơn hoàn tiền sẽ bị chặn cho tới khi bạn tạo mã.</span>`;
  } catch(e){
    box.textContent = 'Không kiểm tra được: ' + e.message;
  }
}

async function handleSetMoneyPin(){
  const input = document.getElementById('moneyPinNew');
  const errBox = document.getElementById('moneyPinError');
  errBox.classList.remove('show');
  const pin = input.value.trim();

  if(!/^\d{6}$/.test(pin)){
    errBox.textContent = 'Mã bảo mật phải gồm đúng 6 chữ số.';
    errBox.classList.add('show');
    return;
  }

  try{
    const { data, error } = await sb.rpc('admin_set_money_pin', { p_new_pin: pin });
    if(error || !data?.ok){
      errBox.textContent = data?.error || error?.message || 'Có lỗi xảy ra.';
      errBox.classList.add('show');
      return;
    }
    input.value = '';
    showToast('✅ Đã lưu mã bảo mật giao dịch.');
    loadMoneyPinStatus();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  }
}

/* ── Modal xin mã PIN dùng chung — trả về Promise<string|null> ──────────
   Cách dùng: const pin = await requestMoneyPin("Xác nhận cộng tiền ví");
   pin === null nghĩa là admin bấm huỷ. */
let _moneyPinResolver = null;

function requestMoneyPin(description){
  document.getElementById('moneyPinConfirmDesc').textContent = description || 'Nhập mã bảo mật 6 số để xác nhận thao tác này.';
  document.getElementById('moneyPinConfirmInput').value = '';
  document.getElementById('moneyPinConfirmError').classList.remove('show');
  document.getElementById('moneyPinConfirmOverlay').classList.add('show');
  setTimeout(()=> document.getElementById('moneyPinConfirmInput').focus(), 50);

  return new Promise((resolve) => { _moneyPinResolver = resolve; });
}

function _resolveMoneyPinPrompt(){
  const pin = document.getElementById('moneyPinConfirmInput').value.trim();
  if(!/^\d{6}$/.test(pin)){
    document.getElementById('moneyPinConfirmError').textContent = 'Mã phải gồm đúng 6 chữ số.';
    document.getElementById('moneyPinConfirmError').classList.add('show');
    return;
  }
  document.getElementById('moneyPinConfirmOverlay').classList.remove('show');
  if(_moneyPinResolver){ _moneyPinResolver(pin); _moneyPinResolver = null; }
}

function _rejectMoneyPinPrompt(){
  document.getElementById('moneyPinConfirmOverlay').classList.remove('show');
  if(_moneyPinResolver){ _moneyPinResolver(null); _moneyPinResolver = null; }
}

/* =====================================================================
   ĐỐI TÁC & CỘNG TÁC VIÊN — quản lý danh sách + ghi nhận thanh toán
   (tiền chuyển thật ngoài đời qua ngân hàng, hệ thống chỉ ghi lại để
   theo dõi/tra soát, bắt buộc mã bảo mật 6 số cho mỗi lần ghi nhận).
===================================================================== */
let allPartners = [];
const PARTNER_ROLE_LABEL = { doi_tac: 'Đối tác', ctv: 'Cộng tác viên' };

async function loadPartners(){
  const box = document.getElementById('partnersTableBody');
  if(!isBackendConfigured() || !currentAdmin) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb.from('partners').select('*').order('created_at', { ascending: false });
    if(error) throw error;
    allPartners = data || [];
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được: ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderPartnersTable();
  loadPartnerPaymentsHistory();
}

function renderPartnersTable(){
  const box = document.getElementById('partnersTableBody');
  if(!allPartners.length){
    box.innerHTML = `<div class="dash-empty">Chưa có đối tác/CTV nào. Bấm "+ Thêm đối tác/CTV".</div>`;
    return;
  }
  box.innerHTML = `<table class="dash-table"><thead><tr>
    <th>Tên</th><th>Vai trò</th><th>SĐT</th><th>Ngân hàng</th><th></th>
  </tr></thead><tbody>${allPartners.map(p => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td><span class="svc-status-pill ${p.role==='doi_tac'?'svc-status-active':'svc-status-inactive'}">${PARTNER_ROLE_LABEL[p.role]||p.role}</span></td>
      <td style="font-family:var(--font-mono); font-size:12px;">${escapeHtml(p.phone||'—')}</td>
      <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(p.bank_info||'—')}</td>
      <td class="svc-actions">
        <button onclick="openPartnerPayModal(${p.id})" style="color:var(--sage);">💸 Thanh toán</button>
        <button onclick="openPartnerForm(${p.id})">Sửa</button>
        <button onclick="handleDeletePartner(${p.id})" class="danger">Xoá</button>
      </td>
    </tr>`).join('')}</tbody></table>`;
}

/* ── Thêm / sửa đối tác ── */
let editingPartnerId = null;

function openPartnerForm(id){
  editingPartnerId = id || null;
  const p = id ? allPartners.find(x => x.id === id) : null;
  document.getElementById('partnerModalTitle').textContent = p ? 'Sửa đối tác/CTV' : 'Thêm đối tác/CTV';
  document.getElementById('partnerModalError').classList.remove('show');
  document.getElementById('pt_name').value = p?.name || '';
  document.getElementById('pt_role').value = p?.role || 'doi_tac';
  document.getElementById('pt_phone').value = p?.phone || '';
  document.getElementById('pt_bank').value = p?.bank_info || '';
  document.getElementById('pt_note').value = p?.note || '';
  document.getElementById('partnerModalOverlay').classList.add('show');
}

function closePartnerForm(){
  document.getElementById('partnerModalOverlay').classList.remove('show');
}

async function handleSavePartner(){
  const errBox = document.getElementById('partnerModalError');
  const name = document.getElementById('pt_name').value.trim();
  if(!name){
    errBox.textContent = 'Vui lòng nhập tên.';
    errBox.classList.add('show');
    return;
  }
  const row = {
    name,
    role: document.getElementById('pt_role').value,
    phone: document.getElementById('pt_phone').value.trim() || null,
    bank_info: document.getElementById('pt_bank').value.trim() || null,
    note: document.getElementById('pt_note').value.trim() || null,
  };

  const btn = document.getElementById('partnerSaveBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';
  try{
    let error;
    if(editingPartnerId){
      ({ error } = await sb.from('partners').update(row).eq('id', editingPartnerId));
    } else {
      ({ error } = await sb.from('partners').insert(row));
    }
    if(error) throw error;
    showToast('✅ Đã lưu.');
    logAdminAction(editingPartnerId ? 'Sửa đối tác/CTV' : 'Thêm đối tác/CTV', name);
    closePartnerForm();
    await loadPartners();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function handleDeletePartner(id){
  if(!confirm('Xoá đối tác/CTV này? (lịch sử thanh toán liên quan sẽ bị xoá theo)')) return;
  try{
    const { error } = await sb.from('partners').delete().eq('id', id);
    if(error) throw error;
    showToast('Đã xoá.');
    logAdminAction('Xoá đối tác/CTV', String(id));
    await loadPartners();
  } catch(e){ showToast('Lỗi: ' + e.message); }
}

/* ── Ghi nhận thanh toán cho đối tác/CTV (bắt buộc mã bảo mật) ── */
let _payingPartnerId = null;

function openPartnerPayModal(id){
  const p = allPartners.find(x => x.id === id);
  if(!p) return;
  _payingPartnerId = id;
  document.getElementById('ppPartnerName').textContent = `${p.name} (${PARTNER_ROLE_LABEL[p.role]||p.role})`;
  document.getElementById('pp_amount').value = '';
  document.getElementById('pp_reason').value = '';
  document.getElementById('partnerPayError').classList.remove('show');
  document.getElementById('partnerPayOverlay').classList.add('show');
}

function closePartnerPayModal(){
  document.getElementById('partnerPayOverlay').classList.remove('show');
  _payingPartnerId = null;
}

async function submitPartnerPayment(){
  const errBox = document.getElementById('partnerPayError');
  errBox.classList.remove('show');
  const amount = Number(document.getElementById('pp_amount').value);
  const reason = document.getElementById('pp_reason').value.trim();

  if(!amount || amount <= 0){
    errBox.textContent = 'Nhập số tiền hợp lệ.';
    errBox.classList.add('show');
    return;
  }

  const partner = allPartners.find(x => x.id === _payingPartnerId);
  if(!confirm(`Xác nhận ĐÃ CHUYỂN KHOẢN ${amount.toLocaleString('vi-VN')}đ cho ${partner?.name}?\n(Hệ thống chỉ ghi nhận lại, không tự chuyển tiền — bạn cần tự chuyển khoản trước)`)) return;

  const pin = await requestMoneyPin(`Xác nhận đã thanh toán ${amount.toLocaleString('vi-VN')}đ cho ${partner?.name}`);
  if(!pin) return;

  const btn = document.getElementById('partnerPaySubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang lưu...';

  try{
    const { data, error } = await sb.rpc('admin_pay_partner', {
      p_partner_id: _payingPartnerId, p_amount: amount, p_reason: reason || null, p_pin: pin
    });
    if(error || !data?.ok){
      errBox.textContent = data?.error || error?.message || 'Có lỗi xảy ra.';
      errBox.classList.add('show');
      return;
    }
    showToast(`✅ Đã ghi nhận thanh toán ${amount.toLocaleString('vi-VN')}đ. Mã phiếu: ${data.code}`);
    logAdminAction('Thanh toán đối tác/CTV', `${partner?.name} — ${amount.toLocaleString('vi-VN')}đ — ${data.code}`);
    closePartnerPayModal();
    await loadPartnerPaymentsHistory();

    if(confirm('Xuất phiếu chi PDF cho khoản này luôn không?')){
      printPartnerReceipt(data.code, partner?.name, amount, reason);
    }
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function loadPartnerPaymentsHistory(){
  const box = document.getElementById('partnerPaymentsHistoryBody');
  if(!box) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb
      .from('partner_payments')
      .select('*, partners(name, role)')
      .order('created_at', { ascending: false })
      .limit(20);
    if(error) throw error;
    if(!data || !data.length){
      box.innerHTML = `<div class="dash-empty">Chưa có khoản thanh toán nào.</div>`;
      return;
    }
    box.innerHTML = `<table class="dash-table"><thead><tr>
      <th>Mã phiếu</th><th>Đối tác/CTV</th><th>Số tiền</th><th>Nội dung</th><th>Người chi</th><th>Thời gian</th><th></th>
    </tr></thead><tbody>${data.map(pp => `
      <tr>
        <td class="dt-code">${escapeHtml(pp.code)}</td>
        <td>${escapeHtml(pp.partners?.name||'')}</td>
        <td style="font-family:var(--font-mono); font-weight:600;">${Number(pp.amount).toLocaleString('vi-VN')}đ</td>
        <td style="font-size:12px; color:var(--ink-soft);">${escapeHtml(pp.reason||'—')}</td>
        <td style="font-size:12px;">${escapeHtml(pp.paid_by_admin_email||'')}</td>
        <td style="font-size:12px; color:var(--ink-soft);">${new Date(pp.created_at).toLocaleString('vi-VN')}</td>
        <td><button class="svc-actions" style="border:1.5px solid var(--line); background:none; padding:5px 10px; border-radius:6px; font-size:11.5px; cursor:pointer;" onclick="printPartnerReceipt('${pp.code}','${escapeHtml(pp.partners?.name||'')}',${pp.amount},'${escapeHtml((pp.reason||'').replace(/'/g,"\\'"))}')">🖨️ PDF</button></td>
      </tr>`).join('')}</tbody></table>`;
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được: ${escapeHtml(e.message)}</div>`;
  }
}

/* Xuất phiếu chi PDF cho đối tác/CTV — dùng chung thư viện jsPDF */
function printPartnerReceipt(code, partnerName, amount, reason){
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    registerVietnameseFont(doc);
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFont('DejaVuSans', 'bold'); doc.setFontSize(16);
    doc.text('PHATDATAGENCY', pageW/2, y, { align:'center' }); y += 6;
    doc.setFont('DejaVuSans', 'normal'); doc.setFontSize(10);
    doc.text('Phiếu chi - Thanh toán đối tác/CTV', pageW/2, y, { align:'center' }); y += 10;
    doc.setDrawColor(200); doc.line(15, y, pageW-15, y); y += 10;

    const rows = [
      ['Mã phiếu', code || ''],
      ['Người nhận', partnerName || ''],
      ['Số tiền', (Number(amount)||0).toLocaleString('vi-VN') + ' đ'],
      ['Nội dung', reason || '(không ghi chú)'],
      ['Thời gian', new Date().toLocaleString('vi-VN')],
    ];
    doc.setFontSize(11);
    rows.forEach(([label, value]) => {
      doc.setFont('DejaVuSans','normal'); doc.text(label, 18, y);
      doc.setFont('DejaVuSans','bold');
      const lines = doc.splitTextToSize(String(value), 70);
      doc.text(lines, pageW-18, y, { align:'right' });
      y += 9 * lines.length;
    });

    y += 10;
    doc.setFont('DejaVuSans','normal'); doc.setFontSize(9);
    doc.text('Người lập phiếu: ' + (currentAdmin?.email || ''), 18, y);

    doc.save(`PhieuChi-${code || 'partner'}.pdf`);
  } catch(e){
    alert('Không tạo được PDF: ' + e.message);
  }
}

/* =====================================================================
   XUẤT HOÁ ĐƠN — chọn từ đơn hàng có sẵn hoặc tự nhập tay, xuất PDF,
   lưu lại lịch sử để tra soát/tải lại sau này.
===================================================================== */
let allOrdersForInvoice = [];
let _invoiceSelectedOrderCode = null;
const INVOICE_PAID_META_PATTERN = /^\[\[PDA_PAID_AMOUNT:(\d+(?:\.\d+)?)\]\]\n?/;

function formatInvoiceMoney(value){
  return (Number(value) || 0).toLocaleString('vi-VN') + ' đ';
}

function buildInvoiceStoredNote(note, paidAmount){
  const cleanNote = String(note || '').replace(INVOICE_PAID_META_PATTERN, '').trim();
  const meta = `[[PDA_PAID_AMOUNT:${Number(paidAmount) || 0}]]`;
  return cleanNote ? `${meta}\n${cleanNote}` : meta;
}

function getInvoicePaidAmount(inv){
  if(inv && inv.paid_amount !== undefined && inv.paid_amount !== null && inv.paid_amount !== ''){
    const directValue = Number(inv.paid_amount);
    if(Number.isFinite(directValue)) return Math.max(0, directValue);
  }
  const match = String(inv?.note || '').match(INVOICE_PAID_META_PATTERN);
  if(match){
    const storedValue = Number(match[1]);
    if(Number.isFinite(storedValue)) return Math.max(0, storedValue);
  }
  // Hoá đơn cũ không có dữ liệu riêng: giữ cách hiểu cũ là đã thanh toán đủ.
  return Math.max(0, Number(inv?.amount) || 0);
}

function getInvoicePaymentStatus(totalAmount, paidAmount){
  const total = Math.max(0, Number(totalAmount) || 0);
  const paid = Math.max(0, Math.min(Number(paidAmount) || 0, total));
  return paid > 0 ? `Đã thanh toán ${formatInvoiceMoney(paid)}` : 'Chưa thanh toán';
}

function updateInvoicePaymentPreview(){
  const total = Math.max(0, Number(document.getElementById('inv_amount')?.value) || 0);
  const rawPaid = Math.max(0, Number(document.getElementById('inv_paidAmount')?.value) || 0);
  const paid = Math.min(rawPaid, total);
  const debt = Math.max(0, total - paid);
  const debtBox = document.getElementById('inv_debtPreview');
  const statusBox = document.getElementById('inv_statusPreview');
  if(debtBox) debtBox.textContent = formatInvoiceMoney(debt);
  if(statusBox) statusBox.textContent = getInvoicePaymentStatus(total, paid);
}

function setInvoiceSource(src){
  document.querySelectorAll('#invSourcePills .service-pill').forEach(p => p.classList.toggle('active', p.dataset.src === src));
  document.getElementById('invOrderPickBlock').style.display = src === 'order' ? 'block' : 'none';
  document.getElementById('invManualOrderCodeBlock').style.display = src === 'manual' ? 'block' : 'none';
  if(src === 'manual'){
    _invoiceSelectedOrderCode = null;
    document.getElementById('invSelectedOrderBox').style.display = 'none';
  } else {
    document.getElementById('inv_manualOrderCode').value = '';
  }
  updateInvoicePaymentPreview();
}

async function loadOrdersForInvoice(){
  try{
    const { data, error } = await sb
      .from('orders')
      .select('order_code, customer_name, phone, email, service_type, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if(error) throw error;
    allOrdersForInvoice = data || [];
    filterInvoiceOrders();
  } catch(e){
    document.getElementById('invOrderResults').innerHTML = `<div style="padding:12px; font-size:12px; color:var(--danger);">Không tải được đơn hàng: ${escapeHtml(e.message)}</div>`;
  }
}

function filterInvoiceOrders(){
  const q = (document.getElementById('inv_orderSearch').value || '').toLowerCase().trim();
  const box = document.getElementById('invOrderResults');
  const list = !q ? allOrdersForInvoice.slice(0, 30) : allOrdersForInvoice.filter(o =>
    (o.order_code||'').toLowerCase().includes(q) ||
    (o.customer_name||'').toLowerCase().includes(q) ||
    (o.phone||'').toLowerCase().includes(q)
  ).slice(0, 30);

  if(!list.length){
    box.innerHTML = `<div style="padding:12px; font-size:12.5px; color:var(--ink-soft);">Không tìm thấy đơn nào.</div>`;
    return;
  }
  box.innerHTML = list.map(o => `
    <div onclick="selectInvoiceOrder('${o.order_code}')"
      style="padding:10px 12px; border-bottom:1px solid var(--line); cursor:pointer; font-size:12.5px;"
      onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'">
      <b style="font-family:var(--font-mono);">${escapeHtml(o.order_code)}</b> — ${escapeHtml(o.customer_name||'')}
      <span style="color:var(--ink-soft); float:right;">${o.amount!=null ? Number(o.amount).toLocaleString('vi-VN')+'đ' : ''}</span>
    </div>`).join('');
}

function selectInvoiceOrder(orderCode){
  const o = allOrdersForInvoice.find(x => x.order_code === orderCode);
  if(!o) return;
  _invoiceSelectedOrderCode = orderCode;

  document.getElementById('inv_recipientName').value = o.customer_name || '';
  document.getElementById('inv_recipientInfo').value = o.phone || o.email || '';
  document.getElementById('inv_content').value = o.service_type || '';
  document.getElementById('inv_amount').value = o.amount || '';
  document.getElementById('inv_paidAmount').value = o.amount || 0;
  document.getElementById('inv_manualOrderCode').value = '';
  updateInvoicePaymentPreview();

  document.getElementById('invSelectedOrderBox').style.display = 'block';
  document.getElementById('invSelectedOrderBox').innerHTML =
    `Đã chọn đơn <b style="font-family:var(--font-mono);">${escapeHtml(orderCode)}</b> — thông tin bên dưới đã tự điền, bạn có thể sửa lại nếu cần.`;
}

async function submitInvoice(){
  const errBox = document.getElementById('invoiceError');
  errBox.classList.remove('show');

  const recipientName = document.getElementById('inv_recipientName').value.trim();
  const recipientInfo = document.getElementById('inv_recipientInfo').value.trim();
  const content = document.getElementById('inv_content').value.trim();
  const amount = Number(document.getElementById('inv_amount').value);
  const paidAmount = Number(document.getElementById('inv_paidAmount').value || 0);
  const manualOrderCode = document.getElementById('inv_manualOrderCode').value.trim().toUpperCase();
  const invoiceOrderCode = _invoiceSelectedOrderCode || manualOrderCode || null;
  const note = document.getElementById('inv_note').value.trim();

  if(!recipientName || !content || !amount || amount <= 0){
    errBox.textContent = 'Vui lòng nhập đủ Tên người nhận, Nội dung và Thành tiền hợp lệ.';
    errBox.classList.add('show');
    return;
  }
  if(!Number.isFinite(paidAmount) || paidAmount < 0 || paidAmount > amount){
    errBox.textContent = 'Số tiền đã thanh toán phải từ 0đ đến đúng Thành tiền.';
    errBox.classList.add('show');
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
  const randPart = Math.floor(1000 + Math.random()*9000);
  const invoiceNo = `HD-${datePart}-${randPart}`;

  const btn = document.getElementById('invoiceSubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang xuất...';

  try{
    const { error } = await sb.from('invoices').insert({
      invoice_no: invoiceNo,
      order_code: invoiceOrderCode,
      recipient_name: recipientName,
      recipient_info: recipientInfo || null,
      content,
      amount,
      note: buildInvoiceStoredNote(note, paidAmount),
      created_by_admin_email: currentAdmin?.email || null,
    });
    if(error) throw error;

    generateInvoicePDF({
      invoice_no: invoiceNo,
      order_code: invoiceOrderCode,
      recipient_name: recipientName,
      recipient_info: recipientInfo,
      content,
      amount,
      paid_amount: paidAmount,
      created_at: now.toISOString()
    });
    showToast(`✅ Đã xuất hoá đơn ${invoiceNo}.`);
    logAdminAction('Xuất hoá đơn', `${invoiceNo} — ${recipientName} — ${amount.toLocaleString('vi-VN')}đ`);

    // reset form nhưng giữ lại nếu muốn xuất tiếp cho người khác
    document.getElementById('inv_recipientName').value = '';
    document.getElementById('inv_recipientInfo').value = '';
    document.getElementById('inv_content').value = '';
    document.getElementById('inv_amount').value = '';
    document.getElementById('inv_paidAmount').value = '0';
    document.getElementById('inv_manualOrderCode').value = '';
    document.getElementById('inv_note').value = '';
    document.getElementById('invSelectedOrderBox').style.display = 'none';
    _invoiceSelectedOrderCode = null;
    updateInvoicePaymentPreview();

    await loadInvoicesHistory();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

async function loadInvoicesHistory(){
  const box = document.getElementById('invoicesHistoryBody');
  if(!box) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb.from('invoices').select('*').order('created_at', { ascending: false }).limit(20);
    if(error) throw error;
    if(!data || !data.length){
      box.innerHTML = `<div class="dash-empty">Chưa có hoá đơn nào.</div>`;
      return;
    }
    box.innerHTML = `<table class="dash-table"><thead><tr>
      <th>Số hoá đơn</th><th>Người nhận</th><th>Nội dung</th><th>Số tiền</th><th>Ngày xuất</th><th></th>
    </tr></thead><tbody>${data.map(inv => `
      <tr>
        <td class="dt-code">${escapeHtml(inv.invoice_no)}</td>
        <td>${escapeHtml(inv.recipient_name)}</td>
        <td style="font-size:12px; color:var(--ink-soft); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(inv.content)}</td>
        <td style="font-family:var(--font-mono); font-weight:600;">${Number(inv.amount).toLocaleString('vi-VN')}đ</td>
        <td style="font-size:12px; color:var(--ink-soft);">${new Date(inv.created_at).toLocaleString('vi-VN')}</td>
        <td><button class="svc-actions" style="border:1.5px solid var(--line); background:none; padding:5px 10px; border-radius:6px; font-size:11.5px; cursor:pointer;" onclick='generateInvoicePDF(${JSON.stringify(inv).replace(/'/g,"&apos;")})'>🖨️ PDF</button></td>
      </tr>`).join('')}</tbody></table>`;
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được: ${escapeHtml(e.message)}</div>`;
  }
}

/* Dựng file PDF hoá đơn — dùng chung thư viện jsPDF đã nạp sẵn cho phiếu chi */
function generateInvoicePDF(inv){
  try{
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    registerVietnameseFont(doc);
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 20;
    const ink = [35, 31, 26];
    const muted = [116, 105, 92];
    const line = [221, 212, 198];
    const sand = [246, 241, 232];
    const coral = [191, 67, 48];
    const green = [75, 126, 83];
    const totalAmount = Math.max(0, Number(inv.amount) || 0);
    const paidAmount = Math.min(getInvoicePaidAmount(inv), totalAmount);
    const debtAmount = Math.max(0, totalAmount - paidAmount);
    const orderCode = String(inv.order_code || '').trim();
    const issueDate = new Date(inv.created_at || Date.now()).toLocaleDateString('vi-VN');
    const paymentStatus = getInvoicePaymentStatus(totalAmount, paidAmount);
    const money = value => (Number(value) || 0).toLocaleString('vi-VN') + ' đ';
    let y = 25;

    // Thương hiệu và thông tin hoá đơn
    doc.setTextColor(...ink);
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(24);
    doc.text('Phatdatagency', margin, y);

    doc.setFontSize(12);
    doc.text('HÓA ĐƠN DỊCH VỤ', pageW-margin, y, { align: 'right' });
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text('Số: ' + (inv.invoice_no || ''), pageW-margin, y+8, { align: 'right' });
    doc.text('Ngày lập: ' + issueDate, pageW-margin, y+14, { align: 'right' });

    y = 49;
    doc.setDrawColor(...line);
    doc.line(margin, y, pageW-margin, y);

    // Thông tin người nhận và trạng thái đơn hàng
    const infoTitleY = y + 12;
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text('THÔNG TIN NGƯỜI NHẬN', margin, infoTitleY);
    doc.text('THÔNG TIN ĐƠN HÀNG', 112, infoTitleY);

    let leftY = infoTitleY + 9;
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.setFont('DejaVuSans', 'normal');
    doc.text('Người nhận', margin, leftY);
    doc.setFont('DejaVuSans', 'bold');
    const recipientLines = doc.splitTextToSize(inv.recipient_name || '', 54);
    doc.text(recipientLines, 48, leftY);
    leftY += Math.max(7, recipientLines.length * 5);
    if(inv.recipient_info){
      doc.setFont('DejaVuSans', 'normal');
      doc.text('Liên hệ', margin, leftY);
      const contactLines = doc.splitTextToSize(String(inv.recipient_info), 54);
      doc.setFont('DejaVuSans', 'bold');
      doc.text(contactLines, 48, leftY);
      leftY += Math.max(7, contactLines.length * 5);
    }

    let rightY = infoTitleY + 9;
    if(orderCode){
      doc.setFont('DejaVuSans', 'normal');
      doc.text('Mã đơn', 112, rightY);
      doc.setFont('DejaVuSans', 'bold');
      doc.text(orderCode, 139, rightY);
      rightY += 7;
    }
    doc.setFont('DejaVuSans', 'normal');
    doc.text('Trạng thái', 112, rightY);
    doc.setFont('DejaVuSans', 'bold');
    const statusLines = doc.splitTextToSize(paymentStatus, 50);
    doc.text(statusLines, 139, rightY);
    rightY += Math.max(7, statusLines.length * 5);

    y = Math.max(leftY, rightY) + 9;

    // Bảng nội dung dịch vụ
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text('THÔNG TIN DỊCH VỤ', margin, y);
    y += 6;

    doc.setFillColor(...sand);
    doc.rect(margin, y, pageW-(margin*2), 10, 'F');
    doc.setTextColor(...ink);
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(9);
    doc.text('Nội dung', margin+4, y+7);
    doc.text('Số tiền', pageW-margin-4, y+7, { align: 'right' });
    y += 16;

    doc.setFont('DejaVuSans', 'normal');
    const contentLines = doc.splitTextToSize(inv.content || '', pageW-92);
    doc.text(contentLines, margin+4, y);
    doc.setFont('DejaVuSans', 'bold');
    doc.text(money(totalAmount), pageW-margin-4, y, { align: 'right' });
    y += Math.max(12, contentLines.length * 5 + 5);

    doc.setDrawColor(...line);
    doc.line(margin, y, pageW-margin, y);
    y += 15;

    if(y > 225){
      doc.addPage();
      y = 24;
    }

    // Mộc thanh toán
    const paymentTop = y;
    const stampColor = paidAmount > 0 ? coral : muted;
    doc.setDrawColor(...stampColor);
    doc.setLineWidth(0.7);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.roundedRect(margin, paymentTop, 70, 38, 3, 3, 'S');
    doc.setLineDashPattern([], 0);
    doc.setTextColor(...stampColor);
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(11);
    doc.text(paidAmount > 0 ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN', margin+35, paymentTop+11, { align: 'center' });
    doc.setFontSize(16);
    doc.text(money(paidAmount), margin+35, paymentTop+22, { align: 'center' });
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(8);
    doc.text(paidAmount > 0 ? `Xác nhận ngày ${issueDate}` : 'Tại thời điểm phát hành', margin+35, paymentTop+31, { align: 'center' });

    // Tổng kết thanh toán
    const summaryX = 108;
    const summaryValueX = pageW-margin;
    let summaryY = paymentTop + 2;
    const drawAmountRow = (label, value, options = {}) => {
      doc.setFont('DejaVuSans', options.bold ? 'bold' : 'normal');
      doc.setFontSize(options.large ? 11 : 9);
      doc.setTextColor(...(options.color || ink));
      doc.text(label, summaryX, summaryY);
      doc.text(money(value), summaryValueX, summaryY, { align: 'right' });
      summaryY += options.large ? 8 : 7;
    };

    drawAmountRow('Tạm tính', totalAmount);
    drawAmountRow('Giảm giá / điều chỉnh', 0);
    doc.setDrawColor(...line);
    doc.line(summaryX, summaryY-3, summaryValueX, summaryY-3);
    summaryY += 2;
    drawAmountRow('Thành tiền', totalAmount, { bold: true, large: true });
    drawAmountRow('Số tiền đã thanh toán', paidAmount, { bold: true, color: green });
    doc.line(summaryX, summaryY-3, summaryValueX, summaryY-3);
    summaryY += 2;
    drawAmountRow('Số tiền còn nợ', debtAmount, { bold: true, large: true, color: coral });

    y = Math.max(paymentTop + 43, summaryY + 2) + 13;
    doc.setDrawColor(...line);
    doc.line(margin, y, pageW-margin, y);
    y += 9;
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text('Cảm ơn quý khách/đối tác đã hợp tác cùng Phatdatagency.', margin, y);

    doc.save(`HoaDon-${inv.invoice_no || 'moi'}.pdf`);
  } catch(e){
    alert('Không tạo được PDF: ' + e.message);
  }
}

/* =====================================================================
   TẠO HỢP ĐỒNG — soạn theo bố cục hợp đồng dân sự chuẩn (căn cứ pháp lý,
   các Điều khoản, chữ ký hai bên). Điều 1 (nội dung dịch vụ) viết riêng
   cho từng loại dịch vụ, các Điều còn lại dùng chung.
===================================================================== */
function onContractTypeChange(){
  const type = document.getElementById('ct_serviceType').value;
  const label = document.getElementById('ct_detailLabel');
  const detail = document.getElementById('ct_detail');
  if(type === 'unlock'){
    label.textContent = 'Mô tả tài khoản cần hỗ trợ mở khoá';
    detail.placeholder = "Vd: Hỗ trợ khôi phục quyền truy cập tài khoản Facebook tên 'Nguyễn Văn A' (link: fb.com/...), đang bị khoá xác minh 2 lớp.";
  } else if(type === 'icloud'){
    label.textContent = 'Mô tả thiết bị cần hỗ trợ mở khoá iCloud';
    detail.placeholder = "Vd: Hỗ trợ khôi phục quyền truy cập iCloud cho iPhone 13, IMEI: ..., khách bị đối tượng lừa đảo chiếm quyền/khoá máy từ xa qua Find My.";
  } else if(type === 'ads'){
    label.textContent = 'Mô tả nội dung cần tăng tương tác';
    detail.placeholder = "Vd: Tăng 5.000 lượt Like cho bài viết Facebook tại đường dẫn https://facebook.com/..., nền tảng Facebook, server Việt Nam ổn định.";
  } else {
    label.textContent = 'Mô tả hạng mục thiết kế';
    detail.placeholder = "Vd: Thiết kế website bán hàng gồm 10 trang, tích hợp giỏ hàng, thanh toán online, giao diện responsive trên di động.";
  }
}

/* CONTRACT_TYPE_LABEL, numberToVietnameseWords, getArticle1Content, buildContractArticles
   giờ nằm ở file dùng chung /contract-template.js (nạp qua <script> trong index.html)
   để đồng bộ tuyệt đối với trang ký hợp đồng của khách — không định nghĩa lại ở đây. */

/* ── Xuất PDF hợp đồng đầy đủ, tự xuống trang khi hết chỗ ── */
function generateContractPDF(c){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  registerVietnameseFont(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 20, maxW = pageW - marginX*2;
  let y = 20;

  function checkPageBreak(needed){
    if(y + needed > pageH - 18){ doc.addPage(); y = 20; }
  }
  function writeCentered(text, size, style){
    doc.setFont('DejaVuSans', style||'normal'); doc.setFontSize(size);
    doc.text(text, pageW/2, y, { align:'center' }); y += size*0.5 + 2;
  }
  function writeParagraph(text, opts={}){
    doc.setFont('DejaVuSans', opts.bold ? 'bold':'normal'); doc.setFontSize(opts.size||10.5);
    const lines = doc.splitTextToSize(text, maxW);
    checkPageBreak(lines.length * 5.2 + 2);
    doc.text(lines, marginX, y);
    y += lines.length * 5.2 + (opts.gap ?? 3);
  }

  writeCentered('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 12, 'bold');
  writeCentered('Độc lập - Tự do - Hạnh phúc', 11, 'normal');
  y += 4;
  writeCentered('———o0o———', 10, 'normal');
  y += 6;
  writeCentered('HỢP ĐỒNG DỊCH VỤ', 15, 'bold');
  writeCentered(CONTRACT_TYPE_LABEL[c.service_type] || '', 12, 'bold');
  y += 3;
  writeCentered(`Số: ${c.contract_no}`, 10, 'normal');
  y += 6;

  writeParagraph('Căn cứ Bộ luật Dân sự nước Cộng hoà xã hội chủ nghĩa Việt Nam năm 2015;', { size:10 });
  writeParagraph('Căn cứ nhu cầu và sự thoả thuận thống nhất giữa hai bên;', { size:10, gap:5 });
  writeParagraph(`Hôm nay, ngày ${new Date(c.created_at).toLocaleDateString('vi-VN')}, hai bên chúng tôi gồm:`, { size:10, gap:5 });

  writeParagraph('BÊN A (BÊN CUNG CẤP DỊCH VỤ):', { bold:true, size:11, gap:2 });
  writeParagraph(`- Đại diện: ${c.party_a_name || ''}`, { size:10, gap:1.5 });
  if(c.party_a_id) writeParagraph(`- CCCD/CMND: ${c.party_a_id}`, { size:10, gap:1.5 });
  if(c.party_a_address) writeParagraph(`- Địa chỉ liên hệ: ${c.party_a_address}`, { size:10, gap:1.5 });
  if(c.party_a_phone) writeParagraph(`- Điện thoại: ${c.party_a_phone}`, { size:10, gap:1.5 });
  writeParagraph(`- Email: ${c.party_a_email || ''}`, { size:10, gap:5 });

  writeParagraph('BÊN B (BÊN SỬ DỤNG DỊCH VỤ):', { bold:true, size:11, gap:2 });
  writeParagraph(`- Họ và tên/Đơn vị: ${c.party_b_name || ''}`, { size:10, gap:1.5 });
  if(c.party_b_id) writeParagraph(`- CCCD/CMND/MST: ${c.party_b_id}`, { size:10, gap:1.5 });
  if(c.party_b_address) writeParagraph(`- Địa chỉ: ${c.party_b_address}`, { size:10, gap:1.5 });
  if(c.party_b_phone) writeParagraph(`- Điện thoại: ${c.party_b_phone}`, { size:10, gap:1.5 });
  if(c.party_b_email) writeParagraph(`- Email: ${c.party_b_email}`, { size:10, gap:1.5 });
  writeParagraph('Hai bên thống nhất ký kết hợp đồng với các điều khoản sau:', { size:10, gap:6 });

  const articles = buildContractArticles(c.service_type, {
    detail: c.service_detail, value: c.contract_value, deposit: c.deposit_amount || 0,
    duration: c.duration_text, note: c.extra_note
  });
  articles.forEach(art => {
    checkPageBreak(10);
    writeParagraph(art.title, { bold:true, size:11.5, gap:3 });
    art.body.forEach(p => writeParagraph(p, { size:10.2, gap:3 }));
    y += 2;
  });

  checkPageBreak(55);
  y += 6;
  const halfW = pageW/2;
  const colACenter = marginX + (halfW-marginX)/2;
  const colBCenter = halfW + (halfW-marginX)/2;

  doc.setFont('DejaVuSans','bold'); doc.setFontSize(11);
  doc.text('ĐẠI DIỆN BÊN A', colACenter, y, { align:'center' });
  doc.text('ĐẠI DIỆN BÊN B', colBCenter, y, { align:'center' });
  y += 5;
  doc.setFont('DejaVuSans','normal'); doc.setFontSize(9);
  doc.text('(Ký, ghi rõ họ tên)', colACenter, y, { align:'center' });
  doc.text('(Ký, ghi rõ họ tên)', colBCenter, y, { align:'center' });

  const sigY = y + 3;
  const sigW = 45, sigH = 22;
  if(c.party_a_signature){
    try{ doc.addImage(c.party_a_signature, 'PNG', colACenter - sigW/2, sigY, sigW, sigH); }catch(e){}
  }
  if(c.party_b_signature){
    try{ doc.addImage(c.party_b_signature, 'PNG', colBCenter - sigW/2, sigY, sigW, sigH); }catch(e){}
  }

  y = sigY + sigH + 4;
  doc.setFontSize(8); doc.setTextColor(120);
  if(c.party_a_signed_at) doc.text(`Đã ký lúc: ${new Date(c.party_a_signed_at).toLocaleString('vi-VN')}`, colACenter, y, { align:'center' });
  if(c.party_b_signed_at) doc.text(`Đã ký lúc: ${new Date(c.party_b_signed_at).toLocaleString('vi-VN')}`, colBCenter, y, { align:'center' });
  doc.setTextColor(0);

  doc.save(`HopDong-${c.contract_no}.pdf`);
}

async function submitContract(){
  const errBox = document.getElementById('contractError');
  errBox.classList.remove('show');

  const serviceType = document.getElementById('ct_serviceType').value;
  const bName = document.getElementById('ct_bName').value.trim();
  const detail = document.getElementById('ct_detail').value.trim();
  const value = Number(document.getElementById('ct_value').value);

  if(!bName || !detail || !value || value <= 0){
    errBox.textContent = 'Vui lòng nhập đủ Tên khách hàng (Bên B), Mô tả dịch vụ và Giá trị hợp đồng hợp lệ.';
    errBox.classList.add('show');
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
  const randPart = Math.floor(1000 + Math.random()*9000);
  const contractNo = `HD-${datePart}-${randPart}`;
  const signToken = randomToken();

  const record = {
    contract_no: contractNo,
    sign_token: signToken,
    service_type: serviceType,
    party_a_name: document.getElementById('ct_aName').value.trim(),
    party_a_id: document.getElementById('ct_aId').value.trim() || null,
    party_a_address: document.getElementById('ct_aAddress').value.trim() || null,
    party_a_phone: document.getElementById('ct_aPhone').value.trim() || null,
    party_a_email: document.getElementById('ct_aEmail').value.trim() || null,
    party_b_name: bName,
    party_b_id: document.getElementById('ct_bId').value.trim() || null,
    party_b_address: document.getElementById('ct_bAddress').value.trim() || null,
    party_b_phone: document.getElementById('ct_bPhone').value.trim() || null,
    party_b_email: document.getElementById('ct_bEmail').value.trim() || null,
    service_detail: detail,
    contract_value: value,
    deposit_amount: Number(document.getElementById('ct_deposit').value) || null,
    duration_text: document.getElementById('ct_duration').value.trim() || null,
    extra_note: document.getElementById('ct_note').value.trim() || null,
    created_by_admin_email: currentAdmin?.email || null,
  };
  if(!isSignatureEmpty('ctSignCanvasA')){
    record.party_a_signature = getSignatureDataURL('ctSignCanvasA');
    record.party_a_signed_at = now.toISOString();
  }

  const btn = document.getElementById('contractSubmitBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang tạo...';

  try{
    const { error } = await sb.from('contracts').insert(record);
    if(error) throw error;

    generateContractPDF({ ...record, created_at: now.toISOString() });
    showToast(`✅ Đã tạo hợp đồng ${contractNo}.`);
    logAdminAction('Tạo hợp đồng', `${contractNo} — ${bName} — ${value.toLocaleString('vi-VN')}đ`);

    const signUrl = `${window.location.origin}/ky-hop-dong/?token=${signToken}`;
    document.getElementById('contractSignLinkInput').value = signUrl;
    document.getElementById('contractSignLinkBox').style.display = 'block';

    clearSignCanvas('ctSignCanvasA');
    await loadContractsHistory();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

function copyContractSignLink(){
  const input = document.getElementById('contractSignLinkInput');
  input.select();
  navigator.clipboard.writeText(input.value).then(()=> showToast('Đã sao chép link ký hợp đồng.'));
}

let allContractsHistory = [];

async function loadContractsHistory(){
  const box = document.getElementById('contractsHistoryBody');
  if(!box) return;
  box.innerHTML = `<div class="dash-loading">Đang tải...</div>`;
  try{
    const { data, error } = await sb.from('contracts').select('*').order('created_at', { ascending:false }).limit(20);
    if(error) throw error;
    allContractsHistory = data || [];
    if(!allContractsHistory.length){
      box.innerHTML = `<div class="dash-empty">Chưa có hợp đồng nào.</div>`;
      return;
    }
    box.innerHTML = `<table class="dash-table"><thead><tr>
      <th>Số hợp đồng</th><th>Loại dịch vụ</th><th>Khách hàng</th><th>Giá trị</th><th>Trạng thái ký</th><th>Ngày tạo</th><th></th>
    </tr></thead><tbody>${allContractsHistory.map(c => `
      <tr>
        <td class="dt-code">${escapeHtml(c.contract_no)}</td>
        <td style="font-size:12px;">${escapeHtml(CONTRACT_TYPE_LABEL[c.service_type]||c.service_type)}</td>
        <td>${escapeHtml(c.party_b_name)}</td>
        <td style="font-family:var(--font-mono); font-weight:600;">${Number(c.contract_value).toLocaleString('vi-VN')}đ</td>
        <td style="font-size:11.5px;">
          ${c.party_a_signed_at ? '✅ A' : '⬜ A'} &nbsp;
          ${c.party_b_signed_at ? '✅ B' : '⬜ B'}
        </td>
        <td style="font-size:12px; color:var(--ink-soft);">${new Date(c.created_at).toLocaleString('vi-VN')}</td>
        <td class="svc-actions">
          <button onclick="generateContractPDF(allContractsHistory.find(x=>x.id===${c.id}))">🖨️ PDF</button>
          <button onclick="copySignLinkFor('${c.sign_token||''}')">🔗 Link ký</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
  } catch(e){
    box.innerHTML = `<div class="dash-empty" style="color:var(--danger);">Không tải được: ${escapeHtml(e.message)}</div>`;
  }
}

function copySignLinkFor(token){
  if(!token){ showToast('Hợp đồng này chưa có link ký (tạo trước khi có tính năng ký điện tử).'); return; }
  const url = `${window.location.origin}/ky-hop-dong/?token=${token}`;
  navigator.clipboard.writeText(url).then(()=> showToast('Đã sao chép link ký hợp đồng.'));
}
