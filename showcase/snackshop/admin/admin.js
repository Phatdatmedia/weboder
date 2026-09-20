// ============================================================
// KHU VỰC QUẢN TRỊ (ADMIN)
// ============================================================

async function requireAdmin() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const user = session?.user;
  if (!user) {
    window.location.href = "index.html";
    return null;
  }
  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("is_admin, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_admin) {
    await supabaseClient.auth.signOut();
    alert("Tài khoản này không có quyền quản trị.");
    window.location.href = "index.html";
    return null;
  }
  document.querySelectorAll("[data-admin-name]").forEach((el) => (el.textContent = profile.full_name || user.email));
  return user;
}

function showMsg(el, msg, type) {
  el.textContent = msg;
  el.className = `alert show alert-${type}`;
}

// ---------- LOGIN (index.html) ----------
const adminLoginForm = document.getElementById("admin-login-form");
if (adminLoginForm) {
  // Nếu đã đăng nhập & là admin, chuyển thẳng vào dashboard
  (async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const user = session?.user;
    if (user) {
      const { data: profile } = await supabaseClient.from("profiles").select("is_admin").eq("id", user.id).single();
      if (profile?.is_admin) window.location.href = "products.html";
    }
  })();

  adminLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById("admin-login-alert");
    const email = document.getElementById("a-email").value.trim();
    const password = document.getElementById("a-password").value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      showMsg(alertBox, "Sai email hoặc mật khẩu.", "error");
      return;
    }
    const { data: profile } = await supabaseClient
      .from("profiles").select("is_admin").eq("id", data.user.id).single();

    if (!profile?.is_admin) {
      await supabaseClient.auth.signOut();
      showMsg(alertBox, "Tài khoản này không có quyền quản trị.", "error");
      return;
    }
    window.location.href = "products.html";
  });
}

document.getElementById("admin-logout")?.addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

// ---------- SẢN PHẨM (products.html) ----------
let categoriesCache = [];
let editingProductId = null;

async function initProductsPage() {
  if (!(await requireAdmin())) return;
  await loadCategoriesForForm();
  await loadProductsTable();

  document.getElementById("add-product-btn").addEventListener("click", () => openProductForm());
  document.getElementById("product-form-close").addEventListener("click", closeProductForm);
  document.getElementById("product-form").addEventListener("submit", saveProduct);
}

async function loadCategoriesForForm() {
  const { data } = await supabaseClient.from("categories").select("*").order("sort_order");
  categoriesCache = data || [];
  const select = document.getElementById("f-category");
  select.innerHTML = categoriesCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
}

