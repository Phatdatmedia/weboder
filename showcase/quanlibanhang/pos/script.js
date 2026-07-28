/* Bọc toàn bộ code trong một hàm riêng (IIFE) để tránh lỗi
   "Identifier ... has already been declared" khi dùng các công cụ
   live-reload (VS Code Live Preview, Live Server...) nạp lại script
   nhiều lần vào cùng một trang mà không tải lại toàn bộ trang. */
(function(){
/* =========================================================================
   1) SUPABASE CONFIG — điền thông tin project của bạn vào đây
   Lấy tại: Supabase Dashboard → Project Settings → API
   ========================================================================= */
const SUPABASE_URL = 'https://tmdxcuzwkydgkdkpucuw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtZHhjdXp3a3lkZ2tka3B1Y3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMzU3ODgsImV4cCI6MjA5ODkxMTc4OH0.uAbJOwLspA15KKo1cI1kZNwxICRa_jGRq3Fmyx50IaY';

/* =========================================================================
   2) SQL SCHEMA — chạy trong Supabase SQL Editor trước khi dùng app này.
   (Toàn bộ script cũng được gửi kèm trong file schema.sql đi cùng)
   ========================================================================= */

let supabase = null;
let DEMO = true;
try {
  if (!SUPABASE_URL.includes('YOUR-PROJECT-REF') && !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE')) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    DEMO = false;
  }
} catch (e) { DEMO = true; }

/* ---------------------------------------------------------------------
   In-memory demo store (used automatically until Supabase is configured)
   --------------------------------------------------------------------- */
const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
});
const DEMO_DB = {
  products: [
    {id: uid(), sku:'SP001', barcode:'8931234560012', name:'Nước suối Lavie 500ml', category:'Nước uống', unit:'chai', cost_price:4000, sale_price:6000, stock_qty:120, min_stock:20, is_active:true},
    {id: uid(), sku:'SP002', barcode:'8931234560029', name:'Coca-Cola lon 330ml', category:'Nước uống', unit:'lon', cost_price:7500, sale_price:11000, stock_qty:80, min_stock:24, is_active:true},
    {id: uid(), sku:'SP003', barcode:'8931234560036', name:'Bánh mì sandwich', category:'Thực phẩm', unit:'cái', cost_price:12000, sale_price:20000, stock_qty:15, min_stock:10, is_active:true},
    {id: uid(), sku:'SP004', barcode:'8931234560043', name:'Mì ly Hảo Hảo', category:'Thực phẩm', unit:'ly', cost_price:6000, sale_price:9000, stock_qty:8, min_stock:15, is_active:true},
    {id: uid(), sku:'SP005', barcode:'8931234560050', name:'Cà phê sữa đá chai', category:'Nước uống', unit:'chai', cost_price:9000, sale_price:15000, stock_qty:40, min_stock:10, is_active:true},
    {id: uid(), sku:'SP006', barcode:'8931234560067', name:'Khăn giấy Pulppy', category:'Tiêu dùng', unit:'gói', cost_price:8000, sale_price:13000, stock_qty:25, min_stock:10, is_active:true},
    {id: uid(), sku:'SP007', barcode:'8931234560074', name:'Kẹo Alpenliebe', category:'Bánh kẹo', unit:'gói', cost_price:3000, sale_price:5000, stock_qty:60, min_stock:20, is_active:true},
    {id: uid(), sku:'SP008', barcode:'8931234560081', name:'Sữa tươi Vinamilk 180ml', category:'Nước uống', unit:'hộp', cost_price:5500, sale_price:8500, stock_qty:5, min_stock:20, is_active:true},
  ],
  orders: [], order_items: [], stock_in: [], stock_out: [], stock_takes: [], stock_take_items: [], shifts: [],
  employees: [
    {id: uid(), username:'admin', password:'admin123', full_name:'Quản trị viên', role:'admin', is_active:true, created_at:new Date().toISOString()},
    {id: uid(), username:'cashier01', password:'123456', full_name:'Hoài Hải', role:'cashier', is_active:true, created_at:new Date().toISOString()},
  ]
};

