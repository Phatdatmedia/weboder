(function(){
/* =========================================================================
   SUPABASE CONFIG — điền giống hệt như trong pos.html (cùng một project)
   ========================================================================= */
const SUPABASE_URL = 'https://tmdxcuzwkydgkdkpucuw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZHhjdXp3a3lkZ2tka3B1Y3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzU3ODgsImV4cCI6MjA5ODkxMTc4OH0.uAbJOwLspA15KKo1cI1kZNwxICRa_jGRq3Fmyx50IaY';

let supabase = null;
let DEMO = true;
try {
  if (!SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE')) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    DEMO = false;
  }
} catch (e) { DEMO = true; }

const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
});

/* ---------------------------------------------------------------------
   In-memory demo store — separate instance from pos.html's demo store
   (each HTML file runs its own JS sandbox). Once Supabase is configured
   both pages read/write the exact same real database.
   --------------------------------------------------------------------- */
const DEMO_DB = {
  employees: [
    {id: uid(), username:'admin', password:'admin123', full_name:'Quản trị viên', role:'admin', is_active:true, created_at:new Date().toISOString()},
    {id: uid(), username:'cashier01', password:'123456', full_name:'Hoài Hải', role:'cashier', is_active:true, created_at:new Date().toISOString()},
  ],
  products: [
    {id: uid(), sku:'SP001', barcode:'8931234560012', name:'Nước suối Lavie 500ml', category:'Nước uống', unit:'chai', cost_price:4000, sale_price:6000, stock_qty:120, min_stock:20, is_active:true},
    {id: uid(), sku:'SP002', barcode:'8931234560029', name:'Coca-Cola lon 330ml', category:'Nước uống', unit:'lon', cost_price:7500, sale_price:11000, stock_qty:80, min_stock:24, is_active:true},
    {id: uid(), sku:'SP003', barcode:'8931234560036', name:'Bánh mì sandwich', category:'Thực phẩm', unit:'cái', cost_price:12000, sale_price:20000, stock_qty:15, min_stock:10, is_active:true},
    {id: uid(), sku:'SP004', barcode:'8931234560043', name:'Mì ly Hảo Hảo', category:'Thực phẩm', unit:'ly', cost_price:6000, sale_price:9000, stock_qty:8, min_stock:15, is_active:true},
    {id: uid(), sku:'SP008', barcode:'8931234560081', name:'Sữa tươi Vinamilk 180ml', category:'Nước uống', unit:'hộp', cost_price:5500, sale_price:8500, stock_qty:5, min_stock:20, is_active:true},
  ],
  orders: [], order_items: [], stock_in: [], stock_out: [], stock_takes: [], stock_take_items: [], shifts: []
};

/* ---------------------------------------------------------------------
   Data-access layer (same shape as pos.html)
   --------------------------------------------------------------------- */