async function loadProductsTable() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML = `<tr><td colspan="6">Đang tải...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(name)")
    .order("created_at", { ascending: false });

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="6">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6">Chưa có sản phẩm nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (p) => `
    <tr>
      <td><img src="${p.image_url || 'https://placehold.co/60/f4e9d4/3a2a1a?text=--'}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;"></td>
      <td>${p.name}</td>
      <td>${p.categories?.name || "—"}</td>
      <td>${formatVND(p.price)}</td>
      <td>${p.is_available ? "Đang bán" : "Ngừng bán"}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${p.id}">Sửa</button>
        <button class="btn btn-outline btn-sm" data-delete="${p.id}">Xoá</button>
      </td>
    </tr>`
    )
    .join("");

  window.__productsData = data;

  tbody.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openProductForm(btn.dataset.edit))
  );
  tbody.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => deleteProduct(btn.dataset.delete))
  );
}

async function openProductForm(id) {
  editingProductId = id || null;
  const p = id ? window.__productsData.find((x) => x.id === id) : null;

  document.getElementById("product-form-title").textContent = id ? "Sửa sản phẩm" : "Thêm sản phẩm";
  document.getElementById("f-name").value = p?.name || "";
  document.getElementById("f-category").value = p?.category_id || (categoriesCache[0]?.id ?? "");
  document.getElementById("f-price").value = p?.price || "";
  document.getElementById("f-short").value = p?.short_desc || "";
  document.getElementById("f-desc").value = p?.description || "";
  document.getElementById("f-available").checked = p ? p.is_available : true;
  document.getElementById("f-image-file").value = "";
  document.getElementById("f-image-preview").src = p?.image_url || "";
  document.getElementById("f-image-preview").style.display = p?.image_url ? "block" : "none";
  document.getElementById("product-form-alert").className = "alert";
  document.getElementById("f-gallery-file").value = "";

  await loadGalleryList(id);
  await loadVariantRows(id);

  document.getElementById("product-form-modal").classList.add("open");
}

// ---------- ẢNH PHỤ (GALLERY) ----------
async function loadGalleryList(productId) {
  const wrap = document.getElementById("gallery-list");
  if (!productId) {
    wrap.innerHTML = `<p style="font-size:0.8rem; color:rgba(58,42,26,0.6);">Lưu sản phẩm trước, sau đó mở lại để thêm ảnh phụ.</p>`;
    return;
  }
  const { data } = await supabaseClient
    .from("product_gallery")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  if (!data || !data.length) {
    wrap.innerHTML = `<p style="font-size:0.8rem; color:rgba(58,42,26,0.6);">Chưa có ảnh phụ.</p>`;
    return;
  }

  wrap.innerHTML = data
    .map(
      (g) => `
    <div class="gallery-admin-item" data-gallery-id="${g.id}">
      <img src="${g.image_url}" alt="">
      <button type="button" class="gallery-admin-remove" data-remove-gallery="${g.id}">✕</button>
    </div>`
    )
    .join("");

  wrap.querySelectorAll("[data-remove-gallery]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const { error } = await supabaseClient.from("product_gallery").delete().eq("id", btn.dataset.removeGallery);
      if (!error) btn.closest("[data-gallery-id]").remove();
    })
  );
}

// ---------- PHÂN LOẠI (VARIANTS) ----------
async function loadVariantRows(productId) {
  const wrap = document.getElementById("variant-rows");
  wrap.innerHTML = "";

  let variants = [];
  if (productId) {
    const { data } = await supabaseClient
      .from("product_variants")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });
    variants = data || [];
  }

  if (!variants.length) {
    addVariantRow();
  } else {
    variants.forEach((v) => addVariantRow(v.name, v.price));
  }
}

function addVariantRow(name = "", price = "") {
  const wrap = document.getElementById("variant-rows");
  const row = document.createElement("div");
  row.className = "variant-row";
  row.innerHTML = `
    <input type="text" placeholder="Tên phân loại (vd: Hộp 4 bánh)" class="variant-row-name" value="${name.replace(/"/g, "&quot;")}">
    <input type="number" placeholder="Giá" min="0" class="variant-row-price" value="${price}">
    <button type="button" class="variant-row-remove">✕</button>
  `;
  row.querySelector(".variant-row-remove").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

document.getElementById("add-variant-row")?.addEventListener("click", () => addVariantRow());

function collectVariantRows() {
  return Array.from(document.querySelectorAll("#variant-rows .variant-row"))
    .map((row) => ({
      name: row.querySelector(".variant-row-name").value.trim(),
      price: Number(row.querySelector(".variant-row-price").value) || 0,
    }))
    .filter((v) => v.name);
}

function closeProductForm() {
  document.getElementById("product-form-modal").classList.remove("open");
}

async function saveProduct(e) {
  e.preventDefault();
  const alertBox = document.getElementById("product-form-alert");
  const saveBtn = document.getElementById("product-form-save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Đang lưu...";

  const name = document.getElementById("f-name").value.trim();
  const slug = slugify(name) + "-" + Date.now().toString(36);
  const category_id = document.getElementById("f-category").value;
  const price = Number(document.getElementById("f-price").value);
  const short_desc = document.getElementById("f-short").value.trim();
  const description = document.getElementById("f-desc").value.trim();
  const is_available = document.getElementById("f-available").checked;
  const fileInput = document.getElementById("f-image-file");

  let image_url = document.getElementById("f-image-preview").src || null;
  if (!image_url) image_url = null;

  if (fileInput.files[0]) {
    const file = fileInput.files[0];
    const path = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: uploadErr } = await supabaseClient.storage
      .from("product-images")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      showMsg(alertBox, "Lỗi tải ảnh lên: " + uploadErr.message, "error");
      saveBtn.disabled = false;
      saveBtn.textContent = "Lưu sản phẩm";
      return;
    }
    const { data: pub } = supabaseClient.storage.from("product-images").getPublicUrl(path);
    image_url = pub.publicUrl;
  }

  const payload = { name, category_id, price, short_desc, description, is_available, image_url };

  let error;
  let savedProductId = editingProductId;

  if (editingProductId) {
    ({ error } = await supabaseClient.from("products").update(payload).eq("id", editingProductId));
  } else {
    const { data: inserted, error: insertErr } = await supabaseClient
      .from("products")
      .insert({ ...payload, slug })
      .select()
      .single();
    error = insertErr;
    savedProductId = inserted?.id;
  }

  if (error) {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lưu sản phẩm";
    showMsg(alertBox, "Lưu thất bại: " + error.message, "error");
    return;
  }

  // Tải thêm ảnh phụ (gallery) nếu có chọn file mới
  const galleryFiles = document.getElementById("f-gallery-file").files;
  for (const file of galleryFiles) {
    const path = `gallery-${savedProductId}-${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: upErr } = await supabaseClient.storage.from("product-images").upload(path, file);
    if (!upErr) {
      const { data: pub } = supabaseClient.storage.from("product-images").getPublicUrl(path);
      await supabaseClient.from("product_gallery").insert({ product_id: savedProductId, image_url: pub.publicUrl });
    }
  }

  // Đồng bộ phân loại: xoá hết rồi thêm lại theo danh sách hiện tại trên form
  const variantRows = collectVariantRows();
  await supabaseClient.from("product_variants").delete().eq("product_id", savedProductId);
  if (variantRows.length) {
    await supabaseClient
      .from("product_variants")
      .insert(variantRows.map((v, i) => ({ product_id: savedProductId, name: v.name, price: v.price, sort_order: i })));
  }

  saveBtn.disabled = false;
  saveBtn.textContent = "Lưu sản phẩm";

  closeProductForm();
  loadProductsTable();
}

