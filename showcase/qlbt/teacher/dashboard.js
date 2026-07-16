// ============================================================
// LOGIC TRANG GIÁO VIÊN
// Mọi truy vấn dưới đây đều được RLS lọc theo teacher_id = auth.uid()
// ngay tại database — kể cả nếu đoạn JS này bị sửa/bypass, giáo viên A
// vẫn không thể đọc/ghi dữ liệu lớp của giáo viên B.
// ============================================================

let currentUser = null;
let currentClassId = null;

(async () => {
  const auth = await requireRole("teacher");
  if (!auth) return;
  currentUser = auth.user;
  document.getElementById("userName").textContent = auth.profile?.full_name || auth.user.email;
  await loadClasses();
})();

document.getElementById("logoutBtn").addEventListener("click", logout);

document.querySelectorAll("[data-close]").forEach((btn) =>
  btn.addEventListener("click", () => closeModal(btn.dataset.close))
);
function openModal(id) { document.getElementById(id).classList.add("show"); }
function closeModal(id) { document.getElementById(id).classList.remove("show"); }

// -------------------- LỚP HỌC --------------------

async function loadClasses() {
  const { data: classes, error } = await supabaseClient
    .from("classes")
    .select("id, name, join_code, created_at")
    .order("created_at", { ascending: false });

  const grid = document.getElementById("classGrid");
  grid.innerHTML = "";

  if (error) {
    grid.innerHTML = `<div class="empty">Không tải được danh sách lớp.</div>`;
    return;
  }
  if (!classes.length) {
    grid.innerHTML = `<div class="empty">Chưa có lớp nào. Nhấn "Tạo lớp mới" để bắt đầu.</div>`;
    return;
  }

  classes.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cursor = "pointer";
    card.innerHTML = `
      <h3>${escapeHTML(c.name)}</h3>
      <p>Mã lớp: <span class="join-code">${escapeHTML(c.join_code)}</span></p>
    `;
    card.addEventListener("click", () => openClassDetail(c.id, c.name, c.join_code));
    grid.appendChild(card);
  });
}

document.getElementById("openCreateClass").addEventListener("click", () => openModal("modalCreateClass"));

document.getElementById("createClassForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("createClassBtn");
  const errBox = document.getElementById("createClassError");
  hideError(errBox);
  setButtonLoading(btn, true);

  const name = document.getElementById("className").value.trim();
  const join_code = randomCode(6);

  const { error } = await supabaseClient.from("classes").insert({
    teacher_id: currentUser.id,
    name,
    join_code,
  });

  setButtonLoading(btn, false);

  if (error) {
    showError(errBox, "Không thể tạo lớp: " + error.message);
    return;
  }

  document.getElementById("createClassForm").reset();
  closeModal("modalCreateClass");
  await loadClasses();
});

// -------------------- CHI TIẾT LỚP --------------------

async function openClassDetail(classId, name, joinCode) {
  currentClassId = classId;
  document.getElementById("classDetail").style.display = "block";
  document.getElementById("detailClassName").textContent = name;
  document.getElementById("detailClassCode").textContent = `Mã lớp: ${joinCode}`;
  document.getElementById("classDetail").scrollIntoView({ behavior: "smooth" });
  await Promise.all([loadAssignments(classId), loadMembers(classId)]);
}

