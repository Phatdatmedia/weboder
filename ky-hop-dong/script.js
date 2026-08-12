const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig",
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

const params = new URLSearchParams(window.location.search);
const TOKEN = params.get('token');
let currentContract = null;

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

async function loadContract(){
  if(!TOKEN){
    showError('Thiếu mã hợp đồng trong đường dẫn. Vui lòng dùng đúng link được gửi cho bạn.');
    return;
  }
  try{
    const { data, error } = await sb.rpc('get_contract_by_token', { p_token: TOKEN });
    if(error || !data?.ok){
      showError(data?.error || error?.message || 'Không tải được hợp đồng.');
      return;
    }
    currentContract = data.contract;
    renderContract(currentContract);
    document.getElementById('loadingBox').style.display = 'none';
    document.getElementById('contractBox').style.display = 'block';

    if(currentContract.party_b_signed_at){
      document.getElementById('signSection').style.display = 'none';
      document.getElementById('alreadySignedBox').style.display = 'block';
      document.getElementById('signedAtText').textContent =
        `Đã ký lúc ${new Date(currentContract.party_b_signed_at).toLocaleString('vi-VN')}`;
    } else {
      initSignaturePad('custSignCanvas');
    }
  } catch(e){
    showError('Lỗi tải hợp đồng: ' + e.message);
  }
}

function showError(msg){
  document.getElementById('loadingBox').style.display = 'none';
  const box = document.getElementById('errorBox');
  box.style.display = 'block';
  box.textContent = '⚠️ ' + msg;
}

function renderContract(c){
  const box = document.getElementById('contractContent');
  const articles = buildContractArticles(c.service_type, {
    detail: c.service_detail, value: c.contract_value, deposit: c.deposit_amount || 0,
    duration: c.duration_text, note: c.extra_note
  });

  let html = `
    <div class="ct-center" style="font-weight:700;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
    <div class="ct-center" style="margin-bottom:4px;">Độc lập - Tự do - Hạnh phúc</div>
    <div class="ct-center" style="color:var(--ink-soft); margin-bottom:14px;">———o0o———</div>
    <h2 class="ct-title">HỢP ĐỒNG DỊCH VỤ<br>${esc(CONTRACT_TYPE_LABEL[c.service_type] || '')}</h2>
    <div class="ct-no">Số: ${esc(c.contract_no)} — Ngày ${new Date(c.created_at).toLocaleDateString('vi-VN')}</div>

    <div class="ct-party">
      <b>BÊN A (BÊN CUNG CẤP DỊCH VỤ)</b>
      Đại diện: ${esc(c.party_a_name||'')}<br>
      ${c.party_a_id ? `CCCD/CMND: ${esc(c.party_a_id)}<br>` : ''}
      ${c.party_a_address ? `Địa chỉ: ${esc(c.party_a_address)}<br>` : ''}
      ${c.party_a_phone ? `Điện thoại: ${esc(c.party_a_phone)}<br>` : ''}
      Email: ${esc(c.party_a_email||'')}
    </div>

    <div class="ct-party">
      <b>BÊN B (BÊN SỬ DỤNG DỊCH VỤ)</b>
      Họ và tên/Đơn vị: ${esc(c.party_b_name||'')}<br>
      ${c.party_b_id ? `CCCD/CMND/MST: ${esc(c.party_b_id)}<br>` : ''}
      ${c.party_b_address ? `Địa chỉ: ${esc(c.party_b_address)}<br>` : ''}
      ${c.party_b_phone ? `Điện thoại: ${esc(c.party_b_phone)}<br>` : ''}
      ${c.party_b_email ? `Email: ${esc(c.party_b_email)}` : ''}
    </div>
  `;

  articles.forEach(art => {
    html += `<div class="ct-article-title">${esc(art.title)}</div>`;
    art.body.forEach(p => { html += `<div class="ct-article-body">${esc(p)}</div>`; });
  });

  html += `
    <div class="ct-sig-row">
      <div class="ct-sig-col">
        <b>ĐẠI DIỆN BÊN A</b>
        ${c.party_a_signature ? `<img src="${c.party_a_signature}" alt="Chữ ký Bên A">` : '<div style="height:70px;"></div>'}
        ${c.party_a_signed_at ? `<div class="ct-sig-time">Đã ký: ${new Date(c.party_a_signed_at).toLocaleString('vi-VN')}</div>` : '<div class="ct-sig-time">Chưa ký</div>'}
      </div>
      <div class="ct-sig-col">
        <b>ĐẠI DIỆN BÊN B</b>
        <div id="ctSigBBox">${c.party_b_signature ? `<img src="${c.party_b_signature}" alt="Chữ ký Bên B">` : '<div style="height:70px;"></div>'}</div>
        <div class="ct-sig-time" id="ctSigBTime">${c.party_b_signed_at ? 'Đã ký: ' + new Date(c.party_b_signed_at).toLocaleString('vi-VN') : 'Chưa ký'}</div>
      </div>
    </div>
  `;

  box.innerHTML = html;
}

async function submitSignature(){
  const msg = document.getElementById('signMsg');
  msg.className = 'msg';

  if(isSignatureEmpty('custSignCanvas')){
    msg.textContent = 'Vui lòng ký vào khung phía trên trước.';
    msg.className = 'msg err';
    return;
  }
  if(!document.getElementById('agreeCheck').checked){
    msg.textContent = 'Vui lòng xác nhận đã đọc và đồng ý với nội dung hợp đồng.';
    msg.className = 'msg err';
    return;
  }

  const btn = document.getElementById('signBtn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Đang gửi...';

  try{
    const signature = getSignatureDataURL('custSignCanvas');
    const { data, error } = await sb.functions.invoke('sign-contract', {
      body: { token: TOKEN, party: 'b', signature, userAgent: navigator.userAgent }
    });

    if(error || !data?.ok){
      throw new Error(data?.error || error?.message || 'Không ký được, thử lại sau.');
    }

    msg.textContent = '✅ Đã ký thành công!';
    msg.className = 'msg ok';

    document.getElementById('ctSigBBox').innerHTML = `<img src="${signature}" alt="Chữ ký Bên B">`;
    document.getElementById('ctSigBTime').textContent = 'Đã ký: ' + new Date(data.signed_at).toLocaleString('vi-VN');

    setTimeout(() => {
      document.getElementById('signSection').style.display = 'none';
      document.getElementById('alreadySignedBox').style.display = 'block';
      document.getElementById('signedAtText').textContent = 'Đã ký lúc ' + new Date(data.signed_at).toLocaleString('vi-VN');
    }, 1200);
  } catch(e){
    msg.textContent = 'Lỗi: ' + e.message;
    msg.className = 'msg err';
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
}

loadContract();