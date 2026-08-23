:root{
  --paper:        #121110;   /* nền chính — than đen ấm */
  --paper-deep:   #19100D;   /* nền phụ (header bảng, hover nhẹ) — hơi ngả nâu cháy */
  --surface:      #1E1B18;   /* bề mặt nổi khối: card, modal, ô nhập liệu */
  --surface-2:    #26221D;   /* bề mặt nổi khối cấp 2 (hover trên surface) */
  --ink-deep:     #0A0908;   /* đen sâu nhất — dùng cho nút chính, sidebar, toast */
  --ink:          #F4EFE6;   /* chữ chính — kem sáng ấm */
  --ink-soft:     #9C9284;   /* chữ phụ — xám ấm */
  --line:         #322D27;   /* viền — xám than tinh tế */
  --coral:        #FF5A3C;   /* điểm nhấn — cam rực, tương phản tốt trên nền tối */
  --coral-deep:   #FF8A6B;   /* biến thể sáng hơn dùng làm chữ/nhãn trên nền tối */
  --coral-tint:   rgba(255,90,60,0.13);
  --sage:         #8FB07E;
  --danger:       #FF6B5C;
  --white:        #FFFCF6;

  --font-display: 'Fraunces', serif;
  --font-body:    'Inter', sans-serif;
  --font-mono:    'Space Mono', monospace;

  --radius-sm: 4px;
  --radius-md: 10px;
  --radius-lg: 22px;

  --shadow-card: 0 1px 2px rgba(0,0,0,0.35), 0 8px 24px -8px rgba(0,0,0,0.5);
  --shadow-pop:  0 4px 14px rgba(0,0,0,0.45), 0 32px 64px -20px rgba(0,0,0,0.65);
}

