/* ============================================================
   KIỂM TRA CHẾ ĐỘ BẢO TRÌ — chạy NGAY LẬP TỨC, TRƯỚC mọi lệnh gọi
   dữ liệu khác trên trang. Nếu đang bảo trì: hiện màn hình bảo trì,
   ẩn toàn bộ nội dung trang, và CHẶN các hàm tải dữ liệu khác chạy tiếp.
============================================================ */
window._maintenanceActive = false;

async function checkMaintenanceMode(){
  try{
    const { data } = await sb.from('site_config').select('value').eq('key', 'maintenance_mode').single();
    const cfg = data?.value;
    if(cfg?.enabled){
      window._maintenanceActive = true;
      document.getElementById('maintenanceOverlayTitle').textContent = cfg.title || 'Website đang bảo trì';
      document.getElementById('maintenanceOverlayMsg').textContent = cfg.message || 'Chúng tôi đang nâng cấp hệ thống, vui lòng quay lại sau.';
      document.getElementById('maintenanceOverlay').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      // Ẩn toàn bộ nội dung trang gốc (nhưng vẫn giữ trong DOM, không xoá)
      Array.from(document.body.children).forEach(el => {
        if(el.id !== 'maintenanceOverlay') el.style.display = 'none';
      });
    }
  } catch(e){
    // Không đọc được cấu hình -> coi như không bảo trì, cho web chạy bình thường
  }
  return window._maintenanceActive;
}

/* =====================================================================
   CẤU HÌNH — sửa các giá trị dưới đây cho phù hợp với bạn
===================================================================== */
const CONFIG = {
  // Lấy tại Supabase Dashboard > Settings > API
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig",

  // Thông tin nhận thanh toán VietQR (fallback thủ công)
  BANK_ID: "970407",        // Mã ngân hàng VietQR, vd: 970436 = Vietcombank. Tra cứu tại vietqr.io
  BANK_NAME: "Techcombank",
  ACCOUNT_NUMBER: "3838648888",
  ACCOUNT_NAME: "LE PHAT DAT",
  DEPOSIT_AMOUNT: 20000,   // số tiền đặt cọc mặc định hiển thị trên QR (VNĐ)

  // ── PayOS ──────────────────────────────────────────────────────────────
  // Lấy tại: https://my.payos.vn → Tài khoản → API Keys
  // ⚠️  CLIENT_ID và API_KEY chỉ dùng ở Supabase Edge Function (server-side)
  //     CHECKSUM_KEY dùng để verify webhook (cũng nên đặt ở server)
  //     Ở frontend chỉ cần PAYOS_RETURN_URL và PAYOS_CANCEL_URL
  PAYOS_RETURN_URL: "https://phatdatagency.id.vn/payment-success", // trang báo thành công
  PAYOS_CANCEL_URL: "https://phatdatagency.id.vn/payment-cancel",  // trang báo huỷ
  // Tên hiển thị trên trang thanh toán PayOS
  PAYOS_DESCRIPTION: "Dat coc don hang",  // tối đa 25 ký tự, không dấu
};

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* =====================================================================
   Nạp cấu hình thanh toán thực tế từ Supabase (site_config, key
   'payment_config') — đây là nơi admin sửa ở tab "Thanh toán". Nếu chưa
   cấu hình gì thì giữ nguyên giá trị mặc định khai báo cứng ở trên.
   Gọi hàm này và CHỜ XONG trước khi cho phép mở form đặt hàng / thanh toán.
===================================================================== */
let paymentConfigReady = null; // Promise, dùng để đảm bảo load xong trước khi submit đơn
function loadPaymentConfigFromSupabase(){
  if(!isBackendConfigured()) return Promise.resolve();
  paymentConfigReady = (async () => {
    try{
      const { data, error } = await sb.from('site_config').select('value').eq('key', 'payment_config').single();
      if(error) throw error;
      const c = data?.value;
      if(!c) return;
      if(c.depositAmount) CONFIG.DEPOSIT_AMOUNT   = Number(c.depositAmount);
      if(c.depositDesc)   CONFIG.PAYOS_DESCRIPTION = c.depositDesc;
      if(c.bankName)      CONFIG.BANK_NAME        = c.bankName;
      if(c.bankId)        CONFIG.BANK_ID          = c.bankId;
      if(c.accNum)        CONFIG.ACCOUNT_NUMBER   = c.accNum;
      if(c.accName)       CONFIG.ACCOUNT_NAME     = c.accName;
      if(c.returnUrl)     CONFIG.PAYOS_RETURN_URL = c.returnUrl;
      if(c.cancelUrl)     CONFIG.PAYOS_CANCEL_URL = c.cancelUrl;
    } catch(e){
      console.warn('Không tải được payment_config, dùng giá trị mặc định trong code:', e.message);
    }
  })();
  return paymentConfigReady;
}
// (Được gọi tập trung ở cuối file, sau khi kiểm tra chế độ bảo trì)

/* =====================================================================
   MARKETING PIXEL — nạp Facebook Pixel / TikTok Pixel từ Supabase
   (site_config, key 'marketing_config', cấu hình ở admin tab "Marketing").
   Chỉ chạy pixel nào admin đã dán ID; để trống thì bỏ qua, không lỗi.
===================================================================== */
window._pixelIds = { fb: null, tt: null };

async function initMarketingPixels(){
  if(!isBackendConfigured()) return;
  try{
    const { data, error } = await sb.from('site_config').select('value').eq('key', 'marketing_config').single();
    if(error) throw error;
    const cfg = data?.value;
    if(!cfg) return;

    if(cfg.fbPixelId){
      window._pixelIds.fb = cfg.fbPixelId;
      /* eslint-disable */
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.fbPixelId);
      fbq('track', 'PageView');
    }

    if(cfg.ttPixelId){
      window._pixelIds.tt = cfg.ttPixelId;
      !function (w, d, t) {
        w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var s=d.createElement("script");s.type="text/javascript",s.async=!0,s.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(s,a)};
        ttq.load(cfg.ttPixelId);
        ttq.page();
      }(window, document, 'ttq');
    }
  } catch(e){
    console.warn('Không tải được marketing_config:', e.message);
  }
}
// (Được gọi tập trung ở cuối file, sau khi kiểm tra chế độ bảo trì)

/* Bắn sự kiện "gửi đơn hàng" cho cả 2 pixel (gọi ngay sau khi tạo đơn thành công) */
function trackOrderLeadEvent(){
  try{ if(window._pixelIds.fb && typeof fbq === 'function') fbq('track', 'Lead'); } catch(e){}
  try{ if(window._pixelIds.tt && typeof ttq !== 'undefined') ttq.track('SubmitForm'); } catch(e){}
}

/* =====================================================================
   TOAST
===================================================================== */
let toastTimer = null;
function showToast(msg){
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.classList.remove('show'), 2600);
}

/* =====================================================================
   ORDER MODAL
===================================================================== */
let selectedService = null;
let selectedPayment = null;
let cachedServices = [];
let currentServiceObj = null;
let selectedAmountMode = null; // 'deposit' | 'full'
let appliedCoupon = null;

function setMainCouponFeedback(message, ok){
  const box = document.getElementById('couponFeedback');
  if(!box) return;
  if(!message){ box.style.display = 'none'; box.textContent = ''; return; }
  box.style.display = 'block';
  box.textContent = message;
  box.style.background = ok ? 'var(--sage-tint)' : 'var(--coral-tint)';
  box.style.color = ok ? 'var(--sage)' : 'var(--coral-deep)';
  box.style.border = `1px solid ${ok ? 'rgba(101,119,90,.25)' : 'rgba(244,85,54,.28)'}`;
}

function clearMainCouponIfChanged(){
  const code = document.getElementById('f_coupon')?.value.trim().toUpperCase() || '';
  if(appliedCoupon && code !== appliedCoupon.code){
    appliedCoupon = null;
    setMainCouponFeedback('Mã đã thay đổi. Bấm “Áp dụng” để kiểm tra lại.', false);
  }
}