/* ---------------------------------------------------------------------
   Thin data-access layer: identical function signatures whether talking
   to Supabase or the in-memory demo store, so UI code never branches.
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
  async listProducts() {
    if (DEMO) return DEMO_DB.products.filter(p=>p.is_active);
    const {data, error} = await supabase.from('products').select('*').eq('is_active', true).order('name');
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
  async getOpenShift() {
    if (DEMO) return DEMO_DB.shifts.find(s=>s.status==='open') || null;
    const {data, error} = await supabase.from('shifts').select('*').eq('status','open').order('opened_at',{ascending:false}).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  },
  async openShift(cashier, openingCash) {
    if (DEMO) {
      const s = {id:uid(), cashier_name:cashier, opening_cash:openingCash, total_sales:0, total_cash_sales:0, total_orders:0, status:'open', opened_at:new Date().toISOString(), closed_at:null};
      DEMO_DB.shifts.push(s); return s;
    }
    const {data, error} = await supabase.from('shifts').insert({cashier_name:cashier, opening_cash:openingCash}).select().single();
    if (error) throw error;
    return data;
  },
  async closeShift(id, closingCash, expectedCash) {
    const diff = closingCash - expectedCash;
    if (DEMO) {
      const s = DEMO_DB.shifts.find(x=>x.id===id);
      Object.assign(s, {closing_cash:closingCash, expected_cash:expectedCash, cash_diff:diff, status:'closed', closed_at:new Date().toISOString()});
      return s;
    }
    const {data, error} = await supabase.from('shifts').update({closing_cash:closingCash, expected_cash:expectedCash, cash_diff:diff, status:'closed', closed_at:new Date().toISOString()}).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async listShifts() {
    if (DEMO) return [...DEMO_DB.shifts].sort((a,b)=> new Date(b.opened_at)-new Date(a.opened_at));
    const {data, error} = await supabase.from('shifts').select('*').order('opened_at',{ascending:false}).limit(30);
    if (error) throw error;
    return data;
  },
  async createOrder(order, items) {
    if (DEMO) {
      order.id = uid(); order.created_at = new Date().toISOString(); order.status='completed';
      DEMO_DB.orders.push(order);
      items.forEach(it => {
        DEMO_DB.order_items.push({...it, id:uid(), order_id:order.id});
        const p = DEMO_DB.products.find(x=>x.id===it.product_id);
        if (p) p.stock_qty -= it.qty;
      });
      const s = DEMO_DB.shifts.find(x=>x.id===order.shift_id);
      if (s) { s.total_sales += order.total; s.total_orders += 1; if (order.payment_method==='cash') s.total_cash_sales += order.total; }
      return order;
    }
    const {data, error} = await supabase.rpc('fn_create_order', {
      p_shift_id: order.shift_id, p_code: order.code, p_items: items,
      p_subtotal: order.subtotal, p_discount: order.discount, p_total: order.total,
      p_payment_method: order.payment_method, p_cash_received: order.cash_received, p_cash_change: order.cash_change
    });
    if (error) throw error;
    order.id = data;
    return order;
  },
  async listOrders(sinceISO, limit=200) {
    if (DEMO) return DEMO_DB.orders.filter(o => !sinceISO || o.created_at >= sinceISO).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0, limit);
    let q = supabase.from('orders').select('*').order('created_at',{ascending:false}).limit(limit);
    if (sinceISO) q = q.gte('created_at', sinceISO);
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
  async stockIn(entry) {
    if (DEMO) {
      DEMO_DB.stock_in.push({...entry, id:uid(), created_at:new Date().toISOString()});
      const p = DEMO_DB.products.find(x=>x.id===entry.product_id);
      if (p) p.stock_qty += entry.qty;
      return;
    }
    const {error} = await supabase.rpc('fn_stock_in', {p_product_id:entry.product_id, p_qty:entry.qty, p_unit_cost:entry.unit_cost, p_supplier:entry.supplier, p_note:entry.note});
    if (error) throw error;
  },
  async listStockIn(limit=50) {
    if (DEMO) return [...DEMO_DB.stock_in].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
    const {data, error} = await supabase.from('stock_in').select('*, products(name)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(r=>({...r, product_name:r.products?.name}));
  },
  async stockOut(entry) {
    if (DEMO) {
      DEMO_DB.stock_out.push({...entry, id:uid(), created_at:new Date().toISOString()});
      const p = DEMO_DB.products.find(x=>x.id===entry.product_id);
      if (p) p.stock_qty = Math.max(0, p.stock_qty - entry.qty);
      return;
    }
    const {error} = await supabase.rpc('fn_stock_out', {p_product_id:entry.product_id, p_qty:entry.qty, p_reason:entry.reason, p_note:entry.note});
    if (error) throw error;
  },
  async listStockOut(limit=50) {
    if (DEMO) return [...DEMO_DB.stock_out].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit);
    const {data, error} = await supabase.from('stock_out').select('*, products(name)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(r=>({...r, product_name:r.products?.name}));
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
        const p = DEMO_DB.products.find(x=>x.id===i.product_id);
        if (p) p.stock_qty = i.actual_qty;
      });
      return;
    }
    const {error} = await supabase.rpc('fn_apply_stock_take', {p_stock_take_id: stockTakeId});
    if (error) throw error;
  },
  async listStockTakes(limit=20) {
    if (DEMO) {
      return [...DEMO_DB.stock_takes].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,limit).map(st=>{
        const items = DEMO_DB.stock_take_items.filter(i=>i.stock_take_id===st.id);
        return {...st, count:items.length, diffCount: items.filter(i=>i.diff!==0).length};
      });
    }
    const {data, error} = await supabase.from('stock_takes').select('*, stock_take_items(diff)').order('created_at',{ascending:false}).limit(limit);
    if (error) throw error;
    return data.map(st=>({...st, count: st.stock_take_items.length, diffCount: st.stock_take_items.filter(i=>i.diff!==0).length}));
  }
};

/* ---------------------------------------------------------------------
   Utilities
   --------------------------------------------------------------------- */
const vnd = n => new Intl.NumberFormat('vi-VN').format(Math.round(n||0)) + ' ₫';
const fmtDT = iso => new Date(iso).toLocaleString('vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
const fmtT = iso => new Date(iso).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
function toast(msg, kind='ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind==='ok'?'ok':kind==='err'?'err':'');
  el.textContent = msg;
  document.getElementById('toastWrap').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}
function openModal(html) {
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target.id==='modalOverlay') closeModal(); });