async function deleteProduct(id) {
  if (!confirm("Xoá sản phẩm này?")) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) {
    alert("Không xoá được: " + error.message);
    return;
  }
  loadProductsTable();
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

document.getElementById("f-image-file")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const preview = document.getElementById("f-image-preview");
  preview.src = URL.createObjectURL(file);
  preview.style.display = "block";
});

// ---------- ĐƠN HÀNG (orders.html) ----------
async function initOrdersPage() {
  if (!(await requireAdmin())) return;
  await loadOrdersTable();

  document.getElementById("order-status-filter").addEventListener("change", loadOrdersTable);
}

const STATUS_LABEL = {
  pending: "Chờ xác nhận", confirmed: "Đã xác nhận",
  shipping: "Đang giao", done: "Hoàn tất", cancelled: "Đã huỷ",
};
const PAYMENT_METHOD_LABEL = { cod: "COD", bank_transfer: "Chuyển khoản QR", payos: "PayOS" };

async function loadOrdersTable() {
  const tbody = document.getElementById("orders-tbody");
  tbody.innerHTML = `<tr><td colspan="7">Đang tải...</td></tr>`;

  const filter = document.getElementById("order-status-filter").value;
  let query = supabaseClient
    .from("orders")
    .select("*, order_items(*)")
    .order("created_at", { ascending: false });

  if (filter !== "all") query = query.eq("status", filter);

  const { data, error } = await query;

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7">Không có đơn hàng nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (o) => `
    <tr>
      <td>${o.id.slice(0, 8)}</td>
      <td>${o.guest_name || "—"}<br><span style="font-size:0.8em;color:rgba(58,42,26,0.6)">${o.guest_phone || ""}</span></td>
      <td>${o.order_items.map((it) => `${it.quantity}× ${it.product_name}`).join(", ")}</td>
      <td>${formatVND(o.total)}</td>
      <td>
        <div style="font-size:0.8em; margin-bottom:4px;">${PAYMENT_METHOD_LABEL[o.payment_method] || o.payment_method}</div>
        <select data-payment-select="${o.id}" class="status-select">
          <option value="unpaid" ${o.payment_status === "unpaid" ? "selected" : ""}>Chưa thanh toán</option>
          <option value="paid" ${o.payment_status === "paid" ? "selected" : ""}>Đã thanh toán</option>
        </select>
      </td>
      <td>
        <select data-status-select="${o.id}" class="status-select">
          ${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
      </td>
      <td>${new Date(o.created_at).toLocaleString("vi-VN")}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-status-select]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("orders")
        .update({ status: sel.value })
        .eq("id", sel.dataset.statusSelect);
      if (error) alert("Cập nhật trạng thái thất bại.");
    })
  );

  tbody.querySelectorAll("[data-payment-select]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("orders")
        .update({ payment_status: sel.value })
        .eq("id", sel.dataset.paymentSelect);
      if (error) alert("Cập nhật trạng thái thanh toán thất bại.");
    })
  );
}

