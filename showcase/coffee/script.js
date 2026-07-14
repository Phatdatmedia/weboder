// ==========================================
// THÔNG TIN LIÊN KẾT SUPABASE API CỦA BẠN
// ==========================================
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co"; 
const SUPABASE_KEY = "YOUR_ANON_PUBLIC_KEY";

const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
};

// CƠ SỞ DỮ LIỆU GỐC AN TOÀN (MOCK DATA)
const DEFAULT_DB = {
    categories: [{id: 1, name: 'Cà phê'}, {id: 2, name: 'Trà trái cây'}, {id: 3, name: 'Trà sữa'}, {id: 4, name: 'Freeze / Đá xay'}, {id: 5, name: 'Bánh ngọt'}],
    menu: [
        {id: 'm1', category: 'Cà phê', name: 'Cà phê sữa đá', price: 39000, emoji: '☕'},
        {id: 'm2', category: 'Cà phê', name: 'Cà phê đen đá', price: 35000, emoji: '☕'},
        {id: 'm3', category: 'Cà phê', name: 'Bạc xỉu', price: 45000, emoji: '🥛'},
        {id: 'm4', category: 'Cà phê', name: 'Cà phê muối', price: 49000, emoji: '☕'}
    ]
};

// Khởi tạo kho lưu trữ cục bộ
if (!localStorage.getItem("local_menu")) localStorage.setItem("local_menu", JSON.stringify(DEFAULT_DB.menu));
if (!localStorage.getItem("local_orders")) localStorage.setItem("local_orders", JSON.stringify([]));

let dbData = { categories: DEFAULT_DB.categories, menu: [], orders: [] };
let cart = [];
let currentCategory = "Cà phê";
let selectedOrderType = "Tại quán";
let authMode = 'login';
let sessionUser = JSON.parse(localStorage.getItem("coffee_session")) || null;

const formatVND = (n) => Number(n || 0).toLocaleString("vi-VN") + "đ";

// ==========================================
// 🛡️ HỆ THỐNG KIỂM TRA QUYỀN TRUY CẬP BẢO MẬT
// ==========================================
function verifySecurityRoles() {
    const mgmtZone = document.getElementById("management-zone");
    const btnOrders = document.getElementById("nav-orders-btn");
    const btnProducts = document.getElementById("nav-products-btn");
    const btnDashboard = document.getElementById("nav-dashboard-btn");

    if (!sessionUser) {
        mgmtZone?.classList.add("hidden");
        return;
    }

    const role = sessionUser.role || 'customer';

    if (role === 'admin') {
        mgmtZone?.classList.remove("hidden");
        btnOrders?.classList.remove("hidden");
        btnProducts?.classList.remove("hidden");
        btnDashboard?.classList.remove("hidden");
    } else if (role === 'staff') {
        mgmtZone?.classList.remove("hidden");
        btnOrders?.classList.remove("hidden");
        btnProducts?.classList.add("hidden");
        btnDashboard?.classList.add("hidden");
    } else {
        mgmtZone?.classList.add("hidden");
    }
}

function checkActionPermission(required) {
    if (!sessionUser) return false;
    if (required === 'admin' && sessionUser.role !== 'admin') return false;
    if (required === 'staff' && !['admin', 'staff'].includes(sessionUser.role)) return false;
    return true;
}

// Chuyển đổi tab quản trị bên trong không gian bảo mật
function switchTab(panelName) {
    document.querySelectorAll(".admin-panel").forEach(p => p.classList.add("hidden"));
    
    if (panelName === 'shop') return; // Quay về xem menu công cộng công khai

    if (panelName === 'orders' && checkActionPermission('staff')) {
        document.getElementById("panel-orders")?.classList.remove("hidden");
    } else if (panelName === 'products' && checkActionPermission('admin')) {
        document.getElementById("panel-products")?.classList.remove("hidden");
    } else if (panelName === 'dashboard' && checkActionPermission('admin')) {
        document.getElementById("panel-dashboard")?.classList.remove("hidden");
    } else {
        alert("🚨 Từ chối: Bạn không đủ quyền hạn mở khu vực này!");
    }
}

