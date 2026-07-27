const form = document.getElementById("loginForm");
const errorBox = document.getElementById("errorBox");
const successBox = document.getElementById("successBox");
const loginBtn = document.getElementById("loginBtn");

// Thông báo nếu bị đăng xuất do rảnh quá lâu
const params = new URLSearchParams(location.search);
if (params.get("reason") === "idle") {
  showSuccess(successBox, "Bạn đã được đăng xuất tự động do không hoạt động. Vui lòng đăng nhập lại.");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorBox);
  setButtonLoading(loginBtn, true, "Đang đăng nhập...");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  setButtonLoading(loginBtn, false);

  if (error) {
    // Thông báo lỗi chung chung, không tiết lộ email có tồn tại hay không
    showError(errorBox, "Email hoặc mật khẩu không đúng.");
    return;
  }

  // Xác định vai trò rồi điều hướng đúng khu vực
  const { data: roleRow } = await supabaseClient
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .single();

  if (!roleRow) {
    window.location.href = "/showcase/qlbt/register/";
  } else if (roleRow.role === "teacher") {
    window.location.href = "/showcase/qlbt/showcase/qlbt/edu-system/teacher/dashboard.html";
  } else {
    window.location.href = "/showcase/qlbt/showcase/qlbt/edu-system/student/dashboard.html";
  }
});

// Nếu đã đăng nhập sẵn, chuyển hướng luôn
(async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    const { data: roleRow } = await supabaseClient
      .from("user_roles").select("role").eq("user_id", session.user.id).single();
    if (roleRow) {
      window.location.href = roleRow.role === "teacher" ? "/showcase/qlbt/edu-system/teacher/dashboard.html" : "/showcase/qlbt/edu-system/student/dashboard.html";
    }
  }
})();
