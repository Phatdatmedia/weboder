// ============================================================
// THEO DÕI LƯỢT TRUY CẬP
// - page_view: mỗi lần mở trang
// - visitor_id: mã trình duyệt lưu localStorage để ước tính khách duy nhất
// Không lưu IP.
// ============================================================
(function () {
  const STORAGE_KEY = "snackshop_visitor_id";
  const SESSION_KEY = "snackshop_visit_session";

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "v-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  }

  function getVisitorId() {
    try {
      let id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return uuid();
    }
  }

  function getSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = uuid();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch (_) {
      return uuid();
    }
  }

  async function trackVisit() {
    if (!window.supabaseClient) return;

    try {
      const path = window.location.pathname || "/";
      // Không ghi nhận khu vực admin.
      if (path.includes("/admin/")) return;

      await window.supabaseClient.from("traffic_events").insert({
        visitor_id: getVisitorId(),
        session_id: getSessionId(),
        page_path: path,
        referrer: document.referrer || null,
      });
    } catch (error) {
      // Tracking không được phép làm hỏng website.
      console.debug("Traffic tracking skipped:", error?.message || error);
    }
  }

  window.trackSnackShopVisit = trackVisit;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trackVisit, { once: true });
  } else {
    trackVisit();
  }
})();