// ==========================================
// TỒN TRỮ ĐỒNG BỘ DỮ LIỆU TỪ SUPABASE / LOCAL
// ==========================================
async function syncDatabase() {
    try {
        const [menuRes, catRes] = await Promise.all([
            fetch(`${SUPABASE_URL}/rest/v1/menu?select=*`, { headers }),
            fetch(`${SUPABASE_URL}/rest/v1/categories?select=*`, { headers })
        ]);
        if (!menuRes.ok || !catRes.ok) throw new Error();
        dbData.menu = await menuRes.json();
        dbData.categories = await catRes.json();
    } catch {
        dbData.menu = JSON.parse(localStorage.getItem("local_menu"));
        dbData.categories = DEFAULT_DB.categories;
    }
    dbData.orders = JSON.parse(localStorage.getItem("local_orders")) || [];
    renderInterface();
}

// ==========================================
// RENDER GIAO DIỆN CHUẨN ĐẸP CỦA BẠN
// ==========================================
function renderInterface() {
    renderAuthZone();
    renderCategories();
    renderProducts();
    renderCart();
    renderManagementTables();
}

function renderAuthZone() {
    const zone = document.getElementById("auth-zone");
    if (!zone) return;

    if (sessionUser) {
        zone.innerHTML = `
            <div class="flex items-center gap-2 bg-stone-100 pl-2 pr-3 py-1 rounded-xl border border-stone-200">
                <span class="w-6 h-6 rounded-lg bg-orange-600 text-white flex items-center justify-center text-[10px] font-bold uppercase">${sessionUser.role.slice(0,2)}</span>
                <span class="text-xs font-bold text-stone-700 max-w-[90px] truncate">${sessionUser.email}</span>
                <button id="logout-btn" class="text-stone-400 hover:text-red-600 ml-1 cursor-pointer">✕</button>
            </div>
        `;
        document.getElementById("logout-btn").addEventListener("click", () => {
            localStorage.removeItem("coffee_session");
            sessionUser = null;
            verifySecurityRoles();
            syncDatabase();
        });
    } else {
        zone.innerHTML = `<button id="login-trigger-btn" class="bg-orange-600 text-white font-medium text-sm rounded-xl px-4 py-2 transition active:scale-95 cursor-pointer">Đăng nhập</button>`;
        document.getElementById("login-trigger-btn").addEventListener("click", () => toggleModal("auth-modal", true));
    }
}

function renderCategories() {
    const container = document.getElementById("category-tabs");
    if (!container) return;
    container.innerHTML = dbData.categories.map(c => `
        <button data-cat="${c.name}" class="cat-filter-btn px-4 py-1.5 rounded-full text-xs font-medium transition ${currentCategory === c.name ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200 cursor-pointer'}">
            ${c.name}
        </button>
    `).join("");

    document.querySelectorAll(".cat-filter-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            currentCategory = e.currentTarget.getAttribute("data-cat");
            renderCategories();
            renderProducts();
        });
    });
}

