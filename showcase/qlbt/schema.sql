-- ============================================================================
-- HỆ THỐNG GIAO BÀI TẬP / BÀI KIỂM TRA
-- Schema + Row Level Security (RLS) cho Supabase
-- Chạy TOÀN BỘ file này trong Supabase Studio > SQL Editor
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. TIỆN ÍCH
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. BẢNG ROLES (tách riêng khỏi profiles để KHÔNG BAO GIỜ cho phép
--    người dùng tự sửa role của chính mình qua API — đây là lỗi leo thang
--    đặc quyền (privilege escalation) phổ biến nhất trong các hệ thống kiểu này)
-- ----------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Ai cũng có thể ĐỌC role của chính mình, KHÔNG ai được tự ghi/sửa bảng này
-- từ client (chỉ được ghi qua function bảo mật bên dưới, chạy với security definer)
create policy "user can read own role"
  on public.user_roles for select
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2. BẢNG MÃ MỜI GIÁO VIÊN (teacher_invites)
--    Chỉ ai có mã mời hợp lệ, dùng 1 lần, mới được đăng ký làm giáo viên.
--    Bạn (chủ hệ thống) tự tạo mã này trong Supabase Studo và gửi cho giáo viên
--    qua kênh riêng tư (không public trên web). KHÔNG có API công khai để tạo mã.
-- ----------------------------------------------------------------------------
create table public.teacher_invites (
  code text primary key,
  used_by uuid references auth.users(id),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.teacher_invites enable row level security;
-- Không policy nào cho phép SELECT/INSERT/UPDATE từ client -> mặc định deny all.
-- Việc kiểm tra mã mời chỉ thực hiện bên trong function security definer.

-- ----------------------------------------------------------------------------
-- 3. PROFILES (thông tin hiển thị, KHÔNG chứa role)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "user can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "user can update own profile (not role)"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "user can insert own profile once"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Giáo viên được xem hồ sơ học sinh trong lớp mình dạy
create policy "teacher can read student profiles in own classes"
  on public.profiles for select
  using (
    exists (
      select 1 from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.student_id = profiles.id
        and c.teacher_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. FUNCTION ĐĂNG KÝ AN TOÀN (security definer)
--    Đây là NƠI DUY NHẤT gán role. Client không bao giờ được tự ý gửi role='teacher'.
-- ----------------------------------------------------------------------------
create or replace function public.complete_registration(
  p_full_name text,
  p_role text,
  p_invite_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite record;
begin
  if v_uid is null then
    raise exception 'Không có phiên đăng nhập hợp lệ';
  end if;

  if p_role not in ('teacher', 'student') then
    raise exception 'Vai trò không hợp lệ';
  end if;

  -- Nếu đăng ký làm giáo viên -> BẮT BUỘC phải có mã mời hợp lệ, chưa dùng, chưa hết hạn
  if p_role = 'teacher' then
    select * into v_invite
    from public.teacher_invites
    where code = p_invite_code
      and used_by is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Mã mời giáo viên không hợp lệ hoặc đã hết hạn';
    end if;

    update public.teacher_invites
      set used_by = v_uid, used_at = now()
      where code = p_invite_code;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_uid, p_role)
  on conflict (user_id) do nothing;

  insert into public.profiles (id, full_name)
  values (v_uid, p_full_name)
  on conflict (id) do update set full_name = excluded.full_name;
end;
$$;

revoke all on function public.complete_registration from public;
grant execute on function public.complete_registration to authenticated;

-- Helper function kiểm tra vai trò hiện tại (dùng trong policy cho gọn & nhanh)
create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid();
$$;

grant execute on function public.current_role to authenticated;

-- ----------------------------------------------------------------------------
-- 5. CLASSES (lớp học)
-- ----------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.classes enable row level security;

create policy "teacher can manage own classes"
  on public.classes for all
  using (teacher_id = auth.uid() and public.current_role() = 'teacher')
  with check (teacher_id = auth.uid() and public.current_role() = 'teacher');

create policy "student can view classes they joined"
  on public.classes for select
  using (
    exists (
      select 1 from public.class_members cm
      where cm.class_id = classes.id and cm.student_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. CLASS_MEMBERS (học sinh trong lớp)
-- ----------------------------------------------------------------------------
create table public.class_members (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

alter table public.class_members enable row level security;

create policy "teacher can view members of own classes"
  on public.class_members for select
  using (
    exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy "teacher can remove members of own classes"
  on public.class_members for delete
  using (
    exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy "student can view own membership"
  on public.class_members for select
  using (student_id = auth.uid());

-- Học sinh KHÔNG được tự insert trực tiếp vào bảng này (tránh tự ý join lớp
-- không đúng mã). Việc join lớp bắt buộc qua function join_class_by_code bên dưới.

create or replace function public.join_class_by_code(p_join_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_uid uuid := auth.uid();
begin
  if public.current_role() <> 'student' then
    raise exception 'Chỉ học sinh mới có thể tham gia lớp';
  end if;

  select id into v_class_id from public.classes where join_code = p_join_code;

  if v_class_id is null then
    raise exception 'Mã lớp không hợp lệ';
  end if;

  insert into public.class_members (class_id, student_id)
  values (v_class_id, v_uid)
  on conflict do nothing;

  return v_class_id;
end;
$$;

revoke all on function public.join_class_by_code from public;
grant execute on function public.join_class_by_code to authenticated;

-- ----------------------------------------------------------------------------
-- 7. ASSIGNMENTS (bài tập / bài kiểm tra)
-- ----------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  type text not null check (type in ('homework', 'exam')),
  due_date timestamptz,
  attachment_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.assignments enable row level security;

create policy "teacher can manage own assignments"
  on public.assignments for all
  using (teacher_id = auth.uid() and public.current_role() = 'teacher')
  with check (teacher_id = auth.uid() and public.current_role() = 'teacher');

create policy "student can view published assignments of own classes"
  on public.assignments for select
  using (
    is_published = true
    and exists (
      select 1 from public.class_members cm
      where cm.class_id = assignments.class_id and cm.student_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 8. SUBMISSIONS (bài nộp)
-- ----------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  content text default '',
  file_path text,
  submitted_at timestamptz not null default now(),
  grade numeric(5,2),
  feedback text,
  graded_at timestamptz,
  graded_by uuid references auth.users(id),
  unique (assignment_id, student_id)
);

alter table public.submissions enable row level security;

-- Học sinh: chỉ được thao tác trên bài nộp của chính mình, và chỉ với bài tập
-- đã publish thuộc lớp mình đang học
create policy "student can view own submissions"
  on public.submissions for select
  using (student_id = auth.uid());

create policy "student can insert own submission"
  on public.submissions for insert
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.assignments a
      join public.class_members cm on cm.class_id = a.class_id
      where a.id = assignment_id
        and a.is_published = true
        and cm.student_id = auth.uid()
    )
  );

create policy "student can update own submission before grading"
  on public.submissions for update
  using (student_id = auth.uid() and graded_at is null)
  with check (student_id = auth.uid() and graded_at is null);

-- Giáo viên: xem & chấm bài nộp thuộc bài tập của mình. KHÔNG được sửa content
-- bài làm của học sinh (chỉ được set grade/feedback) — thực thi bằng trigger bên dưới.
create policy "teacher can view submissions of own assignments"
  on public.submissions for select
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  );

create policy "teacher can grade submissions of own assignments"
  on public.submissions for update
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_id and a.teacher_id = auth.uid()
    )
  );

-- Trigger: đảm bảo giáo viên chỉ có thể thay đổi grade/feedback, không sửa bài làm học sinh
create or replace function public.protect_submission_content()
returns trigger
language plpgsql
security definer
as $$
begin
  if public.current_role() = 'teacher' then
    new.content := old.content;
    new.file_path := old.file_path;
    new.student_id := old.student_id;
    new.assignment_id := old.assignment_id;
    new.graded_by := auth.uid();
    new.graded_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_protect_submission_content
  before update on public.submissions
  for each row execute function public.protect_submission_content();

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOG (nhật ký hành động nhạy cảm — phục vụ phát hiện bất thường)
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
-- Không ai được đọc/ghi trực tiếp từ client. Chỉ ghi qua function security definer.

create or replace function public.log_action(p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, action, details)
  values (auth.uid(), p_action, p_details);
$$;

grant execute on function public.log_action to authenticated;

-- ----------------------------------------------------------------------------
-- 10. STORAGE BUCKETS (chạy trong Supabase Studio > Storage nếu muốn dùng file đính kèm)
-- ----------------------------------------------------------------------------
-- Tạo 2 bucket PRIVATE (không public):
--   assignment-attachments  (giáo viên upload đề bài)
--   submission-files        (học sinh nộp bài)
--
-- Sau khi tạo bucket, chạy các policy Storage sau:

insert into storage.buckets (id, name, public)
values ('assignment-attachments', 'assignment-attachments', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('submission-files', 'submission-files', false)
on conflict (id) do nothing;

-- Giáo viên upload file đính kèm đề bài vào thư mục có tên = teacher_id của họ
create policy "teacher upload own attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'assignment-attachments'
    and public.current_role() = 'teacher'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "teacher manage own attachments"
  on storage.objects for all
  using (
    bucket_id = 'assignment-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Học sinh trong lớp được xem file đính kèm (đọc qua signed URL do app tạo)
create policy "class members can read attachments"
  on storage.objects for select
  using (
    bucket_id = 'assignment-attachments'
    and exists (
      select 1 from public.assignments a
      join public.class_members cm on cm.class_id = a.class_id
      where a.attachment_path = name
        and cm.student_id = auth.uid()
        and a.is_published = true
    )
  );

-- Học sinh upload bài nộp vào thư mục có tên = student_id của họ
create policy "student upload own submission file"
  on storage.objects for insert
  with check (
    bucket_id = 'submission-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "student manage own submission file"
  on storage.objects for all
  using (
    bucket_id = 'submission-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "teacher read submission files of own assignments"
  on storage.objects for select
  using (
    bucket_id = 'submission-files'
    and exists (
      select 1 from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where s.file_path = name and a.teacher_id = auth.uid()
    )
  );

-- ============================================================================
-- HẾT SCHEMA
-- Ghi chú bảo mật quan trọng:
-- 1. Bảng user_roles KHÔNG có policy insert/update từ client -> chỉ
--    complete_registration() (security definer) mới ghi được.
-- 2. Đăng ký làm giáo viên bắt buộc mã mời hợp lệ, dùng 1 lần, có hạn 7 ngày.
-- 3. Vào Supabase Dashboard > Authentication > Providers > Email:
--    - Bật "Confirm email"
--    - Bật "Leaked password protection"
--    - Đặt độ dài mật khẩu tối thiểu 12 ký tự
-- 4. Vào Authentication > Rate Limits: giữ giới hạn mặc định hoặc thắt chặt hơn.
-- 5. KHÔNG BAO GIỜ đưa service_role key vào code frontend, chỉ dùng anon key.
-- ============================================================================
