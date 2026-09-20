// ============================================================
// TRANG CHI TIẾT SẢN PHẨM
// ============================================================

let currentProduct = null;
let currentVariants = [];
let selectedVariant = null;
let detailQty = 1;

const productId = new URLSearchParams(location.search).get("id");

function placeholderImg() {
  return "https://placehold.co/700x700/f4e9d4/3a2a1a?text=Snack";
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!productId) {
    document.getElementById("product-detail-wrap").innerHTML =
      `<p class="empty-state">Không tìm thấy sản phẩm.</p>`;
    return;
  }
  await loadProduct();
  wireTabs();
  wireStarInput();
});

async function loadProduct() {
  const { data: product, error } = await supabaseClient
    .from("products")
    .select("*, categories(name, slug)")
    .eq("id", productId)
    .single();

  if (error || !product) {
    document.getElementById("product-detail-wrap").innerHTML =
      `<p class="empty-state">Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng bán.</p>`;
    return;
  }
  currentProduct = product;
  document.title = `${product.name} — Vặt Ơi`;

  renderBreadcrumb(product);
  await renderGallery(product);
  renderInfo(product);
  await renderVariants(product.id);
  renderDescriptionTab(product);
  await loadReviews(product.id);
  await loadRelated(product);

  document.getElementById("product-detail-wrap").style.display = "grid";
}

function renderBreadcrumb(p) {
  const wrap = document.getElementById("breadcrumb");
  wrap.innerHTML = `
    <a href="index.html">Trang chủ</a> ›
    ${p.categories ? `<a href="index.html#products">${escapeHtml(p.categories.name)}</a> ›` : ""}
    <span>${escapeHtml(p.name)}</span>
  `;
}

async function renderGallery(p) {
  const { data: gallery } = await supabaseClient
    .from("product_gallery")
    .select("*")
    .eq("product_id", p.id)
    .order("sort_order", { ascending: true });

  const images = [p.image_url || placeholderImg(), ...((gallery || []).map((g) => g.image_url))];

  const mainImg = document.getElementById("gallery-main-img");
  mainImg.src = images[0];
  mainImg.alt = p.name;

  const thumbsWrap = document.getElementById("gallery-thumbs");
  if (images.length <= 1) {
    thumbsWrap.innerHTML = "";
    return;
  }
  thumbsWrap.innerHTML = images
    .map(
      (url, i) =>
        `<div class="gallery-thumb ${i === 0 ? "active" : ""}" data-thumb-src="${url}"><img src="${url}" alt="${escapeHtml(p.name)} ${i + 1}"></div>`
    )
    .join("");

  thumbsWrap.querySelectorAll("[data-thumb-src]").forEach((el) => {
    el.addEventListener("click", () => {
      mainImg.src = el.dataset.thumbSrc;
      thumbsWrap.querySelectorAll(".gallery-thumb").forEach((t) => t.classList.remove("active"));
      el.classList.add("active");
    });
  });
}

function renderInfo(p) {
  document.getElementById("detail-category").textContent = p.categories?.name || "";
  document.getElementById("detail-name").textContent = p.name;
  document.getElementById("detail-short").textContent = p.short_desc || "";
  updatePriceDisplay(p.price);
}

function updatePriceDisplay(price) {
  document.getElementById("detail-price").textContent = formatVND(price);
}

async function renderVariants(productId) {
  const { data: variants } = await supabaseClient
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });

  currentVariants = variants || [];
  const wrap = document.getElementById("variant-group");

  if (!currentVariants.length) {
    wrap.innerHTML = "";
    selectedVariant = null;
    return;
  }

  wrap.innerHTML = `
    <label style="font-weight:700; font-size:0.85rem;">Chọn phân loại</label>
    ${currentVariants
      .map(
        (v, i) => `
      <div class="variant-option ${i === 0 ? "selected" : ""}" data-variant-id="${v.id}">
        <span>${escapeHtml(v.name)}</span>
        <span class="variant-price">${formatVND(v.price)}</span>
      </div>`
      )
      .join("")}
  `;

  selectedVariant = currentVariants[0];
  updatePriceDisplay(selectedVariant.price);

  wrap.querySelectorAll("[data-variant-id]").forEach((el) => {
    el.addEventListener("click", () => {
      wrap.querySelectorAll(".variant-option").forEach((o) => o.classList.remove("selected"));
      el.classList.add("selected");
      selectedVariant = currentVariants.find((v) => v.id === el.dataset.variantId);
      updatePriceDisplay(selectedVariant.price);
    });
  });
}

function renderDescriptionTab(p) {
  document.getElementById("tab-description").textContent =
    p.description || p.short_desc || "Chưa có mô tả chi tiết cho món này.";
}

