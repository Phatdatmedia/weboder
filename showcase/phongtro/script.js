// ═══ GLOBALS ═══
var SUPABASE_URL = 'https://uvhckyqqiiebmmslurje.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2aGNreXFxaWllYm1tc2x1cmplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjUyMzUsImV4cCI6MjA5ODMwMTIzNX0.8m8TiDiERxPlKtGLl3hTDsClfmPz3cCMm74HftC_Qmg';
let SB = null;
let currentUser = null, currentProfile = null;
let roomsC = [], tenantsC = [], invoicesC = [], paymentsC = [], requestsC = [];
let sessionTimer = null;
let sessionStartTime = null;
let invFilter = 'all';
const SESSION_MS = 30 * 60 * 1000;
const WARN_MS    = 25 * 60 * 1000;

// ═══ MODAL ═══
function showModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.getElementById(id).classList.add('show');
}
function hideModal(id) {
  document.getElementById(id).style.display = '';
  document.getElementById(id).classList.remove('show');
}

// ═══ TOAST ═══
function toast(msg, type) {
  if (!type) type = 'success';
  var t = document.getElementById('toast');
  var el = document.createElement('div');
  el.className = 'toast-item toast-' + type;
  el.textContent = msg;
  t.appendChild(el);
  setTimeout(function() { el.remove(); }, 3500);
}

// ═══ ALERT HTML ═══
function alertHTML(msg, type) {
  return '<div class="alert-box alert-' + type + '">' + (type === 'success' ? '✓ ' : '✗ ') + msg + '</div>';
}

// ═══ FORMAT ═══
function money(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n || 0);
}
function moneyShort(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'tr';
  return money(n);
}
function fmtDate(d) { return new Date(d).toLocaleDateString('vi-VN'); }
function fmtDT(d) { return new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }); }
function v(id) { return parseFloat(document.getElementById(id).value) || 0; }
function clearF(ids) { ids.forEach(function(id) { var el = document.getElementById(id); if (el) el.value = ''; }); }

// ═══ PAGES ═══
function showPage(page) {
  ['home', 'login', 'admin', 'student'].forEach(function(p) {
    document.getElementById('page-' + p).classList.toggle('hidden', p !== page);
  });
}

// ═══ SUPABASE (gắn cứng key) ═══
function initSB() {
  SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
  });
}

// ═══ AUTH ═══
var loginRole = 'admin';
function setRole(role, btn) {
  loginRole = role;
  document.querySelectorAll('.ltab').forEach(function(t) { t.classList.remove('active'); });
  btn.classList.add('active');
  document.getElementById('loginEmail').placeholder = role === 'admin' ? 'admin@troly.vn' : 'sinhvien@troly.vn';
}

async function doLogin() {
  var alertEl = document.getElementById('loginAlert');
  if (!SB) {
    alertEl.innerHTML = alertHTML('Lỗi kết nối hệ thống. Vui lòng tải lại trang.', 'error');
    return;
  }
  var email = document.getElementById('loginEmail').value.trim();
  var pass  = document.getElementById('loginPass').value;
  if (!email || !pass) {
    alertEl.innerHTML = alertHTML('Vui lòng nhập email và mật khẩu', 'error');
    return;
  }
  var btn = document.getElementById('loginBtn');
  btn.innerHTML = '<span class="spin"></span> Đang đăng nhập…';
  alertEl.innerHTML = '';
  try {
    var res = await SB.auth.signInWithPassword({ email: email, password: pass });
    btn.innerHTML = 'Đăng nhập';
    if (res.error) {
      alertEl.innerHTML = alertHTML('Sai email hoặc mật khẩu', 'error');
      return;
    }
    await afterLogin(res.data.user);
  } catch (e) {
    btn.innerHTML = 'Đăng nhập';
    alertEl.innerHTML = alertHTML('Lỗi đăng nhập: ' + e.message, 'error');
  }
}

async function afterLogin(user) {
  currentUser = user;
  var profRes = await SB.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profRes.data;
  if (!currentProfile) {
    toast('Không tìm thấy thông tin tài khoản. Liên hệ admin.', 'error');
    await SB.auth.signOut();
    return;
  }
  startSessionTimer();
  if (currentProfile.role === 'admin') {
    document.getElementById('admName').textContent = user.email.split('@')[0];
    document.getElementById('admAvatar').textContent = (user.email[0] || 'A').toUpperCase();
    document.getElementById('admDbStatus').innerHTML = '🟢 Đã kết nối';
    await loadAdminData();
    showPage('admin');
    toast('Chào mừng, Admin! 👋', 'success');
  } else {
    await loadStudentData();
    showPage('student');
    toast('Chào mừng! 🎓', 'success');
  }
}

async function checkAuth() {
  if (!SB) return;
  try {
    var res = await SB.auth.getSession();
    if (res.data && res.data.session) await afterLogin(res.data.session.user);
  } catch (e) {}
}