function resetMainCoupon(clearInput){
  appliedCoupon = null;
  if(clearInput && document.getElementById('f_coupon')) document.getElementById('f_coupon').value = '';
  setMainCouponFeedback('', false);
}

function getMainCouponSubtotal(){
  if(!selectedService) return 0;
  const servicePrice = currentServiceObj ? Number(currentServiceObj['Giá trị đơn']) : 0;
  return servicePrice > 0 ? servicePrice : Number(CONFIG.DEPOSIT_AMOUNT || 0);
}

async function previewMainCoupon(code, subtotal, phone){
  const { data, error } = await sb.rpc('preview_discount_code', {
    p_code: code,
    p_subtotal: subtotal,
    p_customer_phone: phone || null
  });
  if(error) return { ok:false, error:error.message };
  return data || { ok:false, error:'Không kiểm tra được mã giảm giá.' };
}

async function applyMainCoupon(){
  const btn = document.getElementById('applyCouponBtn');
  const code = document.getElementById('f_coupon').value.trim().toUpperCase();
  const subtotal = getMainCouponSubtotal();
  if(!selectedService){ setMainCouponFeedback('Vui lòng chọn dịch vụ trước.', false); return; }
  if(Number(currentServiceObj?.['Giá trị đơn']) > 0 && !selectedAmountMode){
    setMainCouponFeedback('Vui lòng chọn Đặt cọc hoặc Thanh toán toàn bộ trước.', false); return;
  }
  if(!code){ setMainCouponFeedback('Vui lòng nhập mã giảm giá.', false); return; }

  btn.disabled = true;
  btn.textContent = 'Đang kiểm tra...';
  try{
    const result = await previewMainCoupon(code, subtotal, document.getElementById('f_phone').value.trim());
    if(!result.ok){
      appliedCoupon = null;
      setMainCouponFeedback(result.error || 'Mã giảm giá không hợp lệ.', false);
      return;
    }
    appliedCoupon = result;
    const depositNote = selectedAmountMode === 'deposit' ? ' Số tiền đặt cọc vẫn theo mức bạn chọn.' : '';
    setMainCouponFeedback(
      `Đã áp dụng ${result.code}: giảm ${Number(result.discount_amount).toLocaleString('vi-VN')}đ. Tổng sau giảm ${Number(result.final_amount).toLocaleString('vi-VN')}đ.${depositNote}`,
      true
    );
  } catch(e){
    appliedCoupon = null;
    setMainCouponFeedback('Không kiểm tra được mã giảm giá: ' + e.message, false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Áp dụng';
  }
}

function openOrderModal(presetService){
  document.getElementById('orderModalOverlay').classList.add('show');
  document.getElementById('formView').style.display = 'block';
  document.getElementById('payView').classList.remove('show');
  document.body.style.overflow = 'hidden';
  window._formOpenedAt = Date.now(); // chống bot: form mở-tới-lúc-gửi quá nhanh là dấu hiệu bất thường

  loadServicesIntoModal(presetService);
}
function closeOrderModal(){
  document.getElementById('orderModalOverlay').classList.remove('show');
  document.body.style.overflow = '';
  resetOrderForm();
}
document.getElementById('orderModalOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'orderModalOverlay') closeOrderModal();
});

async function loadServicesIntoModal(presetService){
  const container = document.getElementById('servicePills');

  if(cachedServices.length === 0){
    try{
      const result = await fetchActiveServices();
      if(result.ok) cachedServices = result.services || [];
    } catch(err){
      // im lặng, xử lý ở dưới bằng cachedServices rỗng
    }
  }

  if(cachedServices.length === 0){
    container.innerHTML = `<span style="font-size:13px; color:var(--ink-soft);">Chưa tải được danh sách dịch vụ. Kiểm tra kết nối hoặc thử lại.</span>`;
    return;
  }

  container.innerHTML = cachedServices.map(s =>
    `<button type="button" class="service-pill" data-service="${escapeHtml(s["Tên dịch vụ"])}">${escapeHtml(s["Tên dịch vụ"])}</button>`
  ).join('');

  container.querySelectorAll('.service-pill').forEach(pill=>{
    pill.addEventListener('click', ()=> selectService(pill.dataset.service));
  });

  if(presetService){
    selectService(presetService);
  }
}

function selectService(service){
  selectedService = service;
  document.querySelectorAll('#servicePills .service-pill').forEach(p=>{
    p.classList.toggle('active', p.dataset.service === service);
  });
  currentServiceObj = cachedServices.find(s => s["Tên dịch vụ"] === service) || null;
  updateAmountSection();
}

function updateAmountSection(){
  const amountSection = document.getElementById('amountSection');
  const contactNote = document.getElementById('amountContactNote');
  const fullNote = document.getElementById('amountFullNote');
  const depositWrap = document.getElementById('amountDepositWrap');

  // reset lựa chọn mỗi khi đổi dịch vụ
  selectedAmountMode = null;
  document.querySelectorAll('#amountModePills .service-pill').forEach(p=> p.classList.remove('active'));
  depositWrap.style.display = 'none';
  fullNote.style.display = 'none';
  document.getElementById('f_deposit_amount').value = '';
  resetMainCoupon(true);

  const priceAmount = currentServiceObj ? Number(currentServiceObj["Giá trị đơn"]) : null;

  if(!currentServiceObj || !priceAmount || priceAmount <= 0){
    amountSection.style.display = 'none';
    contactNote.style.display = 'block';
    return;
  }

  contactNote.style.display = 'none';
  amountSection.style.display = 'block';
}

document.getElementById('amountModePills').querySelectorAll('.service-pill').forEach(pill=>{
  pill.addEventListener('click', ()=> selectAmountMode(pill.dataset.mode));
});

function selectAmountMode(mode){
  resetMainCoupon(false);
  selectedAmountMode = mode;
  document.querySelectorAll('#amountModePills .service-pill').forEach(p=>{
    p.classList.toggle('active', p.dataset.mode === mode);
  });

  const priceAmount = Number(currentServiceObj["Giá trị đơn"]);
  const minDeposit = currentServiceObj["Cọc tối thiểu"] != null && Number(currentServiceObj["Cọc tối thiểu"]) > 0
    ? Number(currentServiceObj["Cọc tối thiểu"])
    : Math.round(priceAmount * 0.2); // fallback: 20% nếu admin chưa đặt cọc tối thiểu

  const fullNote = document.getElementById('amountFullNote');
  const depositWrap = document.getElementById('amountDepositWrap');
  const depositInput = document.getElementById('f_deposit_amount');
  const depositHint = document.getElementById('depositHint');

  if(mode === 'full'){
    depositWrap.style.display = 'none';
    fullNote.style.display = 'block';
    fullNote.textContent = `Bạn sẽ thanh toán toàn bộ giá trị đơn: ${priceAmount.toLocaleString('vi-VN')}đ`;
  } else {
    fullNote.style.display = 'none';
    depositWrap.style.display = 'block';
    depositInput.min = minDeposit;
    depositInput.max = priceAmount;
    depositInput.value = minDeposit;
    depositHint.textContent = `Giá trị đơn: ${priceAmount.toLocaleString('vi-VN')}đ — cọc tối thiểu ${minDeposit.toLocaleString('vi-VN')}đ`;
  }
}

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
    hint.textContent = "⚡ Bạn sẽ nhận link thanh toán PayOS ngay sau khi đặt đơn — hỗ trợ ATM, Visa, ví điện tử.";
  } else if(method === 'VietQR'){
    hint.textContent = "📱 Quét mã QR bằng app ngân hàng bất kỳ để chuyển khoản đặt cọc.";
  } else if(method === 'Thanh toán sau'){
    hint.textContent = "🤝 Đội ngũ sẽ trao đổi thanh toán khi xác nhận đơn. Bạn có thể đổi ý bất cứ lúc nào.";
  } else {
    hint.textContent = "";
  }
}

