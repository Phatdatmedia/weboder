/* contract-template.js — nội dung hợp đồng dùng CHUNG cho admin (xuất PDF)
   và trang ký hợp đồng cho khách (hiển thị để đọc trước khi ký).
   Sửa nội dung điều khoản thì chỉ cần sửa 1 chỗ ở đây, cả 2 nơi tự đồng bộ. */

const CONTRACT_TYPE_LABEL = {
  unlock:  'MỞ KHOÁ TÀI KHOẢN MẠNG XÃ HỘI',
  icloud:  'MỞ KHOÁ ICLOUD / THIẾT BỊ APPLE',
  ads:     'CHẠY QUẢNG CÁO TĂNG TƯƠNG TÁC MẠNG XÃ HỘI',
  web:     'THIẾT KẾ WEBSITE / ỨNG DỤNG',
};

/* Chuyển số tiền sang chữ (tiếng Việt) — dùng cho dòng "Bằng chữ:" trong hợp đồng */
function numberToVietnameseWords(num){
  if(num === 0) return 'Không đồng';
  const chuSo = ['không','một','hai','ba','bốn','năm','sáu','bảy','tám','chín'];
  const doc3 = (n) => {
    let str = '';
    const tram = Math.floor(n/100), chuc = Math.floor((n%100)/10), donvi = n%10;
    if(tram > 0){ str += chuSo[tram] + ' trăm '; if(chuc===0 && donvi>0) str += 'lẻ '; }
    if(chuc > 1){ str += chuSo[chuc] + ' mươi '; if(chuc>=2 && donvi===1) return str.trim()+' mốt'; }
    else if(chuc === 1){ str += 'mười '; }
    if(donvi > 0){
      if(donvi===5 && chuc>=1) str += 'lăm';
      else str += chuSo[donvi];
    }
    return str.trim();
  };
  const units = ['', ' nghìn', ' triệu', ' tỷ'];
  let n = Math.floor(Math.abs(num));
  const groups = [];
  while(n > 0){ groups.unshift(n % 1000); n = Math.floor(n/1000); }
  let result = groups.map((g, i) => {
    if(g === 0) return '';
    const idx = groups.length - 1 - i;
    return doc3(g) + units[idx];
  }).filter(Boolean).join(' ');
  result = result.charAt(0).toUpperCase() + result.slice(1);
  return result + ' đồng';
}

/* Nội dung Điều 1 riêng cho từng loại dịch vụ */
function getArticle1Content(type, detail){
  if(type === 'unlock'){
    return [
      `1.1. Bên A hỗ trợ Bên B trong quá trình khôi phục quyền truy cập/mở khoá đối với tài khoản mạng xã hội thuộc sở hữu hợp pháp của Bên B, cụ thể: ${detail}`,
      `1.2. Bên B cam kết là chủ sở hữu hợp pháp hoặc người được uỷ quyền hợp pháp đối với tài khoản nêu tại Mục 1.1, và chịu hoàn toàn trách nhiệm trước pháp luật về tính xác thực của cam kết này. Bên A có quyền từ chối hoặc dừng thực hiện dịch vụ ngay khi phát hiện thông tin không trung thực.`,
      `1.3. Do quyết định mở khoá tài khoản thuộc thẩm quyền của nền tảng mạng xã hội, Bên A cam kết nỗ lực hỗ trợ tối đa trong khả năng chuyên môn, nhưng không đảm bảo tỷ lệ thành công tuyệt đối 100%; kết quả cuối cùng phụ thuộc vào chính sách và quyết định của nền tảng mạng xã hội đó.`,
    ];
  }
  if(type === 'icloud'){
    return [
      `1.1. Bên A hỗ trợ Bên B trong quá trình khôi phục quyền truy cập iCloud/mở khoá kích hoạt (Activation Lock) đối với thiết bị Apple thuộc sở hữu hợp pháp của Bên B, cụ thể: ${detail}`,
      `1.2. Bên B cam kết là chủ sở hữu hợp pháp của thiết bị nêu tại Mục 1.1, và có trách nhiệm cung cấp cho Bên A các thông tin, giấy tờ chứng minh quyền sở hữu hợp pháp khi được yêu cầu (hoá đơn mua hàng, biên lai giao dịch, thông tin Apple ID liên kết, hoặc giấy tờ tương đương). Bên B chịu hoàn toàn trách nhiệm trước pháp luật nếu cam kết này không trung thực.`,
      `1.3. Bên A có quyền từ chối tiếp nhận hoặc dừng ngay việc thực hiện dịch vụ, không hoàn trả chi phí đã phát sinh, nếu tại bất kỳ thời điểm nào phát hiện hoặc có căn cứ hợp lý để nghi ngờ thiết bị nêu tại Mục 1.1 là tài sản do trộm cắp, lừa đảo, chiếm đoạt hoặc có nguồn gốc không hợp pháp.`,
      `1.4. Do việc mở khoá phụ thuộc vào hệ thống bảo mật của Apple và tính chất phức tạp riêng của từng trường hợp, Bên A cam kết nỗ lực hỗ trợ tối đa trong khả năng chuyên môn, nhưng không đảm bảo tỷ lệ thành công tuyệt đối 100%; kết quả cuối cùng phụ thuộc vào tình trạng thực tế của thiết bị và chính sách của Apple tại thời điểm xử lý.`,
    ];
  }
  if(type === 'ads'){
    return [
      `1.1. Bên A cung cấp dịch vụ tăng lượt tương tác (like/theo dõi/bình luận/chia sẻ/lượt xem theo lựa chọn cụ thể) cho nền tảng mạng xã hội và nội dung do Bên B cung cấp, cụ thể: ${detail}`,
      `1.2. Bên B cam kết nội dung, bài viết, tài khoản được cung cấp là hợp pháp, không vi phạm tiêu chuẩn cộng đồng của nền tảng và không thuộc các lĩnh vực bị pháp luật Việt Nam cấm hoặc hạn chế kinh doanh.`,
      `1.3. Do đặc thù của nền tảng mạng xã hội, chỉ số tương tác có thể biến động theo thời gian do chính sách rà soát tự động của nền tảng; Bên A cam kết bàn giao đúng số lượng đã thoả thuận tại thời điểm hoàn thành đơn hàng, việc duy trì chỉ số về sau (nếu có) thực hiện theo chính sách bảo hành riêng của Bên A.`,
    ];
  }
  return [
    `1.1. Bên A thực hiện thiết kế và bàn giao sản phẩm theo yêu cầu của Bên B, cụ thể: ${detail}`,
    `1.2. Số lần chỉnh sửa, điều chỉnh giao diện/nội dung miễn phí trong phạm vi yêu cầu ban đầu: tối đa 03 (ba) lần. Các yêu cầu thay đổi vượt phạm vi ban đầu do hai bên thoả thuận chi phí phát sinh riêng, lập thành phụ lục hoặc xác nhận qua văn bản/tin nhắn.`,
    `1.3. Bên A bàn giao mã nguồn (nếu có) và toàn quyền sử dụng sản phẩm cho Bên B ngay sau khi Bên B hoàn tất thanh toán đầy đủ giá trị hợp đồng quy định tại Điều 2.`,
  ];
}