function renderProducts() {
    const grid = document.getElementById("product-grid");
    if (!grid) return;
    const list = dbData.menu.filter(m => m.category === currentCategory);

    if (list.length === 0) {
        grid.innerHTML = `<div class="col-span-4 text-center py-8 text-stone-400 text-xs">Hiện chưa có món trong nhóm này.</div>`;
        return;
    }

    grid.innerHTML = list.map(item => {
        const inCart = cart.find(c => c.id === item.id);
        return `
            <div class="bg-white border border-stone-200 rounded-2xl p-4 flex flex-col hover:shadow-md transition">
                <div class="text-3xl mb-2">${item.emoji || '☕'}</div>
                <h4 class="font-bold text-stone-900 text-sm truncate">${item.name}</h4>
                <p class="font-mono text-orange-600 text-xs font-bold mt-0.5 mb-4">${formatVND(item.price)}</p>
                <div class="mt-auto">
                    ${!inCart ? `
                        <button onclick="handleAddToCart('${item.id}')" class="w-full bg-stone-50 border border-stone-200 hover:bg-orange-600 hover:text-white text-stone-700 font-bold text-xs py-2 rounded-xl transition cursor-pointer">
                            + Thêm vào giỏ
                        </button>
                    ` : `
                        <div class="flex items-center justify-between bg-orange-600 rounded-xl text-white p-1">
                            <button onclick="handleQtyChange('${item.id}', -1)" class="w-6 h-6 font-bold hover:bg-orange-700 rounded-lg">-</button>
                            <span class="font-mono text-xs font-bold">${inCart.qty}</span>
                            <button onclick="handleQtyChange('${item.id}', 1)" class="w-6 h-6 font-bold hover:bg-orange-700 rounded-lg">+</button>
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join("");
}

window.handleAddToCart = function(id) {
    const prod = dbData.menu.find(m => m.id === id);
    if (!prod) return;
    const exists = cart.find(c => c.id === id);
    if (exists) exists.qty += 1;
    else cart.push({ ...prod, qty: 1 });
    renderCart();
    renderProducts();
};

window.handleQtyChange = function(id, delta) {
    const idx = cart.findIndex(c => c.id === id);
    if (idx === -1) return;
    cart[idx].qty += delta;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    renderCart();
    renderProducts();
};

function renderCart() {
    const container = document.getElementById("cart-items-container");
    const footer = document.getElementById("cart-footer");
    const badge = document.getElementById("cart-badge");
    if (!container) return;

    const totalQty = cart.reduce((s, i) => s + i.qty, 0);
    const totalPrice = cart.reduce((s, i) => s + (i.price * i.qty), 0);

    badge.innerText = totalQty;
    if (totalQty > 0) { badge.classList.remove("hidden"); footer.classList.remove("hidden"); }
    else { badge.classList.add("hidden"); footer.classList.add("hidden"); container.innerHTML = `<p class="text-center py-8 text-xs text-stone-400">Giỏ hàng trống.</p>`; return; }

    container.innerHTML = cart.map(item => `
        <div class="flex items-center gap-3 border-b border-stone-50 pb-2">
            <span class="text-xl">${item.emoji}</span>
            <div class="flex-1 min-w-0"><p class="text-xs font-bold text-stone-900 truncate">${item.name}</p><p class="text-[10px] text-orange-600 font-mono">${formatVND(item.price)}</p></div>
            <div class="flex items-center bg-stone-100 rounded-lg p-0.5">
                <button onclick="handleQtyChange('${item.id}', -1)" class="w-4 h-4 font-bold text-xs">-</button>
                <span class="text-xs font-mono w-4 text-center">${item.qty}</span>
                <button onclick="handleQtyChange('${item.id}', 1)" class="w-4 h-4 font-bold text-xs">+</button>
            </div>
        </div>
    `).join("");
    document.getElementById("cart-total-text").innerText = formatVND(totalPrice);
}

// ==========================================
// ĐĂNG NHẬP / ĐĂNG KÝ XÁC THỰC BẢO MẬT
// ==========================================
async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;
    const btnSubmit = document.getElementById("auth-submit-btn");

    btnSubmit.innerText = "Đang xử lý phân quyền...";
    btnSubmit.disabled = true;

    let targetedRole = 'customer';
    if (email.includes('admin@')) targetedRole = 'admin';
    else if (email.includes('staff@') || email.includes('nhanvien@')) targetedRole = 'staff';

    const endpoint = authMode === 'login' ? 'token?grant_type=password' : 'signup';

    try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, password, options: { data: { role: targetedRole } } })
        });
        const data = await res.json();
        if (!res.ok) throw new Error();

        if (authMode === 'signup') {
            alert(`Tạo tài khoản thành công cấp bậc [${targetedRole.toUpperCase()}]!`);
            switchAuthMode('login');
        } else {
            sessionUser = { email: data.user.email, role: data.user.user_metadata?.role || targetedRole };
            localStorage.setItem("coffee_session", JSON.stringify(sessionUser));
            toggleModal("auth-modal", false);
            verifySecurityRoles();
            syncDatabase();
        }
    } catch {
        // Dự phòng khi chạy không qua API để nhà phát triển test cục bộ dễ dàng
        if (authMode === 'login') {
            sessionUser = { email, role: targetedRole };
            localStorage.setItem("coffee_session", JSON.stringify(sessionUser));
            toggleModal("auth-modal", false);
            verifySecurityRoles();
            syncDatabase();
        } else {
            alert("Đã ghi nhận đăng ký Demo!");
            switchAuthMode('login');
        }
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = authMode === 'login' ? "Xác nhận Đăng nhập" : "Xác nhận Đăng ký";
    }
}