function resetOrderForm(){
  ['f_name','f_phone','f_email','f_budget','f_deadline','f_desc','f_deposit_amount'].forEach(id=>{
    document.getElementById(id).value = '';
  });
  selectedService = null;
  selectedPayment = null;
  currentServiceObj = null;
  selectedAmountMode = null;
  document.querySelectorAll('.service-pill').forEach(p=> p.classList.remove('active'));
  document.getElementById('paymentHint').textContent = '';
  document.getElementById('amountSection').style.display = 'none';
  document.getElementById('amountContactNote').style.display = 'none';
  document.getElementById('amountFullNote').style.display = 'none';
  document.getElementById('amountDepositWrap').style.display = 'none';
  document.getElementById('formError').classList.remove('show');
  resetMainCoupon(true);
}

async function handleSubmitOrder(){
  if(paymentConfigReady) await paymentConfigReady; // đảm bảo dùng đúng cấu hình mới nhất từ admin

  // Chống bot: honeypot field bị điền, hoặc gửi form chưa tới 2 giây sau khi mở -> chặn âm thầm
  const honeypot = document.getElementById('f_website').value.trim();
  const filledTooFast = window._formOpenedAt && (Date.now() - window._formOpenedAt) < 2000;
  if(honeypot || filledTooFast){
    console.warn('Order blocked: bot suspected.');
    return;
  }

  const name = document.getElementById('f_name').value.trim();
  const phone = document.getElementById('f_phone').value.trim();
  const email = document.getElementById('f_email').value.trim();
  const budget = document.getElementById('f_budget').value.trim();
  const deadline = document.getElementById('f_deadline').value;
  const desc = document.getElementById('f_desc').value.trim();
  const errBox = document.getElementById('formError');

  if(!selectedService || !selectedPayment || !name || !phone || !desc){
    errBox.textContent = "Vui lòng điền đầy đủ các trường bắt buộc (đánh dấu *), bao gồm chọn dịch vụ và phương thức thanh toán.";
    errBox.classList.add('show');
    return;
  }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    errBox.textContent = "Email không đúng định dạng. Vui lòng kiểm tra lại (VD: ban@email.com) hoặc để trống.";
    errBox.classList.add('show');
    return;
  }

  // Tính số tiền thanh toán thực tế dựa trên lựa chọn Đặt cọc / Toàn bộ
  const priceAmount = currentServiceObj ? Number(currentServiceObj["Giá trị đơn"]) : null;
  let amount, paymentType, totalPrice = null;

  if(priceAmount && priceAmount > 0){
    if(!selectedAmountMode){
      errBox.textContent = "Vui lòng chọn Đặt cọc hoặc Thanh toán toàn bộ.";
      errBox.classList.add('show');
      return;
    }
    totalPrice = priceAmount;
    if(selectedAmountMode === 'full'){
      amount = priceAmount;
      paymentType = 'Thanh toán toàn bộ';
    } else {
      const minDeposit = currentServiceObj["Cọc tối thiểu"] != null && Number(currentServiceObj["Cọc tối thiểu"]) > 0
        ? Number(currentServiceObj["Cọc tối thiểu"])
        : Math.round(priceAmount * 0.2);
      amount = Number(document.getElementById('f_deposit_amount').value);
      if(!amount || amount < minDeposit || amount > priceAmount){
        errBox.textContent = `Số tiền đặt cọc phải từ ${minDeposit.toLocaleString('vi-VN')}đ đến ${priceAmount.toLocaleString('vi-VN')}đ.`;
        errBox.classList.add('show');
        return;
      }
      paymentType = 'Đặt cọc';
    }
  } else {
    // Dịch vụ chưa có giá cụ thể -> dùng mức đặt cọc mặc định, tư vấn sau
    amount = CONFIG.DEPOSIT_AMOUNT;
    paymentType = 'Đặt cọc (mặc định, chưa có giá)';
  }

  const couponCode = document.getElementById('f_coupon').value.trim().toUpperCase();
  let couponPreview = null;
  if(couponCode){
    couponPreview = await previewMainCoupon(couponCode, totalPrice || amount, phone);
    if(!couponPreview.ok){
      appliedCoupon = null;
      setMainCouponFeedback(couponPreview.error || 'Mã giảm giá không còn hiệu lực.', false);
      errBox.textContent = couponPreview.error || 'Mã giảm giá không còn hiệu lực.';
      errBox.classList.add('show');
      return;
    }
    appliedCoupon = couponPreview;
  }

  errBox.classList.remove('show');

  const btn = document.getElementById('submitOrderBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang gửi...";

  const orderData = {
    name, phone, email,
    service: selectedService,
    description: desc,
    budget, deadline,
    amount, paymentType, totalPrice,
    couponCode: couponPreview?.code || null,
    couponPreview,
    // Lưu vào DB: PayOS và VietQR đều là "Thanh toán trước"
    paymentMethod: (selectedPayment === 'PayOS' || selectedPayment === 'VietQR')
      ? 'Thanh toán trước (' + selectedPayment + ')'
      : selectedPayment
  };

  // Lưu để truyền sang PayOS / VietQR
  window._lastBuyerName  = name;
  window._lastBuyerEmail = email;
  window._lastBuyerPhone = phone;
  window._lastAmount     = amount;

  try{
    const result = await createOrderSupabase(orderData);
    if(result.ok){
      window._lastAmount = result.amount;
      trackOrderLeadEvent();
      showPaymentView(result.code, selectedPayment);
    } else {
      errBox.textContent = result.error || "Có lỗi xảy ra, vui lòng thử lại.";
      errBox.classList.add('show');
    }
  } catch(err){
    errBox.textContent = "Không thể kết nối tới máy chủ. Kiểm tra lại cấu hình Supabase.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function showPaymentView(code, paymentMethod){
  document.getElementById('formView').style.display = 'none';
  document.getElementById('payView').classList.add('show');
  document.getElementById('payOrderCode').textContent = code;
  window._lastOrderCode = code;

  const amountBox = document.getElementById('payAmountBox');
  if(window._lastAmount){
    amountBox.style.display = 'block';
    document.getElementById('payAmountVal').textContent = Number(window._lastAmount).toLocaleString('vi-VN') + 'đ';
  } else {
    amountBox.style.display = 'none';
  }

  if(paymentMethod === 'PayOS'){
    renderPayOSSection(code);
  } else if(paymentMethod === 'VietQR'){
    renderVietQRSection(code);
  } else {
    document.getElementById('payQrSection').style.display = 'none';
    document.getElementById('payLaterSection').style.display = 'block';
    document.getElementById('payosSection').style.display = 'none';
  }
}

/* ── VietQR (giữ nguyên logic cũ) ── */
function renderVietQRSection(code){
  document.getElementById('payQrSection').style.display = 'block';
  document.getElementById('payLaterSection').style.display = 'none';
  document.getElementById('payosSection').style.display = 'none';

  document.getElementById('payBankName').textContent = CONFIG.BANK_NAME;
  document.getElementById('payAccNum').textContent = CONFIG.ACCOUNT_NUMBER;
  document.getElementById('payAccName').textContent = CONFIG.ACCOUNT_NAME;
  document.getElementById('payTransferNote').textContent = code;

  const qrUrl = `https://img.vietqr.io/image/${CONFIG.BANK_ID}-${CONFIG.ACCOUNT_NUMBER}-compact2.png`
    + `?amount=${window._lastAmount || CONFIG.DEPOSIT_AMOUNT}`
    + `&addInfo=${encodeURIComponent(code)}`
    + `&accountName=${encodeURIComponent(CONFIG.ACCOUNT_NAME)}`;
  document.getElementById('payQrImg').src = qrUrl;
}

/* ── PayOS ── */
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
      <p style="margin-top:12px; font-size:13.5px; color:var(--ink-soft);">Đang tạo link thanh toán PayOS...</p>
    </div>`;

  try{
    const result = await createPayOSLink(code);
    if(result.ok && result.checkoutUrl){
      section.innerHTML = `
        <div style="text-align:center; padding:10px 0 6px;">
          <div style="font-size:13px; color:var(--ink-soft); margin-bottom:16px;">
            Link thanh toán đã sẵn sàng — hỗ trợ ATM, Visa/Master, ví điện tử.
          </div>
          <a href="${result.checkoutUrl}" target="_blank" rel="noopener"
             class="btn btn-primary" style="font-size:15px; padding:15px 36px; display:inline-flex;">
            ⚡ Thanh toán ngay →
          </a>
          <div style="margin-top:14px;">
            <a href="${result.checkoutUrl}" style="font-family:var(--font-mono); font-size:11px;
               color:var(--ink-soft); word-break:break-all; text-decoration:underline;"
               target="_blank" rel="noopener">${result.checkoutUrl}</a>
          </div>
          <div style="margin-top:18px; display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="copyPayosLink('${result.checkoutUrl}')">
              📋 Sao chép link
            </button>
            <button class="btn btn-ghost btn-sm" onclick="switchToVietQR()">
              📱 Dùng VietQR thay thế
            </button>
          </div>
        </div>
        <div class="pay-note" style="margin-top:20px;">
          Sau khi thanh toán thành công, PayOS sẽ tự động cập nhật trạng thái đơn hàng.
          Lưu lại mã đơn <b>${code}</b> để tra cứu tiến trình.
        </div>`;
    } else {
      // Fallback về VietQR nếu PayOS lỗi
      section.innerHTML = `
        <div class="pay-note" style="color:#9A3300; background:#FFF0DC; border-radius:8px; padding:14px 16px; font-size:13px; margin-bottom:16px;">
          ⚠️ Không tạo được link PayOS (${result.error || 'lỗi không xác định'}).
          Đã tự động chuyển sang VietQR.
        </div>`;
      setTimeout(()=> renderVietQRSection(code), 600);
    }
  } catch(err){
    section.innerHTML = `
      <div class="pay-note" style="color:#9A3300; background:#FFF0DC; border-radius:8px; padding:14px 16px; font-size:13px; margin-bottom:16px;">
        ⚠️ Lỗi kết nối PayOS. Đã tự động chuyển sang VietQR.
      </div>`;
    setTimeout(()=> renderVietQRSection(code), 600);
  }
}

function copyPayosLink(url){
  navigator.clipboard.writeText(url).then(()=> showToast("Đã sao chép link thanh toán!"));
}

function switchToVietQR(){
  const code = window._lastOrderCode;
  if(!code) return;
  renderVietQRSection(code);
  showToast("Đã chuyển sang VietQR.");
}

function switchToPayNow(){
  // Giữ tương thích — mặc định chuyển sang VietQR
  const code = window._lastOrderCode;
  if(!code) return;
  renderVietQRSection(code);
  showToast("Đã chuyển sang thanh toán QR.");
}

function copyOrderCode(){
  const code = window._lastOrderCode;
  if(!code) return;
  navigator.clipboard.writeText(code).then(()=> showToast("Đã sao chép mã đơn: " + code));
}

/* =====================================================================
   BACKEND COMMUNICATION (Supabase)
===================================================================== */
function isBackendConfigured(){
  return CONFIG.SUPABASE_URL && CONFIG.SUPABASE_URL.indexOf("PASTE_YOUR") !== 0
      && CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_ANON_KEY.indexOf("PASTE_YOUR") !== 0;
}

/**
 * Lấy danh sách dịch vụ đang bán, sắp theo thứ tự hiển thị.
 */
async function fetchActiveServices(){
  if(!isBackendConfigured()) throw new Error("Chưa cấu hình Supabase");
  const { data, error } = await sb
    .from('services')
    .select('*')
    .eq('status', 'Đang bán')
    .order('sort_order', { ascending: true });
  if(error) return { ok:false, error: error.message };
  // map về tên cột tiếng Việt cũ để không phải sửa lại UI rendering
  const mapped = (data||[]).map(s => ({
    "Tên dịch vụ": s.name, "Mô tả": s.description, "Giá hiển thị": s.price_label,
    "Giá trị đơn": s.price_amount, "Cọc tối thiểu": s.min_deposit
  }));
  return { ok:true, services: mapped };
}

/**
 * Tạo đơn hàng mới. Tự sinh mã đơn dạng DH-yyMMdd-xxxx.
 */
async function createOrderSupabase(data){
  if(!isBackendConfigured()) throw new Error("Chưa cấu hình Supabase");

  // Sinh mã đơn ở client (đơn giản, đủ dùng — DB có UNIQUE constraint chặn trùng)
  const now = new Date();
  const datePart = now.toISOString().slice(2,10).replace(/-/g,'');
  const randPart = Math.floor(1000 + Math.random()*9000);
  const orderCode = `DH-${datePart}-${randPart}`;

  const { data: userData } = await sb.auth.getUser();
  const userId = userData?.user?.id || null;

  const insertRow = {
    order_code: orderCode,
    customer_name: data.name,
    email: data.email,
    phone: data.phone,
    service_type: data.service,
    description: data.description,
    budget: data.budget,
    deadline: data.deadline || null,
    amount: data.amount,
    payment_type: data.paymentType || null,
    total_price: data.totalPrice || null,
    payment_method: data.paymentMethod,
    user_id: userId
  };
  if(data.couponCode) insertRow.discount_code = data.couponCode;

  const { error } = await sb.from('orders').insert(insertRow);

  if(error) return { ok:false, error: error.message };
  let payableAmount = Number(data.amount) || 0;
  if(data.couponPreview?.ok){
    if(Number(data.totalPrice) > 0){
      const fullPayment = String(data.paymentType || '').toLowerCase().includes('toàn bộ') || payableAmount >= Number(data.totalPrice);
      payableAmount = fullPayment
        ? Number(data.couponPreview.final_amount)
        : Math.min(payableAmount, Number(data.couponPreview.final_amount));
    } else {
      payableAmount = Number(data.couponPreview.final_amount);
    }
  }
  return { ok:true, code: orderCode, amount: payableAmount };
}

/**
 * Tạo link thanh toán PayOS qua Supabase Edge Function.
 * Edge Function sẽ giữ CLIENT_ID, API_KEY, CHECKSUM_KEY an toàn ở server.
 *
 * Supabase Edge Function cần deploy tại: supabase/functions/create-payos-link/index.ts
 * (xem hướng dẫn bên dưới)
 */
async function createPayOSLink(orderCode){
  if(!isBackendConfigured()) throw new Error("Chưa cấu hình Supabase");

  // PayOS bắt buộc buyerEmail đúng định dạng email NẾU có gửi lên.
  // Vì đa số khách dùng Zalo/SĐT thay vì email, ta chỉ gửi trường này
  // khi thực sự hợp lệ — không gửi chuỗi rỗng/sai để tránh bị từ chối.
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(window._lastBuyerEmail || '');

  const payload = {
    orderCode,                                    // mã đơn, VD: DH-250704-1234
    amount: window._lastAmount || CONFIG.DEPOSIT_AMOUNT, // số tiền thanh toán (VNĐ)
    description: orderCode, // QUAN TRỌNG: webhook PayOS khớp đơn theo đúng chuỗi này (không dùng nhãn chung nữa)
    returnUrl: CONFIG.PAYOS_RETURN_URL,
    cancelUrl: CONFIG.PAYOS_CANCEL_URL,
    buyerName: window._lastBuyerName || '',
    buyerPhone: window._lastBuyerPhone || '',
  };
  if(emailValid) payload.buyerEmail = window._lastBuyerEmail;

  const { data, error } = await sb.functions.invoke('create-payos-link', { body: payload });

  if(error) return { ok: false, error: error.message };
  return data; // { ok, checkoutUrl, paymentLinkId } hoặc { ok:false, error }
}

/**
 * Tra cứu đơn hàng theo mã — dùng RPC function public (ẩn email/sđt khách khác).
 */
async function lookupOrderSupabase(code){
  if(!isBackendConfigured()) throw new Error("Chưa cấu hình Supabase");
  const { data, error } = await sb.rpc('lookup_order', { p_code: code.trim().toUpperCase() });
  if(error) return { ok:false, error: error.message };
  if(!data || data.length === 0) return { ok:false, error: "Không tìm thấy đơn hàng với mã này" };

  const row = data[0];
  const order = {
    "Mã đơn": row.order_code,
    "Loại dịch vụ": row.service_type,
    "Trạng thái": row.status,
    "Phương thức TT": row.payment_method
  };
  return { ok:true, order };
}

/**
 * Gọi Edge Function để AI tạo dàn ý slide (ẩn Gemini key ở server).
 */
async function generateSlideOutlineSupabase(content, title){
  if(!isBackendConfigured()) throw new Error("Chưa cấu hình Supabase");
  const { data, error } = await sb.functions.invoke('generate-slide', {
    body: { content, title }
  });
  if(error) return { ok:false, error: error.message };
  return data; // { ok, outline } hoặc { ok:false, error }
}

/* =====================================================================
   LOOKUP ORDER
===================================================================== */
const STATUS_MAP = {
  "Chờ xác nhận":     { cls: "status-pending",  step: 0 },
  "Đã xác nhận":      { cls: "status-progress", step: 1 },
  "Đang thực hiện":   { cls: "status-progress", step: 2 },
  "Hoàn thành":       { cls: "status-done",     step: 3 },
  "Đã huỷ":           { cls: "status-cancel",   step: -1 }
};
const TRACK_STEPS = ["Đặt đơn thành công", "Đã xác nhận yêu cầu", "Đang thực hiện thiết kế", "Hoàn thành & bàn giao"];

async function handleLookup(){
  const codeInput = document.getElementById('lookupCode');
  const code = codeInput.value.trim();
  const errBox = document.getElementById('lookupError');
  const btn = document.getElementById('lookupBtn');

  errBox.classList.remove('show');
  document.getElementById('orderResult').classList.remove('show');

  if(!code){
    errBox.textContent = "Vui lòng nhập mã đơn hàng.";
    errBox.classList.add('show');
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Đang tra cứu...";

  try{
    const result = await lookupOrderSupabase(code);
    if(result.ok){
      renderOrderResult(result.order);
    } else {
      errBox.textContent = result.error || "Không tìm thấy đơn hàng.";
      errBox.classList.add('show');
      document.getElementById('lookupEmpty').style.display = 'block';
    }
  } catch(err){
    errBox.textContent = "Không thể kết nối máy chủ. Kiểm tra lại cấu hình Supabase.";
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function renderOrderResult(order){
  document.getElementById('lookupEmpty').style.display = 'none';
  const resultBox = document.getElementById('orderResult');
  resultBox.classList.add('show');

  document.getElementById('orCode').textContent = order["Mã đơn"];
  document.getElementById('orService').textContent = order["Loại dịch vụ"] || "—";

  const status = order["Trạng thái"] || "Chờ xác nhận";
  const meta = STATUS_MAP[status] || { cls: "status-pending", step: 0 };
  const badge = document.getElementById('orStatusBadge');
  badge.className = "or-status " + meta.cls;
  badge.textContent = status;

  const track = document.getElementById('orderTrack');
  track.innerHTML = '';

  if(meta.step === -1){
    track.innerHTML = `<div class="track-content"><div class="tc-title">Đơn hàng đã bị huỷ.</div></div>`;
    return;
  }

  TRACK_STEPS.forEach((label, idx)=>{
    const active = idx <= meta.step;
    const row = document.createElement('div');
    row.className = 'track-row';
    row.innerHTML = `
      <div class="track-dot-col">
        <div class="track-dot ${active ? 'active' : ''}"></div>
        <div class="track-line"></div>
      </div>
      <div class="track-content">
        <div class="tc-title ${active ? '' : 'muted'}">${label}</div>
      </div>`;
    track.appendChild(row);
  });
}

document.getElementById('lookupCode').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') handleLookup();
});

function escapeHtml(str){
  if(str === undefined || str === null) return '';
  return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* =====================================================================
   AI SLIDE GENERATOR
===================================================================== */
let uploadedFile = null;
let uploadedFileText = null;
let currentOutline = null;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');

dropzone.addEventListener('dragover', (e)=>{ e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', ()=> dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e)=>{
  e.preventDefault();
  dropzone.classList.remove('drag');
  if(e.dataTransfer.files.length) handleFileSelected(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e)=>{
  if(e.target.files.length) handleFileSelected(e.target.files[0]);
});

function handleFileSelected(file){
  const validTypes = ['.docx', '.pdf', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if(!validTypes.includes(ext)){
    showToast("Định dạng file không hỗ trợ. Dùng .docx, .pdf hoặc .txt");
    return;
  }
  if(file.size > 10 * 1024 * 1024){
    showToast("File vượt quá 10MB.");
    return;
  }
  uploadedFile = file;
  document.getElementById('fileName').textContent = "📄 " + file.name;
  document.getElementById('generateBtn').disabled = false;
}

async function extractTextFromFile(file){
  const ext = '.' + file.name.split('.').pop().toLowerCase();

  if(ext === '.txt'){
    return await file.text();
  }

  if(ext === '.docx'){
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if(ext === '.pdf'){
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for(let i = 1; i <= pdf.numPages; i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(it => it.str).join(' ') + '\n';
    }
    return fullText;
  }

  throw new Error("Không hỗ trợ định dạng file này.");
}

function setAiProgress(percent, label){
  const progBox = document.getElementById('aiProgress');
  progBox.classList.add('show');
  document.getElementById('aiProgressFill').style.width = percent + '%';
  document.getElementById('aiProgressLabel').textContent = label;
}

async function handleGenerateSlide(){
  if(!uploadedFile) return;

  if(!isBackendConfigured()){
    showToast("Chưa cấu hình Supabase — không thể gọi AI.");
    return;
  }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  document.getElementById('aiResult').classList.remove('show');
  setAiProgress(15, "Đang đọc nội dung file...");

  try{
    const text = await extractTextFromFile(uploadedFile);
    uploadedFileText = text;

    if(!text || text.trim().length < 10){
      showToast("Không trích xuất được nội dung từ file này.");
      setAiProgress(0, "");
      document.getElementById('aiProgress').classList.remove('show');
      btn.disabled = false;
      return;
    }

    setAiProgress(45, "AI đang phân tích nội dung...");

    const fileTitle = uploadedFile.name.replace(/\.[^/.]+$/, "");
    const result = await generateSlideOutlineSupabase(text, fileTitle);

    setAiProgress(85, "Đang dựng dàn ý slide...");

    if(result.ok){
      currentOutline = result.outline;
      renderOutline(currentOutline);
      setAiProgress(100, "Hoàn tất!");
      setTimeout(()=> document.getElementById('aiProgress').classList.remove('show'), 1200);
    } else {
      showToast("Lỗi AI: " + (result.error || "không xác định"));
      document.getElementById('aiProgress').classList.remove('show');
    }
  } catch(err){
    showToast("Có lỗi xảy ra: " + err.message);
    document.getElementById('aiProgress').classList.remove('show');
  } finally {
    btn.disabled = false;
  }
}

function renderOutline(outline){
  const resultBox = document.getElementById('aiResult');
  resultBox.classList.add('show');
  document.getElementById('deckTitleLabel').textContent = outline.deckTitle || "Dàn ý slide";
  document.getElementById('slideCountTag').textContent = (outline.slides || []).length + " slide";

  const list = document.getElementById('outlineList');
  list.innerHTML = '';
  (outline.slides || []).forEach((s, idx)=>{
    const item = document.createElement('div');
    item.className = 'outline-item';
    const typeLabel = { title: 'Trang bìa', content: 'Nội dung', section: 'Phân đoạn' }[s.type] || s.type;
    item.innerHTML = `<div class="ot-type">${idx+1} · ${typeLabel}</div><div class="ot-title">${escapeHtml(s.title || '')}</div>`;
    list.appendChild(item);
  });
}

function downloadPptx(){
  if(!currentOutline){ showToast("Chưa có dàn ý slide để xuất."); return; }

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'ATELIER_169', width: 10, height: 5.63 });
  pptx.layout = 'ATELIER_169';

  const COLOR_INK = "211C16";
  const COLOR_CORAL = "FF4B2E";
  const COLOR_PAPER = "F2EEE6";
  const COLOR_SOFT = "5B5347";

  (currentOutline.slides || []).forEach(s=>{
    const slide = pptx.addSlide();

    if(s.type === 'title'){
      slide.background = { color: COLOR_INK };
      slide.addShape(pptx.ShapeType.rect, { x:0, y:2.55, w:1.4, h:0.06, fill:{ color: COLOR_CORAL } });
      slide.addText(s.title || currentOutline.deckTitle || '', {
        x:0.6, y:1.9, w:8.8, h:1.2, fontSize:32, bold:true, color:"FFFFFF", fontFace:"Arial", align:'left'
      });
      if(s.subtitle){
        slide.addText(s.subtitle, { x:0.6, y:3.0, w:8.8, h:0.8, fontSize:15, color:"C9C2B4", fontFace:"Arial" });
      }
    }
    else if(s.type === 'section'){
      slide.background = { color: COLOR_PAPER };
      slide.addShape(pptx.ShapeType.rect, { x:0.6, y:2.5, w:0.9, h:0.06, fill:{ color: COLOR_CORAL } });
      slide.addText(s.title || '', {
        x:0.6, y:2.6, w:8.8, h:1.0, fontSize:28, bold:true, color: COLOR_INK, fontFace:"Arial"
      });
    }
    else {
      slide.background = { color: "FFFFFF" };
      slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:10, h:0.85, fill:{ color: COLOR_PAPER } });
      slide.addText(s.title || '', {
        x:0.5, y:0.18, w:9, h:0.55, fontSize:20, bold:true, color: COLOR_INK, fontFace:"Arial"
      });

      const bullets = (s.bullets || []).map(b => ({
        text: b,
        options: { bullet: { code: '25A0', color: COLOR_CORAL }, fontSize:15, color:"333333", breakLine:true, paraSpaceAfter:14 }
      }));

      if(bullets.length){
        slide.addText(bullets, { x:0.6, y:1.25, w:8.8, h:3.9, fontFace:"Arial", valign:'top' });
      }
    }

    slide.addText(`${currentOutline.deckTitle || ''}`, {
      x:0.4, y:5.32, w:6, h:0.25, fontSize:8, color: COLOR_SOFT, fontFace:"Arial"
    });
  });

  const safeFileName = (currentOutline.deckTitle || 'slide').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  pptx.writeFile({ fileName: `${safeFileName}.pptx` });
  showToast("Đang tải file .pptx...");
}

/* =====================================================================
   SERVICES GRID (trang chủ)
===================================================================== */
const SERVICE_ICONS = [
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r=".6" fill="currentColor"/></svg>`,
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M14 8h4M14 11h4M7 15h10M7 18h6"/></svg>`,
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>`,
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>`
];