// ---------- THANH TOÁN (payments.html) ----------
let allOrdersForPayments = [];

async function initPaymentsPage() {
  if (!(await requireAdmin())) return;
  await loadPaymentsData();

  document.getElementById("filter-payment-status").addEventListener("change", renderPaymentsTable);
  document.getElementById("filter-payment-method").addEventListener("change", renderPaymentsTable);
}

async function loadPaymentsData() {
  const tbody = document.getElementById("payments-tbody");
  tbody.innerHTML = `<tr><td colspan="7">Đang tải...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("orders")
    .select("id, guest_name, guest_phone, total, status, payment_method, payment_status, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="7">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }

  allOrdersForPayments = data;
  renderPaymentSummary(data);
  renderPaymentsTable();
}

function renderPaymentSummary(data) {
  const unpaid = data.filter((o) => o.payment_status === "unpaid");
  const paid = data.filter((o) => o.payment_status === "paid");
  const sum = (arr) => arr.reduce((s, o) => s + Number(o.total), 0);

  document.getElementById("stat-unpaid-total").textContent = formatVND(sum(unpaid));
  document.getElementById("stat-unpaid-count").textContent = `${unpaid.length} đơn`;
  document.getElementById("stat-paid-total").textContent = formatVND(sum(paid));
  document.getElementById("stat-paid-count").textContent = `${paid.length} đơn`;
}

function renderPaymentsTable() {
  const tbody = document.getElementById("payments-tbody");
  const statusFilter = document.getElementById("filter-payment-status").value;
  const methodFilter = document.getElementById("filter-payment-method").value;

  let rows = allOrdersForPayments;
  if (statusFilter !== "all") rows = rows.filter((o) => o.payment_status === statusFilter);
  if (methodFilter !== "all") rows = rows.filter((o) => o.payment_method === methodFilter);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">Không có đơn hàng phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (o) => `
    <tr>
      <td>${o.id.slice(0, 8)}</td>
      <td>${o.guest_name || "—"}<br><span style="font-size:0.8em;color:rgba(58,42,26,0.6)">${o.guest_phone || ""}</span></td>
      <td>${PAYMENT_METHOD_LABEL[o.payment_method] || o.payment_method}</td>
      <td>${formatVND(o.total)}</td>
      <td><span class="status-pill status-${o.status}">${STATUS_LABEL[o.status] || o.status}</span></td>
      <td>
        <select data-payment-toggle="${o.id}" class="status-select">
          <option value="unpaid" ${o.payment_status === "unpaid" ? "selected" : ""}>Chưa thanh toán</option>
          <option value="paid" ${o.payment_status === "paid" ? "selected" : ""}>Đã thanh toán</option>
        </select>
      </td>
      <td>${new Date(o.created_at).toLocaleString("vi-VN")}</td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-payment-toggle]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      const id = sel.dataset.paymentToggle;
      const { error } = await supabaseClient.from("orders").update({ payment_status: sel.value }).eq("id", id);
      if (error) {
        alert("Cập nhật thất bại.");
        return;
      }
      const row = allOrdersForPayments.find((o) => o.id === id);
      if (row) row.payment_status = sel.value;
      renderPaymentSummary(allOrdersForPayments);
    })
  );
}

