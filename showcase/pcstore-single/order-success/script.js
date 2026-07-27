import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// =========================================================
// ⚠️ CẤU HÌNH SUPABASE — điền URL và ANON KEY của bạn tại đây
// Lấy tại: Supabase Dashboard > Project Settings > API
// =========================================================
const SUPABASE_URL = "https://ajodavrshmkunztjjbot.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqb2RhdnJzaG1rdW56dGpqYm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjAyODcsImV4cCI6MjA5OTkzNjI4N30.IxQJLP7xX6CqBsobJeubQunzssDSwF0Rjucj1pwRk08";
const SHIPPING_FEE = 30000;           // phí ship mặc định (VND)
const FREE_SHIP_THRESHOLD = 5000000;  // miễn phí ship nếu đơn >= giá trị này

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// ---- ui.js ----
function formatVND(n) {
  if (n === null || n === undefined) return "0₫";
  return Number(n).toLocaleString("vi-VN") + "₫";
}

function toast(message, type = "info") {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "toast-box";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

function qs(sel, el = document) { return el.querySelector(sel); }
function qsa(sel, el = document) { return [...el.querySelectorAll(sel)]; }

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

const STATUS_LABEL = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  packing: "Đang đóng gói",
  shipping: "Đang giao",
  delivered: "Đã giao",
  cancelled: "Đã huỷ",
};

const STATUS_STEPS = ["pending", "confirmed", "packing", "shipping", "delivered"];

// ---- auth.js ----

async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: fullName } },
  });
  if (error) throw error;
  return data;
}

async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await supabase.auth.signOut();
}

async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

// Bắt buộc đăng nhập — chuyển hướng nếu chưa đăng nhập
async function requireAuth(redirect = "/showcase/pcstore-single/login/") {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirect;
    return null;
  }
  return user;
}

// Bắt buộc quyền nhân viên/admin — dùng cho khu vực /admin
async function requireStaff(redirect = "/showcase/login.html") {
  const user = await getCurrentUser();
  if (!user) { window.location.href = redirect; return null; }
  const profile = await getProfile(user.id);
  if (!profile || !["staff", "admin"].includes(profile.role)) {
    toast("Bạn không có quyền truy cập khu vực này", "error");
    window.location.href = "/showcase/index.html";
    return null;
  }
  return { user, profile };
}

// Vẽ header dùng chung: cập nhật trạng thái đăng nhập, số lượng giỏ hàng
async function mountHeaderAuthState({ cartCountEl, userSlotEl } = {}) {
  const user = await getCurrentUser();
  if (userSlotEl) {
    if (user) {
      const profile = await getProfile(user.id);
      const isStaff = profile && ["staff", "admin"].includes(profile.role);
      userSlotEl.innerHTML = `
        <a href="${location.pathname.includes('/admin') ? '../' : ''}account.html" class="nav-link">👤 ${profile?.full_name || "Tài khoản"}</a>
        ${isStaff ? `<a href="${location.pathname.includes('/admin') ? '' : 'admin/'}index.html" class="nav-link nav-link--staff">Quản trị</a>` : ""}
        <button class="nav-link nav-link--btn" id="btn-logout">Đăng xuất</button>
      `;
      document.getElementById("btn-logout")?.addEventListener("click", async () => {
        await signOut();
        window.location.href = location.pathname.includes('/admin') ? "/showcase/login.html" : "/showcase/pcstore-single/login/";
      });
    } else {
      userSlotEl.innerHTML = `<a href="/showcase/pcstore-single/login/" class="nav-link">Đăng nhập</a>`;
    }
  }
  return user;
}

// ---- cart.js ----

async function getCartItems(userId) {
  const { data, error } = await supabase
    .from("cart_items")
    .select("id, quantity, product_id, products(id, name, price, sale_price, image_url, stock)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function getCartCount(userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from("cart_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count || 0;
}

async function addToCart(userId, productId, quantity = 1) {
  // Nếu sản phẩm đã có trong giỏ, cộng dồn số lượng
  const { data: existing } = await supabase
    .from("cart_items").select("id, quantity")
    .eq("user_id", userId).eq("product_id", productId).maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("cart_items").update({ quantity: existing.quantity + quantity })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("cart_items").insert({ user_id: userId, product_id: productId, quantity });
    if (error) throw error;
  }
}

async function updateCartQuantity(cartItemId, quantity) {
  if (quantity <= 0) return removeCartItem(cartItemId);
  const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", cartItemId);
  if (error) throw error;
}

async function removeCartItem(cartItemId) {
  const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
  if (error) throw error;
}