async function loadServicesGrid(){
  const grid = document.getElementById('servicesGrid');
  try{
    const result = await fetchActiveServices();
    if(!result.ok || !(result.services || []).length){
      grid.innerHTML = `<div class="services-empty">Chưa có dịch vụ nào đang mở bán. Vui lòng quay lại sau.</div>`;
      return;
    }
    cachedServices = result.services;

    grid.innerHTML = result.services.map((s, idx) => `
      <div class="service-card" onclick="openOrderModal('${escapeHtml(s["Tên dịch vụ"]).replace(/'/g, "\\'")}')">
        <span class="corner">${String(idx+1).padStart(2,'0')}</span>
        <div class="service-icon">${SERVICE_ICONS[idx % SERVICE_ICONS.length]}</div>
        <h3>${escapeHtml(s["Tên dịch vụ"])}</h3>
        <p>${escapeHtml(s["Mô tả"] || '')}</p>
        <div class="price">${escapeHtml(s["Giá hiển thị"] || '')} <span class="arrow">→</span></div>
      </div>
    `).join('');
  } catch(err){
    grid.innerHTML = `<div class="services-empty">Không thể tải danh sách dịch vụ. Kiểm tra lại cấu hình Supabase.</div>`;
  }
}

/* =====================================================================
   MISC UX
===================================================================== */
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape'){
    if(document.getElementById('orderModalOverlay').classList.contains('show')){
      closeOrderModal();
    }
  }
});

