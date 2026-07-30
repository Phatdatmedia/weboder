/* =====================================================================
   CẤU HÌNH SUPABASE — dùng chung project với trang chủ (index.html)
===================================================================== */
const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig",

  // Thông tin nhận thanh toán VietQR (fallback thủ công — sẽ bị ghi đè bởi
  // cấu hình thật admin đã lưu ở tab "Thanh toán" trong admin, dùng chung site_config)
  BANK_ID: "970407",
  BANK_NAME: "Techcombank",
  ACCOUNT_NUMBER: "3838648888",
  ACCOUNT_NAME: "LE PHAT DAT",

  // PayOS
  PAYOS_RETURN_URL: "https://phatdatagency.id.vn/payment-success",
  PAYOS_CANCEL_URL: "https://phatdatagency.id.vn/payment-cancel",
  PAYOS_DESCRIPTION: "Dat coc don hang",
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* Nạp cấu hình thanh toán thật từ Supabase (site_config, key 'payment_config') —
   đúng bảng admin đang sửa ở tab "Thanh toán", dùng chung với trang chủ. */
let paymentConfigReady = (async () => {
  try{
    const { data, error } = await sb.from('site_config').select('value').eq('key', 'payment_config').single();
    if(error) throw error;
    const c = data?.value;
    if(!c) return;
    if(c.depositDesc) CONFIG.PAYOS_DESCRIPTION = c.depositDesc;
    if(c.bankName)    CONFIG.BANK_NAME        = c.bankName;
    if(c.bankId)      CONFIG.BANK_ID          = c.bankId;
    if(c.accNum)      CONFIG.ACCOUNT_NUMBER   = c.accNum;
    if(c.accName)     CONFIG.ACCOUNT_NAME     = c.accName;
    if(c.returnUrl)   CONFIG.PAYOS_RETURN_URL = c.returnUrl;
    if(c.cancelUrl)   CONFIG.PAYOS_CANCEL_URL = c.cancelUrl;
  } catch(e){ /* giữ giá trị mặc định nếu chưa cấu hình */ }
})();

/* Đơn giá lấy từ bảng social_ads_pricing (quản lý ở admin.html, tab "Đơn tương tác").
   Bộ giá minh hoạ bên dưới chỉ dùng tạm khi chưa tải được từ Supabase (mất mạng, chưa tạo bảng...). */
let UNIT_PRICE = {
  Facebook:  { Like: 15, Follow: 20, Comment: 60, Share: 25, View: 5 },
  Instagram: { Like: 12, Follow: 25, Comment: 65, Share: 20, View: 6 },
  TikTok:    { Like: 10, Follow: 22, Comment: 55, Share: 18, View: 4 },
  YouTube:   { Like: 25, Follow: 40, Comment: 90, Share: 30, View: 8 },
};
const SERVICE_LABEL = { Like:'Tăng like', Follow:'Tăng follow', Comment:'Tăng bình luận', Share:'Tăng chia sẻ', View:'Tăng lượt xem' };

// Khai báo TRƯỚC ở đây vì updateQuote() (gọi ngay bên dưới) cần dùng tới các
// biến này qua updateWalletPillState() — để dưới cũ sẽ bị lỗi
// "Cannot access before initialization" và làm gãy toàn bộ script.
let loggedInProfile = null; // { id, name, email } — null nếu là khách vãng lai
let walletBalance = 0;
let selectedPayment = null;

async function loadPricingFromSupabase(){
  try{
    const { data, error } = await sb.from('social_ads_pricing').select('*');
    if(error || !data || !data.length) return; // giữ bộ giá tạm nếu chưa có bảng/dữ liệu
    const table = {};
    data.forEach(row => {
      if(!table[row.platform]) table[row.platform] = {};
      table[row.platform][row.interaction_type] = Number(row.unit_price) || 0;
      if(row.interaction_label) SERVICE_LABEL[row.interaction_type] = row.interaction_label;
    });
    UNIT_PRICE = table;
    updateQuote();
  } catch(e){ /* im lặng giữ bộ giá tạm nếu lỗi mạng */ }
}