/* ---------------------------------------------------------------------
   App state
   --------------------------------------------------------------------- */
let PRODUCTS = [];
let CART = [];       // {product_id, name, price, qty}
let CURRENT_SHIFT = null;
let CURRENT_EMPLOYEE = null; // {id, full_name, role}

/* ---------------------------------------------------------------------
   Navigation
   --------------------------------------------------------------------- */
const PAGE_TITLES = {dashboard:'Tổng quan', pos:'Bán hàng', stockin:'Nhập hàng', stockout:'Xuất hàng', stocktake:'Kiểm kê', shift:'Chốt ca', products:'Sản phẩm', reports:'Thống kê'};
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab===tab));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id==='page-'+tab));
  document.getElementById('pageTitle').textContent = PAGE_TITLES[tab] || '';
  if (tab==='dashboard') renderDashboard();
  if (tab==='pos') renderPOS();
  if (tab==='stockin') renderStockInPage();
  if (tab==='stockout') renderStockOutPage();
  if (tab==='stocktake') renderStockTakePage();
  if (tab==='shift') renderShiftPage();
  if (tab==='products') renderProductsPage();
  if (tab==='reports') renderReportsPage();
}
document.getElementById('navMenu').addEventListener('click', e => {
  const item = e.target.closest('.nav-item'); if (!item) return;
  switchTab(item.dataset.tab);
});
document.getElementById('logoutBtn').addEventListener('click', () => {
  CURRENT_EMPLOYEE = null;
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginError').classList.remove('show');
});

function applyRoleVisibility() {
  const isAdmin = CURRENT_EMPLOYEE && CURRENT_EMPLOYEE.role === 'admin';
  document.querySelectorAll('[data-role="admin"]').forEach(el => { el.style.display = isAdmin ? '' : 'none'; });
}

async function doLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.remove('show');
  if (!username || !password) { errBox.textContent = 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu'; errBox.classList.add('show'); return; }
  const btn = document.getElementById('loginBtn');
  btn.setAttribute('disabled',''); btn.textContent = 'Đang đăng nhập…';
  try {
    const emp = await DB.login(username, password);
    if (!emp) { errBox.textContent = 'Sai tên đăng nhập hoặc mật khẩu, hoặc tài khoản đã bị khoá'; errBox.classList.add('show'); return; }
    CURRENT_EMPLOYEE = emp;
    document.getElementById('whoName').textContent = emp.full_name;
    document.getElementById('whoAvatar').src = 'https://api.dicebear.com/7.x/notionists/svg?seed=' + encodeURIComponent(emp.full_name);
    document.getElementById('shiftCashier').value = emp.full_name;
    applyRoleVisibility();
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appRoot').style.display = 'flex';
    document.getElementById('connDot').classList.toggle('live', !DEMO);
    document.getElementById('connText').textContent = DEMO ? 'Chưa cấu hình Supabase — chạy dữ liệu mẫu' : 'Đã kết nối Supabase';
    CURRENT_SHIFT = await DB.getOpenShift();
    updateShiftPill();
    switchTab('dashboard');
  } catch (e) {
    console.error(e); errBox.textContent = 'Lỗi đăng nhập: ' + e.message; errBox.classList.add('show');
  } finally {
    btn.removeAttribute('disabled'); btn.textContent = 'Đăng nhập';
  }
}
document.getElementById('loginBtn').addEventListener('click', doLogin);

/* =========================================================================
   DASHBOARD
   ========================================================================= */