/* =====================================================================
   AUTH SESSION — dùng Supabase Auth (session tự đồng bộ qua localStorage
   nội bộ của supabase-js, không cần tự quản lý token)
===================================================================== */
async function initNavAuth(){
  const accountBtn = document.getElementById('navAccountBtn');
  const loginBtn   = document.getElementById('navLoginBtn');
  if(!accountBtn || !loginBtn || !isBackendConfigured()) return;

  const { data } = await sb.auth.getSession();
  const session = data?.session;

  if(session?.user){
    // Lấy tên hiển thị từ bảng profiles
    const { data: profile } = await sb
      .from('profiles')
      .select('full_name, is_priority')
      .eq('id', session.user.id)
      .single();
    const displayName = profile?.full_name || session.user.email;
    const isPriority  = !!profile?.is_priority;

    accountBtn.textContent = (isPriority ? '✨ ' : '👤 ') + displayName.split(' ').pop();
    accountBtn.classList.toggle('vip-nav-badge', isPriority);
    accountBtn.style.display = 'inline-flex';
    loginBtn.style.display   = 'none';

    // Khách hàng ưu tiên -> hiện hiệu ứng chào mừng, tự reset lại sau mỗi 3 tiếng
    // (dùng chung key với account.html nên không bị chào lặp lại khi khách chuyển trang)
    if(isPriority){
      const vipKey = 'vipWelcomeLastShown_' + session.user.id;
      const lastShown = Number(localStorage.getItem(vipKey) || 0);
      const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
      if(Date.now() - lastShown > THREE_HOURS_MS){
        showVipWelcome(displayName);
        localStorage.setItem(vipKey, String(Date.now()));
      }
    }
  } else {
    accountBtn.style.display = 'none';
    loginBtn.style.display   = 'inline-flex';
  }
}
initNavAuth();