async function doLogout() {
  if (SB) await SB.auth.signOut();
  currentUser = null; currentProfile = null;
  clearSessionTimer();
  showPage('home');
  toast('Đã đăng xuất', 'info');
}

// ═══ SESSION ═══
function startSessionTimer() {
  clearSessionTimer();
  sessionStartTime = Date.now();
  sessionTimer = setInterval(checkSession, 30000);
}
function clearSessionTimer() {
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
  document.getElementById('sessionBar').style.display = 'none';
}
async function checkSession() {
  if (!SB || !currentUser) return;
  var elapsed = Date.now() - sessionStartTime;
  if (elapsed >= SESSION_MS) {
    clearSessionTimer();
    toast('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'error');
    await doLogout();
    return;
  }
  var remaining = SESSION_MS - elapsed;
  if (remaining <= (SESSION_MS - WARN_MS)) {
    document.getElementById('sessionBar').style.display = 'block';
    document.getElementById('sessionCountdown').textContent = Math.ceil(remaining / 60000);
  }
}
async function refreshSession() {
  if (!SB) return;
  await SB.auth.refreshSession();
  sessionStartTime = Date.now();
  document.getElementById('sessionBar').style.display = 'none';
  toast('Đã gia hạn phiên thêm 30 phút', 'success');
}

// ═══ PUBLIC ═══
var allPublicRooms = [], pubFilter = 'all';
async function loadPublicRooms() {
  if (!SB) return;
  var res = await SB.from('rooms').select('*').order('room_number');
  allPublicRooms = res.data || [];
  document.getElementById('pub-total').textContent = allPublicRooms.length;
  document.getElementById('pub-empty').textContent = allPublicRooms.filter(function(r) { return r.status === 'empty'; }).length;
  document.getElementById('pub-occupied').textContent = allPublicRooms.filter(function(r) { return r.status === 'occupied'; }).length;
  renderPublicRooms();
  var empty = allPublicRooms.filter(function(r) { return r.status === 'empty'; }).slice(0, 3);
  if (empty.length) {
    document.getElementById('heroMosaic').innerHTML = empty.map(function(r, i) {
      return '<div class="mosaic-card' + (i === 0 ? ' featured' : '') + '"><div class="mc-room">Phòng ' + r.room_number + (i === 0 ? ' – Nổi bật' : '') + '</div><div class="mc-price">' + money(r.price) + ' <span>₫/tháng</span></div><div class="mc-detail">' + (r.area ? r.area + ' m² · ' : '') + (r.note || 'Phòng sạch, an ninh') + '</div>' + (r.status === 'empty' ? '<div class="mc-tag">TRỐNG</div>' : '') + '</div>';
    }).join('');
  }
}

function filterRooms(f, btn) {
  pubFilter = f;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderPublicRooms();
}

function renderPublicRooms() {
  var grid = document.getElementById('pubRoomsGrid');
  var list = allPublicRooms;
  if (pubFilter === 'empty') list = list.filter(function(r) { return r.status === 'empty'; });
  if (pubFilter === 'occupied') list = list.filter(function(r) { return r.status === 'occupied'; });
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="ei">🏠</div><h3>' + (allPublicRooms.length ? 'Không tìm thấy phòng phù hợp' : 'Chưa có phòng nào') + '</h3><p>' + (allPublicRooms.length ? 'Thử bộ lọc khác' : 'Kết nối Supabase để xem danh sách') + '</p></div>';
    return;
  }
  var emos = ['🏠', '🛏️', '🏡', '🪟', '🛋️', '🚪'];
  grid.innerHTML = list.map(function(r, i) {
    var occupied = r.status === 'occupied';
    return '<div class="room-pub-card"><div class="room-img" style="background:linear-gradient(135deg,' + (occupied ? '#374151,#4B5563' : 'var(--moss),var(--moss2)') + ')">' + emos[i % emos.length] + '<div class="room-badge"><span class="badge ' + (occupied ? 'badge-red' : 'badge-green') + '">' + (occupied ? '✓ Đã thuê' : '○ Còn trống') + '</span></div></div><div class="room-info"><div class="room-num">Phòng ' + r.room_number + '</div><div class="room-meta">Tầng ' + (r.floor || 1) + (r.area ? ' · ' + r.area + ' m²' : '') + '</div><div class="room-price-pub">' + money(r.price) + '<span>/tháng</span></div>' + (r.note ? '<div class="room-features"><span class="rf">' + r.note + '</span></div>' : '') + (!occupied ? '<button class="btn btn-moss btn-sm" style="margin-top:12px;width:100%;justify-content:center" onclick="showModal(\'requestModal\')">Liên hệ thuê phòng</button>' : '') + '</div></div>';
  }).join('');
}