async function loadAssignments(classId) {
  const { data: assignments, error } = await supabaseClient
    .from("assignments")
    .select("id, title, type, due_date, is_published, created_at")
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  const list = document.getElementById("assignmentList");
  list.innerHTML = "";

  if (error || !assignments.length) {
    list.innerHTML = `<div class="empty">Chưa có bài tập nào.</div>`;
    return;
  }

  assignments.forEach((a) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div>
        <div class="title">${escapeHTML(a.title)}</div>
        <div class="meta">
          <span class="badge ${a.type === "exam" ? "badge-exam" : "badge-homework"}">${a.type === "exam" ? "Kiểm tra" : "Bài tập"}</span>
          <span class="badge ${a.is_published ? "badge-published" : "badge-draft"}">${a.is_published ? "Đã xuất bản" : "Bản nháp"}</span>
          · Hạn: ${formatDate(a.due_date)}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-secondary" data-grade="${a.id}" data-title="${escapeHTML(a.title)}">Chấm bài</button>
      </div>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("[data-grade]").forEach((btn) =>
    btn.addEventListener("click", () => openGrading(btn.dataset.grade, btn.dataset.title))
  );
}

async function loadMembers(classId) {
  const { data: members, error } = await supabaseClient
    .from("class_members")
    .select("student_id, joined_at, profiles(full_name)")
    .eq("class_id", classId);

  const list = document.getElementById("memberList");
  list.innerHTML = "";

  if (error || !members.length) {
    list.innerHTML = `<div class="empty">Chưa có học sinh nào tham gia.</div>`;
    return;
  }

  members.forEach((m) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <div class="title">${escapeHTML(m.profiles?.full_name || "Học sinh")}</div>
      <div class="meta">Tham gia: ${formatDate(m.joined_at)}</div>
    `;
    list.appendChild(row);
  });
}

// -------------------- GIAO BÀI --------------------

document.getElementById("openCreateAssignment").addEventListener("click", () => {
  if (!currentClassId) return;
  openModal("modalCreateAssignment");
});

document.getElementById("createAssignmentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("createAssignmentBtn");
  const errBox = document.getElementById("createAssignmentError");
  hideError(errBox);
  setButtonLoading(btn, true);

  const title = document.getElementById("assignTitle").value.trim();
  const type = document.getElementById("assignType").value;
  const description = document.getElementById("assignDesc").value.trim();
  const dueLocal = document.getElementById("assignDue").value;
  const is_published = document.getElementById("assignPublish").checked;

  const { error } = await supabaseClient.from("assignments").insert({
    class_id: currentClassId,
    teacher_id: currentUser.id,
    title,
    type,
    description,
    due_date: dueLocal ? new Date(dueLocal).toISOString() : null,
    is_published,
  });

  setButtonLoading(btn, false);

  if (error) {
    showError(errBox, "Không thể giao bài: " + error.message);
    return;
  }

  document.getElementById("createAssignmentForm").reset();
  closeModal("modalCreateAssignment");
  await loadAssignments(currentClassId);
});

// -------------------- CHẤM BÀI --------------------

async function openGrading(assignmentId, title) {
  openModal("modalGrade");
  const container = document.getElementById("gradeSubmissionsList");
  container.innerHTML = `<p>Đang tải bài nộp cho "${escapeHTML(title)}"...</p>`;

  const { data: submissions, error } = await supabaseClient
    .from("submissions")
    .select("id, content, submitted_at, grade, feedback, student_id, profiles(full_name)")
    .eq("assignment_id", assignmentId)
    .order("submitted_at", { ascending: false });

  if (error) {
    container.innerHTML = `<div class="empty">Không tải được bài nộp.</div>`;
    return;
  }
  if (!submissions.length) {
    container.innerHTML = `<div class="empty">Chưa có học sinh nào nộp bài.</div>`;
    return;
  }

  container.innerHTML = "";
  submissions.forEach((s) => {
    const box = document.createElement("div");
    box.className = "item-row";
    box.style.flexDirection = "column";
    box.style.alignItems = "stretch";
    box.style.gap = "8px";
    box.innerHTML = `
      <div class="title">${escapeHTML(s.profiles?.full_name || "Học sinh")}
        <span class="badge ${s.grade !== null ? "badge-graded" : "badge-pending"}">${s.grade !== null ? "Đã chấm" : "Chờ chấm"}</span>
      </div>
      <div class="meta">Nộp lúc: ${formatDate(s.submitted_at)}</div>
      <div style="white-space:pre-wrap; background:#F5F3EE; padding:10px; border-radius:6px; font-size:.88rem;">${escapeHTML(s.content || "(Không có nội dung văn bản)")}</div>
      <label>Điểm (0-10)</label>
      <input type="number" min="0" max="10" step="0.1" value="${s.grade ?? ""}" data-grade-input="${s.id}" />
      <label>Nhận xét</label>
      <textarea data-feedback-input="${s.id}">${escapeHTML(s.feedback || "")}</textarea>
      <button class="btn btn-primary" style="margin-top:8px;" data-save-grade="${s.id}">Lưu điểm</button>
    `;
    container.appendChild(box);
  });

  container.querySelectorAll("[data-save-grade]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.saveGrade;
      const gradeVal = container.querySelector(`[data-grade-input="${id}"]`).value;
      const feedbackVal = container.querySelector(`[data-feedback-input="${id}"]`).value;

      setButtonLoading(btn, true, "Đang lưu...");
      const { error: gradeErr } = await supabaseClient
        .from("submissions")
        .update({
          grade: gradeVal === "" ? null : Number(gradeVal),
          feedback: feedbackVal,
        })
        .eq("id", id);
      setButtonLoading(btn, false);

      if (gradeErr) {
        alert("Không thể lưu điểm: " + gradeErr.message);
      } else {
        btn.textContent = "Đã lưu ✓";
      }
    });
  });
}
