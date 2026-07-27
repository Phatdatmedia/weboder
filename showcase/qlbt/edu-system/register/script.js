let selectedRole = "student";
const tabStudent = document.getElementById("tabStudent");
const tabTeacher = document.getElementById("tabTeacher");
const inviteField = document.getElementById("inviteField");
const inviteCode = document.getElementById("inviteCode");

tabStudent.addEventListener("click", () => {
  selectedRole = "student";
  tabStudent.classList.add("active");
  tabTeacher.classList.remove("active");
  inviteField.style.display = "none";
  inviteCode.required = false;
});
tabTeacher.addEventListener("click", () => {
  selectedRole = "teacher";
  tabTeacher.classList.add("active");
  tabStudent.classList.remove("active");
  inviteField.style.display = "block";
  inviteCode.required = true;
});

const form = document.getElementById("registerForm");
const errorBox = document.getElementById("errorBox");
const successBox = document.getElementById("successBox");
const registerBtn = document.getElementById("registerBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError(errorBox);

  const fullName = document.getElementById("fullName").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!passwordStrengthOk(password)) {
    showError(errorBox, "Mật khẩu cần tối thiểu 12 ký tự, có chữ hoa, chữ thường và số.");
    return;
  }
  if (selectedRole === "teacher" && !inviteCode.value.trim()) {
    showError(errorBox, "Vui lòng nhập mã mời giáo viên.");
    return;
  }

  setButtonLoading(registerBtn, true, "Đang tạo tài khoản...");

  // Bước 1: tạo tài khoản Auth (KHÔNG gửi role ở bước này)
  const { data: signUpData, error: signUpErr } = await supabaseClient.auth.signUp({
    email,
    password,
  });

  if (signUpErr) {
    setButtonLoading(registerBtn, false);
    showError(errorBox, "Không thể đăng ký: " + signUpErr.message);
    return;
  }

  // Nếu dự án bật "Confirm email", session sẽ null cho tới khi người dùng xác nhận
  if (!signUpData.session) {
    setButtonLoading(registerBtn, false);
    showSuccess(
      successBox,
      "Đã gửi email xác nhận. Vui lòng kiểm tra hộp thư, xác nhận rồi quay lại đăng nhập."
    );
    form.reset();
    return;
  }

  // Bước 2: hoàn tất đăng ký qua function bảo mật (server kiểm tra mã mời nếu là giáo viên)
  const { error: regErr } = await supabaseClient.rpc("complete_registration", {
    p_full_name: fullName,
    p_role: selectedRole,
    p_invite_code: selectedRole === "teacher" ? inviteCode.value.trim() : null,
  });

  setButtonLoading(registerBtn, false);

  if (regErr) {
    showError(errorBox, regErr.message.includes("Mã mời")
      ? regErr.message
      : "Không thể hoàn tất đăng ký: " + regErr.message);
    return;
  }

  window.location.href =
    selectedRole === "teacher" ? "/showcase/qlbt/edu-system/teacher/dashboard.html" : "/showcase/qlbt/edu-system/student/dashboard.html";
});
