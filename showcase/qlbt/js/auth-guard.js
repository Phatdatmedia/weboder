// ============================================================
// AUTH GUARD
// LƯU Ý QUAN TRỌNG: Đoạn kiểm tra này chỉ để có TRẢI NGHIỆM tốt
// (ẩn trang, điều hướng đúng chỗ). Nó KHÔNG PHẢI là lớp bảo mật thật sự.
// Lớp bảo mật thật sự nằm ở Row Level Security (RLS) trong Postgres —
// tức là dù ai đó bypass toàn bộ JS này, họ vẫn không đọc/ghi được
// dữ liệu mà RLS không cho phép. Không bao giờ chỉ dựa vào JS để bảo vệ dữ liệu.
// ============================================================

const IDLE_TIMEOUT_MS = 20 * 60 * 1000; // Tự đăng xuất sau 20 phút không thao tác
let idleTimer = null;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "/index.html?reason=idle";
  }, IDLE_TIMEOUT_MS);
}

function armIdleWatcher() {
  ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, resetIdleTimer, { passive: true })
  );
  resetIdleTimer();
}

/**
 * Bắt buộc trang phải có phiên đăng nhập hợp lệ + đúng vai trò yêu cầu.
 * Trả về { user, role, profile } nếu hợp lệ; nếu không sẽ tự chuyển hướng.
 */
async function requireRole(requiredRole) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = "/index.html";
    return null;
  }

  // Luôn hỏi lại server vai trò thật (bảng user_roles có RLS bảo vệ),
  // không tin bất kỳ giá trị nào lưu ở localStorage/sessionStorage.
  const { data: roleRow, error: roleErr } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", session.user.id)
    .single();

  if (roleErr || !roleRow) {
    // Chưa hoàn tất đăng ký (chưa gọi complete_registration)
    window.location.href = "/register.html";
    return null;
  }

  if (roleRow.role !== requiredRole) {
    // Đăng nhập đúng nhưng sai khu vực (vd: học sinh cố vào trang giáo viên)
    window.location.href =
      roleRow.role === "teacher" ? "/teacher/dashboard.html" : "/student/dashboard.html";
    return null;
  }

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("full_name")
    .eq("id", session.user.id)
    .single();

  armIdleWatcher();

  return { user: session.user, role: roleRow.role, profile };
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "/index.html";
}

// Nếu token bị thu hồi/hết hạn ở nơi khác (vd: đổi mật khẩu trên thiết bị khác),
// tự động đưa người dùng về trang đăng nhập.
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
      window.location.href = "/index.html";
    }
  }
});
