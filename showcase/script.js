/* ============================================================
   KIỂM TRA CHẾ ĐỘ BẢO TRÌ — chạy NGAY LẬP TỨC, TRƯỚC mọi lệnh gọi
   dữ liệu khác trên trang. Nếu đang bảo trì: hiện màn hình bảo trì,
   ẩn toàn bộ nội dung trang, và CHẶN các hàm tải dữ liệu khác chạy tiếp.
============================================================ */
window._maintenanceActive = false;

async function checkMaintenanceMode(){
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', 'maintenance_mode').single();
    const cfg = data?.value;
    if(cfg?.enabled){
      window._maintenanceActive = true;
      document.getElementById('maintenanceOverlayTitle').textContent = cfg.title || 'Website đang bảo trì';
      document.getElementById('maintenanceOverlayMsg').textContent = cfg.message || 'Chúng tôi đang nâng cấp hệ thống, vui lòng quay lại sau.';
      document.getElementById('maintenanceOverlay').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Ẩn toàn bộ nội dung trang gốc (nhưng vẫn giữ trong DOM, không xoá)
      Array.from(document.body.children).forEach(el => {
        if(el.id !== 'maintenanceOverlay') el.style.display = 'none';
      });
    }
  } catch(e){
    // Không đọc được cấu hình -> coi như không bảo trì, cho web chạy bình thường
  }
  return window._maintenanceActive;
}

/* ============================================================
   CẤU HÌNH — dán đúng URL/key giống index.html
============================================================ */
const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig"
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* ============================================================
   CORE STATE
============================================================ */
let allProjects = [];
let activeFilter = "all";
let searchQuery = "";
let currentProject = null;

function isConfigured(){
  return CONFIG.SUPABASE_URL && !CONFIG.SUPABASE_URL.includes("PASTE_YOUR")
      && CONFIG.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY.includes("PASTE_YOUR");
}

/* ============================================================
   LOAD PROJECTS — chỉ hiển thị dự án thật từ Supabase.
   Chưa có dự án nào (hoặc chưa cấu hình) -> hiện trạng thái trống,
   không dùng dữ liệu mẫu giả.
============================================================ */
async function loadProjects(){
  if(!isConfigured()){
    renderConfigMissing();
    return;
  }
  try{
    const { data, error } = await sb
      .from('projects')
      .select('*')
      .eq('status', 'Hiển thị')
      .order('sort_order', { ascending: true });

    if(error){ renderLoadError(error.message); return; }

    allProjects = (data||[]).map(p => ({
      ID: p.id, "Tên dự án": p.name, "Mô tả": p.description, "Loại": p.type,
      "Tags": p.tags, "Link demo": p.demo_link,
      "Ảnh thumbnail (URL)": p.thumbnail_url, "Ảnh chi tiết (URL)": p.detail_image_url,
      "Trạng thái": p.status, "Thứ tự": p.sort_order
    }));

    animateCount("countProjects", allProjects.length);
    const types = new Set(allProjects.map(p => p["Loại"]).filter(Boolean));
    animateCount("countTypes", types.size);

    renderGrid();
  } catch(e){
    renderLoadError("Không thể kết nối Supabase.");
  }
}

function renderConfigMissing(){
  document.getElementById("showcaseGrid").innerHTML =
    `<div class="grid-empty"><strong>Đang chuẩn bị nội dung</strong>Trang showcase sẽ sớm có dự án để trưng bày. Quay lại sau nhé!</div>`;
  animateCount("countProjects", 0);
  animateCount("countTypes", 0);
}

function renderLoadError(msg){
  document.getElementById("showcaseGrid").innerHTML =
    `<div class="grid-empty"><strong>Không thể tải dữ liệu</strong>${esc(msg)}</div>`;
}

function renderGrid(){
  const grid = document.getElementById("showcaseGrid");
  let filtered = allProjects;

  if(activeFilter !== "all"){
    filtered = filtered.filter(p => p["Loại"] === activeFilter);
  }
  if(searchQuery){
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(p =>
      (p["Tên dự án"]||"").toLowerCase().includes(q) ||
      (p["Tags"]||"").toLowerCase().includes(q) ||
      (p["Mô tả"]||"").toLowerCase().includes(q)
    );
  }

  if(filtered.length === 0){
    grid.innerHTML = `<div class="grid-empty"><strong>Không tìm thấy dự án nào</strong>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => buildCard(p)).join("");

  // Stagger entrance animation
  grid.querySelectorAll(".project-card").forEach((card, i) => {
    card.style.opacity = "0";
    card.style.transform = "translateY(22px)";
    requestAnimationFrame(() => {
      setTimeout(() => {
        card.style.transition = "opacity .38s ease, transform .38s cubic-bezier(.2,.8,.3,1)";
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      }, i * 60);
    });
  });
}

function buildCard(p){
  const tags = parseTags(p["Tags"]);
  const thumb = p["Ảnh thumbnail (URL)"] || "";
  const imgHtml = thumb
    ? `<img class="card-img" src="/${esc(thumb)}" alt="${esc(p["Tên dự án"])}" loading="lazy" onerror="this.parentElement.style.background='var(--canvas)'">`
    : `<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--canvas) 0%,var(--canvas-mid) 100%);display:flex;align-items:center;justify-content:center;color:#3A3830;font-size:13px;">Chưa có ảnh</div>`;

  return `
  <article class="project-card" onclick="openDetail('${esc(p.ID)}')" tabindex="0" role="button"
    aria-label="Xem chi tiết: ${esc(p["Tên dự án"])}">
    ${imgHtml}
    <div class="card-strip">
      <div class="card-type-badge">${esc(p["Loại"]||"")}</div>
      <div class="card-title">${esc(p["Tên dự án"]||"")}</div>
    </div>
    <div class="card-overlay">
      <div class="overlay-type">${esc(p["Loại"]||"")}</div>
      <div class="overlay-title">${esc(p["Tên dự án"]||"")}</div>
      <div class="overlay-desc">${esc(p["Mô tả"]||"")}</div>
      <div class="overlay-tags">${tags.slice(0,3).map(t=>`<span class="overlay-tag">${esc(t)}</span>`).join("")}</div>
      <div class="overlay-actions">
        <span class="btn btn-primary btn-sm" style="pointer-events:none;">Xem chi tiết →</span>
      </div>
    </div>
  </article>`;
}