const els = {
  platform: document.getElementById('f_platform'),
  service:  document.getElementById('f_service'),
  qty:      document.getElementById('f_qty'),
};

function updateQuote(){
  const platform = els.platform.value;
  const service = els.service.value;
  const qty = Number(els.qty.value) || 0;
  const unit = (UNIT_PRICE[platform] && UNIT_PRICE[platform][service]) || 0;
  const total = Math.round(unit * qty);

  document.getElementById('q_platform').textContent = platform;
  document.getElementById('q_service').textContent = SERVICE_LABEL[service];
  document.getElementById('q_unit').textContent = unit.toLocaleString('vi-VN') + 'đ';
  document.getElementById('q_qty').textContent = qty.toLocaleString('vi-VN');
  document.getElementById('q_total').textContent = total.toLocaleString('vi-VN') + 'đ';
  updateWalletPillState(total);
  return total;
}
[els.platform, els.service, els.qty].forEach(el => el.addEventListener('input', updateQuote));
document.getElementById('f_start').valueAsDate = new Date();
updateQuote();
loadPricingFromSupabase();

/* =====================================================================
   CHỌN PHƯƠNG THỨC THANH TOÁN
===================================================================== */
document.querySelectorAll('#paymentPills .service-pill').forEach(pill=>{
  pill.addEventListener('click', ()=> selectPayment(pill.dataset.payment));
});
function selectPayment(method){
  selectedPayment = method;
  document.querySelectorAll('#paymentPills .service-pill').forEach(p=>{
    p.classList.toggle('active', p.dataset.payment === method);
  });
  const hint = document.getElementById('paymentHint');
  if(method === 'PayOS'){
    hint.textContent = "⚡ QR thanh toán tự động sẽ hiện ngay sau khi đặt đơn — quét là xong, hỗ trợ ATM, Visa, ví điện tử.";
  } else if(method === 'VietQR'){
    hint.textContent = "📱 Quét mã QR bằng app ngân hàng bất kỳ để chuyển khoản.";
  } else if(method === 'Thanh toán sau'){
    hint.textContent = "🤝 Đội ngũ sẽ trao đổi thanh toán khi xác nhận đơn.";
  } else if(method === 'Ví'){
    hint.textContent = "💰 Trừ thẳng từ số dư ví, đơn được xác nhận ngay lập tức, không cần chờ.";
  } else {
    hint.textContent = "";
  }
}

/* =====================================================================
   ĐĂNG NHẬP — nếu khách đã login, ẩn Họ tên/SĐT/Email, lấy thông tin
   từ bảng "profiles" thay vì bắt nhập lại (khách vãng lai vẫn nhập bình thường).
===================================================================== */
async function checkLoginState(){
  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if(!session?.user){ return; } // khách vãng lai -> giữ nguyên form

  const { data: profile } = await sb
    .from('profiles')
    .select('full_name, email')
    .eq('id', session.user.id)
    .single();

  loggedInProfile = {
    id: session.user.id,
    name: profile?.full_name || session.user.email,
    email: profile?.email || session.user.email
  };

  document.getElementById('guestFields').style.display = 'none';
  document.getElementById('guestEmailField').style.display = 'none';
  document.getElementById('f_name').required = false;
  document.getElementById('f_phone').required = false;

  document.getElementById('loggedInName').textContent = loggedInProfile.name;
  document.getElementById('loggedInAs').style.display = 'block';
  document.getElementById('walletBox').style.display = 'block';
  document.getElementById('walletPaymentPill').style.display = 'inline-block';

  await refreshWalletBalance();
}
checkLoginState();

/* =====================================================================
   VÍ PHATDATAGENCY — nạp tiền / thanh toán bằng ví
===================================================================== */
async function refreshWalletBalance(){
  if(!loggedInProfile) return;
  try{
    const { data, error } = await sb.rpc('get_my_wallet');
    if(error || !data?.ok) return;
    walletBalance = Number(data.balance) || 0;
    document.getElementById('walletBalance').textContent = walletBalance.toLocaleString('vi-VN') + 'đ';
    updateWalletPillState(updateQuoteSilent());
  } catch(e){ /* bỏ qua lỗi mạng tạm thời */ }
}