*{ box-sizing: border-box; margin:0; padding:0; }
html{ scroll-behavior: smooth; }
body{
  font-family: var(--font-body);
  background: var(--paper);
  color: var(--ink);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
img{ max-width:100%; display:block; }
button{ font-family: inherit; cursor:pointer; }
a{ color:inherit; text-decoration:none; }
input, textarea, select{ font-family: inherit; font-size: inherit; color: inherit; }
::selection{ background: var(--coral); color: var(--white); }
a:focus-visible, button:focus-visible, input:focus-visible{ outline: 2px solid var(--coral); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce){
  *{ animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
h1,h2,h3,h4{ font-family: var(--font-display); font-weight:600; line-height:1.08; letter-spacing:-0.01em; }

.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  padding: 14px 26px; border-radius: 999px; font-weight:600; font-size:14.5px;
  border: 1.5px solid transparent;
  transition: transform .18s ease, background .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease;
  white-space:nowrap;
}
.btn-primary{ background: var(--ink-deep); color: var(--white); }
.btn-primary:hover{ background: var(--coral); transform: translateY(-2px); box-shadow: 0 10px 24px -8px rgba(255,90,60,0.55); }
.btn-ghost{ background: transparent; border-color: var(--ink); color: var(--ink); }
.btn-ghost:hover{ background: var(--ink-deep); color: var(--white); transform: translateY(-2px); }
.btn-sm{ padding: 10px 18px; font-size: 13px; }
.btn:active{ transform: translateY(0); }
.btn[disabled]{ opacity:.5; cursor:not-allowed; transform:none !important; box-shadow:none !important; }

.field{
  width:100%; padding: 14px 16px; border:1.5px solid var(--line); border-radius: var(--radius-sm);
  background: var(--paper); color: var(--ink); font-size:14.5px;
  transition: border-color .18s ease, background .18s ease;
}
.field::placeholder{ color: var(--ink-soft); opacity:0.75; }
.field:focus{ outline:none; border-color: var(--coral); background: var(--surface-2); }

::-webkit-scrollbar{ width:10px; }
::-webkit-scrollbar-track{ background: var(--paper); }
::-webkit-scrollbar-thumb{ background: var(--line); border-radius:8px; }
::-webkit-scrollbar-thumb:hover{ background: var(--ink-soft); }

/* ====================== ADMIN LOGIN ====================== */
.login-screen{
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding: 20px;
}
.login-box{
  width:100%;
  max-width: 380px;
  background: var(--surface);
  border:1px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 40px 36px;
  box-shadow: var(--shadow-pop);
}
.login-box .login-logo{
  font-family: var(--font-display);
  font-size:22px;
  font-weight:700;
  margin-bottom:6px;
}
.login-box .login-logo .dot{ color: var(--coral); }
.login-box .login-sub{ font-size:13.5px; color: var(--ink-soft); margin-bottom:28px; }
.login-box label{ font-size:12.5px; font-weight:600; color: var(--ink-soft); display:block; margin-bottom:7px; }
.login-box .field{ margin-bottom:8px; }
.login-error{ color:var(--danger); font-size:13px; min-height:18px; margin-bottom:10px; display:none; }
.login-error.show{ display:block; }
.login-box button{ width:100%; margin-top:8px; }

/* ====================== DASHBOARD ====================== */
.dash-shell{ display:flex; min-height:100vh; }
.dash-sidebar{
  width: 240px;
  flex-shrink:0;
  background: var(--ink-deep);
  color: var(--ink);
  padding: 28px 20px;
  display:flex;
  flex-direction:column;
  position:sticky;
  top:0;
  height:100vh;
  overflow-y:auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.18) transparent;
}
.dash-sidebar::-webkit-scrollbar{ width:6px; }
.dash-sidebar::-webkit-scrollbar-thumb{ background:rgba(255,255,255,0.18); border-radius:6px; }
.dash-sidebar::-webkit-scrollbar-track{ background:transparent; }
.dash-logo{ font-family: var(--font-display); font-size:20px; font-weight:700; color:var(--white); margin-bottom:40px; }
.dash-logo .dot{ color: var(--coral); }
.dash-nav{ display:flex; flex-direction:column; gap:4px; }
.dash-nav-item{
  padding: 11px 14px;
  border-radius:8px;
  font-size:13.5px;
  color: #B8B0A0;
  display:flex; align-items:center; gap:10px;
  transition: background .15s ease, color .15s ease;
}
.dash-nav-item:hover{ background: rgba(255,255,255,0.06); color: var(--white); }
.dash-nav-item.active{ background: var(--coral); color: var(--white); }
.dash-nav-section{
  font-size:10.5px; font-weight:700; letter-spacing:.09em; text-transform:uppercase;
  color:#7A7266; padding:16px 14px 6px;
}
.dash-nav-section:first-child{ padding-top:2px; }
.dash-back{ margin-top:auto; font-size:12.5px; color:#B8B0A0; display:flex; align-items:center; gap:8px; }
.dash-back:hover{ color: var(--white); }

.dash-main{ flex:1; padding: 32px 40px; min-width:0; }
.dash-top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; flex-wrap:wrap; gap:16px; }
.dash-top h1{ font-size:26px; }
.dash-top p{ color: var(--ink-soft); font-size:13.5px; margin-top:4px; }

.dash-stats{ display:grid; grid-template-columns: repeat(4,1fr); gap:18px; margin-bottom:32px; }
.dash-stat-card{ background: var(--surface); border:1px solid var(--line); border-radius: var(--radius-md); padding:20px; }
.dash-stat-card .ds-label{ font-family: var(--font-mono); font-size:11px; color: var(--ink-soft); text-transform:uppercase; }
.dash-stat-card .ds-val{ font-family: var(--font-display); font-size:32px; margin-top:8px; }
.dash-stat-card .ds-sub{ font-size:12px; color: var(--sage); margin-top:4px; }

/* ── KPI card kiểu mới: icon + số + trend ── */
.kpi-grid{ display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:26px; }
.kpi-card{
  background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md);
  padding:18px 20px; position:relative; overflow:hidden; border-left:3px solid var(--line);
}
.kpi-card.accent-coral{ border-left-color:var(--coral); }
.kpi-card.accent-sage{ border-left-color:var(--sage); }
.kpi-card .kpi-top{ display:flex; align-items:center; justify-content:space-between; }
.kpi-card .kpi-icon{ font-size:18px; opacity:.85; }
.kpi-card .kpi-label{ font-family:var(--font-mono); font-size:10.5px; color:var(--ink-soft); text-transform:uppercase; letter-spacing:.05em; margin-top:10px; }
.kpi-card .kpi-val{ font-family:var(--font-display); font-size:30px; margin-top:4px; }
.kpi-card .kpi-trend{ font-size:11.5px; margin-top:6px; display:flex; align-items:center; gap:4px; }
.kpi-trend.up{ color:var(--sage); }
.kpi-trend.down{ color:var(--danger); }
.kpi-trend.flat{ color:var(--ink-soft); }