const DB = {
  async login(username, password) {
    if (DEMO) {
      const e = DEMO_DB.employees.find(x => x.username===username && x.password===password && x.is_active);
      return e ? {id:e.id, full_name:e.full_name, role:e.role} : null;
    }
    const {data, error} = await supabase.rpc('fn_login', {p_username:username, p_password:password});
    if (error) throw error;
    return (data && data[0]) || null;
  },
  async listEmployees() {
    if (DEMO) return [...DEMO_DB.employees].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const {data, error} = await supabase.rpc('fn_list_employees');
    if (error) throw error;
    return data;
  },
  async createEmployee(username, password, full_name, role) {
    if (DEMO) {
      if (DEMO_DB.employees.some(e=>e.username===username)) throw new Error('Tên đăng nhập đã tồn tại');
      DEMO_DB.employees.push({id:uid(), username, password, full_name, role, is_active:true, created_at:new Date().toISOString()});
      return;
    }
    const {error} = await supabase.rpc('fn_create_employee', {p_username:username, p_password:password, p_full_name:full_name, p_role:role});
    if (error) throw error;
  },
  async updateEmployee(id, full_name, role, is_active) {
    if (DEMO) { Object.assign(DEMO_DB.employees.find(e=>e.id===id), {full_name, role, is_active}); return; }
    const {error} = await supabase.rpc('fn_update_employee', {p_id:id, p_full_name:full_name, p_role:role, p_is_active:is_active});
    if (error) throw error;
  },
  async resetPassword(id, newPassword) {
    if (DEMO) { DEMO_DB.employees.find(e=>e.id===id).password = newPassword; return; }
    const {error} = await supabase.rpc('fn_reset_password', {p_id:id, p_new_password:newPassword});
    if (error) throw error;
  },
  async listProducts(includeInactive=false) {
    if (DEMO) return DEMO_DB.products.filter(p=>includeInactive||p.is_active);
    let q = supabase.from('products').select('*').order('name');
    if (!includeInactive) q = q.eq('is_active', true);
    const {data, error} = await q;
    if (error) throw error;
    return data;
  },
  async upsertProduct(p) {
    if (DEMO) {
      if (p.id) { Object.assign(DEMO_DB.products.find(x=>x.id===p.id), p); }
      else { p.id = uid(); p.is_active = true; DEMO_DB.products.push(p); }
      return p;
    }
    const {data, error} = await supabase.from('products').upsert(p).select().single();
    if (error) throw error;
    return data;
  },
  async deactivateProduct(id) {
    if (DEMO) { const p = DEMO_DB.products.find(x=>x.id===id); if (p) p.is_active = false; return; }
    const {error} = await supabase.from('products').update({is_active:false}).eq('id', id);
    if (error) throw error;
  },
  async listOrders(fromISO, toISO, limit=300) {
    if (DEMO) return DEMO_DB.orders.filter(o => (!fromISO||o.created_at>=fromISO) && (!toISO||o.created_at<=toISO)).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
    let q = supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(limit);
    if (fromISO) q = q.gte('created_at', fromISO);
    if (toISO) q = q.lte('created_at', toISO);
    const {data, error} = await q;
    if (error) throw error;
    return data;
  },
  async listOrderItems(orderId) {
    if (DEMO) return DEMO_DB.order_items.filter(i=>i.order_id===orderId);
    const {data, error} = await supabase.from('order_items').select('*').eq('order_id', orderId);
    if (error) throw error;
    return data;
  },
  async listStockIn(limit=100) {
    if (DEMO) return [...DEMO_DB.stock_in].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
    const {data, error} = await supabase.from('stock_in').select('*, products(name)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(r=>({...r, product_name:r.products?.name}));
  },
  async stockIn(entry) {
    if (DEMO) {
      DEMO_DB.stock_in.push({...entry, id:uid(), created_at:new Date().toISOString()});
      const p = DEMO_DB.products.find(x=>x.id===entry.product_id); if (p) p.stock_qty += entry.qty;
      return;
    }
    const {error} = await supabase.rpc('fn_stock_in', {p_product_id:entry.product_id, p_qty:entry.qty, p_unit_cost:entry.unit_cost, p_supplier:entry.supplier, p_note:entry.note});
    if (error) throw error;
  },
  async listStockOut(limit=100) {
    if (DEMO) return [...DEMO_DB.stock_out].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
    const {data, error} = await supabase.from('stock_out').select('*, products(name)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(r=>({...r, product_name:r.products?.name}));
  },
  async stockOut(entry) {
    if (DEMO) {
      DEMO_DB.stock_out.push({...entry, id:uid(), created_at:new Date().toISOString()});
      const p = DEMO_DB.products.find(x=>x.id===entry.product_id); if (p) p.stock_qty = Math.max(0, p.stock_qty-entry.qty);
      return;
    }
    const {error} = await supabase.rpc('fn_stock_out', {p_product_id:entry.product_id, p_qty:entry.qty, p_reason:entry.reason, p_note:entry.note});
    if (error) throw error;
  },
  async listStockTakes(limit=20) {
    if (DEMO) return [...DEMO_DB.stock_takes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit).map(st=>{
      const items = DEMO_DB.stock_take_items.filter(i=>i.stock_take_id===st.id);
      return {...st, count:items.length, diffCount: items.filter(i=>i.diff!==0).length};
    });
    const {data, error} = await supabase.from('stock_takes').select('*, stock_take_items(diff)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(st=>({...st, count: st.stock_take_items.length, diffCount: st.stock_take_items.filter(i=>i.diff!==0).length}));
  },
  async saveStockTake(items, note) {
    if (DEMO) {
      const stId = uid();
      DEMO_DB.stock_takes.push({id:stId, note, created_at:new Date().toISOString()});
      items.forEach(it => DEMO_DB.stock_take_items.push({...it, id:uid(), stock_take_id:stId}));
      return stId;
    }
    const {data, error} = await supabase.from('stock_takes').insert({note}).select().single();
    if (error) throw error;
    const rows = items.map(it => ({...it, stock_take_id: data.id}));
    const {error:e2} = await supabase.from('stock_take_items').insert(rows);
    if (e2) throw e2;
    return data.id;
  },
  async applyStockTake(stockTakeId) {
    if (DEMO) {
      DEMO_DB.stock_take_items.filter(i=>i.stock_take_id===stockTakeId).forEach(i=>{
        const p = DEMO_DB.products.find(x=>x.id===i.product_id); if (p) p.stock_qty = i.actual_qty;
      });
      return;
    }
    const {error} = await supabase.rpc('fn_apply_stock_take', {p_stock_take_id: stockTakeId});
    if (error) throw error;
  },
  async listShifts(limit=100) {
    if (DEMO) return [...DEMO_DB.shifts].sort((a,b)=>new Date(b.opened_at)-new Date(a.opened_at)).slice(0,limit);
    const {data, error} = await supabase.from('shifts').select('*').order('opened_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data;
  }
};

/* ---------------------------------------------------------------------
   Utilities
   --------------------------------------------------------------------- */
const vnd = n => new Intl.NumberFormat('vi-VN').format(Math.round(n||0)) + ' ₫';
const fmtDT = iso => new Date(iso).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function paymentLabel(m) { return m==='cash'?'Tiền mặt':m==='transfer'?'Chuyển khoản':'Thẻ/Ví'; }
function toast(msg, kind='ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind==='ok'?'ok':kind==='err'?'err':'');
  el.textContent = msg;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
function openModal(html) { document.getElementById('modalBox').innerHTML = html; document.getElementById('modalOverlay').classList.add('show'); }
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id==='modalOverlay') closeModal(); });
function startOfTodayISO() { const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); }

let PRODUCTS = [];
let CURRENT_EMPLOYEE = null;

/* ---------------------------------------------------------------------
   Login
   --------------------------------------------------------------------- */
async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.remove('show');
  if (!username || !password) { errBox.textContent = 'Vui lòng nhập đầy đủ thông tin'; errBox.classList.add('show'); return; }
  const btn = document.getElementById('loginBtn');
  btn.setAttribute('disabled',''); btn.textContent = 'Đang đăng nhập…';
  try {
    const emp = await DB.login(username, password);
    if (!emp) { errBox.textContent = 'Sai tên đăng nhập hoặc mật khẩu'; errBox.classList.add('show'); return; }
    if (emp.role !== 'admin') { errBox.textContent = 'Tài khoản này không có quyền quản trị'; errBox.classList.add('show'); return; }
    CURRENT_EMPLOYEE = emp;
    document.getElementById('whoName').textContent = emp.full_name;
    document.getElementById('whoAvatar').src = 'https://api.dicebear.com/7.x/notionists/svg?seed=' + encodeURIComponent(emp.full_name);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'flex';
    document.getElementById('connDot').classList.toggle('live', !DEMO);
    document.getElementById('connText').textContent = DEMO ? 'Chưa cấu hình Supabase — chạy dữ liệu mẫu' : 'Đã kết nối Supabase';
    switchTab('dashboard');
  } catch (e) {
    console.error(e); errBox.textContent = 'Lỗi đăng nhập: ' + e.message; errBox.classList.add('show');
  } finally {
    btn.removeAttribute('disabled'); btn.textContent = 'Đăng nhập';
  }
}
document.getElementById('loginBtn').addEventListener('click', doLogin);
document.getElementById('logoutBtn').addEventListener('click', () => {
  CURRENT_EMPLOYEE = null;
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUsername').value = ''; document.getElementById('loginPassword').value = '';
});