async function renderDashboard() {
  const [products, orders] = await Promise.all([DB.listProducts(), DB.listOrders(startOfTodayISO())]);
  PRODUCTS = products;
  const revenue = orders.reduce((a,o)=>a+Number(o.total),0);
  document.getElementById('dashRevenue').textContent = vnd(revenue);
  document.getElementById('dashOrders').textContent = orders.length;
  const stockValue = products.reduce((a,p)=>a+p.cost_price*p.stock_qty,0);
  document.getElementById('dashStockValue').textContent = vnd(stockValue);
  const low = products.filter(p=>p.stock_qty <= p.min_stock);
  document.getElementById('dashLowStock').textContent = low.length;

  const lowBody = document.getElementById('dashLowStockTable');
  lowBody.innerHTML = low.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.stock_qty} ${esc(p.unit)}</td><td class="num">${p.min_stock}</td><td>${p.stock_qty===0?'<span class="badge danger">Hết hàng</span>':'<span class="badge warn">Sắp hết</span>'}</td></tr>`).join('');
  document.getElementById('dashLowStockEmpty').style.display = low.length? 'none':'block';

  const recent = orders.slice(0,10);
  const recBody = document.getElementById('dashRecentOrders');
  recBody.innerHTML = recent.map(o => `<tr><td>${esc(o.code)}</td><td>${fmtT(o.created_at)}</td><td class="num">${o.item_count||''}</td><td>${paymentLabel(o.payment_method)}</td><td class="num">${vnd(o.total)}</td></tr>`).join('');
  document.getElementById('dashRecentEmpty').style.display = recent.length? 'none':'block';
}
function startOfTodayISO() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function paymentLabel(m) { return m==='cash'?'Tiền mặt':m==='transfer'?'Chuyển khoản':'Thẻ/Ví'; }
function esc(s){ return String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* =========================================================================
   POS / BÁN HÀNG
   ========================================================================= */
async function renderPOS() {
  CURRENT_SHIFT = await DB.getOpenShift();
  document.getElementById('posNoShift').style.display = CURRENT_SHIFT ? 'none':'block';
  document.getElementById('posWorkspace').style.display = CURRENT_SHIFT ? 'flex':'none';
  if (!CURRENT_SHIFT) return;
  PRODUCTS = await DB.listProducts();
  const cats = [...new Set(PRODUCTS.map(p=>p.category).filter(Boolean))];
  const catSel = document.getElementById('posCategory');
  catSel.innerHTML = '<option value="">Tất cả</option>' + cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  renderPOSGrid();
  renderCart();
}
function renderPOSGrid() {
  const q = document.getElementById('posSearch').value.trim().toLowerCase();
  const cat = document.getElementById('posCategory').value;
  const list = PRODUCTS.filter(p => {
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.barcode||'').includes(q);
    const matchC = !cat || p.category===cat;
    return matchQ && matchC;
  });
  const grid = document.getElementById('posGrid');
  grid.innerHTML = list.map(p => `
    <div class="pos-card" data-id="${p.id}" style="border:1px solid var(--line);border-radius:12px;padding:10px;cursor:pointer;background:#fbfbfe;transition:.12s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--line)'">
      <div style="font-weight:700;font-size:12.5px;line-height:1.3;margin-bottom:6px;min-height:32px;">${esc(p.name)}</div>
      <div style="font-size:11px;color:var(--ink-soft);margin-bottom:4px;">${p.stock_qty} ${esc(p.unit)} còn lại</div>
      <div class="num" style="font-weight:800;color:var(--accent-deep);">${vnd(p.sale_price)}</div>
    </div>`).join('');
  document.getElementById('posGridEmpty').style.display = list.length? 'none':'block';
  grid.querySelectorAll('.pos-card').forEach(card => card.addEventListener('click', () => addToCart(card.dataset.id)));
}
document.getElementById('posSearch').addEventListener('input', renderPOSGrid);
document.getElementById('posCategory').addEventListener('change', renderPOSGrid);
document.getElementById('posSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim();
  const exact = PRODUCTS.find(p => p.barcode===q || p.sku.toLowerCase()===q.toLowerCase());
  if (exact) { addToCart(exact.id); e.target.value=''; renderPOSGrid(); }
});

function addToCart(productId) {
  const p = PRODUCTS.find(x=>x.id===productId); if (!p) return;
  if (p.stock_qty <= 0) { toast(`${p.name} đã hết hàng`, 'err'); return; }
  const line = CART.find(c=>c.product_id===productId);
  if (line) {
    if (line.qty >= p.stock_qty) { toast('Không đủ tồn kho', 'err'); return; }
    line.qty += 1;
  } else {
    CART.push({product_id:p.id, name:p.name, price:p.sale_price, qty:1, unit:p.unit, maxQty:p.stock_qty});
  }
  renderCart();
}
function renderCart() {
  const wrap = document.getElementById('cartItems');
  wrap.innerHTML = CART.map((c,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--line);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(c.name)}</div>
        <div class="num" style="font-size:11.5px;color:var(--ink-soft);">${vnd(c.price)} / ${esc(c.unit||'')}</div>
      </div>
      <button class="btn-icon" onclick="changeQty(${i},-1)">−</button>
      <span class="num" style="min-width:22px;text-align:center;font-weight:700;">${c.qty}</span>
      <button class="btn-icon" onclick="changeQty(${i},1)">+</button>
      <button class="btn-icon" onclick="removeFromCart(${i})" style="color:var(--accent-deep);">✕</button>
    </div>`).join('');
  document.getElementById('cartEmpty').style.display = CART.length? 'none':'block';
  recalcTotals();
}
function changeQty(i, delta) {
  const c = CART[i]; c.qty += delta;
  if (c.qty > (c.maxQty||Infinity)) { c.qty -= delta; toast('Không đủ tồn kho', 'err'); return; }
  if (c.qty <= 0) CART.splice(i,1);
  renderCart();
}
function removeFromCart(i) { CART.splice(i,1); renderCart(); }
function cartSubtotal() { return CART.reduce((a,c)=>a+c.price*c.qty,0); }
function recalcTotals() {
  const sub = cartSubtotal();
  const discount = Number(document.getElementById('cartDiscount').value)||0;
  const total = Math.max(0, sub - discount);
  document.getElementById('cartSubtotal').textContent = vnd(sub);
  document.getElementById('cartTotal').textContent = vnd(total);
  const method = document.getElementById('paymentMethod').value;
  document.getElementById('cashReceivedWrap').style.display = method==='cash' ? 'flex':'none';
  const received = Number(document.getElementById('cashReceived').value)||0;
  document.getElementById('cashChange').textContent = vnd(method==='cash' ? Math.max(0, received-total) : 0);
}
document.getElementById('cartDiscount').addEventListener('input', recalcTotals);
document.getElementById('paymentMethod').addEventListener('change', recalcTotals);
document.getElementById('cashReceived').addEventListener('input', recalcTotals);
document.getElementById('clearCartBtn').addEventListener('click', () => { CART=[]; renderCart(); });