/* ── Card chart chung ── */
.chart-card{ background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); padding:22px; }
.chart-card h3{ font-family:var(--font-display); font-size:17px; font-weight:600; margin-bottom:2px; }
.chart-card .chart-sub{ font-size:12px; color:var(--ink-soft); margin-bottom:16px; }
.chart-row{ display:grid; grid-template-columns:1.4fr 1fr; gap:18px; margin-bottom:26px; }
.chart-row-3{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:26px; }

.bar-chart{ display:flex; align-items:flex-end; gap:10px; height:150px; }
.bar-chart .bar-col{ flex:1; display:flex; flex-direction:column; align-items:center; gap:6px; }
.bar-chart .bar{ width:100%; max-width:34px; background:linear-gradient(180deg, var(--coral), var(--coral-deep)); border-radius:6px 6px 2px 2px; min-height:3px; transition:height .4s ease; }
.bar-chart .bar-label{ font-size:10px; color:var(--ink-soft); font-family:var(--font-mono); }
.bar-chart .bar-value{ font-size:9.5px; color:var(--ink-soft); }

.donut-wrap{ display:flex; align-items:center; gap:20px; }
.donut-legend{ display:flex; flex-direction:column; gap:9px; font-size:12.5px; }
.donut-legend .dl-item{ display:flex; align-items:center; gap:8px; }
.donut-legend .dl-dot{ width:9px; height:9px; border-radius:50%; flex-shrink:0; }
.donut-legend .dl-count{ margin-left:auto; font-family:var(--font-mono); color:var(--ink-soft); padding-left:14px; }

.top-services-list{ display:flex; flex-direction:column; gap:12px; }
.ts-row{ font-size:13px; }
.ts-row-top{ display:flex; justify-content:space-between; margin-bottom:5px; }
.ts-row-top .ts-amount{ font-family:var(--font-mono); font-weight:600; color:var(--coral-deep); }
.ts-bar-track{ height:6px; background:var(--surface-2); border-radius:4px; overflow:hidden; }
.ts-bar-fill{ height:100%; background:linear-gradient(90deg, var(--sage), #6f9860); border-radius:4px; }

.quick-links{ display:grid; grid-template-columns:repeat(auto-fit, minmax(150px,1fr)); gap:12px; margin-bottom:28px; }
.quick-link-card{
  background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md);
  padding:16px; text-align:left; cursor:pointer; transition:border-color .15s, transform .15s;
  display:flex; flex-direction:column; gap:8px;
}
.quick-link-card:hover{ border-color:var(--coral); transform:translateY(-2px); }
.quick-link-card .ql-icon{ font-size:20px; }
.quick-link-card .ql-label{ font-size:13px; font-weight:600; }
.quick-link-card .ql-sub{ font-size:11px; color:var(--ink-soft); }

.dash-table-wrap{ background: var(--surface); border:1px solid var(--line); border-radius: var(--radius-md); overflow:hidden; }
.dash-table-head{ display:flex; justify-content:space-between; align-items:center; padding: 18px 22px; border-bottom:1px solid var(--line); }
.dash-table-head h3{ font-size:16px; font-family: var(--font-body); font-weight:600; }
.dash-search{ position:relative; }
.dash-search input{ padding: 9px 14px 9px 34px; border:1.5px solid var(--line); border-radius:999px; font-size:13px; width:220px; background: var(--paper); }
.dash-search svg{ position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--ink-soft); }