// Tính lại tổng tạm tính mà không đụng vào DOM 2 lần (dùng nội bộ cho refreshWalletBalance)
function updateQuoteSilent(){
  const platform = els.platform.value;
  const service = els.service.value;
  const qty = Number(els.qty.value) || 0;
  const unit = (UNIT_PRICE[platform] && UNIT_PRICE[platform][service]) || 0;
  return Math.round(unit * qty);
}

function updateWalletPillState(currentTotal){
  const pill = document.getElementById('walletPaymentPill');
  if(!loggedInProfile || pill.style.display === 'none') return;
  const enough = walletBalance >= currentTotal;
  pill.classList.toggle('disabled', !enough);
  pill.textContent = enough
    ? `💰 Ví Phatdatagency (${walletBalance.toLocaleString('vi-VN')}đ)`
    : `💰 Ví Phatdatagency (không đủ số dư)`;
  if(!enough && selectedPayment === 'Ví'){
    selectedPayment = null;
    pill.classList.remove('active');
  }
}

function toggleTopupPanel(){
  const panel = document.getElementById('topupPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function startTopup(){
  const amountInput = document.getElementById('topup_amount');
  const amount = Number(amountInput.value);
  const method = document.getElementById('topup_method').value;
  const msg = document.getElementById('topupMsg');
  msg.className = 'msg';

  if(!amount || amount < 10000){
    msg.textContent = 'Số tiền nạp tối thiểu là 10.000đ.';
    msg.className = 'msg err';
    return;
  }
  if(!loggedInProfile){
    msg.textContent = 'Bạn cần đăng nhập để nạp tiền vào ví.';
    msg.className = 'msg err';
    return;
  }

  const now = new Date();
  const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
  const randPart = Math.floor(1000 + Math.random()*9000);
  const topupCode = `NAP-${datePart}-${randPart}`;

  try{
    const { error: insertErr } = await sb.from('wallet_topup_requests').insert({
      code: topupCode, user_id: loggedInProfile.id, amount
    });
    if(insertErr) throw insertErr;

    window._lastAmount = amount;
    window._lastOrderCode = topupCode;
    window._lastBuyerName = loggedInProfile.name;
    window._lastBuyerEmail = loggedInProfile.email || '';
    window._lastBuyerPhone = '';

    const resultBox = document.getElementById('topupResult');
    resultBox.style.display = 'block';

    if(method === 'PayOS'){
      resultBox.innerHTML = `<div style="text-align:center; padding:16px 0;"><svg class="spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg></div>`;
      const result = await createPayOSLink(topupCode);
      if(result.ok && result.checkoutUrl){
        const qrImgUrl = result.qrCode ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(result.qrCode)}` : null;
        resultBox.innerHTML = `
          ${qrImgUrl ? `<img src="${qrImgUrl}" alt="QR nạp tiền" width="200" height="200" style="border-radius:12px; border:1px solid var(--line); background:#fff; padding:8px;">` : ''}
          <div style="margin-top:12px;">
            <a href="${result.checkoutUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">⚡ Mở trang thanh toán →</a>
          </div>`;
        startTopupPolling(topupCode);
      } else {
        resultBox.innerHTML = `<div class="pay-note" style="color:#9A3300; background:#FFF0DC;">Không tạo được link, thử lại hoặc chọn VietQR.</div>`;
      }
    } else {
      const qrUrl = `https://img.vietqr.io/image/${CONFIG.BANK_ID}-${CONFIG.ACCOUNT_NUMBER}-compact2.png`
        + `?amount=${amount}&addInfo=${encodeURIComponent(topupCode)}&accountName=${encodeURIComponent(CONFIG.ACCOUNT_NAME)}`;
      resultBox.innerHTML = `
        <img src="${qrUrl}" alt="QR nạp tiền VietQR" width="200" height="200" style="border-radius:12px; border:1px solid var(--line); background:#fff; padding:8px;">
        <div class="pay-note" style="margin-top:12px; text-align:left;">Chuyển khoản đúng nội dung <b>${topupCode}</b> để hệ thống tự nhận ra.</div>`;
      startTopupPolling(topupCode);
    }
  } catch(err){
    msg.textContent = 'Lỗi: ' + err.message;
    msg.className = 'msg err';
  }
}

let _topupPollTimer = null;
function startTopupPolling(code){
  if(_topupPollTimer) clearInterval(_topupPollTimer);
  let tries = 0;
  const before = walletBalance;
  _topupPollTimer = setInterval(async () => {
    tries++;
    if(tries > 225){ clearInterval(_topupPollTimer); return; }
    await refreshWalletBalance();
    if(walletBalance > before){
      clearInterval(_topupPollTimer);
      document.getElementById('topupResult').innerHTML = `<div style="font-size:14px; color:var(--sage); font-weight:600;">✅ Nạp tiền thành công! Số dư mới: ${walletBalance.toLocaleString('vi-VN')}đ</div>`;
    }
  }, 4000);
}

/* =====================================================================
   TẠO ĐƠN — insert vào bảng "orders" đã có sẵn, dùng đúng các cột hiện tại
   nên admin.html hiển thị được ngay, không cần sửa gì thêm.
===================================================================== */
document.getElementById('boostForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('formMsg');
  btn.disabled = true; btn.textContent = 'Đang gửi...';
  msg.className = 'msg';

  try{
    const platform = els.platform.value;
    const service = els.service.value;
    const qty = Number(els.qty.value);
    const link = document.getElementById('f_link').value.trim();
    const start = document.getElementById('f_start').value;
    const note = document.getElementById('f_note').value.trim();
    const estimated = updateQuote();

    if(!loggedInProfile && !document.getElementById('f_name').value.trim()){
      throw new Error('Vui lòng nhập họ tên.');
    }
    if(!loggedInProfile && !document.getElementById('f_phone').value.trim()){
      throw new Error('Vui lòng nhập số điện thoại / Zalo.');
    }
    if(!selectedPayment){
      throw new Error('Vui lòng chọn phương thức thanh toán.');
    }

    const now = new Date();
    const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
    const randPart = Math.floor(1000 + Math.random()*9000);
    const orderCode = `DH-${datePart}-${randPart}`;

    const description =
      `[Chạy QC tăng tương tác]\n` +
      `Nền tảng: ${platform}\n` +
      `Loại: ${SERVICE_LABEL[service]}\n` +
      `Link: ${link}\n` +
      `Số lượng: ${qty.toLocaleString('vi-VN')}\n` +
      `Ngày bắt đầu mong muốn: ${start || 'chưa chọn'}` +
      (note ? `\nGhi chú: ${note}` : '');

    const customerName = loggedInProfile ? loggedInProfile.name : document.getElementById('f_name').value.trim();
    const customerEmail = loggedInProfile ? loggedInProfile.email : (document.getElementById('f_email').value.trim() || null);
    const customerPhone = loggedInProfile ? '' : document.getElementById('f_phone').value.trim();
    const userId = loggedInProfile ? loggedInProfile.id : null;

    // PayOS và VietQR đều là "thanh toán trước", lưu rõ phương thức nào trong DB
    const paymentMethod = selectedPayment === 'PayOS'
      ? 'Thanh toán trước (Thanh toán tự động)'
      : selectedPayment === 'VietQR'
        ? 'Thanh toán trước (VietQR)'
        : selectedPayment === 'Ví'
          ? 'Ví Phatdatagency'
          : selectedPayment;

    if(selectedPayment === 'Ví' && walletBalance < estimated){
      throw new Error('Số dư ví không đủ, vui lòng nạp thêm hoặc chọn phương thức khác.');
    }

    // Lưu lại để truyền sang bước tạo link PayOS / VietQR và hiện biên lai sau này
    window._lastAmount     = estimated;
    window._lastOrderCode  = orderCode;
    window._lastBuyerName  = customerName;
    window._lastBuyerEmail = customerEmail || '';
    window._lastBuyerPhone = customerPhone || '';
    window._lastOrderDetails = {
      order_code: orderCode,
      service_type: 'Chạy quảng cáo tăng tương tác MXH',
      platform, interaction_type: service,
      quantity: qty, amount: estimated
    };

    const { error } = await sb.from('orders').insert({
      order_code: orderCode,
      customer_name: customerName,
      email: customerEmail,
      phone: customerPhone,
      service_type: 'Chạy quảng cáo tăng tương tác MXH',
      description,
      budget: estimated,
      amount: estimated,
      payment_method: paymentMethod,
      user_id: userId,
      // Các cột dưới đây dùng để tab "Đơn tương tác" trong admin
      // lọc và hiển thị có cấu trúc, thay vì phải đọc description.
      order_group: 'social_ads',
      platform,
      interaction_type: service,
      quantity: qty,
      post_link: link,
      start_date: start || null
    });

    if(error) throw error;

    // Thanh toán bằng ví: gọi RPC trừ tiền NGAY (an toàn, chống double-spend
    // nhờ khoá dòng trong hàm pay_order_with_wallet ở phía Postgres)
    if(selectedPayment === 'Ví'){
      const { data: payResult, error: payErr } = await sb.rpc('pay_order_with_wallet', { p_order_code: orderCode });
      if(payErr || !payResult?.ok){
        throw new Error(payResult?.error || payErr?.message || 'Không trừ được tiền từ ví.');
      }
      walletBalance = Number(payResult.balance) || 0;
      document.getElementById('walletBalance').textContent = walletBalance.toLocaleString('vi-VN') + 'đ';

      document.getElementById('boostForm').style.display = 'none';
      document.getElementById('successCode').textContent = orderCode;
      document.getElementById('successBox').style.display = 'block';
      const amountBox = document.getElementById('payAmountBox');
      amountBox.style.display = 'block';
      document.getElementById('payAmountVal').textContent = Number(estimated).toLocaleString('vi-VN') + 'đ';
      showReceipt();
      return;
    }

    document.getElementById('boostForm').style.display = 'none';
    document.getElementById('successCode').textContent = orderCode;
    document.getElementById('successBox').style.display = 'block';
    showPaymentSection(selectedPayment);

  } catch(err){
    msg.textContent = 'Lỗi: ' + err.message;
    msg.className = 'msg err';
  } finally {
    btn.disabled = false; btn.textContent = 'Tạo đơn hàng';
  }
});