/* ---------------------------------------------------------------------
   Navigation
   --------------------------------------------------------------------- */
const PAGE_TITLES = {dashboard:'Tổng quan', employees:'Nhân viên', products:'Sản phẩm', orders:'Đơn hàng', stock:'Kho hàng', stocktake:'Kiểm kê', shifts:'Ca làm việc', reports:'Thống kê'};
function switchTab(tab) {
  document.querySelectorAll('.nav-item[data-tab]').forEach(n => n.classList.toggle('active', n.dataset.tab===tab));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id==='page-'+tab));
  document.getElementById('pageTitle').textContent = PAGE_TITLES[tab] || '';
  if (tab==='dashboard') renderDashboard();
  if (tab==='employees') renderEmployeesPage();
  if (tab==='products') renderProductsPage();
  if (tab==='orders') renderOrdersPage();
  if (tab==='stock') renderStockPage();
  if (tab==='stocktake') renderStockTakePage();
  if (tab==='shifts') renderShiftsPage();
  if (tab==='reports') renderReportsPage();
}
document.getElementById('navMenu').addEventListener('click', e => {
  const item = e.target.closest('.nav-item'); if (!item || !item.dataset.tab) return;
  switchTab(item.dataset.tab);
});

/* =========================================================================
   TỔNG QUAN
   ========================================================================= */