async function sendRequest() {
  var alertEl = document.getElementById('reqAlert');
  var name = document.getElementById('req_name').value.trim();
  var phone = document.getElementById('req_phone').value.trim();
  if (!name || !phone) { alertEl.innerHTML = alertHTML('Tên và SĐT là bắt buộc', 'error'); return; }
  if (!SB) { alertEl.innerHTML = alertHTML('Hệ thống chưa kết nối. Vui lòng gọi trực tiếp.', 'error'); return; }
  var btn = document.getElementById('sendReqBtn');
  btn.innerHTML = '<span class="spin"></span>';
  var res = await SB.from('rent_requests').insert({ full_name: name, phone: phone, email: document.getElementById('req_email').value, message: document.getElementById('req_msg').value });
  btn.innerHTML = 'Gửi yêu cầu';
  if (res.error) { alertEl.innerHTML = alertHTML('Lỗi: ' + res.error.message, 'error'); return; }
  hideModal('requestModal');
  toast('Đã gửi yêu cầu! Admin sẽ liên hệ sớm nhất. 🎉', 'success');
  clearF(['req_name', 'req_phone', 'req_email', 'req_msg']);
  document.getElementById('reqAlert').innerHTML = '';
}

// ═══ ADMIN DATA ═══
async function loadAdminData() {
  if (!SB) return;
  var results = await Promise.all([
    SB.from('rooms').select('*').order('room_number'),
    SB.from('tenants').select('*, rooms(room_number,floor,area,price)').order('full_name'),
    SB.from('invoices').select('*, rooms(room_number), tenants(full_name)').order('created_at', { ascending: false }),
    SB.from('payments').select('*, invoices(month_year, rooms(room_number), tenants(full_name))').order('paid_at', { ascending: false }),
    SB.from('rent_requests').select('*').order('created_at', { ascending: false })
  ]);
  roomsC = results[0].data || [];
  tenantsC = results[1].data || [];
  invoicesC = results[2].data || [];
  paymentsC = results[3].data || [];
  requestsC = results[4].data || [];
  renderAdminDashboard();
  renderAdminRooms();
  renderAdminTenants();
  renderAdminInvoices();
  renderAdminPayments();
  renderAdminRequests();
  renderAdminAccounts();
  populateSelects();
}

function admPage(p, el) {
  ['dashboard', 'rooms', 'tenants', 'accounts', 'invoices', 'payments', 'requests'].forEach(function(x) {
    document.getElementById('adm-' + x).classList.toggle('hidden', x !== p);
  });
  document.querySelectorAll('.adm-nav-item').forEach(function(n) { n.classList.remove('active'); });
  el.classList.add('active');
  var titles = { dashboard: 'Dashboard', rooms: 'Phòng trọ', tenants: 'Sinh viên', accounts: 'Tài khoản sinh viên', invoices: 'Hóa đơn', payments: 'Lịch sử thanh toán', requests: 'Yêu cầu thuê' };
  document.getElementById('admPageTitle').textContent = titles[p] || p;
}

function renderAdminDashboard() {
  var total = roomsC.length;
  var occ = roomsC.filter(function(r) { return r.status === 'occupied'; }).length;
  var now = new Date(), mn = now.getMonth(), yr = now.getFullYear();
  var rev = paymentsC.filter(function(p) { var d = new Date(p.paid_at); return d.getMonth() === mn && d.getFullYear() === yr; }).reduce(function(s, p) { return s + p.amount; }, 0);
  var unpaid = invoicesC.filter(function(i) { return i.status !== 'paid'; }).length;
  document.getElementById('as-total').textContent = total;
  document.getElementById('as-occ').textContent = occ;
  document.getElementById('as-emp').textContent = total - occ;
  document.getElementById('as-rev').textContent = moneyShort(rev);
  document.getElementById('as-unpaid').textContent = unpaid;
  var recent = invoicesC.slice(0, 5).concat(paymentsC.slice(0, 5)).sort(function(a, b) { return new Date(b.created_at || b.paid_at) - new Date(a.created_at || a.paid_at); }).slice(0, 8);
  document.getElementById('admActivity').innerHTML = recent.length ? recent.map(function(item) {
    var isPay = 'paid_at' in item;
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F5F0E8"><div style="width:34px;height:34px;border-radius:9px;background:' + (isPay ? '#DCFCE7' : '#DBEAFE') + ';display:flex;align-items:center;justify-content:center;font-size:15px">' + (isPay ? '💵' : '🧾') + '</div><div><div style="font-size:13px;font-weight:600">' + (isPay ? 'Thu ' + money(item.amount) : 'HĐ tháng ' + item.month_year) + '</div><div style="font-size:11px;color:var(--muted)">' + fmtDT(item.paid_at || item.created_at) + '</div></div></div>';
  }).join('') : '<div class="empty-state"><div class="ei">📋</div><h3>Chưa có hoạt động</h3></div>';
}