/* =====================================================================
   HIỂN THỊ KHU VỰC THANH TOÁN SAU KHI TẠO ĐƠN — dùng lại đúng logic
   PayOS / VietQR đang chạy ở trang chủ (script.js gốc).
===================================================================== */
function showPaymentSection(paymentMethod){
  const amountBox = document.getElementById('payAmountBox');
  if(window._lastAmount){
    amountBox.style.display = 'block';
    document.getElementById('payAmountVal').textContent = Number(window._lastAmount).toLocaleString('vi-VN') + 'đ';
  } else {
    amountBox.style.display = 'none';
  }

  if(paymentMethod === 'PayOS'){
    renderPayOSSection(window._lastOrderCode);
    startPaymentPolling(window._lastOrderCode);
  } else if(paymentMethod === 'VietQR'){
    renderVietQRSection(window._lastOrderCode);
    startPaymentPolling(window._lastOrderCode);
  } else {
    document.getElementById('payQrSection').style.display = 'none';
    document.getElementById('payosSection').style.display = 'none';
    document.getElementById('payLaterSection').style.display = 'block';
  }
}

/* ── VietQR ── */
function renderVietQRSection(code){
  document.getElementById('payQrSection').style.display = 'block';
  document.getElementById('payosSection').style.display = 'none';
  document.getElementById('payLaterSection').style.display = 'none';

  document.getElementById('payBankName').textContent = CONFIG.BANK_NAME;
  document.getElementById('payAccNum').textContent = CONFIG.ACCOUNT_NUMBER;
  document.getElementById('payAccName').textContent = CONFIG.ACCOUNT_NAME;
  document.getElementById('payTransferNote').textContent = code;

  const qrUrl = `https://img.vietqr.io/image/${CONFIG.BANK_ID}-${CONFIG.ACCOUNT_NUMBER}-compact2.png`
    + `?amount=${window._lastAmount || 0}`
    + `&addInfo=${encodeURIComponent(code)}`
    + `&accountName=${encodeURIComponent(CONFIG.ACCOUNT_NAME)}`;
  document.getElementById('payQrImg').src = qrUrl;
}