/* ============================================================
   DETAIL OVERLAY
============================================================ */
function openDetail(id){
  const p = allProjects.find(x => x.ID === id);
  if(!p) return;
  currentProject = p;

  // Image / preview section
  const wrap = document.getElementById("detailImgWrap");
  const detail = p["Ảnh chi tiết (URL)"] || p["Ảnh thumbnail (URL)"];
  if(detail){
    // Check if the URL looks like an embeddable page (has http/https, not image extension)
    const isImg = /\.(jpg|jpeg|png|gif|webp|svg|avif)(\?.*)?$/i.test(detail);
    if(isImg){
      wrap.innerHTML = `<img src="/${esc(detail)}" alt="${esc(p["Tên dự án"])}" style="width:100%;height:100%;object-fit:cover;">
        <button class="detail-close" onclick="closeDetail()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    } else {
      // treat as iframe-able URL
      wrap.innerHTML = `<iframe src="/${esc(detail)}" title="Preview" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
        <button class="detail-close" onclick="closeDetail()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    }
  } else {
    wrap.innerHTML = `<div class="detail-img-placeholder">Chưa có ảnh preview</div>
      <button class="detail-close" onclick="closeDetail()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
  }

  // Text content
  document.getElementById("detailType").textContent = p["Loại"] || "";
  document.getElementById("detailTitle").textContent = p["Tên dự án"] || "";
  document.getElementById("detailDesc").textContent = p["Mô tả"] || "";

  const tagsEl = document.getElementById("detailTags");
  tagsEl.innerHTML = parseTags(p["Tags"]).map(t=>`<span class="detail-tag">${esc(t)}</span>`).join("");

  const actionsEl = document.getElementById("detailActions");
  const demoLink = p["Link demo"] || "";
  actionsEl.innerHTML = `
    ${demoLink ? `<a href="/${esc(demoLink)}" target="_blank" rel="noopener" class="btn btn-primary">Xem Demo ↗</a>` : `<span class="btn btn-ghost-dark" style="cursor:default;opacity:.5;">Chưa có link demo</span>`}
    <a href="/#services" class="btn btn-ghost-dark">Đặt đơn tương tự →</a>
  `;

  const overlay = document.getElementById("detailOverlay");
  overlay.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeDetail(){
  document.getElementById("detailOverlay").classList.remove("show");
  document.body.style.overflow = "";
  currentProject = null;
}

document.getElementById("detailOverlay").addEventListener("click", e => {
  if(e.target.id === "detailOverlay") closeDetail();
});

/* ============================================================
   FILTER + SEARCH
============================================================ */
document.querySelectorAll(".filter-pill").forEach(pill => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    activeFilter = pill.dataset.filter;
    renderGrid();
  });
});

let searchTimer;
document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderGrid();
  }, 250);
});

/* ============================================================
   KEYBOARD SUPPORT
============================================================ */
document.addEventListener("keydown", e => {
  if(e.key === "Escape") closeDetail();
});
document.getElementById("showcaseGrid").addEventListener("keydown", e => {
  if((e.key === "Enter" || e.key === " ") && e.target.classList.contains("project-card")){
    e.preventDefault();
    const id = e.target.onclick.toString().match(/'([^']+)'/)?.[1];
    if(id) openDetail(id);
  }
});

/* ============================================================
   COUNT-UP ANIMATION
============================================================ */
function animateCount(id, target){
  const el = document.getElementById(id);
  if(!el) return;
  let current = 0;
  const step = Math.ceil(target / 20);
  const timer = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if(current >= target) clearInterval(timer);
  }, 40);
}

/* ============================================================
   TOAST
============================================================ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ============================================================
   HELPERS
============================================================ */
function parseTags(str){ return (str||"").split(",").map(t=>t.trim()).filter(Boolean); }

function esc(str){
  if(str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
}

/* ============================================================
   INIT
============================================================ */
(async function bootApp(){
  const inMaintenance = await checkMaintenanceMode();
  if(inMaintenance) return; // Dừng hẳn — không tải/gửi thêm bất kỳ dữ liệu nào khác
  loadProjects();
})();
