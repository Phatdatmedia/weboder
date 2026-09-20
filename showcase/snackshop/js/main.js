// ============================================================
// TRANG CHỦ — danh sách món (click ảnh/tên vào trang chi tiết), giỏ hàng
// ============================================================

let allProducts = [];
let activeCategorySlug = "all";

async function loadCategories() {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  const wrap = document.getElementById("category-chips");
  if (error || !data) return;

  const allChip = document.createElement("button");
  allChip.className = "chip active";
  allChip.textContent = "Tất cả";
  allChip.dataset.slug = "all";
  wrap.appendChild(allChip);

  data.forEach((cat) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = cat.name;
    chip.dataset.slug = cat.slug;
    wrap.appendChild(chip);
  });

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    wrap.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    activeCategorySlug = btn.dataset.slug;
    renderProducts();
  });
}

const CATEGORY_ICONS = [
  { match: /trung.?thu/i, icon: "🥮" },
  { match: /snack|banh/i, icon: "🍘" },
  { match: /trai.?cay|say/i, icon: "🥭" },
  { match: /cay/i, icon: "🌶️" },
  { match: /keo|mut|candy/i, icon: "🍬" },
  { match: /combo/i, icon: "🎁" },
  { match: /.*/, icon: "🍪" }, // mặc định
];

function iconForCategory(cat) {
  const key = `${cat.slug} ${cat.name}`;
  const found = CATEGORY_ICONS.find((c) => c.match.test(key));
  return found ? found.icon : "🍪";
}

