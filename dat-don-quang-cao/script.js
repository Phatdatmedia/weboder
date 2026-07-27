/* =====================================================================
   CẤU HÌNH SUPABASE — dùng chung project với trang chủ (index.html)
===================================================================== */
const CONFIG = {
  SUPABASE_URL: "https://npsylbxggliczhtnzzgl.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig"
};
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

/* Đơn giá lấy từ bảng social_ads_pricing (quản lý ở admin.html, tab "Đơn tương tác").
   Bộ giá minh hoạ bên dưới chỉ dùng tạm khi chưa tải được từ Supabase (mất mạng, chưa tạo bảng...). */
let UNIT_PRICE = {
  Facebook:  { Like: 15, Follow: 20, Comment: 60, Share: 25, View: 5 },
  Instagram: { Like: 12, Follow: 25, Comment: 65, Share: 20, View: 6 },
  TikTok:    { Like: 10, Follow: 22, Comment: 55, Share: 18, View: 4 },
  YouTube:   { Like: 25, Follow: 40, Comment: 90, Share: 30, View: 8 },
};
const SERVICE_LABEL = { Like:'Tăng like', Follow:'Tăng follow', Comment:'Tăng bình luận', Share:'Tăng chia sẻ', View:'Tăng lượt xem' };

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
  return total;
}
[els.platform, els.service, els.qty].forEach(el => el.addEventListener('input', updateQuote));
document.getElementById('f_start').valueAsDate = new Date();
updateQuote();
loadPricingFromSupabase();

/* =====================================================================
   ĐĂNG NHẬP — nếu khách đã login, ẩn Họ tên/SĐT/Email, lấy thông tin
   từ bảng "profiles" thay vì bắt nhập lại (khách vãng lai vẫn nhập bình thường).
===================================================================== */
let loggedInProfile = null; // { id, name, email } — null nếu là khách vãng lai

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
}
checkLoginState();

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

    const { error } = await sb.from('orders').insert({
      order_code: orderCode,
      customer_name: customerName,
      email: customerEmail,
      phone: customerPhone,
      service_type: 'Chạy quảng cáo tăng tương tác MXH',
      description,
      budget: estimated,
      amount: estimated,
      user_id: userId,
      // Các cột dưới đây dùng để tab "Đơn tương tác" trong admin.html
      // lọc và hiển thị có cấu trúc, thay vì phải đọc description.
      order_group: 'social_ads',
      platform,
      interaction_type: service,
      quantity: qty,
      post_link: link,
      start_date: start || null
    });

    if(error) throw error;

    document.getElementById('boostForm').style.display = 'none';
    document.getElementById('successCode').textContent = orderCode;
    document.getElementById('successBox').style.display = 'block';

  } catch(err){
    msg.textContent = 'Lỗi: ' + err.message;
    msg.className = 'msg err';
  } finally {
    btn.disabled = false; btn.textContent = 'Tạo đơn hàng';
  }
});