// ---------- DOANH THU (revenue.html) ----------
async function initRevenuePage() {
  if (!(await requireAdmin())) return;

  const { data, error } = await supabaseClient.rpc("admin_revenue_summary");
  const tbody = document.getElementById("revenue-tbody");

  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="3">Không tải được dữ liệu doanh thu.</td></tr>`;
    return;
  }

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="3">Chưa có đơn hàng nào được thanh toán.</td></tr>`;
    document.getElementById("stat-all-time").textContent = formatVND(0);
    document.getElementById("stat-all-time-count").textContent = "0 đơn";
    document.getElementById("stat-this-month").textContent = formatVND(0);
    document.getElementById("stat-this-month-count").textContent = "0 đơn";
    return;
  }

  const allTimeRevenue = data.reduce((s, r) => s + Number(r.revenue), 0);
  const allTimeCount = data.reduce((s, r) => s + Number(r.order_count), 0);
  document.getElementById("stat-all-time").textContent = formatVND(allTimeRevenue);
  document.getElementById("stat-all-time-count").textContent = `${allTimeCount} đơn`;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentMonthRow = data.find((r) => r.month === currentMonthKey);
  document.getElementById("stat-month-label").textContent = `Doanh thu tháng ${now.getMonth() + 1}/${now.getFullYear()}`;
  document.getElementById("stat-this-month").textContent = formatVND(currentMonthRow ? currentMonthRow.revenue : 0);
  document.getElementById("stat-this-month-count").textContent = `${currentMonthRow ? currentMonthRow.order_count : 0} đơn`;

  tbody.innerHTML = data
    .map((r) => `<tr><td>${monthLabel(r.month)}</td><td>${r.order_count}</td><td>${formatVND(r.revenue)}</td></tr>`)
    .join("");

  renderRevenueChart([...data].reverse());
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

// ---------- CẤU HÌNH (settings.html) ----------
let editingBannerId = null;
let bannersCache = [];

async function initSettingsPage() {
  if (!(await requireAdmin())) return;

  document.getElementById("webhook-url-display").textContent =
    `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/payos-webhook`;

  await loadBrandingAndBankForm();
  await loadPayosSecretForm();
  await loadBannersTable();

  document.getElementById("logo-file")?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById("logo-preview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });

  document.getElementById("branding-form").addEventListener("submit", saveBranding);
  document.getElementById("bank-form").addEventListener("submit", saveBankInfo);
  document.getElementById("payos-form").addEventListener("submit", savePayosSecret);

  document.getElementById("add-banner-btn").addEventListener("click", () => openBannerForm());
  document.getElementById("banner-form-close").addEventListener("click", closeBannerForm);
  document.getElementById("banner-form").addEventListener("submit", saveBanner);
  document.getElementById("b-image-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById("b-image-preview");
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  });
}