async function renderDashboard() {
  const [products, orders, shifts] = await Promise.all([DB.listProducts(), DB.listOrders(startOfTodayISO()), DB.listShifts()]);
  PRODUCTS = products;
  document.getElementById('dashRevenue').textContent = vnd(orders.reduce((a,o)=>a+Number(o.total),0));
  document.getElementById('dashOrders').textContent = orders.length;
  const openShifts = shifts.filter(s=>s.status==='open');
  document.getElementById('dashOpenShifts').textContent = openShifts.length;
  const low = products.filter(p=>p.stock_qty<=p.min_stock);
  document.getElementById('dashLowStock').textContent = low.length;

  document.getElementById('dashOpenShiftsTable').innerHTML = openShifts.map(s => `<tr><td>${esc(s.cashier_name)}</td><td>${fmtDT(s.opened_at)}</td><td class="num">${vnd(s.total_sales)}</td><td class="num">${s.total_orders}</td></tr>`).join('');
  document.getElementById('dashOpenShiftsEmpty').style.display = openShifts.length? 'none':'block';

  document.getElementById('dashLowStockTable').innerHTML = low.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.stock_qty} ${esc(p.unit)}</td><td class="num">${p.min_stock}</td><td>${p.stock_qty===0?'<span class="badge danger">Hết hàng</span>':'<span class="badge warn">Sắp hết</span>'}</td></tr>`).join('');
  document.getElementById('dashLowStockEmpty').style.display = low.length? 'none':'block';
}

/* =========================================================================
   NHÂN VIÊN
   ========================================================================= */
async function renderEmployeesPage() {
  const rows = await DB.listEmployees();
  document.getElementById('empTable').innerHTML = rows.map(e => `
    <tr>
      <td class="num">${esc(e.username)}</td><td>${esc(e.full_name)}</td>
      <td>${e.role==='admin'?'<span class="badge acc">Quản trị viên</span>':'<span class="badge neu">Thu ngân</span>'}</td>
      <td>${e.is_active?'<span class="badge ok">Đang hoạt động</span>':'<span class="badge danger">Đã khoá</span>'}</td>
      <td>${fmtDT(e.created_at)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-icon" title="Sửa" onclick="editEmployee('${e.id}')">✎</button>
        <button class="btn-icon" title="Đặt lại mật khẩu" onclick="resetEmployeePassword('${e.id}','${esc(e.full_name)}')">🔑</button>
      </td>
    </tr>`).join('');
  window.__employeesCache = rows;
}
document.getElementById('empAddBtn').addEventListener('click', () => openEmployeeModal(null));
function editEmployee(id) { openEmployeeModal((window.__employeesCache||[]).find(e=>e.id===id)); }
function openEmployeeModal(e) {
  const isNew = !e;
  e = e || {username:'', full_name:'', role:'cashier', is_active:true};
  openModal(`
    <h3>${isNew?'Thêm nhân viên':'Sửa thông tin nhân viên'}</h3>
    <div class="field" style="margin-bottom:10px;"><label>Tên đăng nhập</label><input type="text" id="mUsername" value="${esc(e.username)}" ${isNew?'':'disabled style="background:#f0f1f6;"'}></div>
    ${isNew? `<div class="field" style="margin-bottom:10px;"><label>Mật khẩu ban đầu</label><input type="text" id="mPassword" placeholder="Tối thiểu 6 ký tự"></div>` : ''}
    <div class="field" style="margin-bottom:10px;"><label>Họ tên</label><input type="text" id="mFullName" value="${esc(e.full_name)}"></div>
    <div class="form-row">
      <div class="field"><label>Vai trò</label><select id="mRole"><option value="cashier" ${e.role==='cashier'?'selected':''}>Thu ngân</option><option value="admin" ${e.role==='admin'?'selected':''}>Quản trị viên</option></select></div>
      ${!isNew? `<div class="field"><label>Trạng thái</label><select id="mActive"><option value="true" ${e.is_active?'selected':''}>Đang hoạt động</option><option value="false" ${!e.is_active?'selected':''}>Khoá tài khoản</option></select></div>`:''}
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Huỷ</button><button class="btn btn-primary" id="mSaveBtn">Lưu</button></div>
  `);
  document.getElementById('mSaveBtn').addEventListener('click', async () => {
    const full_name = document.getElementById('mFullName').value.trim();
    const role = document.getElementById('mRole').value;
    if (!full_name) { toast('Vui lòng nhập họ tên', 'err'); return; }
    try {
      if (isNew) {
        const username = document.getElementById('mUsername').value.trim();
        const password = document.getElementById('mPassword').value;
        if (!username || password.length < 6) { toast('Tên đăng nhập không trống và mật khẩu tối thiểu 6 ký tự', 'err'); return; }
        await DB.createEmployee(username, password, full_name, role);
      } else {
        const is_active = document.getElementById('mActive').value === 'true';
        await DB.updateEmployee(e.id, full_name, role, is_active);
      }
      toast('Đã lưu thông tin nhân viên'); closeModal(); renderEmployeesPage();
    } catch(err) { toast('Lỗi: '+err.message, 'err'); }
  });
}
function resetEmployeePassword(id, name) {
  openModal(`
    <h3>Đặt lại mật khẩu — ${esc(name)}</h3>
    <div class="field"><label>Mật khẩu mới</label><input type="text" id="mNewPass" placeholder="Tối thiểu 6 ký tự"></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Huỷ</button><button class="btn btn-primary" id="mResetBtn">Cập nhật</button></div>
  `);
  document.getElementById('mResetBtn').addEventListener('click', async () => {
    const pass = document.getElementById('mNewPass').value;
    if (pass.length < 6) { toast('Mật khẩu tối thiểu 6 ký tự', 'err'); return; }
    try { await DB.resetPassword(id, pass); toast('Đã đặt lại mật khẩu'); closeModal(); }
    catch(e){ toast('Lỗi: '+e.message,'err'); }
  });
}

/* =========================================================================
   SẢN PHẨM
   ========================================================================= */
async function renderProductsPage() {
  PRODUCTS = await DB.listProducts();
  drawProductsTable();
}
function drawProductsTable() {
  const q = document.getElementById('prodSearch').value.trim().toLowerCase();
  const list = PRODUCTS.filter(p => !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q));
  document.getElementById('prodTable').innerHTML = list.map(p => `
    <tr>
      <td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.category||'—')}</td>
      <td class="num">${vnd(p.cost_price)}</td><td class="num">${vnd(p.sale_price)}</td>
      <td class="num">${p.stock_qty<=p.min_stock? `<span class="badge warn">${p.stock_qty}</span>`:p.stock_qty}</td>
      <td style="display:flex;gap:6px;"><button class="btn-icon" onclick="editProduct('${p.id}')">✎</button><button class="btn-icon" onclick="removeProduct('${p.id}')" style="color:#c0392b;">✕</button></td>
    </tr>`).join('');
}
document.getElementById('prodSearch').addEventListener('input', drawProductsTable);
document.getElementById('prodAddBtn').addEventListener('click', () => openProductModal(null));
function editProduct(id) { openProductModal(PRODUCTS.find(p=>p.id===id)); }
async function removeProduct(id) { if (!confirm('Ngừng kinh doanh sản phẩm này?')) return; await DB.deactivateProduct(id); toast('Đã xoá sản phẩm'); renderProductsPage(); }
function openProductModal(p) {
  const isNew = !p;
  p = p || {sku:'',barcode:'',name:'',category:'',unit:'cái',cost_price:0,sale_price:0,stock_qty:0,min_stock:0};
  openModal(`
    <h3>${isNew?'Thêm sản phẩm':'Sửa sản phẩm'}</h3>
    <div class="form-row"><div class="field"><label>SKU</label><input type="text" id="mSku" value="${esc(p.sku)}"></div>
    <div class="field"><label>Mã vạch</label><input type="text" id="mBarcode" value="${esc(p.barcode||'')}"></div></div>
    <div class="field" style="margin-top:10px;"><label>Tên sản phẩm</label><input type="text" id="mName" value="${esc(p.name)}"></div>
    <div class="form-row" style="margin-top:10px;"><div class="field"><label>Danh mục</label><input type="text" id="mCategory" value="${esc(p.category||'')}"></div>
    <div class="field"><label>Đơn vị</label><input type="text" id="mUnit" value="${esc(p.unit)}"></div></div>
    <div class="form-row" style="margin-top:10px;"><div class="field"><label>Giá vốn</label><input type="number" id="mCost" value="${p.cost_price}"></div>
    <div class="field"><label>Giá bán</label><input type="number" id="mPrice" value="${p.sale_price}"></div></div>
    <div class="form-row" style="margin-top:10px;"><div class="field"><label>Tồn kho${isNew?'':' (chỉnh qua Kho hàng/Kiểm kê)'}</label><input type="number" id="mStock" value="${p.stock_qty}" ${isNew?'':'disabled'}></div>
    <div class="field"><label>Tồn tối thiểu</label><input type="number" id="mMin" value="${p.min_stock}"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Huỷ</button><button class="btn btn-primary" id="mSaveBtn">Lưu</button></div>
  `);
  document.getElementById('mSaveBtn').addEventListener('click', async () => {
    const payload = {
      id: isNew?undefined:p.id, sku: document.getElementById('mSku').value.trim(), barcode: document.getElementById('mBarcode').value.trim(),
      name: document.getElementById('mName').value.trim(), category: document.getElementById('mCategory').value.trim(),
      unit: document.getElementById('mUnit').value.trim() || 'cái', cost_price: Number(document.getElementById('mCost').value)||0,
      sale_price: Number(document.getElementById('mPrice').value)||0, min_stock: Number(document.getElementById('mMin').value)||0,
    };
    if (isNew) payload.stock_qty = Number(document.getElementById('mStock').value)||0;
    if (!payload.name || !payload.sku) { toast('Vui lòng nhập tên và SKU', 'err'); return; }
    try { await DB.upsertProduct(payload); toast('Đã lưu sản phẩm'); closeModal(); renderProductsPage(); }
    catch(e){ toast('Lỗi: '+e.message,'err'); }
  });
}

/* =========================================================================
   ĐƠN HÀNG
   ========================================================================= */
async function renderOrdersPage() { await loadOrders(); }
document.getElementById('ordFilterBtn').addEventListener('click', loadOrders);
async function loadOrders() {
  const from = document.getElementById('ordFrom').value;
  const to = document.getElementById('ordTo').value;
  const fromISO = from ? new Date(from+'T00:00:00').toISOString() : null;
  const toISO = to ? new Date(to+'T23:59:59').toISOString() : null;
  const orders = await DB.listOrders(fromISO, toISO);
  window.__ordersCache = orders;
  document.getElementById('ordTable').innerHTML = orders.map(o => `
    <tr class="clickable" onclick="viewOrder('${o.id}')">
      <td>${esc(o.code)}</td><td>${fmtDT(o.created_at)}</td><td class="num">${o.item_count||''}</td>
      <td>${paymentLabel(o.payment_method)}</td><td class="num">${vnd(o.discount)}</td><td class="num">${vnd(o.total)}</td>
    </tr>`).join('');
  document.getElementById('ordEmpty').style.display = orders.length? 'none':'block';
}
async function viewOrder(id) {
  const order = (window.__ordersCache||[]).find(o=>o.id===id);
  const items = await DB.listOrderItems(id);
  openModal(`
    <h3>Hoá đơn ${esc(order.code)}</h3>
    <div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px;">${fmtDT(order.created_at)} · ${paymentLabel(order.payment_method)}</div>
    <table><thead><tr><th>Sản phẩm</th><th>SL</th><th>Đơn giá</th><th>T.Tiền</th></tr></thead>
      <tbody>${items.map(i=>`<tr><td>${esc(i.product_name)}</td><td class="num">${i.qty}</td><td class="num">${vnd(i.unit_price)}</td><td class="num">${vnd(i.line_total)}</td></tr>`).join('')}</tbody></table>
    <div style="border-top:1px solid var(--line);margin-top:10px;padding-top:10px;">
      <div style="display:flex;justify-content:space-between;"><span>Tạm tính</span><span class="num">${vnd(order.subtotal)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Giảm giá</span><span class="num">${vnd(order.discount)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;"><span>Tổng cộng</span><span class="num">${vnd(order.total)}</span></div>
    </div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Đóng</button></div>
  `);
}

/* =========================================================================
   KHO HÀNG (Nhập / Xuất)
   ========================================================================= */
async function renderStockPage() {
  PRODUCTS = await DB.listProducts();
  document.getElementById('siProduct').innerHTML = PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('');
  document.getElementById('soProduct').innerHTML = PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('');
  const [inRows, outRows] = await Promise.all([DB.listStockIn(), DB.listStockOut()]);
  document.getElementById('siHistory').innerHTML = inRows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${esc(r.product_name||productName(r.product_id))}</td><td class="num">${r.qty}</td><td class="num">${vnd(r.unit_cost)}</td><td class="num">${vnd(r.qty*r.unit_cost)}</td><td>${esc(r.supplier||'—')}</td></tr>`).join('');
  document.getElementById('soHistory').innerHTML = outRows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${esc(r.product_name||productName(r.product_id))}</td><td class="num">${r.qty}</td><td><span class="badge warn">${esc(r.reason)}</span></td></tr>`).join('');
}
function productName(id) { const p = PRODUCTS.find(x=>x.id===id); return p?p.name:'—'; }
document.querySelectorAll('.subtab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  document.getElementById('stockIn').style.display = t.dataset.sub==='in' ? 'block':'none';
  document.getElementById('stockOut').style.display = t.dataset.sub==='out' ? 'block':'none';
}));
document.getElementById('siSubmit').addEventListener('click', async () => {
  const product_id = document.getElementById('siProduct').value;
  const qty = Number(document.getElementById('siQty').value);
  const unit_cost = Number(document.getElementById('siCost').value);
  const supplier = document.getElementById('siSupplier').value.trim();
  if (!product_id || !qty || qty<=0) { toast('Vui lòng chọn sản phẩm và số lượng hợp lệ', 'err'); return; }
  try { await DB.stockIn({product_id, qty, unit_cost, supplier, note:''}); toast('Đã ghi nhận nhập hàng');
    document.getElementById('siQty').value=''; document.getElementById('siCost').value=''; document.getElementById('siSupplier').value='';
    renderStockPage(); } catch(e){ toast('Lỗi: '+e.message,'err'); }
});
document.getElementById('soSubmit').addEventListener('click', async () => {
  const product_id = document.getElementById('soProduct').value;
  const qty = Number(document.getElementById('soQty').value);
  const reason = document.getElementById('soReason').value;
  if (!product_id || !qty || qty<=0) { toast('Vui lòng chọn sản phẩm và số lượng hợp lệ', 'err'); return; }
  try { await DB.stockOut({product_id, qty, reason, note:''}); toast('Đã ghi nhận xuất hàng');
    document.getElementById('soQty').value=''; renderStockPage(); } catch(e){ toast('Lỗi: '+e.message,'err'); }
});

/* =========================================================================
   KIỂM KÊ
   ========================================================================= */
let LAST_STOCK_TAKE_ID = null;
async function renderStockTakePage() {
  PRODUCTS = await DB.listProducts();
  document.getElementById('stTable').innerHTML = PRODUCTS.map(p => `
    <tr data-id="${p.id}"><td>${esc(p.name)}</td><td class="num">${p.stock_qty}</td>
      <td><input type="number" class="st-actual" style="width:90px;" data-system="${p.stock_qty}" placeholder="${p.stock_qty}"></td>
      <td class="num st-diff">0</td></tr>`).join('');
  document.querySelectorAll('.st-actual').forEach(inp => inp.addEventListener('input', e => {
    const row = e.target.closest('tr'); const sys = Number(e.target.dataset.system);
    const act = e.target.value===''?sys:Number(e.target.value); const diff = act-sys;
    const cell = row.querySelector('.st-diff'); cell.textContent = (diff>0?'+':'')+diff;
    cell.style.color = diff===0?'var(--ink-soft)':diff>0?'var(--thu)':'#c0392b';
  }));
  const rows = await DB.listStockTakes();
  document.getElementById('stHistory').innerHTML = rows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td class="num">${r.count}</td><td class="num">${r.diffCount}</td><td>${esc(r.note||'—')}</td></tr>`).join('');
}
document.getElementById('stFillBtn').addEventListener('click', () => document.querySelectorAll('.st-actual').forEach(inp => { inp.value = inp.dataset.system; inp.dispatchEvent(new Event('input')); }));
document.getElementById('stSaveBtn').addEventListener('click', async () => {
  const items = [...document.querySelectorAll('#stTable tr')].map(row => {
    const sys = Number(row.querySelector('.st-actual').dataset.system);
    const val = row.querySelector('.st-actual').value;
    const actual = val===''?sys:Number(val);
    return {product_id: row.dataset.id, system_qty: sys, actual_qty: actual, diff: actual-sys};
  });
  try { LAST_STOCK_TAKE_ID = await DB.saveStockTake(items, 'Kiểm kê '+new Date().toLocaleDateString('vi-VN')); toast('Đã lưu phiếu kiểm kê'); renderStockTakePage(); }
  catch(e){ toast('Lỗi: '+e.message,'err'); }
});
document.getElementById('stApplyBtn').addEventListener('click', async () => {
  if (!LAST_STOCK_TAKE_ID) { toast('Hãy lưu phiếu kiểm kê trước', 'err'); return; }
  try { await DB.applyStockTake(LAST_STOCK_TAKE_ID); toast('Đã cập nhật tồn kho'); LAST_STOCK_TAKE_ID=null; renderStockTakePage(); }
  catch(e){ toast('Lỗi: '+e.message,'err'); }
});

