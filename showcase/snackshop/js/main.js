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

// Ẩn 2 danh mục này khỏi giao diện trang chủ, nhưng không xoá dữ liệu
// trong Supabase để không ảnh hưởng tới sản phẩm đã có.
function isHiddenHomeCategory(cat) {
  const key = `${cat.slug || ""} ${cat.name || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return /trai\s*cay\s*say|keo\s*(va|&)\s*mut|keo\s*mut|candy/.test(key);
}

async function loadCategoryIconGrid() {
  const wrap = document.getElementById("category-icon-grid");
  const { data, error } = await supabaseClient
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error || !data || !wrap) return;

  // Chỉ hiển thị các danh mục còn lại trên trang chủ.
  const visibleCategories = data.filter((cat) => !isHiddenHomeCategory(cat));

  wrap.innerHTML = `
    <div class="category-icon-item active" data-icon-slug="all">
      <div class="category-icon-badge">🍽️</div>
      <div class="category-icon-label">Tất cả</div>
    </div>
    ${visibleCategories
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

async function loadSiteSettings() {
  const { data, error } = await supabaseClient.from("site_settings").select("logo_url, logo_text, about_title, about_text, footer_description, contact_phone, contact_email, contact_address, facebook_url, tiktok_url").eq("id", 1).single();
  if (error || !data) return;

  document.querySelectorAll("[data-site-logo]").forEach((el) => {
    el.innerHTML = data.logo_url
      ? `<img class="site-logo-img" src="${escapeHtml(data.logo_url)}" alt="${escapeHtml(data.logo_text || "Logo")}">`
      : escapeHtml(data.logo_text || "Vặt Ơi");
  });
  const title = document.getElementById("about-title");
  const content = document.getElementById("about-content");
  if (title) title.textContent = data.about_title || "Giới thiệu";
  if (content) content.textContent = data.about_text || "Đồ ăn vặt ngon mỗi ngày, được chọn lọc kỹ từ hương vị đến chất lượng.";
  document.querySelector("[data-footer-name]")?.replaceChildren(document.createTextNode(data.logo_text || "Vặt Ơi"));
  const desc = document.querySelector("[data-footer-description]"); if (desc) desc.textContent = data.footer_description || "Đồ ăn vặt online — giao tận nơi.";
  const setText = (sel, value) => { const el = document.querySelector(sel); if (el) { el.textContent = value || ""; el.style.display = value ? "" : "none"; } };
  setText("[data-footer-address]", data.contact_address);

  const phone = document.querySelector("[data-footer-phone]");
  if (phone) {
    phone.textContent = data.contact_phone || "";
    phone.href = data.contact_phone ? `tel:${String(data.contact_phone).replace(/[^+\d]/g, "")}` : "#";
    phone.parentElement.style.display = data.contact_phone ? "" : "none";
  }

  const email = document.querySelector("[data-footer-email]");
  if (email) {
    email.textContent = data.contact_email || "";
    email.href = data.contact_email ? `mailto:${data.contact_email}` : "#";
    email.parentElement.style.display = data.contact_email ? "" : "none";
  }

  const social = document.getElementById("footer-social-links");
  if (social) {
    const facebookIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.5-1.5h1.7V4a20 20 0 0 0-2.5-.2c-2.5 0-4.2 1.5-4.2 4.3V10H7.2v3H10v8h3.5Z"/></svg>`;
    const tiktokIcon = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.8 3c.3 1.9 1.4 3.4 3.2 4.1v3.2c-1.3 0-2.5-.4-3.5-1.1v5.5c0 4-2.6 6.3-6 6.3-3.1 0-5.5-2.2-5.5-5.3 0-3.2 2.5-5.5 5.8-5.5.3 0 .6 0 .9.1v3.2a3.8 3.8 0 0 0-.9-.1c-1.4 0-2.4.9-2.4 2.2 0 1.2.9 2.1 2.2 2.1 1.5 0 2.5-1 2.5-3V3h3.7Z"/></svg>`;
    social.innerHTML = `${data.facebook_url ? `<a class="social-link" href="${escapeHtml(data.facebook_url)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${facebookIcon}</a>` : ""}${data.tiktok_url ? `<a class="social-link" href="${escapeHtml(data.tiktok_url)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok">${tiktokIcon}</a>` : ""}`;
  }
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
  await loadSiteSettings();
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