async function loadBrandingAndBankForm() {
  const { data } = await supabaseClient.from("site_settings").select("*").eq("id", 1).single();
  if (!data) return;

  document.getElementById("s-logo-text").value = data.logo_text || "";
  const logoPreview = document.getElementById("logo-preview");
  if (data.logo_url) {
    logoPreview.src = data.logo_url;
    logoPreview.style.display = "block";
  }

  document.getElementById("s-bank-id").value = data.bank_id || "";
  document.getElementById("s-account-no").value = data.bank_account_no || "";
  document.getElementById("s-account-name").value = data.bank_account_name || "";
  document.getElementById("s-payos-enabled").checked = !!data.payos_enabled;
}

async function uploadSiteImage(file, prefix) {
  const path = `${prefix}-${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error } = await supabaseClient.storage.from("site-images").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabaseClient.storage.from("site-images").getPublicUrl(path);
  return data.publicUrl;
}

async function saveBranding(e) {
  e.preventDefault();
  const alertBox = document.getElementById("branding-alert");
  const btn = document.getElementById("branding-save");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try {
    let logo_url = document.getElementById("logo-preview").src || null;
    if (!document.getElementById("logo-preview").style.display || document.getElementById("logo-preview").style.display === "none") {
      logo_url = null;
    }
    const fileInput = document.getElementById("logo-file");
    if (fileInput.files[0]) {
      logo_url = await uploadSiteImage(fileInput.files[0], "logo");
    }

    const payload = {
      id: 1,
      logo_url,
      logo_text: document.getElementById("s-logo-text").value.trim() || "Vặt Ơi",
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseClient.from("site_settings").update(payload).eq("id", 1);
    if (error) throw error;

    showMsg(alertBox, "Đã lưu thương hiệu.", "success");
  } catch (err) {
    showMsg(alertBox, "Lưu thất bại: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Lưu thương hiệu";
  }
}

async function saveBankInfo(e) {
  e.preventDefault();
  const alertBox = document.getElementById("bank-alert");
  const btn = document.getElementById("bank-save");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  const payload = {
    bank_id: document.getElementById("s-bank-id").value.trim(),
    bank_account_no: document.getElementById("s-account-no").value.trim(),
    bank_account_name: document.getElementById("s-account-name").value.trim().toUpperCase(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient.from("site_settings").update(payload).eq("id", 1);

  btn.disabled = false;
  btn.textContent = "Lưu thông tin ngân hàng";

  if (error) {
    showMsg(alertBox, "Lưu thất bại: " + error.message, "error");
    return;
  }
  showMsg(alertBox, "Đã lưu thông tin ngân hàng.", "success");
}

async function loadPayosSecretForm() {
  const { data } = await supabaseClient.from("site_settings_secret").select("*").eq("id", 1).single();
  if (!data) return;
  document.getElementById("s-payos-client-id").value = data.payos_client_id || "";
  document.getElementById("s-payos-api-key").value = data.payos_api_key || "";
  document.getElementById("s-payos-checksum-key").value = data.payos_checksum_key || "";
}

async function savePayosSecret(e) {
  e.preventDefault();
  const alertBox = document.getElementById("payos-alert");
  const btn = document.getElementById("payos-save");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  const payos_enabled = document.getElementById("s-payos-enabled").checked;

  const [{ error: err1 }, { error: err2 }] = await Promise.all([
    supabaseClient.from("site_settings").update({ payos_enabled, updated_at: new Date().toISOString() }).eq("id", 1),
    supabaseClient
      .from("site_settings_secret")
      .update({
        payos_client_id: document.getElementById("s-payos-client-id").value.trim(),
        payos_api_key: document.getElementById("s-payos-api-key").value.trim(),
        payos_checksum_key: document.getElementById("s-payos-checksum-key").value.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1),
  ]);

  btn.disabled = false;
  btn.textContent = "Lưu cấu hình PayOS";

  if (err1 || err2) {
    showMsg(alertBox, "Lưu thất bại: " + (err1 || err2).message, "error");
    return;
  }
  showMsg(alertBox, "Đã lưu cấu hình PayOS. Nhớ deploy Edge Function webhook nếu chưa có.", "success");
}

// ---------- BANNER TRANG CHỦ ----------
async function loadBannersTable() {
  const tbody = document.getElementById("banners-tbody");
  tbody.innerHTML = `<tr><td colspan="4">Đang tải...</td></tr>`;

  const { data, error } = await supabaseClient.from("site_banners").select("*").order("sort_order", { ascending: true });
  if (error || !data) {
    tbody.innerHTML = `<tr><td colspan="4">Lỗi tải dữ liệu.</td></tr>`;
    return;
  }
  bannersCache = data;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4">Chưa có banner nào — trang chủ đang dùng ảnh mặc định.</td></tr>`;
    return;
  }

  tbody.innerHTML = data
    .map(
      (b) => `
    <tr>
      <td><img src="${b.image_url}" style="width:64px;height:44px;object-fit:cover;border-radius:8px;"></td>
      <td>${b.title || "—"}</td>
      <td>${b.sort_order}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit-banner="${b.id}">Sửa</button>
        <button class="btn btn-outline btn-sm" data-delete-banner="${b.id}">Xoá</button>
      </td>
    </tr>`
    )
    .join("");

  tbody.querySelectorAll("[data-edit-banner]").forEach((btn) =>
    btn.addEventListener("click", () => openBannerForm(btn.dataset.editBanner))
  );
  tbody.querySelectorAll("[data-delete-banner]").forEach((btn) =>
    btn.addEventListener("click", () => deleteBanner(btn.dataset.deleteBanner))
  );
}