function showVipWelcome(name){
  const overlay = document.getElementById('vipWelcomeOverlay');
  if(!overlay) return;
  document.getElementById('vipWelcomeName').textContent = 'Chào mừng trở lại, ' + (name || '');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }, 2600);
}

// Tự cập nhật nav khi trạng thái đăng nhập thay đổi
// Đồng thời reload grid dịch vụ nếu đang trống (xảy ra khi auth session
// chưa restore xong lúc loadServicesGrid() chạy lần đầu)
if(isBackendConfigured()){
  sb.auth.onAuthStateChange((event) => {
    initNavAuth();
    // Chỉ reload nếu grid đang hiện skeleton hoặc trống (không ghi đè khi đã có card)
    const grid = document.getElementById('servicesGrid');
    const hasCards = grid && grid.querySelector('.service-card');
    if(!hasCards){
      loadServicesGrid();
    }
  });
}

// Đóng menu mobile / smooth-scroll
document.querySelectorAll('.nav-links a[href^="#"], .footer-col a[href^="#"]').forEach(a=>{
  a.addEventListener('click', function(e){
    const target = document.querySelector(this.getAttribute('href'));
    if(target){ e.preventDefault(); target.scrollIntoView({ behavior:'smooth', block:'start' }); }
  });
});

// Đợi Supabase client restore session xong rồi mới load grid
// tránh tình trạng query chạy trước khi auth token được set vào request headers
if(isBackendConfigured()){
  sb.auth.getSession().then(() => loadServicesGrid());
} else {
  loadServicesGrid();
}