document.getElementById('checkoutBtn').addEventListener('click', async () => {
  if (!CART.length) { toast('Giỏ hàng đang trống', 'err'); return; }
  const sub = cartSubtotal();
  const discount = Number(document.getElementById('cartDiscount').value)||0;
  const total = Math.max(0, sub - discount);
  const method = document.getElementById('paymentMethod').value;
  const received = method==='cash' ? (Number(document.getElementById('cashReceived').value)||0) : total;
  if (method==='cash' && received < total) { toast('Số tiền khách đưa không đủ', 'err'); return; }
  const change = method==='cash' ? received-total : 0;
  const code = 'HD' + Date.now().toString().slice(-8);

  const order = {code, shift_id:CURRENT_SHIFT.id, subtotal:sub, discount, total, payment_method:method, cash_received:received, cash_change:change};
  const items = CART.map(c => ({product_id:c.product_id, product_name:c.name, unit_price:c.price, qty:c.qty, line_total:c.price*c.qty}));

  try {
    document.getElementById('checkoutBtn').setAttribute('disabled','');
    const savedOrder = await DB.createOrder(order, items);
    order.created_at = savedOrder.created_at || new Date().toISOString();
    order.id = savedOrder.id;
    printReceipt(order, items);
    toast('Thanh toán thành công — đã in hoá đơn ' + code);
    CART = [];
    document.getElementById('cartDiscount').value = 0;
    document.getElementById('cashReceived').value = '';
    renderCart();
    CURRENT_SHIFT = await DB.getOpenShift();
    PRODUCTS = await DB.listProducts();
    renderPOSGrid();
  } catch (e) {
    console.error(e); toast('Lỗi khi thanh toán: ' + e.message, 'err');
  } finally {
    document.getElementById('checkoutBtn').removeAttribute('disabled');
  }
});