function openBannerForm(id) {
  editingBannerId = id || null;
  const b = id ? bannersCache.find((x) => x.id === id) : null;

  document.getElementById("banner-form-title").textContent = id ? "Sửa banner" : "Thêm banner";
  document.getElementById("b-eyebrow").value = b?.eyebrow || "";
  document.getElementById("b-title").value = b?.title || "";
  document.getElementById("b-subtitle").value = b?.subtitle || "";
  document.getElementById("b-button-text").value = b?.button_text || "Xem sản phẩm";
  document.getElementById("b-button-link").value = b?.button_link || "#products";
  document.getElementById("b-sort").value = b?.sort_order ?? bannersCache.length;
  document.getElementById("b-image-file").value = "";
  const preview = document.getElementById("b-image-preview");
  preview.src = b?.image_url || "";
  preview.style.display = b?.image_url ? "block" : "none";
  document.getElementById("banner-form-alert").className = "alert";

  document.getElementById("banner-form-modal").classList.add("open");
}

function closeBannerForm() {
  document.getElementById("banner-form-modal").classList.remove("open");
}

async function saveBanner(e) {
  e.preventDefault();
  const alertBox = document.getElementById("banner-form-alert");
  const btn = document.getElementById("banner-form-save");
  btn.disabled = true;
  btn.textContent = "Đang lưu...";

  try {
    let image_url = document.getElementById("b-image-preview").src || null;
    if (document.getElementById("b-image-preview").style.display === "none") image_url = null;
    const fileInput = document.getElementById("b-image-file");
    if (fileInput.files[0]) {
      image_url = await uploadSiteImage(fileInput.files[0], "banner");
    }
    if (!image_url) throw new Error("Vui lòng chọn ảnh banner.");

    const payload = {
      image_url,
      eyebrow: document.getElementById("b-eyebrow").value.trim(),
      title: document.getElementById("b-title").value.trim(),
      subtitle: document.getElementById("b-subtitle").value.trim(),
      button_text: document.getElementById("b-button-text").value.trim(),
      button_link: document.getElementById("b-button-link").value.trim(),
      sort_order: Number(document.getElementById("b-sort").value) || 0,
    };

    let error;
    if (editingBannerId) {
      ({ error } = await supabaseClient.from("site_banners").update(payload).eq("id", editingBannerId));
    } else {
      ({ error } = await supabaseClient.from("site_banners").insert(payload));
    }
    if (error) throw error;

    closeBannerForm();
    loadBannersTable();
  } catch (err) {
    showMsg(alertBox, "Lưu thất bại: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Lưu banner";
  }
}

async function deleteBanner(id) {
  if (!confirm("Xoá banner này?")) return;
  const { error } = await supabaseClient.from("site_banners").delete().eq("id", id);
  if (error) {
    alert("Không xoá được: " + error.message);
    return;
  }
  loadBannersTable();
}

function renderRevenueChart(rowsAscending) {
  const canvas = document.getElementById("revenue-chart");
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: "bar",
    data: {
      labels: rowsAscending.map((r) => monthLabel(r.month)),
      datasets: [
        {
          label: "Doanh thu",
          data: rowsAscending.map((r) => Number(r.revenue)),
          backgroundColor: "#d6452e",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { callback: (v) => formatVND(v) },
        },
      },
    },
  });
}