table.dash-table{ width:100%; border-collapse:collapse; }
table.dash-table th{
  text-align:left; font-family: var(--font-mono); font-size:11px; text-transform:uppercase;
  color: var(--ink-soft); padding: 12px 22px; border-bottom:1px solid var(--line); background: var(--paper-deep);
}
table.dash-table td{ padding: 14px 22px; border-bottom:1px solid var(--line); font-size:13.5px; }
table.dash-table tr:last-child td{ border-bottom:none; }
table.dash-table tr:hover td{ background: var(--surface-2); }
.dt-code{ font-family: var(--font-mono); font-size:12.5px; }
.or-status{
  display:inline-flex; padding:6px 14px; border-radius:999px; font-size:12.5px; font-weight:600; font-family: var(--font-mono);
}
.status-pending{ background:rgba(224,181,104,0.15); color:#E7C083; }
.status-progress{ background:rgba(127,168,224,0.15); color:#93B8ED; }
.status-done{ background:rgba(127,192,137,0.15); color:#8FD09E; }
.status-cancel{ background:rgba(224,139,122,0.15); color:#F0A290; }
.dash-empty{ padding: 60px 20px; text-align:center; color: var(--ink-soft); font-size:14px; }
.dash-loading{ padding: 60px 20px; text-align:center; color: var(--ink-soft); font-size:14px; font-family: var(--font-mono); }

/* ====================== MOBILE TAB BAR (thay sidebar khi màn hình nhỏ) ====================== */
.mobile-tabbar{
  display:none;
  gap:8px;
  padding: 12px 16px;
  background: var(--ink-deep);
  position:sticky;
  top:0;
  z-index:50;
  overflow-x:auto;
}
.mobile-tabbar button{
  flex-shrink:0;
  font-size:13px;
  padding: 9px 16px;
  border-radius:999px;
  border:1.5px solid rgba(255,255,255,0.18);
  background: transparent;
  color:#B8B0A0;
  font-family: var(--font-body);
}
.mobile-tabbar button.active{
  background: var(--coral);
  border-color: var(--coral);
  color: var(--white);
}
.mobile-tabbar button.logout-btn{
  margin-left:auto;
  color:#B8B0A0;
  border-color: transparent;
}

@media (max-width: 980px){
  .dash-shell{ flex-direction: column; }
  .dash-stats{ grid-template-columns: 1fr 1fr; }
  .kpi-grid{ grid-template-columns: 1fr 1fr; }
  .chart-row, .chart-row-3{ grid-template-columns: 1fr; }
  .dash-sidebar{ display:none; }
  .dash-main{ padding: 24px 18px; }
  table.dash-table{ display:block; overflow-x:auto; white-space:nowrap; }
  .mobile-tabbar{ display:flex; }
}


/* ====================== STATUS SELECT (trong bảng) ====================== */
.status-select{
  font-family: var(--font-mono); font-size:11.5px; padding:6px 10px; border-radius:999px;
  border:1.5px solid var(--line); background:var(--surface-2); color:var(--ink); cursor:pointer;
}
.status-select.status-pending{ border-color:#E0B568; }
.status-select.status-progress{ border-color:#7FA8E0; }
.status-select.status-done{ border-color:#7FC089; }
.status-select.status-cancel{ border-color:#E08B7A; }

/* ====================== TAB PANELS ====================== */
.tab-panel{ display:none; }
.tab-panel.active{ display:block; }

/* ====================== SERVICE TABLE ====================== */
.svc-toolbar{ display:flex; justify-content:flex-end; margin-bottom:16px; }
.filter-pill-btn{
  padding:8px 16px; border-radius:999px; font-size:12.5px; font-weight:500;
  border:1.5px solid var(--line); background:var(--surface); color:var(--ink-soft);
  transition:all .15s ease; cursor:pointer;
}
.filter-pill-btn:hover{ border-color:var(--coral); color:var(--ink); }
.filter-pill-btn.active{ background:var(--coral); border-color:var(--coral); color:var(--white); }
.svc-status-pill{
  font-family: var(--font-mono); font-size:11.5px; padding:5px 12px; border-radius:999px; font-weight:600;
}
.svc-status-active{ background:rgba(127,192,137,0.15); color:#8FD09E; }
.svc-status-inactive{ background:rgba(156,146,132,0.15); color:var(--ink-soft); }
.svc-actions{ display:flex; gap:8px; }
.svc-actions button{
  font-size:12px; padding:7px 12px; border-radius:8px; border:1.5px solid var(--line); background:var(--surface-2); color:var(--ink);
  display:inline-flex; align-items:center; gap:5px;
}
.svc-actions button:hover{ border-color: var(--coral); color: var(--coral-deep); }
.svc-actions button.danger:hover{ border-color:var(--danger); color:var(--danger); }

/* ====================== SERVICE MODAL ====================== */
.modal-overlay{
  position:fixed; inset:0; background: rgba(0,0,0,0.65); backdrop-filter: blur(3px);
  z-index:1000; display:none; align-items:flex-start; justify-content:center;
  padding: 40px 20px; overflow-y:auto;
}
.modal-overlay.show{ display:flex; }
.modal{
  background: var(--surface); border-radius: var(--radius-lg); max-width: 520px; width:100%;
  margin-top: 60px; box-shadow: var(--shadow-pop); border:1px solid var(--line);
}
.modal-head{ display:flex; justify-content:space-between; align-items:center; padding: 22px 26px; border-bottom: 1px solid var(--line); }
.modal-head h3{ font-size:19px; font-family: var(--font-display); font-weight:600; }
.modal-close{
  width:32px; height:32px; border-radius:50%; border:1.5px solid var(--line); background:var(--surface-2); color:var(--ink);
  display:flex; align-items:center; justify-content:center;
}
.modal-close:hover{ background: var(--ink-deep); border-color:var(--ink-deep); color:var(--white); }
.modal-body{ padding: 22px 26px 26px; }
.form-group{ display:flex; flex-direction:column; gap:7px; margin-bottom:16px; }
.form-group label{ font-size:12.5px; font-weight:600; color: var(--ink-soft); }
.form-row{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
textarea.field{ resize:vertical; min-height:70px; }
.modal-error{ color:var(--danger); font-size:13px; margin-bottom:10px; display:none; }
.modal-error.show{ display:block; }
.modal-submit-row{ display:flex; justify-content:flex-end; gap:10px; margin-top:6px; }

/* ====================== TOAST ====================== */
.toast{
  position:fixed; bottom:24px; left:50%; transform: translateX(-50%) translateY(20px);
  background: var(--surface-2); color: var(--white); border:1px solid var(--line);
  padding: 14px 22px; border-radius: 999px; font-size:13.5px;
  display:flex; align-items:center; gap:10px;
  box-shadow: var(--shadow-pop);
  z-index: 2000;
  opacity:0; pointer-events:none;
  transition: all .3s cubic-bezier(.2,.9,.3,1.2);
}
.toast.show{ opacity:1; transform: translateX(-50%) translateY(0); pointer-events:auto; }
.toast .t-dot{ width:7px; height:7px; border-radius:50%; background: var(--coral); }

/* ====================== ACCOUNT APPEALS ====================== */
.nav-count-badge{
  min-width:20px; height:20px; padding:0 6px; margin-left:auto;
  display:inline-grid; place-items:center; border-radius:999px;
  background:var(--coral); color:var(--white); font-family:var(--font-mono);
  font-size:10px; font-weight:700; line-height:1;
}
.nav-count-badge[hidden]{ display:none !important; }
.mobile-tabbar .nav-count-badge{ margin-left:5px; vertical-align:middle; }
.appeal-stats{ grid-template-columns:repeat(5,minmax(0,1fr)); }
.appeal-stat-pending{ border-color:rgba(224,181,104,.5); }
.appeal-stat-reviewing{ border-color:rgba(127,168,224,.5); }
.appeal-stat-needs-info{ border-color:rgba(174,139,224,.5); }
.appeal-stat-approved{ border-color:rgba(127,192,137,.5); }
.appeal-stat-rejected{ border-color:rgba(224,139,122,.5); }
.appeal-toolbar{
  display:flex; align-items:center; justify-content:space-between; gap:16px;
  margin-bottom:16px; flex-wrap:wrap;
}
.appeal-filter-group{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.appeal-table-sub{ margin-top:3px; color:var(--ink-soft); font-size:11.5px; }
.appeal-user-cell{ display:flex; align-items:center; gap:10px; min-width:190px; }
.appeal-user-avatar{
  width:34px; height:34px; flex:0 0 34px; display:grid; place-items:center;
  border-radius:50%; background:var(--coral-tint); color:var(--coral-deep); font-weight:700;
}
.appeal-user-cell div{ min-width:0; display:flex; flex-direction:column; gap:2px; }
.appeal-user-cell strong,.appeal-user-cell span{ max-width:210px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.appeal-user-cell strong{ font-size:12.5px; }
.appeal-user-cell span{ color:var(--ink-soft); font-family:var(--font-mono); font-size:10.5px; }
.appeal-reason-preview{ max-width:300px; color:var(--ink-soft); font-size:12px; line-height:1.5; white-space:normal; }
.appeal-status{
  display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px;
  font-family:var(--font-mono); font-size:10.5px; font-weight:700; white-space:nowrap;
}
.appeal-status::before{ content:""; width:6px; height:6px; border-radius:50%; background:currentColor; }
.appeal-status-pending{ color:#E7C083; background:rgba(224,181,104,.14); }
.appeal-status-reviewing{ color:#93B8ED; background:rgba(127,168,224,.14); }
.appeal-status-needs-info{ color:#C3A2F4; background:rgba(174,139,224,.14); }
.appeal-status-approved{ color:#8FD09E; background:rgba(127,192,137,.14); }
.appeal-status-rejected{ color:#F0A290; background:rgba(224,139,122,.14); }
.appeal-status-permanent{ color:#FF8B7F; background:rgba(255,71,62,.18); border:1px solid rgba(255,107,92,.35); }
.appeal-permanent-label{ color:#FF8B7F !important; font-family:var(--font-body) !important; font-size:9.5px !important; font-weight:700; }
.appeal-open-btn{
  padding:7px 11px; border:1px solid var(--line); border-radius:8px;
  background:var(--surface-2); color:var(--ink); font-size:11.5px;
}
.appeal-open-btn:hover{ border-color:var(--coral); color:var(--coral-deep); }
.appeal-review-modal{ max-width:680px; }
.appeal-review-modal .modal-head p{ margin-top:4px; color:var(--ink-soft); font-family:var(--font-mono); font-size:10.5px; }
.appeal-account-box{
  display:flex; align-items:center; gap:12px; padding:14px 16px;
  border:1px solid var(--line); border-radius:12px; background:var(--surface-2); margin-bottom:17px;
}
.appeal-avatar{
  width:42px; height:42px; flex:0 0 42px; display:grid; place-items:center;
  border-radius:50%; background:var(--coral); color:var(--white); font-weight:700;
}
.appeal-account-box>div{ min-width:0; display:flex; flex-direction:column; gap:3px; }
.appeal-account-box>div strong,.appeal-account-box>div span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.appeal-account-box>div strong{ font-size:13.5px; }
.appeal-account-box>div span{ color:var(--ink-soft); font-family:var(--font-mono); font-size:11px; }
.appeal-account-box>.appeal-status{ margin-left:auto; }
.appeal-detail-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-bottom:17px; }
.appeal-detail-grid>div{ padding:11px 13px; border:1px solid var(--line); border-radius:10px; background:var(--paper); }
.appeal-detail-grid span{ display:block; color:var(--ink-soft); font-size:9.5px; text-transform:uppercase; letter-spacing:.05em; margin-bottom:4px; }
.appeal-detail-grid strong{ display:block; font-size:11.5px; overflow-wrap:anywhere; }
.appeal-reason-box{ padding:15px 16px; margin-bottom:17px; border-left:3px solid var(--coral); background:var(--coral-tint); border-radius:0 10px 10px 0; }
.appeal-reason-box>span{ display:block; color:var(--coral-deep); font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
.appeal-reason-box p{ color:var(--ink); font-size:12.5px; line-height:1.7; white-space:pre-wrap; overflow-wrap:anywhere; }
.appeal-note-hint{ color:var(--ink-soft); font-size:10.5px; }
.appeal-review-actions{ display:flex; justify-content:flex-end; align-items:center; gap:9px; flex-wrap:wrap; margin-top:8px; }
.appeal-review-actions[hidden]{ display:none !important; }
.appeal-review-actions .btn{ border-radius:9px; }
.appeal-reject-btn{ border:1px solid rgba(255,107,92,.55); background:rgba(255,107,92,.08); color:#F0A290; }
.appeal-reject-btn:hover{ background:var(--danger); color:var(--white); }
.appeal-needs-info-btn{ border:1px solid rgba(174,139,224,.55); background:rgba(174,139,224,.1); color:#C3A2F4; }
.appeal-needs-info-btn:hover{ background:#674B93; color:var(--white); }
.appeal-approve-btn{ border:1px solid rgba(127,192,137,.55); background:rgba(127,192,137,.13); color:#8FD09E; }
.appeal-approve-btn:hover{ background:#5E8E67; color:var(--white); }
.appeal-closed-note{ padding:12px 14px; border-radius:9px; text-align:center; color:var(--ink-soft); background:var(--paper); font-size:11.5px; }
.appeal-closed-note[hidden]{ display:none !important; }

@media(max-width:760px){
  .appeal-stats{ grid-template-columns:1fr 1fr; }
  .appeal-toolbar{ align-items:stretch; }
  .appeal-toolbar .dash-search,.appeal-toolbar .dash-search input{ width:100%; }
  .appeal-detail-grid{ grid-template-columns:1fr; }
  .appeal-account-box{ align-items:flex-start; }
  .appeal-account-box>.appeal-status{ margin-left:0; }
  .appeal-review-actions{ align-items:stretch; flex-direction:column; }
  .appeal-review-actions .btn{ width:100%; }
}

/* ====================== ANNOUNCE & PAYMENT CONFIG ====================== */
.cfg-section{
  background: var(--surface);
  border:1px solid var(--line);
  border-radius: var(--radius-md);
  margin-bottom: 22px;
  overflow:hidden;
}
.cfg-section-head{
  padding: 16px 22px;
  border-bottom:1px solid var(--line);
  display:flex; align-items:center; justify-content:space-between;
  gap:12px;
}
.cfg-section-head h3{ font-size:15px; font-family:var(--font-body); font-weight:600; }
.cfg-section-head p{ font-size:12.5px; color:var(--ink-soft); margin-top:2px; }
.cfg-body{ padding: 22px; }
.cfg-row{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media(max-width:640px){ .cfg-row{ grid-template-columns:1fr; } }
.cfg-form-group{ display:flex; flex-direction:column; gap:7px; margin-bottom:16px; }
.cfg-form-group label{ font-size:12.5px; font-weight:600; color:var(--ink-soft); }
.cfg-form-group small{ font-size:11.5px; color:var(--ink-soft); margin-top:2px; }
.cfg-form-group textarea.field{ min-height:80px; resize:vertical; }

/* Toggle switch */
.toggle-wrap{ display:flex; align-items:center; gap:12px; }
.toggle{
  position:relative; width:44px; height:24px; flex-shrink:0;
}
.toggle input{ opacity:0; width:0; height:0; position:absolute; }
.toggle-slider{
  position:absolute; inset:0; background:var(--line); border-radius:999px; cursor:pointer;
  transition: background .2s;
}
.toggle-slider::before{
  content:""; position:absolute;
  width:18px; height:18px; border-radius:50%; background:white;
  left:3px; top:3px; transition:transform .2s;
  box-shadow:0 1px 3px rgba(0,0,0,.2);
}
.toggle input:checked + .toggle-slider{ background:var(--coral); }
.toggle input:checked + .toggle-slider::before{ transform:translateX(20px); }
.toggle-label{ font-size:13.5px; font-weight:500; }

/* Announce preview */
.announce-preview{
  border:1.5px dashed var(--line); border-radius:var(--radius-md);
  padding:20px; background:var(--paper); text-align:center;
  margin-top:16px; font-size:13px; color:var(--ink-soft);
}
.announce-preview.has-content{
  background:var(--surface-2); text-align:left; padding:0; overflow:hidden;
}
.ap-img{ width:100%; max-height:160px; object-fit:cover; display:block; }
.ap-body{ padding:16px 18px 10px; }
.ap-tag{ font-family:var(--font-mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--coral-deep); margin-bottom:6px; }
.ap-title{ font-family:var(--font-display); font-size:17px; font-weight:600; margin-bottom:5px; }
.ap-desc{ font-size:13px; color:var(--ink-soft); line-height:1.55; }
.ap-footer{ padding:12px 18px 14px; display:flex; justify-content:flex-end; gap:10px; }
.ap-btn{ display:inline-block; padding:9px 18px; border-radius:999px; background:var(--ink-deep); color:var(--white); font-size:13px; font-weight:600; }

/* Payment method cards */
.pay-method-grid{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media(max-width:640px){ .pay-method-grid{ grid-template-columns:1fr; } }
.pay-method-card{
  border:1.5px solid var(--line); border-radius:var(--radius-md); padding:18px;
  transition: border-color .18s;
}
.pay-method-card.active-card{ border-color:var(--coral); background:rgba(255,75,46,.03); }
.pay-method-card h4{ font-size:14px; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
.save-row{ display:flex; justify-content:flex-end; margin-top:6px; }
.chip{
  display:inline-flex; align-items:center; gap:5px;
  font-family:var(--font-mono); font-size:11px; padding:4px 10px; border-radius:999px;
  border:1px solid var(--line); color:var(--ink-soft); background:var(--paper);
}
.chip.on{ background:rgba(127,192,137,0.12); border-color:#7FC089; color:#8FD09E; }
.chip.off{ background:rgba(224,139,122,0.12); border-color:#E08B7A; color:#F0A290; }

/* ====================== QUILL EDITOR (tab Nội dung trang) — override theo tông tối ====================== */
.ql-toolbar.ql-snow{
  border-color: var(--line) !important; background: var(--paper-deep);
  border-radius: 8px 8px 0 0;
}
.ql-container.ql-snow{
  border-color: var(--line) !important; border-radius: 0 0 8px 8px;
  font-family: var(--font-body); font-size:14.5px; color: var(--ink);
}
.ql-editor{ min-height:380px; color: var(--ink); }
.ql-editor h2{ font-family: var(--font-display); color: var(--ink); }
.ql-editor a{ color: var(--coral-deep); }
.ql-snow .ql-stroke{ stroke: var(--ink-soft); }
.ql-snow .ql-fill{ fill: var(--ink-soft); }
.ql-snow .ql-picker{ color: var(--ink-soft); }
.ql-snow .ql-picker-options{ background: var(--surface-2); border-color: var(--line) !important; }
.ql-snow .ql-tooltip{ background: var(--surface-2); border-color: var(--line); color: var(--ink); box-shadow: var(--shadow-pop); }
.ql-snow .ql-tooltip input[type=text]{ background: var(--paper); color: var(--ink); border-color: var(--line); }
.ql-toolbar.ql-snow .ql-picker.ql-expanded .ql-picker-label{ border-color: var(--line); }
.ql-snow .ql-picker-label{ color: var(--ink-soft); }
.ql-toolbar.ql-snow button:hover, .ql-toolbar.ql-snow button.ql-active{ color: var(--coral); }
.ql-toolbar.ql-snow button:hover .ql-stroke, .ql-toolbar.ql-snow button.ql-active .ql-stroke{ stroke: var(--coral); }
.ql-toolbar.ql-snow button:hover .ql-fill, .ql-toolbar.ql-snow button.ql-active .ql-fill{ fill: var(--coral); }