function printReceipt(order, items) {
  const html = `
    <div style="font-family:'DM Mono',monospace;width:280px;margin:0 auto;font-size:12px;color:#000;">
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-weight:800;font-size:15px;">NINRES POS</div>
        <div>123 Đường ABC, Quận 1, TP.HCM</div>
        <div>Hotline: 0909 000 000</div>
      </div>
      <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:6px 0;margin-bottom:8px;">
        <div>Mã HĐ: ${esc(order.code)}</div>
        <div>Thời gian: ${fmtDT(order.created_at)}</div>
        <div>Thu ngân: ${esc(CURRENT_SHIFT?.cashier_name||'')}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;">Món</th><th style="text-align:center;">SL</th><th style="text-align:right;">T.Tiền</th></tr></thead>
        <tbody>
          ${items.map(i=>`<tr><td>${esc(i.product_name)}</td><td style="text-align:center;">${i.qty}</td><td style="text-align:right;">${new Intl.NumberFormat('vi-VN').format(i.line_total)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div style="border-top:1px dashed #000;margin-top:8px;padding-top:8px;">
        <div style="display:flex;justify-content:space-between;"><span>Tạm tính</span><span>${new Intl.NumberFormat('vi-VN').format(order.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Giảm giá</span><span>${new Intl.NumberFormat('vi-VN').format(order.discount)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;"><span>TỔNG CỘNG</span><span>${new Intl.NumberFormat('vi-VN').format(order.total)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>${paymentLabel(order.payment_method)}</span><span>${new Intl.NumberFormat('vi-VN').format(order.cash_received)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Tiền thối</span><span>${new Intl.NumberFormat('vi-VN').format(order.cash_change)}</span></div>
      </div>
      <div style="text-align:center;margin-top:12px;">Cảm ơn quý khách — Hẹn gặp lại!</div>
    </div>`;
  const w = window.open('', '_blank', 'width=360,height=640');
  w.document.write(`<html><head><title>${esc(order.code)}</title></head><body>${html}<script>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  w.document.close();
}

/* =========================================================================
   NHẬP HÀNG
   ========================================================================= */
async function renderStockInPage() {
  PRODUCTS = await DB.listProducts();
  document.getElementById('siProduct').innerHTML = PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('');
  const rows = await DB.listStockIn();
  const body = document.getElementById('siHistory');
  body.innerHTML = rows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${esc(r.product_name || productName(r.product_id))}</td><td class="num">${r.qty}</td><td class="num">${vnd(r.unit_cost)}</td><td class="num">${vnd(r.qty*r.unit_cost)}</td><td>${esc(r.supplier||'—')}</td></tr>`).join('');
  document.getElementById('siEmpty').style.display = rows.length? 'none':'block';
}
function productName(id) { const p = PRODUCTS.find(x=>x.id===id); return p ? p.name : '—'; }
document.getElementById('siSubmit').addEventListener('click', async () => {
  const product_id = document.getElementById('siProduct').value;
  const qty = Number(document.getElementById('siQty').value);
  const unit_cost = Number(document.getElementById('siCost').value);
  const supplier = document.getElementById('siSupplier').value.trim();
  const note = document.getElementById('siNote').value.trim();
  if (!product_id || !qty || qty<=0) { toast('Vui lòng chọn sản phẩm và số lượng hợp lệ', 'err'); return; }
  try {
    await DB.stockIn({product_id, qty, unit_cost, supplier, note});
    toast('Đã ghi nhận nhập hàng');
    document.getElementById('siQty').value=''; document.getElementById('siCost').value=''; document.getElementById('siSupplier').value=''; document.getElementById('siNote').value='';
    renderStockInPage();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});

/* =========================================================================
   XUẤT HÀNG
   ========================================================================= */
async function renderStockOutPage() {
  PRODUCTS = await DB.listProducts();
  document.getElementById('soProduct').innerHTML = PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.name)} (${esc(p.sku)})</option>`).join('');
  const rows = await DB.listStockOut();
  const body = document.getElementById('soHistory');
  body.innerHTML = rows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td>${esc(r.product_name || productName(r.product_id))}</td><td class="num">${r.qty}</td><td><span class="badge warn">${esc(r.reason)}</span></td><td>${esc(r.note||'—')}</td></tr>`).join('');
  document.getElementById('soEmpty').style.display = rows.length? 'none':'block';
}
document.getElementById('soSubmit').addEventListener('click', async () => {
  const product_id = document.getElementById('soProduct').value;
  const qty = Number(document.getElementById('soQty').value);
  const reason = document.getElementById('soReason').value;
  const note = document.getElementById('soNote').value.trim();
  if (!product_id || !qty || qty<=0) { toast('Vui lòng chọn sản phẩm và số lượng hợp lệ', 'err'); return; }
  try {
    await DB.stockOut({product_id, qty, reason, note});
    toast('Đã ghi nhận xuất hàng');
    document.getElementById('soQty').value=''; document.getElementById('soNote').value='';
    renderStockOutPage();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});

/* =========================================================================
   KIỂM KÊ
   ========================================================================= */
async function renderStockTakePage() {
  PRODUCTS = await DB.listProducts();
  const body = document.getElementById('stTable');
  body.innerHTML = PRODUCTS.map(p => `
    <tr data-id="${p.id}">
      <td>${esc(p.name)}</td>
      <td class="num">${p.stock_qty}</td>
      <td><input type="number" class="st-actual" style="width:90px;" data-system="${p.stock_qty}" placeholder="${p.stock_qty}"></td>
      <td class="num st-diff">0</td>
    </tr>`).join('');
  body.querySelectorAll('.st-actual').forEach(inp => inp.addEventListener('input', e => {
    const row = e.target.closest('tr');
    const sys = Number(e.target.dataset.system);
    const act = e.target.value==='' ? sys : Number(e.target.value);
    const diff = act - sys;
    const cell = row.querySelector('.st-diff');
    cell.textContent = (diff>0?'+':'') + diff;
    cell.style.color = diff===0 ? 'var(--ink-soft)' : diff>0 ? 'var(--thu)' : 'var(--accent-deep)';
  }));
  await renderStockTakeHistory();
}
async function renderStockTakeHistory() {
  const rows = await DB.listStockTakes();
  const body = document.getElementById('stHistory');
  body.innerHTML = rows.map(r => `<tr><td>${fmtDT(r.created_at)}</td><td class="num">${r.count}</td><td class="num">${r.diffCount}</td><td>${esc(r.note||'—')}</td></tr>`).join('');
  document.getElementById('stHistoryEmpty').style.display = rows.length? 'none':'block';
}
document.getElementById('stFillBtn').addEventListener('click', () => {
  document.querySelectorAll('.st-actual').forEach(inp => { inp.value = inp.dataset.system; inp.dispatchEvent(new Event('input')); });
});
function collectStockTakeItems() {
  return [...document.querySelectorAll('#stTable tr')].map(row => {
    const id = row.dataset.id;
    const sys = Number(row.querySelector('.st-actual').dataset.system);
    const val = row.querySelector('.st-actual').value;
    const actual = val==='' ? sys : Number(val);
    return {product_id:id, system_qty:sys, actual_qty:actual, diff:actual-sys};
  });
}
let LAST_STOCK_TAKE_ID = null;
document.getElementById('stSaveBtn').addEventListener('click', async () => {
  const items = collectStockTakeItems();
  try {
    LAST_STOCK_TAKE_ID = await DB.saveStockTake(items, 'Kiểm kê ' + new Date().toLocaleDateString('vi-VN'));
    toast('Đã lưu phiếu kiểm kê. Bấm "Áp dụng điều chỉnh" để cập nhật tồn kho.');
    renderStockTakeHistory();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});
document.getElementById('stApplyBtn').addEventListener('click', async () => {
  if (!LAST_STOCK_TAKE_ID) { toast('Hãy lưu phiếu kiểm kê trước khi áp dụng', 'err'); return; }
  try {
    await DB.applyStockTake(LAST_STOCK_TAKE_ID);
    toast('Đã cập nhật tồn kho theo kiểm kê thực tế');
    LAST_STOCK_TAKE_ID = null;
    renderStockTakePage();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});

/* =========================================================================
   CHỐT CA
   ========================================================================= */
async function renderShiftPage() {
  CURRENT_SHIFT = await DB.getOpenShift();
  document.getElementById('shiftOpenForm').style.display = CURRENT_SHIFT ? 'none':'block';
  document.getElementById('shiftActiveView').style.display = CURRENT_SHIFT ? 'block':'none';
  updateShiftPill();
  if (CURRENT_SHIFT) {
    document.getElementById('scCashier').textContent = CURRENT_SHIFT.cashier_name;
    document.getElementById('scOpenedAt').textContent = fmtDT(CURRENT_SHIFT.opened_at);
    document.getElementById('scSales').textContent = vnd(CURRENT_SHIFT.total_sales);
    document.getElementById('scOrders').textContent = CURRENT_SHIFT.total_orders;
    document.getElementById('scOpeningCash').textContent = vnd(CURRENT_SHIFT.opening_cash);
    document.getElementById('scCashSales').textContent = vnd(CURRENT_SHIFT.total_cash_sales);
    const expected = Number(CURRENT_SHIFT.opening_cash) + Number(CURRENT_SHIFT.total_cash_sales);
    document.getElementById('scExpectedCash').textContent = vnd(expected);
    recalcShiftDiff();
  }
  await renderShiftHistory();
}
function updateShiftPill() {
  const pill = document.getElementById('shiftPill');
  const text = document.getElementById('shiftPillText');
  if (CURRENT_SHIFT) { pill.classList.add('open'); text.textContent = 'Đang mở · ' + CURRENT_SHIFT.cashier_name; }
  else { pill.classList.remove('open'); text.textContent = 'Chưa mở ca'; }
}
function recalcShiftDiff() {
  if (!CURRENT_SHIFT) return;
  const expected = Number(CURRENT_SHIFT.opening_cash) + Number(CURRENT_SHIFT.total_cash_sales);
  const actual = Number(document.getElementById('shiftClosingCash').value)||0;
  document.getElementById('scDiff').textContent = vnd(actual-expected);
}
document.getElementById('shiftClosingCash').addEventListener('input', recalcShiftDiff);

document.getElementById('shiftOpenBtn').addEventListener('click', async () => {
  const cashier = document.getElementById('shiftCashier').value.trim();
  const opening = Number(document.getElementById('shiftOpeningCash').value)||0;
  if (!cashier) { toast('Vui lòng nhập tên thu ngân', 'err'); return; }
  try {
    await DB.openShift(cashier, opening);
    toast('Đã mở ca làm việc');
    renderShiftPage();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});
document.getElementById('shiftCloseBtn').addEventListener('click', async () => {
  const closing = Number(document.getElementById('shiftClosingCash').value);
  if (isNaN(closing)) { toast('Vui lòng nhập số tiền mặt đếm được', 'err'); return; }
  const expected = Number(CURRENT_SHIFT.opening_cash) + Number(CURRENT_SHIFT.total_cash_sales);
  try {
    const closed = await DB.closeShift(CURRENT_SHIFT.id, closing, expected);
    printShiftReport(closed, expected);
    toast('Đã chốt ca thành công');
    document.getElementById('shiftClosingCash').value='';
    renderShiftPage();
  } catch(e){ toast('Lỗi: '+e.message,'err'); }
});
async function renderShiftHistory() {
  const rows = await DB.listShifts();
  const body = document.getElementById('shiftHistory');
  body.innerHTML = rows.map(r => `<tr>
    <td>${esc(r.cashier_name)}</td><td>${fmtDT(r.opened_at)}</td><td>${r.closed_at?fmtDT(r.closed_at):'<span class="badge ok">Đang mở</span>'}</td>
    <td class="num">${vnd(r.total_sales)}</td>
    <td class="num">${r.cash_diff!=null ? vnd(r.cash_diff) : '—'}</td>
    <td>${r.status==='closed' ? `<button class="btn-icon" onclick='printShiftReport(${JSON.stringify(r)}, ${Number(r.opening_cash)+Number(r.total_cash_sales)})' title="In lại">🖨</button>` : ''}</td>
  </tr>`).join('');
}
function printShiftReport(shift, expected) {
  const html = `
    <div style="font-family:'DM Mono',monospace;width:280px;margin:0 auto;font-size:12px;color:#000;">
      <div style="text-align:center;margin-bottom:8px;"><div style="font-weight:800;font-size:15px;">BÁO CÁO CHỐT CA</div><div>NINRES POS</div></div>
      <div style="border-top:1px dashed #000;border-bottom:1px dashed #000;padding:6px 0;margin-bottom:8px;">
        <div>Thu ngân: ${esc(shift.cashier_name)}</div>
        <div>Mở ca: ${fmtDT(shift.opened_at)}</div>
        <div>Đóng ca: ${fmtDT(shift.closed_at)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;"><span>Tiền quỹ đầu ca</span><span>${new Intl.NumberFormat('vi-VN').format(shift.opening_cash)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Doanh thu tiền mặt</span><span>${new Intl.NumberFormat('vi-VN').format(shift.total_cash_sales)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Tổng doanh thu</span><span>${new Intl.NumberFormat('vi-VN').format(shift.total_sales)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Số hoá đơn</span><span>${shift.total_orders}</span></div>
      <div style="border-top:1px dashed #000;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:800;"><span>Tiền mặt dự kiến</span><span>${new Intl.NumberFormat('vi-VN').format(expected)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Tiền mặt thực đếm</span><span>${new Intl.NumberFormat('vi-VN').format(shift.closing_cash)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:800;"><span>Chênh lệch</span><span>${new Intl.NumberFormat('vi-VN').format(shift.cash_diff)}</span></div>
    </div>`;
  const w = window.open('', '_blank', 'width=360,height=640');
  w.document.write(`<html><head><title>Báo cáo chốt ca</title></head><body>${html}<script>setTimeout(()=>window.print(),250)<\/script></body></html>`);
  w.document.close();
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
      <td class="num">${p.stock_qty <= p.min_stock ? `<span class="badge warn">${p.stock_qty}</span>` : p.stock_qty}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn-icon" onclick="editProduct('${p.id}')">✎</button>
        <button class="btn-icon" onclick="removeProduct('${p.id}')" style="color:var(--accent-deep);">✕</button>
      </td>
    </tr>`).join('');
}
document.getElementById('prodSearch').addEventListener('input', drawProductsTable);
document.getElementById('prodAddBtn').addEventListener('click', () => openProductModal(null));
function editProduct(id) { openProductModal(PRODUCTS.find(p=>p.id===id)); }
async function removeProduct(id) {
  if (!confirm('Ngừng kinh doanh sản phẩm này?')) return;
  await DB.deactivateProduct(id); toast('Đã xoá sản phẩm'); renderProductsPage();
}
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
    <div class="form-row" style="margin-top:10px;"><div class="field"><label>Tồn kho${isNew?'':' (chỉnh qua Nhập/Xuất/Kiểm kê)'}</label><input type="number" id="mStock" value="${p.stock_qty}" ${isNew?'':'disabled'}></div>
    <div class="field"><label>Tồn tối thiểu</label><input type="number" id="mMin" value="${p.min_stock}"></div></div>
    <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">Huỷ</button><button class="btn btn-primary" id="mSaveBtn">Lưu</button></div>
  `);
  document.getElementById('mSaveBtn').addEventListener('click', async () => {
    const payload = {
      id: isNew?undefined:p.id,
      sku: document.getElementById('mSku').value.trim(),
      barcode: document.getElementById('mBarcode').value.trim(),
      name: document.getElementById('mName').value.trim(),
      category: document.getElementById('mCategory').value.trim(),
      unit: document.getElementById('mUnit').value.trim() || 'cái',
      cost_price: Number(document.getElementById('mCost').value)||0,
      sale_price: Number(document.getElementById('mPrice').value)||0,
      min_stock: Number(document.getElementById('mMin').value)||0,
    };
    if (isNew) payload.stock_qty = Number(document.getElementById('mStock').value)||0;
    if (!payload.name || !payload.sku) { toast('Vui lòng nhập tên và SKU', 'err'); return; }
    try { await DB.upsertProduct(payload); toast('Đã lưu sản phẩm'); closeModal(); renderProductsPage(); }
    catch(e){ toast('Lỗi: '+e.message,'err'); }
  });
}

/* =========================================================================
   THỐNG KÊ
   ========================================================================= */
let reportChart;
async function renderReportsPage() {
  const sel = document.getElementById('reportYear');
  if (!sel.options.length) {
    const now = new Date().getFullYear();
    [now, now-1, now-2].forEach(y => sel.appendChild(new Option(y, y)));
  }
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
    type:'line',
    data:{ labels:['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'],
      datasets:[{label:'Doanh thu', data:monthly.map(v=>v/1000000), borderColor:'#3fb6ad', backgroundColor:'rgba(63,182,173,.18)', fill:true, tension:.35, pointRadius:3}]},
    options:{responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:i=>`${i.formattedValue} triệu ₫`}}},
      scales:{y:{title:{display:true,text:'Triệu đồng',color:'#6b7086'},grid:{color:'#eef0f7'}}, x:{grid:{display:false}}}}
  });

  // Top products
  const salesByProduct = {};
  for (const o of orders) {
    if (new Date(o.created_at).getFullYear() !== year) continue;
    const items = await DB.listOrderItems(o.id);
    items.forEach(it => {
      if (!salesByProduct[it.product_name]) salesByProduct[it.product_name] = {qty:0, revenue:0};
      salesByProduct[it.product_name].qty += Number(it.qty);
      salesByProduct[it.product_name].revenue += Number(it.line_total);
    });
  }
  const top = Object.entries(salesByProduct).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,10);
  document.getElementById('topProductsTable').innerHTML = top.map(([name,v],i) => `<tr><td>${i+1}</td><td>${esc(name)}</td><td class="num">${v.qty}</td><td class="num">${vnd(v.revenue)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);">Chưa có dữ liệu bán hàng</td></tr>';
}

/* =========================================================================
   INIT
   ========================================================================= */
(function init() {
  // App data only loads after a successful login (see doLogin()).
  document.getElementById('loginUsername').focus();
})();

/* Các hàm được gọi trực tiếp từ thuộc tính onclick trong HTML
   cần được gắn vào window vì chúng nằm trong IIFE (scope riêng). */
window.switchTab = switchTab;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.editProduct = editProduct;
window.removeProduct = removeProduct;
window.printShiftReport = printShiftReport;
window.closeModal = closeModal;

})(); // end IIFE