// ---------- THỐNG KÊ TRUY CẬP ----------
async function initTrafficPage() {
  if (!(await requireAdmin())) return;
  const btn = document.getElementById('traffic-refresh');
  btn?.addEventListener('click', loadTrafficStats);
  await loadTrafficStats();
}

function trafficNum(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

async function loadTrafficStats() {
  const loading = document.getElementById('traffic-loading');
  const errorBox = document.getElementById('traffic-error');
  const tbody = document.getElementById('traffic-tbody');
  if (!tbody) return;
  loading && (loading.hidden = false);
  errorBox && (errorBox.hidden = true);

  const { data, error } = await supabaseClient.rpc('admin_traffic_summary');
  if (error || !data) {
    loading && (loading.hidden = true);
    if (errorBox) {
      errorBox.textContent = 'Không tải được dữ liệu truy cập. Hãy chạy phần SQL traffic trong Supabase trước.';
      errorBox.hidden = false;
    }
    return;
  }

  const stats = data.stats || {};
  document.getElementById('traffic-today').textContent = trafficNum(stats.today_views);
  document.getElementById('traffic-7days').textContent = trafficNum(stats.last_7_days_views);
  document.getElementById('traffic-30days').textContent = trafficNum(stats.last_30_days_views);
  document.getElementById('traffic-unique').textContent = trafficNum(stats.last_30_days_unique);

  const rows = data.daily || [];
  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${trafficNum(r.views)}</td>
      <td>${trafficNum(r.unique_visitors)}</td>
    </tr>`).join('') : '<tr><td colspan="3">Chưa có dữ liệu truy cập.</td></tr>';
  loading && (loading.hidden = true);
}

// Tự ghi nhận lượt truy cập ở các trang khách hàng.
// Không lưu IP; visitor_id chỉ là mã ngẫu nhiên lưu trên trình duyệt.
function trackPublicVisit() {
  if (location.pathname.includes('/admin/')) return;
  try {
    const KEY = 'snackshop_visitor_id';
    let visitorId = localStorage.getItem(KEY);
    if (!visitorId) {
      visitorId = (crypto.randomUUID ? crypto.randomUUID() : 'v-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      localStorage.setItem(KEY, visitorId);
    }
    const sessionKey = 'snackshop_traffic_session';
    let sessionId = sessionStorage.getItem(sessionKey);
    if (!sessionId) {
      sessionId = (crypto.randomUUID ? crypto.randomUUID() : 's-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      sessionStorage.setItem(sessionKey, sessionId);
    }
    supabaseClient.from('traffic_events').insert({
      visitor_id: visitorId,
      session_id: sessionId,
      path: location.pathname || '/',
      referrer: document.referrer || null
    }).then(() => {}).catch(() => {});
  } catch (_) {}
}

if (document.getElementById('traffic-page')) initTrafficPage();
if (!document.getElementById('admin-login-form')) trackPublicVisit();