/* =========================================================================
   CA LÀM VIỆC
   ========================================================================= */
async function renderShiftsPage() {
  const rows = await DB.listShifts();
  document.getElementById('shiftTable').innerHTML = rows.map(r => `<tr>
    <td>${esc(r.cashier_name)}</td><td>${fmtDT(r.opened_at)}</td><td>${r.closed_at?fmtDT(r.closed_at):'—'}</td>
    <td class="num">${vnd(r.opening_cash)}</td><td class="num">${vnd(r.total_sales)}</td>
    <td class="num">${r.cash_diff!=null?vnd(r.cash_diff):'—'}</td>
    <td>${r.status==='open'?'<span class="badge ok">Đang mở</span>':'<span class="badge neu">Đã đóng</span>'}</td>
  </tr>`).join('');
}

/* =========================================================================
   THỐNG KÊ
   ========================================================================= */
let reportChart;
async function renderReportsPage() {
  const sel = document.getElementById('reportYear');
  if (!sel.options.length) { const now = new Date().getFullYear(); [now,now-1,now-2].forEach(y=>sel.appendChild(new Option(y,y))); }
  await loadReport();
}
document.getElementById('reportFilterBtn').addEventListener('click', loadReport);
async function loadReport() {
  const year = Number(document.getElementById('reportYear').value);
  const orders = await DB.listOrders(`${year}-01-01`);
  const monthly = Array(12).fill(0);
  orders.forEach(o => { const d = new Date(o.created_at); if (d.getFullYear()===year) monthly[d.getMonth()] += Number(o.total); });
  if (reportChart) reportChart.destroy();
  reportChart = new Chart(document.getElementById('reportChart').getContext('2d'), {
    type:'line', data:{labels:['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'],
      datasets:[{label:'Doanh thu', data:monthly.map(v=>v/1000000), borderColor:'#7c5cff', backgroundColor:'rgba(124,92,255,.16)', fill:true, tension:.35, pointRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:i=>`${i.formattedValue} triệu ₫`}}},
      scales:{y:{title:{display:true,text:'Triệu đồng',color:'#6b7086'},grid:{color:'#eef0f7'}}, x:{grid:{display:false}}}}
  });
  const salesByProduct = {};
  for (const o of orders) {
    if (new Date(o.created_at).getFullYear() !== year) continue;
    const items = await DB.listOrderItems(o.id);
    items.forEach(it => { if (!salesByProduct[it.product_name]) salesByProduct[it.product_name]={qty:0,revenue:0}; salesByProduct[it.product_name].qty+=Number(it.qty); salesByProduct[it.product_name].revenue+=Number(it.line_total); });
  }
  const top = Object.entries(salesByProduct).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,10);
  document.getElementById('topProductsTable').innerHTML = top.map(([name,v],i)=>`<tr><td>${i+1}</td><td>${esc(name)}</td><td class="num">${v.qty}</td><td class="num">${vnd(v.revenue)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Chưa có dữ liệu</td></tr>';
}

/* ---------------------------------------------------------------------
   INIT
   --------------------------------------------------------------------- */
document.getElementById('loginUsername').focus();

window.switchTab = switchTab;
window.editEmployee = editEmployee;
window.resetEmployeePassword = resetEmployeePassword;
window.editProduct = editProduct;
window.removeProduct = removeProduct;
window.viewOrder = viewOrder;
window.closeModal = closeModal;

})();