function buildContractArticles(type, data){
  return [
    { title: 'Điều 1. Nội dung dịch vụ', body: getArticle1Content(type, data.detail) },
    { title: 'Điều 2. Giá trị hợp đồng và phương thức thanh toán', body: [
      `2.1. Tổng giá trị hợp đồng là ${Number(data.value).toLocaleString('vi-VN')} đồng (Bằng chữ: ${numberToVietnameseWords(data.value)}).`,
      data.deposit > 0
        ? `2.2. Bên B thanh toán đặt cọc ${Number(data.deposit).toLocaleString('vi-VN')} đồng ngay khi ký hợp đồng, số tiền còn lại là ${Number(data.value - data.deposit).toLocaleString('vi-VN')} đồng được thanh toán khi Bên A hoàn thành và bàn giao dịch vụ.`
        : `2.2. Bên B thanh toán toàn bộ giá trị hợp đồng ngay khi ký hợp đồng hoặc theo tiến độ do hai bên thống nhất.`,
      `2.3. Hình thức thanh toán: chuyển khoản ngân hàng, ví điện tử hoặc hình thức khác theo thông tin do Bên A cung cấp tại từng thời điểm.`,
    ]},
    { title: 'Điều 3. Thời gian thực hiện', body: [
      `3.1. Bên A bắt đầu triển khai dịch vụ sau khi Bên B hoàn tất thanh toán (hoặc đặt cọc, nếu có) và cung cấp đầy đủ thông tin cần thiết.`,
      `3.2. Thời gian thực hiện dự kiến: ${data.duration || 'theo thoả thuận cụ thể giữa hai bên'}. Thời gian này có thể thay đổi tuỳ khối lượng công việc thực tế và được hai bên trao đổi, thống nhất kịp thời.`,
    ]},
    { title: 'Điều 4. Quyền và nghĩa vụ của Bên A', body: [
      `4.1. Bên A có nghĩa vụ thực hiện dịch vụ đúng nội dung, đúng chất lượng đã thoả thuận tại Điều 1; bảo mật toàn bộ thông tin do Bên B cung cấp, chỉ sử dụng cho mục đích thực hiện hợp đồng này; thông báo kịp thời cho Bên B nếu có phát sinh ảnh hưởng đến tiến độ hoặc kết quả dịch vụ.`,
      `4.2. Bên A có quyền yêu cầu Bên B cung cấp đầy đủ, chính xác thông tin cần thiết để thực hiện dịch vụ; có quyền tạm dừng hoặc từ chối tiếp tục thực hiện nếu phát hiện Bên B cung cấp thông tin sai sự thật hoặc yêu cầu thực hiện hành vi vi phạm pháp luật.`,
    ]},
    { title: 'Điều 5. Quyền và nghĩa vụ của Bên B', body: [
      `5.1. Bên B có nghĩa vụ cung cấp thông tin, tài khoản, tài liệu cần thiết đầy đủ và chính xác cho Bên A; thanh toán đúng, đủ theo thoả thuận tại Điều 2; chịu trách nhiệm về tính hợp pháp của thông tin, nội dung, tài khoản mà mình cung cấp cho Bên A.`,
      `5.2. Bên B có quyền được Bên A tư vấn, hỗ trợ trong suốt quá trình thực hiện dịch vụ; có quyền yêu cầu Bên A thực hiện đúng nội dung đã cam kết tại Điều 1.`,
    ]},
    { title: 'Điều 6. Chính sách huỷ và hoàn tiền', body: [
      `6.1. Trường hợp huỷ dịch vụ do lỗi từ phía Bên A, Bên A hoàn lại 100% số tiền Bên B đã thanh toán cho phần dịch vụ chưa thực hiện.`,
      `6.2. Trường hợp Bên B chủ động huỷ dịch vụ khi dịch vụ chưa được triển khai, Bên B được hoàn tối đa 95% số tiền đã thanh toán, phần còn lại (tối đa 5%) là chi phí xử lý mà Bên A được giữ lại.`,
      `6.3. Trường hợp huỷ khi dịch vụ đã được triển khai một phần, Bên A hoàn lại phần chênh lệch giữa số tiền đã thanh toán và giá trị phần công việc đã thực hiện tương ứng, có thể trừ thêm chi phí phát sinh thực tế (nếu có, tối đa 3%) sau khi thông báo cho Bên B.`,
      `6.4. Số tiền hoàn được ghi nhận vào ví điện tử của Bên B trên hệ thống của Bên A hoặc hoàn trả trực tiếp qua chuyển khoản theo thoả thuận của hai bên.`,
    ]},
    { title: 'Điều 7. Cam kết bảo mật thông tin', body: [
      `7.1. Hai bên cam kết bảo mật toàn bộ thông tin, tài liệu, dữ liệu trao đổi trong quá trình thực hiện hợp đồng này, không tiết lộ cho bên thứ ba khi chưa được sự đồng ý bằng văn bản của bên còn lại, trừ trường hợp pháp luật có quy định khác.`,
    ]},
    { title: 'Điều 8. Giải quyết tranh chấp', body: [
      `8.1. Mọi tranh chấp phát sinh trong quá trình thực hiện hợp đồng được hai bên ưu tiên giải quyết thông qua thương lượng, hoà giải trên cơ sở tôn trọng quyền lợi của nhau.`,
      `8.2. Trường hợp không đạt được thoả thuận, tranh chấp sẽ được giải quyết tại Toà án có thẩm quyền theo quy định của pháp luật Việt Nam.`,
    ]},
    { title: 'Điều 9. Điều khoản chung', body: [
      `9.1. Hợp đồng có hiệu lực kể từ ngày ký và có giá trị đến khi hai bên hoàn thành đầy đủ quyền và nghĩa vụ theo hợp đồng.`,
      `9.2. Hợp đồng được lập thành 02 (hai) bản có giá trị pháp lý như nhau, mỗi bên giữ 01 (một) bản để thực hiện.`,
      `9.3. Mọi sửa đổi, bổ sung hợp đồng phải được lập thành văn bản và có xác nhận của hai bên mới có hiệu lực.`,
      `9.4. Hai bên đồng ý sử dụng chữ ký điện tử (ký trực tiếp trên thiết bị điện tử, có ghi nhận thời gian và địa chỉ IP xác nhận) thay cho chữ ký tay, theo quy định của Luật Giao dịch điện tử.`,
      ...(data.note ? [`9.5. Ghi chú thêm: ${data.note}`] : []),
    ]},
  ];
}

/* =====================================================================
   BẢNG KÝ TAY (canvas) — dùng chung cho cả admin (ký Bên A) và trang
   ký hợp đồng cho khách (ký Bên B). Hỗ trợ cả chuột lẫn chạm tay/cảm ứng.
===================================================================== */
function initSignaturePad(canvasId){
  const canvas = document.getElementById(canvasId);
  if(!canvas || canvas.__sigInit) return;
  canvas.__sigInit = true;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let drawing = false;

  function pos(e){
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }
  function start(e){ drawing = true; canvas.__hasSignature = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e){ if(!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end(){ drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive:false });
  canvas.addEventListener('touchmove', move, { passive:false });
  canvas.addEventListener('touchend', end);
}

function clearSignCanvas(canvasId){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  canvas.__hasSignature = false;
}

function isSignatureEmpty(canvasId){
  const canvas = document.getElementById(canvasId);
  return !canvas || !canvas.__hasSignature;
}

function getSignatureDataURL(canvasId){
  const canvas = document.getElementById(canvasId);
  return canvas ? canvas.toDataURL('image/png') : null;
}

function randomToken(){
  const arr = new Uint8Array(24);
  (window.crypto || window.msCrypto).getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}