async function loadCategoryIconGrid() {
  const wrap = document.getElementById("category-icon-grid");
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data || !wrap) return;

  wrap.innerHTML = `
    <div class="category-icon-item active" data-icon-slug="all">
      <div class="category-icon-badge">🍽️</div>
      <div class="category-icon-label">Tất cả</div>
    </div>
    ${data
      .map(
        (cat) => `
      <div class="category-icon-item" data-icon-slug="${cat.slug}">
        <div class="category-icon-badge">${iconForCategory(cat)}</div>
        <div class="category-icon-label">${escapeHtml(cat.name)}</div>
      </div>`
      )
      .join("")}
  `;

  wrap.querySelectorAll("[data-icon-slug]").forEach((el) => {
    el.addEventListener("click", () => {
      wrap.querySelectorAll(".category-icon-item").forEach((i) => i.classList.remove("active"));
      el.classList.add("active");
      activeCategorySlug = el.dataset.iconSlug;
      renderProducts();
      document.getElementById("products").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

// ---------- HERO CAROUSEL ----------
// Nếu admin đã thêm banner trong Cấu hình → dùng banner đó; nếu không → giữ
// nguyên 3 ảnh mặc định đã có sẵn trong index.html.
async function loadHeroBanners() {
  const { data, error } = await supabaseClient
    .from("site_banners")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data || !data.length) return;

  const carousel = document.getElementById("hero-carousel");
  const dotsWrap = document.getElementById("hero-dots");
  if (!carousel) return;

  carousel.querySelectorAll(".hero-slide").forEach((el) => el.remove());

  data.forEach((b, i) => {
    const slide = document.createElement("div");
    slide.className = `hero-slide${i === 0 ? " active" : ""}`;
    slide.style.backgroundImage = `url('${b.image_url}')`;
    slide.innerHTML = `
      <div class="hero-slide-content">
        ${b.eyebrow ? `<span class="hero-slide-eyebrow">${escapeHtml(b.eyebrow)}</span>` : ""}
        ${b.title ? `<h1>${escapeHtml(b.title).replace(/\n/g, "<br>")}</h1>` : ""}
        ${b.subtitle ? `<p>${escapeHtml(b.subtitle)}</p>` : ""}
        ${b.button_text ? `<a href="${b.button_link || "#products"}" class="btn btn-primary">${escapeHtml(b.button_text)}</a>` : ""}
      </div>`;
    carousel.insertBefore(slide, dotsWrap);
  });
}

function initHeroCarousel() {
  const slides = document.querySelectorAll(".hero-slide");
  const dotsWrap = document.getElementById("hero-dots");
  if (!slides.length || !dotsWrap) return;

  dotsWrap.innerHTML = Array.from(slides)
    .map((_, i) => `<div class="hero-dot ${i === 0 ? "active" : ""}" data-slide="${i}"></div>`)
    .join("");

  let current = 0;
  function goTo(i) {
    slides.forEach((s, idx) => s.classList.toggle("active", idx === i));
    dotsWrap.querySelectorAll(".hero-dot").forEach((d, idx) => d.classList.toggle("active", idx === i));
    current = i;
  }

  dotsWrap.querySelectorAll(".hero-dot").forEach((dot) =>
    dot.addEventListener("click", () => goTo(Number(dot.dataset.slide)))
  );

  setInterval(() => goTo((current + 1) % slides.length), 5000);
}

async function loadProducts() {
  const grid = document.getElementById("product-grid");
  grid.innerHTML = `<p class="empty-state">Đang tải món ngon...</p>`;

  const { data, error } = await supabaseClient
    .from("products")
    .select("*, categories(slug)")
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<p class="empty-state">Không tải được sản phẩm. Vui lòng thử lại.</p>`;
    console.error(error);
    return;
  }

  allProducts = data || [];
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  const filtered =
    activeCategorySlug === "all"
      ? allProducts
      : allProducts.filter((p) => p.categories?.slug === activeCategorySlug);

  if (!filtered.length) {
    grid.innerHTML = `<p class="empty-state">Chưa có món nào trong danh mục này.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (p) => `
    <div class="product-card">
      <a class="product-thumb" href="product.html?id=${p.id}">
        <img src="${p.image_url || placeholderImg()}" alt="${escapeHtml(p.name)}" loading="lazy">
        <div class="view-hint">Xem giới thiệu món</div>
      </a>
      <div class="product-info">
        <a class="product-name" href="product.html?id=${p.id}">${escapeHtml(p.name)}</a>
        <div class="product-desc">${escapeHtml(p.short_desc || "")}</div>
        <div class="product-row">
          <span class="price">${formatVND(p.price)}</span>
          <a href="product.html?id=${p.id}" class="btn btn-outline btn-sm">Xem chi tiết</a>
        </div>
      </div>
    </div>`
    )
    .join("");
}

function placeholderImg() {
  return "https://placehold.co/500x500/f4e9d4/3a2a1a?text=Snack";
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- GIỎ HÀNG (DRAWER) ----------
function renderCartDrawer() {
  const cart = getCart();
  const itemsWrap = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");

  if (!cart.length) {
    itemsWrap.innerHTML = `<p class="empty-state">Giỏ hàng đang trống.<br>Chọn vài món ăn vặt nào!</p>`;
  } else {
    itemsWrap.innerHTML = cart
      .map(
        (i) => `
      <div class="cart-item">
        <img src="${i.image_url || placeholderImg()}" alt="${escapeHtml(i.name)}">
        <div class="cart-item-info">
          <div>${escapeHtml(i.name)}</div>
          <div>${i.quantity} × ${formatVND(i.price)}</div>
          <button class="cart-item-remove" data-remove="${i.key}">Xoá</button>
        </div>
      </div>`
      )
      .join("");
  }
  totalEl.textContent = formatVND(cartTotal());
}

function openCart() {
  renderCartDrawer();
  document.getElementById("cart-drawer").classList.add("open");
  document.getElementById("scrim").classList.add("open");
}

function closeCart() {
  document.getElementById("cart-drawer").classList.remove("open");
  document.getElementById("scrim").classList.remove("open");
}

// ---------- EVENT WIRING ----------
document.addEventListener("DOMContentLoaded", async () => {
  await loadHeroBanners();
  initHeroCarousel();
  loadCategoryIconGrid();
  loadProducts();

  document.querySelectorAll("[data-open-cart]").forEach((el) =>
    el.addEventListener("click", openCart)
  );
  document.getElementById("cart-close").addEventListener("click", closeCart);
  document.getElementById("scrim").addEventListener("click", closeCart);

  document.getElementById("cart-items").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (rm) {
      removeFromCart(rm.dataset.remove);
      renderCartDrawer();
    }
  });

  document.getElementById("menu-toggle")?.addEventListener("click", () => {
    document.getElementById("nav-links").classList.toggle("show-mobile");
  });
});