/* =====================================================================
   ANNOUNCE POPUP — đọc cấu hình từ Supabase, bảng `site_config`,
   key = 'announce_popup' (được set từ trang admin, tab "Thông báo").
   Nếu chưa cấu hình Supabase hoặc chưa có row nào, popup sẽ không hiện.
===================================================================== */
const ANN_KEY = 'announce_popup';

function escapeHtmlAnn(str){
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

const ANN_SNOOZE_MS = 24 * 60 * 60 * 1000; // tạm ẩn 24h sau khi bấm Bỏ qua/đã xem

function closeAnnouncePopup(rememberKey){
  const overlay = document.getElementById('announceOverlay');
  overlay.classList.remove('show');
  if(rememberKey){
    try{
      localStorage.setItem(rememberKey, JSON.stringify({ hideUntil: Date.now() + ANN_SNOOZE_MS }));
    } catch(e){}
  }
}

async function initAnnounce(){
  if(!isBackendConfigured()) return; // chưa cấu hình Supabase -> bỏ qua

  let cfg = null;
  try{
    const { data, error } = await sb.from('site_config').select('value').eq('key', ANN_KEY).single();
    if(error) throw error;
    cfg = data?.value || null;
  } catch(e){
    // Chưa có row site_config (bảng mới tạo, admin chưa lưu lần nào) -> không hiện popup
    return;
  }

  if(!cfg || cfg.enabled === false) return;
  if(!cfg.title) return;

  const storageKey = cfg.storageKey || 'announce_hide_v1';
  try{
    const raw = localStorage.getItem(storageKey);
    if(raw){
      const saved = JSON.parse(raw);
      // Còn trong 24h kể từ lần bấm Bỏ qua/xem gần nhất -> chưa báo lại
      // (Nếu admin tăng version storageKey, key này sẽ không khớp nữa -> báo lại ngay)
      if(saved?.hideUntil && Date.now() < saved.hideUntil) return;
    }
  } catch(e){}

  const overlay = document.getElementById('announceOverlay');
  const content = document.getElementById('announceContent');

  const safeKey = storageKey.replace(/'/g,"");
  const btnHtml = cfg.btnUrl
    ? `<a class="ap-btn" href="${escapeHtmlAnn(cfg.btnUrl)}" onclick="closeAnnouncePopup('${safeKey}')">${escapeHtmlAnn(cfg.btnText || 'Xem ngay')}</a>`
    : `<span class="ap-btn" style="cursor:pointer;" onclick="closeAnnouncePopup('${safeKey}')">${escapeHtmlAnn(cfg.btnText || 'Xem ngay')}</span>`;

  content.innerHTML = `
    ${cfg.image ? `<img class="ap-img" src="${escapeHtmlAnn(cfg.image)}" alt="Banner" onerror="this.style.display='none'">` : ''}
    <div class="ap-body">
      ${cfg.tag  ? `<div class="ap-tag">${escapeHtmlAnn(cfg.tag)}</div>` : ''}
      <div class="ap-title">${escapeHtmlAnn(cfg.title)}</div>
      ${cfg.desc ? `<div class="ap-desc">${escapeHtmlAnn(cfg.desc)}</div>` : ''}
    </div>
    <div class="ap-footer">
      <button class="ap-skip" onclick="closeAnnouncePopup('${safeKey}')">Bỏ qua</button>
      ${btnHtml}
    </div>`;

  const delay = Number(cfg.delay) >= 0 ? Number(cfg.delay) : 900;
  setTimeout(() => overlay.classList.add('show'), delay);
}

// Bấm ra ngoài box để đóng popup (không lưu trạng thái "đã tắt")
document.getElementById('announceOverlay').addEventListener('click', function(e){
  if(e.target === this) closeAnnouncePopup();
});

initAnnounce();

/* =====================================================================
   CONTACT INFO — đọc cấu hình từ Supabase, bảng `site_config`,
   key = 'contact_info' (được set từ trang admin, tab "Liên hệ").
   Kênh nào admin để trống sẽ tự ẩn, không hiện ra trang chủ.
===================================================================== */
const CONTACT_KEY = 'contact_info';

function toggleContactCard(){
  document.getElementById('contactCard').classList.toggle('show');
}

async function initContactInfo(){
  if(!isBackendConfigured()) return;

  let cfg = null;
  try{
    const { data, error } = await sb.from('site_config').select('value').eq('key', CONTACT_KEY).single();
    if(error) throw error;
    cfg = data?.value || null;
  } catch(e){
    cfg = null; // chưa có cấu hình cũng không sao, vẫn hiện được "Chat trực tiếp"
  }

  const channels = cfg ? [
    cfg.phone    ? { icon:'📞', label: cfg.phone,    href: 'tel:' + cfg.phone.replace(/[^\d+]/g,'') } : null,
    cfg.email    ? { icon:'✉️', label: cfg.email,    href: 'mailto:' + cfg.email } : null,
    cfg.zalo     ? { icon:'💬', label: 'Zalo: ' + cfg.zalo, href: cfg.zalo.startsWith('http') ? cfg.zalo : 'https://zalo.me/' + cfg.zalo.replace(/[^\d]/g,'') } : null,
    cfg.facebook ? { icon:'📘', label: 'Facebook', href: cfg.facebook } : null,
    cfg.address  ? { icon:'📍', label: cfg.address,  href: null } : null,
  ].filter(Boolean) : [];

  // Footer — chỉ hiện các kênh admin đã cấu hình (không cần chat ở đây)
  if(channels.length){
    document.getElementById('footerContact').innerHTML = channels.map(c =>
      c.href
        ? `<a href="${escapeHtmlAnn(c.href)}" target="_blank" rel="noopener">${c.icon} ${escapeHtmlAnn(c.label)}</a>`
        : `<span>${c.icon} ${escapeHtmlAnn(c.label)}</span>`
    ).join('');
  }

  // Nút nổi + card — nếu admin không tắt hẳn popup
  if(cfg && cfg.popupEnabled === false) return;

  document.getElementById('contactFab').style.display = 'flex';
  const channelsHtml = channels.map(c =>
    c.href
      ? `<a class="cc-row" href="${escapeHtmlAnn(c.href)}" target="_blank" rel="noopener"><span class="cc-ic">${c.icon}</span> ${escapeHtmlAnn(c.label)}</a>`
      : `<div class="cc-row"><span class="cc-ic">${c.icon}</span> ${escapeHtmlAnn(c.label)}</div>`
  ).join('');
  const chatRowHtml = `<a class="cc-row" href="javascript:void(0)" onclick="toggleContactCard(); toggleChatPanel();"><span class="cc-ic">💭</span> Chat trực tiếp</a>`;

  document.getElementById('contactCardBody').innerHTML = channelsHtml + chatRowHtml;
}

// (Được gọi tập trung ở cuối file, sau khi kiểm tra chế độ bảo trì)

/* =====================================================================
   LIVE CHAT — khách mở "case" hỗ trợ, KHÔNG cần tự tạo tài khoản.
   Bảo mật: dùng Supabase Anonymous Auth — mỗi trình duyệt được cấp 1
   phiên đăng nhập ẩn danh (uid riêng), RLS chỉ cho phép đọc/ghi case
   của đúng uid đó. Case tự đóng sau 3 ngày, admin xoá hẳn sau 14 ngày.
===================================================================== */
let chatChannel = null;
let chatPanelOpen = false;
let chatWidgetInited = false;

function toggleChatPanel(){
  const panel = document.getElementById('chatPanel');
  chatPanelOpen = !panel.classList.contains('show');
  panel.classList.toggle('show', chatPanelOpen);
  if(chatPanelOpen){
    document.getElementById('chatFabBadge').style.display = 'none';
    if(!chatWidgetInited){ chatWidgetInited = true; initChatWidget(); }
  }
}

/* Đảm bảo trình duyệt có phiên đăng nhập (kể cả ẩn danh) trước khi chạm vào chat_cases/chat_messages */
async function ensureChatAuth(){
  const { data: sessionData } = await sb.auth.getSession();
  if(sessionData?.session) return sessionData.session.user.id;

  const { data, error } = await sb.auth.signInAnonymously();
  if(error) throw error;
  return data.user.id;
}

async function initChatWidget(){
  if(!isBackendConfigured()){
    document.getElementById('chatStartErr').textContent = 'Chat chưa khả dụng lúc này.';
    document.getElementById('chatStartErr').classList.add('show');
    return;
  }

  try{
    await ensureChatAuth();
    // RLS tự lọc chỉ trả về case thuộc uid của trình duyệt này -> không cần tự quản lý "mã bí mật" nữa
    const { data: cases, error } = await sb.from('chat_cases').select('*').order('created_at', { ascending:false }).limit(1);
    if(error) throw error;
    const kase = cases?.[0];
    if(!kase) return showChatStartView();

    const ageMs = Date.now() - new Date(kase.created_at).getTime();
    const isOpen = kase.status === 'open' && ageMs < 3 * 24 * 60 * 60 * 1000;

    if(!isOpen) return showChatClosedView();

    window._activeChatCase = { id: kase.id, code: kase.case_code, name: kase.customer_name };
    document.getElementById('chatPanelSub').textContent = 'Mã case: ' + kase.case_code;
    await loadChatMessages(kase.id);
    subscribeChatRealtime(kase.id);
    showChatThreadView();
  } catch(e){
    console.warn('Chat init lỗi:', e.message);
    showChatStartView();
  }
}

function showChatStartView(){
  document.getElementById('chatStartView').style.display = 'block';
  document.getElementById('chatBody').style.display = 'none';
  document.getElementById('chatInputRow').style.display = 'none';
  document.getElementById('chatClosedView').style.display = 'none';
  document.getElementById('chatPanelSub').textContent = 'Phatdatagency';
}
function showChatThreadView(){
  document.getElementById('chatStartView').style.display = 'none';
  document.getElementById('chatBody').style.display = 'flex';
  document.getElementById('chatInputRow').style.display = 'flex';
  document.getElementById('chatClosedView').style.display = 'none';
}
function showChatClosedView(){
  document.getElementById('chatStartView').style.display = 'none';
  document.getElementById('chatBody').style.display = 'none';
  document.getElementById('chatInputRow').style.display = 'none';
  document.getElementById('chatClosedView').style.display = 'block';
}

function resetChatToStart(){
  if(chatChannel){ sb.removeChannel(chatChannel); chatChannel = null; }
  window._activeChatCase = null;
  document.getElementById('chatStartName').value = '';
  document.getElementById('chatStartContact').value = '';
  showChatStartView();
}

async function handleStartChatCase(){
  const name = document.getElementById('chatStartName').value.trim();
  const contact = document.getElementById('chatStartContact').value.trim();
  const errBox = document.getElementById('chatStartErr');
  errBox.classList.remove('show');

  if(!name){
    errBox.textContent = 'Vui lòng nhập họ tên.';
    errBox.classList.add('show');
    return;
  }

  const caseCode = 'CASE-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();

  try{
    const uid = await ensureChatAuth();
    const { data, error } = await sb.from('chat_cases').insert({
      case_code: caseCode, customer_name: name, customer_contact: contact || null,
      status: 'open', user_id: uid
    }).select().single();
    if(error) throw error;

    window._activeChatCase = { id: data.id, code: data.case_code, name };
    document.getElementById('chatPanelSub').textContent = 'Mã case: ' + data.case_code;

    // Tin nhắn chào mừng tự động
    await sb.from('chat_messages').insert({
      case_id: data.id, sender_type: 'admin', sender_name: 'Phatdatagency',
      message: `Xin chào ${name}! Cảm ơn bạn đã liên hệ. Đội ngũ sẽ phản hồi sớm nhất có thể 👋`
    });

    await loadChatMessages(data.id);
    subscribeChatRealtime(data.id);
    showChatThreadView();
  } catch(e){
    errBox.textContent = 'Lỗi: ' + e.message;
    errBox.classList.add('show');
  }
}

async function loadChatMessages(caseId){
  const { data, error } = await sb.from('chat_messages').select('*').eq('case_id', caseId).order('created_at', { ascending: true });
  if(error) return;
  const body = document.getElementById('chatBody');
  body.innerHTML = data.map(renderChatBubble).join('');
  body.scrollTop = body.scrollHeight;
}

function renderChatBubble(m){
  const time = new Date(m.created_at).toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  const escFn = (typeof escapeHtmlAnn === 'function') ? escapeHtmlAnn : (s)=>String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<div class="chat-msg ${m.sender_type === 'customer' ? 'customer' : 'admin'}">
    ${escFn(m.message)}
    <div class="cm-time">${time}</div>
  </div>`;
}

function subscribeChatRealtime(caseId){
  if(chatChannel) sb.removeChannel(chatChannel);
  chatChannel = sb.channel('chat-case-' + caseId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'chat_messages', filter:`case_id=eq.${caseId}` }, (payload) => {
      const body = document.getElementById('chatBody');
      body.insertAdjacentHTML('beforeend', renderChatBubble(payload.new));
      body.scrollTop = body.scrollHeight;
      if(payload.new.sender_type === 'admin' && !chatPanelOpen){
        const badge = document.getElementById('chatFabBadge');
        badge.style.display = 'flex';
      }
    })
    .subscribe();
}

async function sendChatMessage(){
  const input = document.getElementById('chatInputMsg');
  const text = input.value.trim();
  if(!text || !window._activeChatCase) return;
  input.value = '';
  try{
    const { error } = await sb.from('chat_messages').insert({
      case_id: window._activeChatCase.id, sender_type: 'customer',
      sender_name: window._activeChatCase.name, message: text
    });
    if(error) throw error;
    await sb.from('chat_cases').update({ last_message_at: new Date().toISOString() }).eq('id', window._activeChatCase.id);
  } catch(e){
    alert('Không gửi được tin nhắn: ' + e.message + ' (có thể case đã đóng)');
  }
}
document.getElementById('chatInputMsg').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') sendChatMessage();
});

/* =====================================================================
   TRACKING LƯỢT TRUY CẬP — ghi 1 dòng vào bảng `page_views` mỗi lần
   trang chủ được tải. Chạy ngầm, không chặn hiển thị trang, lỗi thì bỏ qua.
===================================================================== */
function trackPageView(){
  if(!isBackendConfigured()) return;

  function detectDevice(){
    const ua = navigator.userAgent;
    if(/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
    if(/Mobi|Android|iPhone/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function detectBrowser(){
    const ua = navigator.userAgent;
    if(/Edg\//.test(ua)) return 'Edge';
    if(/OPR\/|Opera/.test(ua)) return 'Opera';
    if(/CriOS/.test(ua)) return 'Chrome (iOS)';
    if(/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
    if(/FxiOS/.test(ua)) return 'Firefox (iOS)';
    if(/Firefox\//.test(ua)) return 'Firefox';
    if(/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    return 'Khác';
  }

  function detectReferrer(){
    if(!document.referrer) return 'Trực tiếp';
    try{
      const refHost = new URL(document.referrer).hostname;
      if(refHost === window.location.hostname) return 'Nội bộ';
      return refHost;
    } catch(e){ return 'Khác'; }
  }

  sb.from('page_views').insert({
    page: 'index',
    device: detectDevice(),
    browser: detectBrowser(),
    referrer: detectReferrer()
  }).then(({error}) => { if(error) console.warn('page_views log lỗi:', error.message); });
}

/* =====================================================================
   BOOTSTRAP TRUNG TÂM — kiểm tra chế độ bảo trì TRƯỚC TIÊN, chỉ khi
   web đang hoạt động bình thường mới chạy các tác vụ tải dữ liệu khác.
===================================================================== */
(async function bootApp(){
  const inMaintenance = await checkMaintenanceMode();
  if(inMaintenance) return; // Dừng hẳn — không tải/gửi thêm bất kỳ dữ liệu nào khác

  loadPaymentConfigFromSupabase();
  initMarketingPixels();
  initContactInfo();
  trackPageView();
})();