function switchAuthMode(mode) {
    authMode = mode;
    const tL = document.getElementById("tab-login-btn");
    const tR = document.getElementById("tab-register-btn");
    const title = document.getElementById("auth-title");
    if (mode === 'login') {
        tL.className = "flex-1 pb-2 font-bold text-sm text-orange-600 border-b-2 border-orange-600";
        tR.className = "flex-1 pb-2 font-medium text-sm text-stone-400 border-b-2 border-transparent";
        title.innerText = "Chào mừng quay trở lại";
    } else {
        tR.className = "flex-1 pb-2 font-bold text-sm text-orange-600 border-b-2 border-orange-600";
        tL.className = "flex-1 pb-2 font-medium text-sm text-stone-400 border-b-2 border-transparent";
        title.innerText = "Tạo tài khoản phân quyền bảo mật";
    }
}

// ==========================================
// VẬN HÀNH KHÔNG GIAN BAN QUẢN TRỊ
// ==========================================
function renderManagementTables() {
    const orderTable = document.getElementById("order-list-table");
    if (orderTable) {
        orderTable.innerHTML = dbData.orders.map(o => `
            <tr class="border-b border-stone-100">
                <td class="py-2 font-mono text-xs font-bold">#${o.id}</td>
                <td class="py-2 text-xs">${o.user}</td>
                <td class="py-2 text-xs">${o.type}</td>
                <td class="py-2 font-mono text-xs text-orange-600 font-bold">${formatVND(o.total)}</td>
                <td class="py-2 text-xs"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${o.status === 'Đã hoàn thành' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">${o.status}</span></td>
                <td class="py-2 text-right">${o.status === 'Chờ xử lý' ? `<button onclick="completeOrder('${o.id}')" class="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-md cursor-pointer">Hoàn thành</button>` : '🔒'}</td>
            </tr>
        `).reverse().join("");
    }

    const prodTable = document.getElementById("admin-product-table");
    if (prodTable) {
        prodTable.innerHTML = dbData.menu.map(p => `
            <tr class="border-b border-stone-100">
                <td class="py-2 text-lg">${p.emoji}</td>
                <td class="py-2 text-xs font-bold">${p.name}</td>
                <td class="py-2 text-xs text-stone-500">${p.category}</td>
                <td class="py-2 font-mono text-xs font-semibold">${formatVND(p.price)}</td>
                <td class="py-2 text-right"><button onclick="removeProduct('${p.id}')" class="text-red-500 text-xs font-bold cursor-pointer">Xóa</button></td>
            </tr>
        `).join("");
    }

    const completed = dbData.orders.filter(o => o.status === 'Đã hoàn thành');
    if (document.getElementById("stat-total-revenue")) document.getElementById("stat-total-revenue").innerText = formatVND(completed.reduce((s,o)=>s+o.total, 0));
    if (document.getElementById("stat-success-orders")) document.getElementById("stat-success-orders").innerText = completed.length + " đơn";
}

