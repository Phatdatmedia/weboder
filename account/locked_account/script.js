const CONFIG = {
  SUPABASE_URL: 'https://npsylbxggliczhtnzzgl.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig',
  ACCOUNT_HOME_URL: '/account/index.html',
  POLL_INTERVAL_MS: 7000,
  MIN_REASON_LENGTH: 30,
};

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

let currentSession = null;
let currentProfile = null;
let currentAppeal = null;
let realtimeChannel = null;
let pollTimer = null;
let toastTimer = null;
let isRedirecting = false;

const $ = id => document.getElementById(id);

function setButtonLoading(id, loading, label){
  const button = $(id);
  if(!button) return;
  button.disabled = loading;
  const textNode = $(`${id}Text`);
  if(!textNode) return;
  textNode.dataset.label = textNode.dataset.label || textNode.textContent.trim();
  textNode.textContent = loading ? 'Đang xử lý...' : (label || textNode.dataset.label);
}

function showMessage(id, message){
  const box = $(id);
  if(!box) return;
  box.textContent = message || '';
  box.classList.toggle('show', Boolean(message));
}

function showToast(message){
  $('toastMessage').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2600);
}

function formatDate(value){
  if(!value) return '';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN', {
    hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'
  });
}

function setAccountIdentity(){
  const name = currentProfile?.full_name || currentSession?.user?.user_metadata?.full_name || 'Người dùng';
  const email = currentProfile?.email || currentSession?.user?.email || '';
  $('accountName').textContent = name;
  $('accountEmail').textContent = email;
  $('accountAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
}

function resetSteps(){
  ['stepLocked','stepSubmitted','stepReviewing','stepApproved'].forEach(id => {
    $(id).classList.remove('active','done');
  });
  $('stepLocked').classList.add('active');
}

function markSteps(status){
  resetSteps();
  if(['pending','reviewing','needs_info','approved'].includes(status)){
    $('stepLocked').className = 'done';
    $('stepSubmitted').classList.add(status === 'pending' ? 'active' : 'done');
  }
  if(['reviewing','needs_info','approved'].includes(status)){
    $('stepReviewing').classList.add(['reviewing','needs_info'].includes(status) ? 'active' : 'done');
  }
  if(status === 'approved') $('stepApproved').classList.add('done');
}

function updateStatusPill(status, text){
  const pill = $('statusPill');
  pill.className = `status-pill status-${status}`;
  pill.innerHTML = `<i></i> ${text}`;
}

function renderAppeal(){
  const status = currentAppeal?.status || 'locked';
  const adminNote = currentAppeal?.admin_note?.trim();
  const formCard = $('appealFormCard');

  $('adminNoteBox').hidden = !adminNote;
  if(adminNote) $('adminNote').textContent = adminNote;

  if(currentProfile?.is_permanently_locked){
    $('statusTitle').textContent = 'Tài khoản đã bị khóa vĩnh viễn';
    $('statusMessage').textContent = 'Tài khoản không thể gửi hoặc được duyệt kháng nghị tại trang này. Vui lòng liên hệ bộ phận hỗ trợ nếu cần kiểm tra lại.';
    updateStatusPill('rejected', 'Khóa vĩnh viễn');
    formCard.hidden = true;
    resetSteps();
    return;
  }

  if(status === 'pending'){
    $('statusTitle').textContent = 'Kháng nghị đã được tiếp nhận';
    $('statusMessage').textContent = `Yêu cầu được gửi lúc ${formatDate(currentAppeal.submitted_at)}. Hệ thống sẽ tự cập nhật ngay khi có kết quả.`;
    updateStatusPill('pending', 'Chờ duyệt');
    formCard.hidden = true;
  } else if(status === 'reviewing'){
    $('statusTitle').textContent = 'Kháng nghị đang được xem xét';
    $('statusMessage').textContent = 'Bộ phận kiểm duyệt đang kiểm tra thông tin. Bạn không cần gửi thêm yêu cầu.';
    updateStatusPill('reviewing', 'Đang xem xét');
    formCard.hidden = true;
  } else if(status === 'needs_info'){
    $('statusTitle').textContent = 'Kháng nghị cần bổ sung';
    $('statusMessage').textContent = 'Quản trị viên cần thêm thông tin để tiếp tục xem xét. Hãy đọc phản hồi, bổ sung đầy đủ rồi gửi lại.';
    updateStatusPill('needs-info', 'Cần bổ sung');
    $('formTitle').textContent = 'Bổ sung và gửi lại kháng nghị';
    $('submitAppealBtnText').dataset.label = 'Gửi lại kháng nghị';
    $('submitAppealBtnText').textContent = 'Gửi lại kháng nghị';
    formCard.hidden = false;
  } else if(status === 'rejected'){
    $('statusTitle').textContent = 'Kháng nghị đã bị từ chối';
    $('statusMessage').textContent = 'Tài khoản đã bị khóa vĩnh viễn. Chỉ quản trị viên mới có thể mở lại bằng thao tác thủ công.';
    updateStatusPill('rejected', 'Khóa vĩnh viễn');
    formCard.hidden = true;
  } else {
    $('statusTitle').textContent = 'Tài khoản đang chờ kháng nghị';
    $('statusMessage').textContent = 'Tài khoản vẫn đang bị giới hạn. Hoàn tất biểu mẫu bên dưới để yêu cầu xem xét mở lại.';
    updateStatusPill('locked', 'Tạm khóa');
    formCard.hidden = false;
  }

  markSteps(status);
}

function showApprovedAndRedirect(){
  if(isRedirecting) return;
  isRedirecting = true;
  clearInterval(pollTimer);
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  $('approvedOverlay').classList.add('show');
  setTimeout(() => window.location.replace(CONFIG.ACCOUNT_HOME_URL), 1100);
}

async function fetchLatestAppeal(){
  const { data, error } = await sb
    .from('account_appeals')
    .select('id, status, reason, contact, admin_note, submitted_at, reviewed_at')
    .eq('user_id', currentSession.user.id)
    .order('submitted_at', { ascending:false })
    .limit(1)
    .maybeSingle();

  if(error) throw error;
  return data || null;
}

async function loadAccountState({ silent = false } = {}){
  if(!currentSession?.user || isRedirecting) return;
  if(!silent) setButtonLoading('checkStatusBtn', true);

  try{
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('full_name, email, is_locked, is_permanently_locked')
      .eq('id', currentSession.user.id)
      .single();

    if(profileError) throw profileError;
    currentProfile = profile;
    setAccountIdentity();

    if(!profile.is_locked && !profile.is_permanently_locked){
      showApprovedAndRedirect();
      return;
    }

    currentAppeal = await fetchLatestAppeal();
    if(currentAppeal?.status === 'approved'){
      // Trigger duyệt sẽ đồng thời mở khoá profile. Tải lại profile một lần
      // để tránh chuyển trang trước khi giao dịch backend hoàn tất.
      const { data: refreshed } = await sb
        .from('profiles')
        .select('is_locked, is_permanently_locked')
        .eq('id', currentSession.user.id)
        .single();
      if(refreshed && !refreshed.is_locked && !refreshed.is_permanently_locked){
        showApprovedAndRedirect();
        return;
      }
    }
    renderAppeal();
    if(!silent) showToast('Đã cập nhật trạng thái mới nhất.');
  } catch(error){
    console.error('Không tải được trạng thái tài khoản:', error);
    if(!silent){
      $('statusTitle').textContent = 'Chưa thể tải trạng thái';
      $('statusMessage').textContent = 'Kết nối tạm thời gián đoạn. Vui lòng bấm kiểm tra lại.';
      updateStatusPill('rejected', 'Lỗi kết nối');
      showMessage('formError', translateError(error));
    }
  } finally {
    if(!silent) setButtonLoading('checkStatusBtn', false, 'Kiểm tra trạng thái');
  }
}

function translateError(error){
  if(error?.code === '23505') return 'Tài khoản đã có một kháng nghị đang chờ duyệt.';
  if(error?.code === '42501') return 'Bạn không có quyền thực hiện thao tác này.';
  if(error?.code === '42P01' || error?.code === 'PGRST205') return 'Chức năng kháng nghị chưa được cấu hình trên hệ thống.';
  return error?.message || 'Không thể kết nối hệ thống. Vui lòng thử lại.';
}

async function submitAppeal(){
  showMessage('formError', '');
  showMessage('formSuccess', '');

  if(currentProfile?.is_permanently_locked){
    showMessage('formError', 'Tài khoản đã bị khóa vĩnh viễn và không thể gửi kháng nghị tại đây.');
    return;
  }

  const reason = $('appealReason').value.trim();
  const contact = $('appealContact').value.trim();

  if($('appealWebsite').value.trim()) return;
  if(reason.length < CONFIG.MIN_REASON_LENGTH){
    showMessage('formError', `Nội dung kháng nghị cần có ít nhất ${CONFIG.MIN_REASON_LENGTH} ký tự.`);
    $('appealReason').focus();
    return;
  }
  if(!$('appealConfirm').checked){
    showMessage('formError', 'Vui lòng xác nhận nội dung trước khi gửi kháng nghị.');
    return;
  }
  if(!currentSession?.user || !currentProfile?.is_locked){
    await loadAccountState();
    return;
  }
  if(['pending','reviewing'].includes(currentAppeal?.status)){
    showMessage('formError', 'Tài khoản đã có một kháng nghị đang được xử lý.');
    return;
  }

  setButtonLoading('submitAppealBtn', true);
  try{
    // Kiểm tra lại trên backend ngay trước khi ghi để không gửi trùng yêu cầu.
    const latest = await fetchLatestAppeal();
    if(['pending','reviewing'].includes(latest?.status)){
      currentAppeal = latest;
      renderAppeal();
      showToast('Kháng nghị hiện tại đang được xử lý.');
      return;
    }

    const { data, error } = await sb
      .from('account_appeals')
      .insert({
        user_id: currentSession.user.id,
        email: currentSession.user.email || currentProfile.email || '',
        reason,
        contact: contact || null,
      })
      .select('id, status, reason, contact, admin_note, submitted_at, reviewed_at')
      .single();

    if(error) throw error;
    currentAppeal = data;
    showMessage('formSuccess', 'Kháng nghị đã được gửi thành công.');
    renderAppeal();
    showToast('Đã gửi kháng nghị thành công.');
  } catch(error){
    showMessage('formError', translateError(error));
  } finally {
    setButtonLoading('submitAppealBtn', false, currentAppeal?.status === 'needs_info' ? 'Gửi lại kháng nghị' : 'Gửi kháng nghị');
  }
}

async function checkStatusNow(){
  await loadAccountState();
}

async function handleLogout(){
  clearInterval(pollTimer);
  if(realtimeChannel) await sb.removeChannel(realtimeChannel);
  await sb.auth.signOut();
  window.location.replace(CONFIG.ACCOUNT_HOME_URL);
}

function subscribeToAccountChanges(){
  realtimeChannel = sb
    .channel(`locked-account-${currentSession.user.id}`)
    .on('postgres_changes', {
      event:'UPDATE', schema:'public', table:'profiles',
      filter:`id=eq.${currentSession.user.id}`
    }, payload => {
      if(payload.new && payload.new.is_locked === false && payload.new.is_permanently_locked !== true){
        showApprovedAndRedirect();
      }
    })
    .on('postgres_changes', {
      event:'*', schema:'public', table:'account_appeals',
      filter:`user_id=eq.${currentSession.user.id}`
    }, () => loadAccountState({ silent:true }))
    .subscribe();
}

$('appealReason').addEventListener('input', event => {
  $('reasonCount').textContent = event.target.value.length;
});

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') loadAccountState({ silent:true });
});

sb.auth.onAuthStateChange(event => {
  if(event === 'SIGNED_OUT' && !isRedirecting){
    window.location.replace(CONFIG.ACCOUNT_HOME_URL);
  }
});

(async function init(){
  const { data, error } = await sb.auth.getSession();
  if(error || !data?.session?.user){
    window.location.replace(CONFIG.ACCOUNT_HOME_URL);
    return;
  }

  currentSession = data.session;
  setAccountIdentity();
  await loadAccountState({ silent:true });
  if(isRedirecting) return;

  subscribeToAccountChanges();
  pollTimer = setInterval(() => loadAccountState({ silent:true }), CONFIG.POLL_INTERVAL_MS);
})();