function renderAdminRooms() {
  var tb = document.getElementById('admRoomTable');
  if (!roomsC.length) { tb.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ei">🏠</div><p>Chưa có phòng</p></div></td></tr>'; return; }
  tb.innerHTML = roomsC.map(function(r) {
    return '<tr><td><strong>P' + r.room_number + '</strong></td><td>Tầng ' + (r.floor || 1) + '</td><td>' + (r.area ? r.area + ' m²' : '–') + '</td><td><strong>' + money(r.price) + '</strong></td><td><span class="badge ' + (r.status === 'occupied' ? 'badge-green' : 'badge-yellow') + '">' + (r.status === 'occupied' ? '✓ Có người' : '○ Trống') + '</span></td><td style="font-size:12px;color:var(--muted);max-width:160px">' + (r.note || '–') + '</td><td><button class="btn btn-danger btn-sm" onclick="delRoom(\'' + r.id + '\')">Xóa</button></td></tr>';
  }).join('');
}

function renderAdminTenants() {
  var tb = document.getElementById('admTenantTable');
  if (!tenantsC.length) { tb.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ei">👤</div><p>Chưa có sinh viên</p></div></td></tr>'; return; }
  tb.innerHTML = tenantsC.map(function(t) {
    return '<tr><td><strong>' + t.full_name + '</strong></td><td>' + (t.student_id || '–') + '</td><td>' + (t.phone || '–') + '</td><td>' + (t.rooms && t.rooms.room_number ? 'P' + t.rooms.room_number : '–') + '</td><td>' + (t.move_in_date ? fmtDate(t.move_in_date) : '–') + '</td><td><span class="badge ' + (t.user_id ? 'badge-green' : 'badge-yellow') + '">' + (t.user_id ? '✓ Có TK' : 'Chưa có TK') + '</span></td><td><button class="btn btn-danger btn-sm" onclick="delTenant(\'' + t.id + '\',\'' + (t.room_id || '') + '\')">Xóa</button></td></tr>';
  }).join('');
}

function renderAdminAccounts() {
  var tb = document.getElementById('admAccountTable');
  var withEmail = tenantsC.filter(function(t) { return t.email; });
  if (!withEmail.length) { tb.innerHTML = '<tr><td colspan="5"><div class="empty-state"><div class="ei">🔑</div><p>Chưa có tài khoản nào</p></div></td></tr>'; return; }
  tb.innerHTML = withEmail.map(function(t) {
    return '<tr><td>' + (t.email || '–') + '</td><td><strong>' + t.full_name + '</strong></td><td>' + (t.rooms && t.rooms.room_number ? 'P' + t.rooms.room_number : '–') + '</td><td>' + fmtDate(t.created_at) + '</td><td><span class="badge ' + (t.user_id ? 'badge-green' : 'badge-yellow') + '">' + (t.user_id ? '✓ Đã kích hoạt' : '⏳ Chờ đăng nhập') + '</span></td></tr>';
  }).join('');
}

function filterInv(f, btn) {
  invFilter = f;
  renderAdminInvoices();
}

function renderAdminInvoices() {
  var tb = document.getElementById('admInvoiceTable');
  var list = invoicesC;
  if (invFilter === 'unpaid') list = list.filter(function(i) { return i.status !== 'paid'; });
  if (invFilter === 'paid') list = list.filter(function(i) { return i.status === 'paid'; });
  if (!list.length) { tb.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="ei">🧾</div><p>Không có hóa đơn</p></div></td></tr>'; return; }
  var stMap = { paid: ['badge-green', '✓ Đã thu'], partial: ['badge-gold', '⚡ Còn nợ'], unpaid: ['badge-red', '○ Chưa thu'] };
  tb.innerHTML = list.map(function(inv) {
    var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
    var st = stMap[inv.status] || stMap.unpaid;
    var det = [inv.room_fee ? '🏠' + moneyShort(inv.room_fee) : '', inv.electric_fee ? '⚡' + moneyShort(inv.electric_fee) : '', inv.water_fee ? '💧' + moneyShort(inv.water_fee) : '', inv.other_fee ? '📡' + moneyShort(inv.other_fee) : ''].filter(Boolean).join(' · ');
    return '<tr><td><code style="font-size:10px;background:#F5F0E8;padding:2px 6px;border-radius:4px">' + inv.id.slice(0, 8).toUpperCase() + '</code></td><td><strong>P' + (inv.rooms ? inv.rooms.room_number : '–') + '</strong></td><td>' + (inv.tenants ? inv.tenants.full_name : '–') + '</td><td>' + inv.month_year + '</td><td style="font-size:11px;color:var(--muted)">' + (det || '–') + '</td><td><strong>' + money(tot) + '</strong></td><td><span class="badge ' + st[0] + '">' + st[1] + '</span></td><td style="display:flex;gap:6px">' + (inv.status !== 'paid' ? '<button class="btn btn-success btn-sm" onclick="openPayModal(\'' + inv.id + '\')">Thu tiền</button>' : '') + '<button class="btn btn-danger btn-sm" onclick="delInvoice(\'' + inv.id + '\')">Xóa</button></td></tr>';
  }).join('');
}

function renderAdminPayments() {
  var tb = document.getElementById('admPayTable');
  if (!paymentsC.length) { tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="ei">💳</div><p>Chưa có lịch sử</p></div></td></tr>'; return; }
  var mth = { cash: '💵 Tiền mặt', bank: '🏦 Chuyển khoản', momo: '🟣 MoMo' };
  tb.innerHTML = paymentsC.map(function(p) {
    return '<tr><td>' + fmtDT(p.paid_at) + '</td><td>' + (p.invoices && p.invoices.rooms ? 'P' + p.invoices.rooms.room_number : '–') + '</td><td>' + (p.invoices && p.invoices.tenants ? p.invoices.tenants.full_name : '–') + '</td><td><strong style="color:var(--green)">' + money(p.amount) + '</strong></td><td>' + (mth[p.method] || p.method || '–') + '</td><td>' + (p.note || '–') + '</td></tr>';
  }).join('');
}

function renderAdminRequests() {
  var tb = document.getElementById('admRequestTable');
  if (!requestsC.length) { tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="ei">📩</div><p>Chưa có yêu cầu</p></div></td></tr>'; return; }
  tb.innerHTML = requestsC.map(function(r) {
    return '<tr><td><strong>' + (r.full_name || '–') + '</strong></td><td>' + (r.phone || '–') + '</td><td>' + (r.email || '–') + '</td><td style="max-width:200px;font-size:12px">' + (r.message || '–') + '</td><td>' + fmtDT(r.created_at) + '</td><td><button class="btn btn-danger btn-sm" onclick="delRequest(\'' + r.id + '\')">Xóa</button></td></tr>';
  }).join('');
}

function populateSelects() {
  var emptyRooms = roomsC.filter(function(r) { return r.status === 'empty'; });
  document.getElementById('t_room').innerHTML = '<option value="">-- Chọn phòng trống --</option>' + emptyRooms.map(function(r) { return '<option value="' + r.id + '">P' + r.room_number + ' – ' + money(r.price) + '/tháng</option>'; }).join('');
  var occRooms = roomsC.filter(function(r) { return r.status === 'occupied'; });
  document.getElementById('i_room').innerHTML = '<option value="">-- Chọn phòng --</option>' + occRooms.map(function(r) { var t = tenantsC.find(function(tt) { return tt.room_id === r.id; }); return '<option value="' + r.id + '">P' + r.room_number + (t ? ' – ' + t.full_name : '') + '</option>'; }).join('');
  var noAcc = tenantsC.filter(function(t) { return !t.user_id; });
  document.getElementById('acc_tenant').innerHTML = '<option value="">-- Chọn sinh viên --</option>' + noAcc.map(function(t) { return '<option value="' + t.id + '">' + t.full_name + (t.rooms ? ' – P' + t.rooms.room_number : '') + '</option>'; }).join('');
}

// ═══ ADMIN ACTIONS ═══
async function saveRoom() {
  if (!SB) { toast('Chưa kết nối Supabase', 'error'); return; }
  var num = document.getElementById('r_num').value.trim();
  var price = parseFloat(document.getElementById('r_price').value);
  if (!num || !price) { toast('Số phòng và giá là bắt buộc', 'error'); return; }
  var btn = document.getElementById('saveRoomBtn');
  btn.innerHTML = '<span class="spin"></span>';
  var res = await SB.from('rooms').insert({ room_number: num, floor: parseInt(document.getElementById('r_floor').value) || 1, price: price, area: parseFloat(document.getElementById('r_area').value) || null, note: document.getElementById('r_note').value, status: 'empty' });
  btn.innerHTML = 'Lưu phòng';
  if (res.error) { toast('Lỗi: ' + res.error.message, 'error'); return; }
  hideModal('addRoomModal'); toast('Đã thêm phòng!', 'success');
  clearF(['r_num', 'r_floor', 'r_price', 'r_area', 'r_note']);
  await loadAdminData(); await loadPublicRooms();
}

async function delRoom(id) {
  if (!confirm('Xóa phòng này?')) return;
  await SB.from('rooms').delete().eq('id', id);
  toast('Đã xóa phòng', 'success');
  await loadAdminData(); await loadPublicRooms();
}

async function saveTenant() {
  if (!SB) return;
  var name = document.getElementById('t_name').value.trim();
  var roomId = document.getElementById('t_room').value;
  if (!name || !roomId) { toast('Tên và phòng là bắt buộc', 'error'); return; }
  var btn = document.getElementById('saveTenantBtn');
  btn.innerHTML = '<span class="spin"></span>';
  var res = await SB.from('tenants').insert({ full_name: name, student_id: document.getElementById('t_sid').value, phone: document.getElementById('t_phone').value, email: document.getElementById('t_email').value, room_id: roomId, move_in_date: document.getElementById('t_date').value || null, id_number: document.getElementById('t_idn').value });
  if (!res.error) await SB.from('rooms').update({ status: 'occupied' }).eq('id', roomId);
  btn.innerHTML = 'Lưu sinh viên';
  if (res.error) { toast('Lỗi: ' + res.error.message, 'error'); return; }
  hideModal('addTenantModal'); toast('Đã thêm sinh viên!', 'success');
  clearF(['t_name', 't_sid', 't_phone', 't_email', 't_idn']);
  await loadAdminData(); await loadPublicRooms();
}

async function delTenant(id, roomId) {
  if (!confirm('Xóa sinh viên? Phòng sẽ chuyển về trống.')) return;
  await SB.from('tenants').delete().eq('id', id);
  if (roomId) await SB.from('rooms').update({ status: 'empty' }).eq('id', roomId);
  toast('Đã xóa sinh viên', 'success');
  await loadAdminData(); await loadPublicRooms();
}

async function createStudentAccount() {
  if (!SB || !currentUser) return;
  var tenantId = document.getElementById('acc_tenant').value;
  var email = document.getElementById('acc_email').value.trim();
  var pass = document.getElementById('acc_pass').value;
  var alertEl = document.getElementById('accAlert');
  if (!tenantId || !email || !pass) { alertEl.innerHTML = alertHTML('Điền đầy đủ thông tin', 'error'); return; }
  if (pass.length < 8) { alertEl.innerHTML = alertHTML('Mật khẩu ít nhất 8 ký tự', 'error'); return; }
  var btn = document.getElementById('saveAccBtn');
  btn.innerHTML = '<span class="spin"></span>';
  var tenant = tenantsC.find(function(t) { return t.id === tenantId; });
  try {
    var sessionRes = await SB.auth.getSession();
    var accessToken = sessionRes.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/create-student-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify({
        email: email,
        password: pass,
        full_name: tenant ? tenant.full_name : '',
        tenant_id: tenantId
      })
    });
    var data = await resp.json();
    btn.innerHTML = 'Tạo tài khoản';
    if (!resp.ok || data.error) {
      alertEl.innerHTML = alertHTML('Lỗi: ' + (data.error || 'Không thể tạo tài khoản'), 'error');
      return;
    }
  } catch (e) {
    btn.innerHTML = 'Tạo tài khoản';
    alertEl.innerHTML = alertHTML('Lỗi kết nối: ' + e.message, 'error');
    return;
  }
  hideModal('addAccountModal'); toast('Đã tạo tài khoản cho ' + (tenant ? tenant.full_name : '') + '!', 'success');
  clearF(['acc_email', 'acc_pass']); document.getElementById('accAlert').innerHTML = '';
  await loadAdminData();
}


async function saveInvoice() {
  if (!SB) return;
  var roomId = document.getElementById('i_room').value;
  var month = document.getElementById('i_month').value;
  if (!roomId || !month) { toast('Chọn phòng và tháng', 'error'); return; }
  var btn = document.getElementById('saveInvBtn');
  btn.innerHTML = '<span class="spin"></span>';
  var tenant = tenantsC.find(function(t) { return t.room_id === roomId; });
  var res = await SB.from('invoices').insert({ room_id: roomId, tenant_id: tenant ? tenant.id : null, month_year: month, room_fee: v('i_rfee'), electric_fee: v('i_efee'), water_fee: v('i_wfee'), other_fee: v('i_ofee'), electric_kwh: v('i_ekwh') || null, water_m3: v('i_wm3') || null, note: document.getElementById('i_note').value, status: 'unpaid' });
  btn.innerHTML = 'Tạo hóa đơn';
  if (res.error) { toast('Lỗi: ' + res.error.message, 'error'); return; }
  hideModal('addInvoiceModal'); toast('Đã tạo hóa đơn!', 'success');
  await loadAdminData();
}

async function delInvoice(id) {
  if (!confirm('Xóa hóa đơn?')) return;
  await SB.from('invoices').delete().eq('id', id);
  toast('Đã xóa', 'success'); await loadAdminData();
}

function openPayModal(invId) {
  var inv = invoicesC.find(function(i) { return i.id === invId; });
  if (!inv) return;
  var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
  document.getElementById('pay_inv_id').value = invId;
  document.getElementById('pay_amount').value = tot;
  document.getElementById('pay_note').value = '';
  document.getElementById('payInvInfo').innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:700">' + (inv.tenants ? inv.tenants.full_name : 'N/A') + '</div><div style="font-size:12px;color:var(--muted)">P' + (inv.rooms ? inv.rooms.room_number : '–') + ' · Tháng ' + inv.month_year + '</div></div><div style="font-family:\'Syne\',sans-serif;font-size:20px;font-weight:800">' + money(tot) + '</div></div>';
  showModal('payModal');
}

async function confirmPay() {
  if (!SB) return;
  var invId = document.getElementById('pay_inv_id').value;
  var amount = parseFloat(document.getElementById('pay_amount').value);
  var method = document.getElementById('pay_method').value;
  var note = document.getElementById('pay_note').value;
  if (!amount) { toast('Nhập số tiền', 'error'); return; }
  var btn = document.getElementById('confirmPayBtn');
  btn.innerHTML = '<span class="spin"></span>';
  await SB.from('payments').insert({ invoice_id: invId, amount: amount, method: method, note: note });
  var inv = invoicesC.find(function(i) { return i.id === invId; });
  var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
  await SB.from('invoices').update({ status: amount >= tot ? 'paid' : 'partial' }).eq('id', invId);
  btn.innerHTML = 'Xác nhận thu';
  hideModal('payModal'); toast('Thu tiền thành công! 🎉', 'success');
  await loadAdminData();
}

async function delRequest(id) {
  await SB.from('rent_requests').delete().eq('id', id);
  toast('Đã xóa', 'success'); await loadAdminData();
}

// ═══ INVOICE CALC ═══
function autoFillInv() {
  var roomId = document.getElementById('i_room').value;
  var room = roomsC.find(function(r) { return r.id === roomId; });
  var tenant = tenantsC.find(function(t) { return t.room_id === roomId; });
  document.getElementById('i_tenant').value = tenant ? tenant.full_name : 'Phòng trống';
  document.getElementById('i_rfee').value = room ? room.price : '';
  calcInvTotal();
}
function calcElec() {
  var n = parseFloat(document.getElementById('i_ekwh').value) || 0;
  var p = parseFloat(document.getElementById('i_eprice').value) || 0;
  document.getElementById('i_efee').value = n * p || '';
  calcInvTotal();
}
function calcWater() {
  var n = parseFloat(document.getElementById('i_wm3').value) || 0;
  var p = parseFloat(document.getElementById('i_wprice').value) || 0;
  document.getElementById('i_wfee').value = n * p || '';
  calcInvTotal();
}
function calcInvTotal() {
  var tot = v('i_rfee') + v('i_efee') + v('i_wfee') + v('i_ofee');
  document.getElementById('invTotal').textContent = money(tot);
}

// ═══ STUDENT DATA ═══
var myTenant = null, myRoom = null, myInvoices = [];
async function loadStudentData() {
  if (!SB || !currentUser) return;
  var res = await SB.from('tenants').select('*, rooms(*)').eq('user_id', currentUser.id).single();
  myTenant = res.data;
  myRoom = myTenant ? myTenant.rooms : null;
  var stuName = myTenant ? myTenant.full_name : currentUser.email;
  document.getElementById('stuName').textContent = stuName;
  document.getElementById('stuWelcomeName').textContent = 'Xin chào, ' + (stuName.split(' ').pop() || stuName) + '!';
  document.getElementById('stuWelcomeSub').textContent = myRoom ? ('Phòng ' + myRoom.room_number + ' – ' + money(myRoom.price) + '/tháng') : 'Phòng chưa được phân công';
  document.getElementById('stuRoomNum').textContent = myRoom ? 'P' + myRoom.room_number : '–';
  document.getElementById('si-name').textContent = myTenant ? myTenant.full_name : '–';
  document.getElementById('si-msv').textContent = (myTenant && myTenant.student_id) || '–';
  document.getElementById('si-phone').textContent = (myTenant && myTenant.phone) || '–';
  document.getElementById('si-date').textContent = (myTenant && myTenant.move_in_date) ? fmtDate(myTenant.move_in_date) : '–';
  document.getElementById('si-room').textContent = myRoom ? 'P' + myRoom.room_number : '–';
  document.getElementById('si-floor').textContent = myRoom ? 'Tầng ' + (myRoom.floor || 1) : '–';
  document.getElementById('si-area').textContent = myRoom ? (myRoom.area + ' m²') : '–';
  document.getElementById('si-price').textContent = myRoom ? money(myRoom.price) : '–';
  if (myTenant) {
    var invRes = await SB.from('invoices').select('*').eq('tenant_id', myTenant.id).order('month_year', { ascending: false });
    myInvoices = invRes.data || [];
    renderStuInvoices();
  }
}

function renderStuInvoices() {
  var el = document.getElementById('stuInvoices');
  if (!myInvoices.length) { el.innerHTML = '<div class="empty-state"><div class="ei">🧾</div><h3>Chưa có hóa đơn</h3><p>Hóa đơn sẽ được admin tạo mỗi tháng</p></div>'; return; }
  var stMap = { paid: ['badge-green', '✓ Đã thanh toán'], partial: ['badge-gold', '⚡ Còn thiếu'], unpaid: ['badge-red', '○ Chưa thanh toán'] };
  el.innerHTML = myInvoices.map(function(inv) {
    var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
    var st = stMap[inv.status] || stMap.unpaid;
    return '<div class="inv-detail"><div class="inv-detail-hd"><div class="inv-month">Hóa đơn tháng ' + inv.month_year + '</div><div style="display:flex;align-items:center;gap:10px"><span class="badge ' + st[0] + '">' + st[1] + '</span>' + (inv.status !== 'paid' ? '<button class="btn btn-moss btn-sm" onclick="openStuPay(\'' + inv.id + '\')">Thanh toán</button>' : '') + '</div></div><div class="inv-items">' + (inv.room_fee ? '<div class="inv-item-row"><span>🏠 Tiền nhà</span><span style="font-weight:600">' + money(inv.room_fee) + '</span></div>' : '') + (inv.electric_fee ? '<div class="inv-item-row"><span>⚡ Tiền điện' + (inv.electric_kwh ? ' (' + inv.electric_kwh + ' kWh)' : '') + '</span><span style="font-weight:600">' + money(inv.electric_fee) + '</span></div>' : '') + (inv.water_fee ? '<div class="inv-item-row"><span>💧 Tiền nước' + (inv.water_m3 ? ' (' + inv.water_m3 + ' m³)' : '') + '</span><span style="font-weight:600">' + money(inv.water_fee) + '</span></div>' : '') + (inv.other_fee ? '<div class="inv-item-row"><span>📡 Dịch vụ khác</span><span style="font-weight:600">' + money(inv.other_fee) + '</span></div>' : '') + (inv.note ? '<div style="padding:10px 0;font-size:12px;color:var(--muted)">📝 ' + inv.note + '</div>' : '') + '</div><div class="inv-total-row"><span class="inv-total-label">Tổng cộng</span><span class="inv-total-val">' + money(tot) + '</span></div></div>';
  }).join('');
}

function openStuPay(invId) {
  var inv = myInvoices.find(function(i) { return i.id === invId; });
  if (!inv) return;
  var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
  document.getElementById('stu_pay_inv_id').value = invId;
  document.getElementById('stuPayInfo').innerHTML = '<div style="font-weight:700;font-size:15px;margin-bottom:4px">Hóa đơn tháng ' + inv.month_year + '</div><div style="color:var(--muted);font-size:12px">Phòng của bạn</div><div style="font-family:\'Syne\',sans-serif;font-size:24px;font-weight:800;color:var(--moss);margin-top:8px">' + money(tot) + '</div>';
  document.getElementById('stuQrAmount').textContent = money(tot);
  document.getElementById('stuQrNote').textContent = 'HD ' + invId.slice(0, 8).toUpperCase() + ' - ' + inv.month_year;
  document.getElementById('stu_pay_method').value = 'cash';
  document.querySelectorAll('.pay-opt').forEach(function(e) { e.classList.remove('sel'); });
  document.querySelectorAll('.pay-opt')[0].classList.add('sel');
  document.getElementById('stuQrSection').style.display = 'none';
  document.getElementById('stuPayAlert').innerHTML = '';
  showModal('stuPayModal');
}

function selPay(el, method) {
  document.querySelectorAll('.pay-opt').forEach(function(e) { e.classList.remove('sel'); });
  el.classList.add('sel');
  document.getElementById('stu_pay_method').value = method;
  document.getElementById('stuQrSection').style.display = method !== 'cash' ? 'block' : 'none';
}

async function stuConfirmPay() {
  if (!SB) return;
  var btn = document.getElementById('stuConfirmBtn');
  var invId = document.getElementById('stu_pay_inv_id').value;
  var method = document.getElementById('stu_pay_method').value;
  var inv = myInvoices.find(function(i) { return i.id === invId; });
  var tot = (inv.room_fee || 0) + (inv.electric_fee || 0) + (inv.water_fee || 0) + (inv.other_fee || 0);
  btn.innerHTML = '<span class="spin"></span>';
  var note = method === 'cash' ? 'SV nộp tiền mặt' : method === 'bank' ? 'SV chuyển khoản' : 'SV thanh toán MoMo';
  var res = await SB.from('payments').insert({ invoice_id: invId, amount: tot, method: method, note: note });
  if (!res.error) await SB.from('invoices').update({ status: 'paid' }).eq('id', invId);
  btn.innerHTML = 'Xác nhận đã thanh toán';
  if (res.error) { document.getElementById('stuPayAlert').innerHTML = alertHTML('Lỗi: ' + res.error.message, 'error'); return; }
  hideModal('stuPayModal'); toast('Thanh toán thành công! 🎉', 'success');
  await loadStudentData();
}

// ═══ CLOSE MODAL ON OVERLAY CLICK ═══
document.addEventListener('click', function(e) {
  if (e.target && e.target.classList && e.target.classList.contains('overlay')) {
    e.target.style.display = '';
    e.target.classList.remove('show');
  }
});

// ═══ INIT ═══
window.addEventListener('load', async function() {
  initSB();
  var now = new Date();
  var m = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  var mEl = document.getElementById('i_month');
  if (mEl) mEl.value = m;
  await loadPublicRooms();
  await checkAuth();
});