async function clearCart(userId) {
  const { error } = await supabase.from("cart_items").delete().eq("user_id", userId);
  if (error) throw error;
}

function cartLineTotal(item) {
  const price = item.products.sale_price ?? item.products.price;
  return price * item.quantity;
}

// ---- products.js ----

async function fetchCategories() {
  const { data, error } = await supabase.from("categories").select("*").order("name");
  if (error) throw error;
  return data;
}

async function fetchProducts({ categorySlug, search, sort, limit = 60 } = {}) {
  let query = supabase.from("products").select("*, categories(name, slug)").eq("is_active", true);

  if (categorySlug) {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", categorySlug).single();
    if (cat) query = query.eq("category_id", cat.id);
  }
  if (search) query = query.ilike("name", `%${search}%`);

  switch (sort) {
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "newest": query = query.order("created_at", { ascending: false }); break;
    default: query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return data;
}

async function fetchProductBySlug(slug) {
  const { data, error } = await supabase
    .from("products")
    .select("*, categories(name, slug)")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data;
}

async function fetchProductById(id) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// ---- Dành cho khu vực admin ----
async function adminFetchAllProducts() {
  const { data, error } = await supabase
    .from("products").select("*, categories(name)").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function adminUpsertProduct(product) {
  const { data, error } = await supabase.from("products").upsert(product).select().single();
  if (error) throw error;
  return data;
}

async function adminDeleteProduct(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ---- orders.js ----

// Tạo đơn hàng từ giỏ hàng hiện tại
async function placeOrder({ userId, cartItems, receiver, paymentMethod, note }) {
  const subtotal = cartItems.reduce((sum, it) => sum + (it.products.sale_price ?? it.products.price) * it.quantity, 0);
  const shippingFee = subtotal >= FREE_SHIP_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shippingFee;

  const { data: order, error: orderErr } = await supabase.from("orders").insert({
    user_id: userId,
    subtotal, shipping_fee: shippingFee, total,
    receiver_name: receiver.name,
    receiver_phone: receiver.phone,
    receiver_address: receiver.address,
    payment_method: paymentMethod,
    note: note || null,
  }).select().single();
  if (orderErr) throw orderErr;

  const items = cartItems.map((it) => ({
    order_id: order.id,
    product_id: it.products.id,
    product_name: it.products.name,
    unit_price: it.products.sale_price ?? it.products.price,
    quantity: it.quantity,
  }));
  const { error: itemsErr } = await supabase.from("order_items").insert(items);
  if (itemsErr) throw itemsErr;

  // Ghi nhận giao dịch thanh toán (mô phỏng — COD sẽ ở trạng thái pending tới khi giao)
  await supabase.from("payments").insert({
    order_id: order.id,
    amount: total,
    method: paymentMethod,
    status: paymentMethod === "cod" ? "pending" : "success",
  });
  if (paymentMethod !== "cod") {
    await supabase.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
  }

  // Xoá giỏ hàng sau khi đặt
  await supabase.from("cart_items").delete().eq("user_id", userId);

  return order;
}

async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function fetchOrderByCode(code, userId) {
  let query = supabase.from("orders").select("*, order_items(*), order_status_history(*)").eq("code", code);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.single();
  if (error) throw error;
  data.order_status_history?.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return data;
}

async function cancelMyOrder(orderId) {
  const { error } = await supabase.from("orders")
    .update({ status: "cancelled" }).eq("id", orderId).eq("status", "pending");
  if (error) throw error;
}

// ---- Dành cho nhân viên / admin ----
async function adminFetchOrders({ status } = {}) {
  let query = supabase.from("orders").select("*, order_items(*), profiles(full_name, phone)").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function adminUpdateOrderStatus(orderId, status, staffId) {
  const payload = { status };
  if (staffId) payload.assigned_staff = staffId;
  const { error } = await supabase.from("orders").update(payload).eq("id", orderId);
  if (error) throw error;
}

async function adminUpdatePaymentStatus(orderId, payment_status) {
  const { error } = await supabase.from("orders").update({ payment_status }).eq("id", orderId);
  if (error) throw error;
}

// ---- staff.js ----

async function fetchAllProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Đổi vai trò người dùng: customer | staff | admin (chỉ admin được phép — RLS chặn ở DB)
async function updateUserRole(userId, role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
}

// ---- page logic ----
const code = new URLSearchParams(location.search).get("code") || "—";
  document.getElementById("order-code").textContent = code;
  document.getElementById("track-link").href = `track-order.html?code=${code}`;