// ---------- SỐ LƯỢNG + THÊM VÀO GIỎ ----------
document.getElementById("qty-minus").addEventListener("click", () => {
  detailQty = Math.max(1, detailQty - 1);
  document.getElementById("detail-qty").textContent = detailQty;
});
document.getElementById("qty-plus").addEventListener("click", () => {
  detailQty += 1;
  document.getElementById("detail-qty").textContent = detailQty;
});
document.getElementById("add-to-cart-btn").addEventListener("click", () => {
  if (!currentProduct) return;
  const item = {
    product_id: currentProduct.id,
    variant_id: selectedVariant ? selectedVariant.id : null,
    name: selectedVariant ? `${currentProduct.name} - ${selectedVariant.name}` : currentProduct.name,
    price: selectedVariant ? selectedVariant.price : currentProduct.price,
    image_url: currentProduct.image_url,
  };
  addToCart(item, detailQty);

  const btn = document.getElementById("add-to-cart-btn");
  const original = btn.textContent;
  btn.textContent = "Đã thêm vào giỏ ✓";
  setTimeout(() => (btn.textContent = original), 1200);
});

// ---------- TABS ----------
function wireTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tabTarget).classList.add("active");
    });
  });
}

// ---------- ĐÁNH GIÁ ----------
let selectedRating = 5;

function wireStarInput() {
  const stars = document.querySelectorAll("#star-input span");
  stars.forEach((star) => {
    star.addEventListener("click", () => {
      selectedRating = Number(star.dataset.star);
      paintStars(selectedRating);
    });
  });
  paintStars(selectedRating);
}

function paintStars(n) {
  document.querySelectorAll("#star-input span").forEach((s) => {
    s.classList.toggle("filled", Number(s.dataset.star) <= n);
  });
}

function starsText(rating) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}

async function loadReviews(productId) {
  const { data: reviews, error } = await supabaseClient
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  const listWrap = document.getElementById("reviews-list");
  const summaryWrap = document.getElementById("rating-summary");
  const tabStarWrap = document.getElementById("detail-rating-summary");

  if (error || !reviews) {
    listWrap.innerHTML = `<p class="empty-state">Không tải được đánh giá.</p>`;
    return;
  }

  if (!reviews.length) {
    summaryWrap.innerHTML = `<span>Chưa có đánh giá nào.</span>`;
    tabStarWrap.innerHTML = "";
    listWrap.innerHTML = `<p class="empty-state">Hãy là người đầu tiên đánh giá món này!</p>`;
    return;
  }

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  summaryWrap.innerHTML = `<span class="star-rating">${starsText(avg)}</span> <strong>${avg.toFixed(1)}</strong> (${reviews.length} đánh giá)`;
  tabStarWrap.innerHTML = `<span class="star-rating">${starsText(avg)}</span> ${avg.toFixed(1)} / 5 · ${reviews.length} đánh giá`;

  listWrap.innerHTML = reviews
    .map(
      (r) => `
    <div class="review-item">
      <span class="star-rating">${starsText(r.rating)}</span>
      <span class="review-author">${escapeHtml(r.reviewer_name)}</span>
      <span class="review-date">${new Date(r.created_at).toLocaleDateString("vi-VN")}</span>
      ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ""}
    </div>`
    )
    .join("");
}

document.getElementById("review-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alertBox = document.getElementById("review-alert");
  const name = document.getElementById("rv-name").value.trim();
  const comment = document.getElementById("rv-comment").value.trim();

  if (!name) {
    alertBox.textContent = "Vui lòng nhập tên của bạn.";
    alertBox.className = "alert show alert-error";
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();

  const { error } = await supabaseClient.from("product_reviews").insert({
    product_id: currentProduct.id,
    user_id: user ? user.id : null,
    reviewer_name: name,
    rating: selectedRating,
    comment,
  });

  if (error) {
    alertBox.textContent = "Gửi đánh giá thất bại. Vui lòng thử lại.";
    alertBox.className = "alert show alert-error";
    console.error(error);
    return;
  }

  alertBox.textContent = "Cảm ơn bạn đã đánh giá!";
  alertBox.className = "alert show alert-success";
  document.getElementById("review-form").reset();
  selectedRating = 5;
  paintStars(5);
  loadReviews(currentProduct.id);
});

// ---------- SẢN PHẨM LIÊN QUAN ----------
async function loadRelated(product) {
  const wrap = document.getElementById("related-grid");
  if (!product.category_id) {
    document.getElementById("related-section").style.display = "none";
    return;
  }

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .eq("category_id", product.category_id)
    .eq("is_available", true)
    .neq("id", product.id)
    .limit(4);

  if (error || !data || !data.length) {
    document.getElementById("related-section").style.display = "none";
    return;
  }

  wrap.innerHTML = data
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