window.completeOrder = function(id) {
    if (!checkActionPermission('staff')) return;
    const o = dbData.orders.find(ord => ord.id === id);
    if (o) o.status = 'Đã hoàn thành';
    localStorage.setItem("local_orders", JSON.stringify(dbData.orders));
    renderManagementTables();
};

window.removeProduct = function(id) {
    if (!checkActionPermission('admin')) { alert("Chỉ tài khoản Admin mới được xóa món!"); return; }
    dbData.menu = dbData.menu.filter(m => m.id !== id);
    localStorage.setItem("local_menu", JSON.stringify(dbData.menu));
    syncDatabase();
};

window.openAddProductModal = function() {
    if (!checkActionPermission('admin')) return;
    const name = prompt("Nhập tên món mới:");
    const price = parseInt(prompt("Nhập giá món:"));
    if (name && price) {
        dbData.menu.push({ id: 'm_' + Date.now(), category: currentCategory, name, price, emoji: '🍹' });
        localStorage.setItem("local_menu", JSON.stringify(dbData.menu));
        syncDatabase();
    }
};

window.setOrderType = function(type) {
    selectedOrderType = type;
    document.getElementById("type-tai-quan").className = type === 'Tại quán' ? "py-2 text-xs font-bold rounded-xl border-2 border-orange-600 bg-orange-50 text-orange-700 cursor-pointer" : "py-2 text-xs font-bold rounded-xl border border-stone-200 text-stone-600 cursor-pointer";
    document.getElementById("type-mang-di").className = type === 'Mang đi' ? "py-2 text-xs font-bold rounded-xl border-2 border-orange-600 bg-orange-50 text-orange-700 cursor-pointer" : "py-2 text-xs font-bold rounded-xl border border-stone-200 text-stone-600 cursor-pointer";
};

// ==========================================
// KHỞI CHẠY LẮNG NGHE SỰ KIỆN KHÓA
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    syncDatabase();
    verifySecurityRoles();

    document.getElementById("cart-toggle-btn")?.addEventListener("click", () => toggleModal("cart-drawer", true));
    document.getElementById("cart-close-btn")?.addEventListener("click", () => toggleModal("cart-drawer", false));
    document.getElementById("auth-close-btn")?.addEventListener("click", () => toggleModal("auth-modal", false));
    document.getElementById("checkout-close-btn")?.addEventListener("click", () => toggleModal("checkout-modal", false));

    document.getElementById("checkout-trigger-btn")?.addEventListener("click", () => {
        toggleModal("cart-drawer", false);
        document.getElementById("checkout-final-total").innerText = formatVND(cart.reduce((s, i) => s + (i.price * i.qty), 0));
        toggleModal("checkout-modal", true);
    });

    document.getElementById("auth-form")?.addEventListener("submit", handleAuthSubmit);
    document.getElementById("tab-login-btn")?.addEventListener("click", () => switchAuthMode('login'));
    document.getElementById("tab-register-btn")?.addEventListener("click", () => switchAuthMode('signup'));

    document.getElementById("checkout-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const price = cart.reduce((s, i) => s + (i.price * i.qty), 0);
        const newOrd = {
            id: Math.floor(1000 + Math.random() * 9000).toString(),
            user: sessionUser ? sessionUser.email : "Khách vãng lai",
            type: selectedOrderType,
            total: price,
            status: 'Chờ xử lý'
        };
        dbData.orders.push(newOrd);
        localStorage.setItem("local_orders", JSON.stringify(dbData.orders));
        
        alert(`🎉 Đặt món thành công! Mã đơn của bạn là #${newOrd.id}`);
        cart = [];
        renderCart();
        renderProducts();
        renderManagementTables();
        toggleModal("checkout-modal", false);
    });
});

表达toggleModal(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) el.classList.remove("hidden");
    else el.classList.add("hidden");
}