/* ── Thanh toán tự động (PayOS) ── */
async function renderPayOSSection(code){
  document.getElementById('payQrSection').style.display = 'none';
  document.getElementById('payLaterSection').style.display = 'none';

  const section = document.getElementById('payosSection');
  section.style.display = 'block';
  section.innerHTML = `
    <div style="text-align:center; padding:28px 0;">
      <svg class="spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" stroke-width="2.2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <p style="margin-top:12px; font-size:13.5px; color:var(--ink-soft);">Đang tạo mã thanh toán tự động...</p>
    </div>`;

  try{
    const result = await createPayOSLink(code);
    if(result.ok && result.checkoutUrl){
      const qrImgUrl = result.qrCode
        ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(result.qrCode)}`
        : null;

      section.innerHTML = `
        <div style="text-align:center; padding:10px 0 6px;">
          ${qrImgUrl ? `
          <img src="${qrImgUrl}" alt="QR thanh toán tự động" width="220" height="220"
               style="border-radius:14px; border:1px solid var(--line); background:#fff; padding:10px;">
          <div style="font-size:13px; color:var(--ink-soft); margin:14px 0 18px;">
            Mở app ngân hàng bất kỳ, quét mã để thanh toán ngay.
          </div>` : `
          <div style="font-size:13px; color:var(--ink-soft); margin-bottom:16px;">
            Link thanh toán đã sẵn sàng — hỗ trợ ATM, Visa/Master, ví điện tử.
          </div>`}
          <a href="${result.checkoutUrl}" target="_blank" rel="noopener"
             class="btn btn-primary" style="font-size:15px; padding:15px 36px; display:inline-flex;">
            ⚡ Mở trang thanh toán →
          </a>
          <div style="margin-top:14px;">
            <a href="${result.checkoutUrl}" style="font-family:var(--font-mono); font-size:11px;
               color:var(--ink-soft); word-break:break-all; text-decoration:underline;"
               target="_blank" rel="noopener">${result.checkoutUrl}</a>
          </div>
          <div style="margin-top:18px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="copyPayosLink('${result.checkoutUrl}')">
              📋 Sao chép link
            </button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="switchToVietQR()">
              📱 Dùng VietQR thay thế
            </button>
          </div>
        </div>
        <div class="pay-note" style="margin-top:20px;">
          Sau khi thanh toán thành công, hệ thống sẽ tự động cập nhật trạng thái đơn hàng.
          Lưu lại mã đơn <b>${code}</b> để tra cứu tiến trình.
        </div>`;
    } else {
      section.innerHTML = `
        <div class="pay-note" style="color:#9A3300; background:#FFF0DC; border-radius:8px; padding:14px 16px; font-size:13px; margin-bottom:16px;">
          ⚠️ Không tạo được thanh toán tự động (${result.error || 'lỗi không xác định'}).
          Đã tự động chuyển sang VietQR.
        </div>`;
      setTimeout(()=> renderVietQRSection(code), 600);
    }
  } catch(err){
    section.innerHTML = `
      <div class="pay-note" style="color:#9A3300; background:#FFF0DC; border-radius:8px; padding:14px 16px; font-size:13px; margin-bottom:16px;">
        ⚠️ Lỗi kết nối thanh toán tự động. Đã tự động chuyển sang VietQR.
      </div>`;
    setTimeout(()=> renderVietQRSection(code), 600);
  }
}

function copyPayosLink(url){
  navigator.clipboard.writeText(url).then(()=> {
    const hint = document.getElementById('paymentHint');
    if(hint){ const old = hint.textContent; hint.textContent = "Đã sao chép link thanh toán!"; setTimeout(()=> hint.textContent = old, 2000); }
  });
}

function switchToVietQR(){
  const code = window._lastOrderCode;
  if(!code) return;
  renderVietQRSection(code);
}

/* PayOS được tạo qua Supabase Edge Function 'create-payos-link' — dùng
   chung với trang chủ, đã deploy sẵn tại supabase/functions/create-payos-link */
async function createPayOSLink(orderCode){
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(window._lastBuyerEmail || '');

  const payload = {
    orderCode,
    amount: window._lastAmount || 0,
    description: orderCode, // QUAN TRỌNG: webhook PayOS khớp đơn theo đúng chuỗi này
    returnUrl: CONFIG.PAYOS_RETURN_URL,
    cancelUrl: CONFIG.PAYOS_CANCEL_URL,
    buyerName: window._lastBuyerName || '',
    buyerPhone: window._lastBuyerPhone || '',
  };
  if(emailValid) payload.buyerEmail = window._lastBuyerEmail;

  const { data, error } = await sb.functions.invoke('create-payos-link', { body: payload });

  if(error) return { ok: false, error: error.message };
  return data;
}

/* =====================================================================
   TỰ ĐỘNG PHÁT HIỆN THANH TOÁN THÀNH CÔNG — kiểm tra định kỳ trạng thái
   đơn hàng (webhook PayOS hoặc admin xác nhận VietQR thủ công đều cập
   nhật cột "status" trong bảng orders), tự hiện biên lai ngay khi phát hiện.
===================================================================== */
let _pollTimer = null;
let _pollTries = 0;
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_TRIES = 225; // ~15 phút

function startPaymentPolling(orderCode){
  stopPaymentPolling();
  _pollTries = 0;
  document.getElementById('pollingHint').textContent = '⏳ Đang tự động kiểm tra thanh toán mỗi vài giây...';

  _pollTimer = setInterval(async () => {
    _pollTries++;
    if(_pollTries > POLL_MAX_TRIES){
      stopPaymentPolling();
      document.getElementById('pollingHint').textContent = '';
      return;
    }
    try{
      const { data, error } = await sb.rpc('lookup_order', { p_code: orderCode.trim().toUpperCase() });
      if(error || !data || !data.length) return;
      const row = data[0];

      if(row.status === 'Đã xác nhận' || row.status === 'Đang thực hiện' || row.status === 'Hoàn thành'){
        stopPaymentPolling();
        showReceipt();
      }
    } catch(e){ /* bỏ qua lỗi mạng tạm thời, thử lại lần sau */ }
  }, POLL_INTERVAL_MS);
}

function stopPaymentPolling(){
  if(_pollTimer){ clearInterval(_pollTimer); _pollTimer = null; }
}

function showReceipt(){
  const order = window._lastOrderDetails || {};
  document.getElementById('payQrSection').style.display = 'none';
  document.getElementById('payosSection').style.display = 'none';
  document.getElementById('payLaterSection').style.display = 'none';
  document.getElementById('pollingHint').textContent = '';

  document.getElementById('rc_code').textContent = order.order_code || window._lastOrderCode || '—';
  document.getElementById('rc_service').textContent = order.service_type || 'Chạy quảng cáo tăng tương tác MXH';
  document.getElementById('rc_platform').textContent = `${order.platform || ''} — ${SERVICE_LABEL[order.interaction_type] || order.interaction_type || ''}`;
  document.getElementById('rc_qty').textContent = order.quantity != null ? Number(order.quantity).toLocaleString('vi-VN') : '—';
  document.getElementById('rc_amount').textContent = order.amount != null ? Number(order.amount).toLocaleString('vi-VN') + 'đ' : '—';
  document.getElementById('rc_time').textContent = new Date().toLocaleString('vi-VN');

  document.getElementById('receiptSection').style.display = 'block';
}