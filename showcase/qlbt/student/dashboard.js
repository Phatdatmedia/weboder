// ============================================================
// LOGIC TRANG HỌC SINH
// RLS đảm bảo học sinh chỉ thấy assignment đã publish của lớp mình tham gia,
// và chỉ đọc/sửa được submission của chính mình.
// ============================================================

let currentUser = null;
let currentAssignment = null;

(async () => {
  const auth = await requireRole("student");
  if (!auth) return;
  currentUser = auth.user;
  document.getElementById("userName").textContent = auth.profile?.full_name || auth.user.email;
  await loadEverything();
})();

document.getElementById("logoutBtn").addEventListener("click", logout);
document.querySelectorAll("[data-close]").forEach((btn) =>
  btn.addEventListener("click", () => closeModal(btn.dataset.close))
);
function openModal(id) { document.getElementById(id).classList.add("show"); }
function closeModal(id) { document.getElementById(id).classList.remove("show"); }

async function loadEverything() {
  await loadClasses();
  await loadAssignments();
}

// -------------------- LỚP HỌC --------------------

async function loadClasses() {
  const { data: memberships, error } = await supabaseClient
    .from("class_members")
    .select("classes(id, name, teacher_id)");

  const list = document.getElementById("classList");
  list.innerHTML = "";

  if (error || !memberships.length) {
    list.innerHTML = `<div class="empty">Chưa tham gia lớp nào.</div>`;
    return;
  }

  memberships.forEach((m) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<div class="title">${escapeHTML(m.classes?.name || "")}</div>`;
    list.appendChild(row);
  });
}

document.getElementById("openJoinClass").addEventListener("click", () => openModal("modalJoinClass"));

document.getElementById("joinClassForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("joinClassBtn");
  const errBox = document.getElementById("joinClassError");
  hideError(errBox);
  setButtonLoading(btn, true);

  const code = document.getElementById("joinCode").value.trim().toUpperCase();

  const { error } = await supabaseClient.rpc("join_class_by_code", { p_join_code: code });

  setButtonLoading(btn, false);

  if (error) {
    showError(errBox, "Không thể tham gia lớp: " + error.message);
    return;
  }

  document.getElementById("joinClassForm").reset();
  closeModal("modalJoinClass");
  await loadEverything();
});

// -------------------- BÀI TẬP --------------------

async function loadAssignments() {
  const { data: assignments, error } = await supabaseClient
    .from("assignments")
    .select("id, title, description, type, due_date, class_id, classes(name)")
    .order("due_date", { ascending: true });

  const list = document.getElementById("assignmentList");
  const upcoming = document.getElementById("upcomingList");
  list.innerHTML = "";
  upcoming.innerHTML = "";

  if (error || !assignments.length) {
    list.innerHTML = `<div class="empty">Chưa có bài tập nào.</div>`;
    upcoming.innerHTML = `<div class="empty">Không có gì sắp đến hạn.</div>`;
    return;
  }

  // Lấy trước danh sách bài đã nộp của học sinh để hiển thị trạng thái
  const { data: mySubs } = await supabaseClient
    .from("submissions")
    .select("assignment_id, grade");
  const subMap = new Map((mySubs || []).map((s) => [s.assignment_id, s]));

  const now = new Date();
  const soon = assignments.filter((a) => a.due_date && new Date(a.due_date) > now).slice(0, 3);

  if (!soon.length) {
    upcoming.innerHTML = `<div class="empty">Không có gì sắp đến hạn.</div>`;
  } else {
    soon.forEach((a) => {
      const row = document.createElement("div");
      row.className = "item-row";
      row.innerHTML = `
        <div>
          <div class="title">${escapeHTML(a.title)}</div>
          <div class="meta">${escapeHTML(a.classes?.name || "")} · Hạn: ${formatDate(a.due_date)}</div>
        </div>
      `;
      upcoming.appendChild(row);
    });
  }

  assignments.forEach((a) => {
    const sub = subMap.get(a.id);
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div>
        <div class="title">${escapeHTML(a.title)}</div>
        <div class="meta">
          <span class="badge ${a.type === "exam" ? "badge-exam" : "badge-homework"}">${a.type === "exam" ? "Kiểm tra" : "Bài tập"}</span>
          ${sub ? `<span class="badge ${sub.grade !== null && sub.grade !== undefined ? "badge-graded" : "badge-pending"}">${sub.grade !== null && sub.grade !== undefined ? "Đã chấm: " + sub.grade : "Đã nộp — chờ chấm"}</span>` : ""}
          · ${escapeHTML(a.classes?.name || "")} · Hạn: ${formatDate(a.due_date)}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" data-open="${a.id}">${sub ? "Xem / Sửa bài nộp" : "Làm bài"}</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-open]").forEach((btn) =>
    btn.addEventListener("click", () => openSubmit(assignments.find((a) => a.id === btn.dataset.open)))
  );
}

// -------------------- NỘP BÀI --------------------

async function openSubmit(assignment) {
  currentAssignment = assignment;
  document.getElementById("submitAssignTitle").textContent = assignment.title;
  document.getElementById("submitAssignDesc").textContent = assignment.description || "";
  document.getElementById("submitError").classList.remove("show");
  document.getElementById("submitSuccess").classList.remove("show");

  const { data: existing } = await supabaseClient
    .from("submissions")
    .select("content, grade, feedback")
    .eq("assignment_id", assignment.id)
    .maybeSingle();

  document.getElementById("submitContent").value = existing?.content || "";

  const submitBtn = document.getElementById("submitBtn");
  if (existing && existing.grade !== null && existing.grade !== undefined) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Đã được chấm điểm — không thể sửa";
    showSuccess(
      document.getElementById("submitSuccess"),
      `Điểm: ${existing.grade}${existing.feedback ? " — Nhận xét: " + existing.feedback : ""}`
    );
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = existing ? "Cập nhật bài nộp" : "Nộp bài";
  }

  openModal("modalSubmit");
}

document.getElementById("submitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  const errBox = document.getElementById("submitError");
  hideError(errBox);
  setButtonLoading(btn, true);

  const content = document.getElementById("submitContent").value.trim();

  const { error } = await supabaseClient
    .from("submissions")
    .upsert(
      { assignment_id: currentAssignment.id, student_id: currentUser.id, content },
      { onConflict: "assignment_id,student_id" }
    );

  setButtonLoading(btn, false);

  if (error) {
    showError(errBox, "Không thể nộp bài: " + error.message);
    return;
  }

  closeModal("modalSubmit");
  await loadAssignments();
});
