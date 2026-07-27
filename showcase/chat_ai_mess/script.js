const chatArea = document.getElementById('chatArea');
const msgInput = document.getElementById('msgInput');
const sendBtn = document.getElementById('sendBtn');
const cfgToggle = document.getElementById('cfgToggle');
const cfgPanel = document.getElementById('cfgPanel');
const hintRow = document.getElementById('hintRow');

cfgToggle.addEventListener('click', () => cfgPanel.classList.toggle('open'));

const INDUSTRY_PRESETS = {
  tham_my: {
    field:"Thẩm mỹ viện", name:"One Optimize Clinic",
    script:`Dịch vụ chính: xóa mụn thịt bằng công nghệ sóng CO2 (không để sẹo), trị mụn nam giới, nâng cơ mặt, xóa nhăn, nâng ngực nội soi.
Phong cách tư vấn: thân thiện, xưng "em" gọi khách là "chị/anh", hỏi kỹ vùng khách quan tâm trước khi báo giá, không chốt giá cụ thể qua tin nhắn mà xin số điện thoại để chuyên viên gọi tư vấn kỹ và đặt lịch.
Khung giờ tư vấn: khách hay nhắn tin ngoài giờ hành chính (buổi tối/đêm) — bot luôn trực 24/7 để trả lời ngay.`,
    hints:["Mụn thịt","Giá nâng ngực bao nhiêu vậy em","Chị ở TPHCM, quan tâm xóa nhăn"]
  },
  nha_khoa: {
    field:"Nha khoa", name:"Nha Khoa Sài Gòn Smile",
    script:`Dịch vụ chính: niềng răng invisalign, bọc răng sứ, tẩy trắng răng, trồng răng implant, khám tổng quát miễn phí lần đầu.
Phong cách tư vấn: chuyên nghiệp, trấn an khách sợ đau/sợ nha sĩ, hỏi tình trạng răng và mong muốn thẩm mỹ trước khi tư vấn phác đồ, xin số điện thoại để đặt lịch khám tổng quát miễn phí.
Lưu ý: không chẩn đoán bệnh lý cụ thể qua tin nhắn, luôn khuyên đến khám trực tiếp để bác sĩ kiểm tra.`,
    hints:["Niềng răng giá bao nhiêu ạ","Em bị hô nhẹ có niềng được không","Cho chị đặt lịch khám thử"]
  },
  gym: {
    field:"Gym / Fitness", name:"IronCore Fitness",
    script:`Dịch vụ chính: gói tập gym, PT 1-kèm-1, lớp nhóm (cardio, boxing), tư vấn dinh dưỡng.
Phong cách tư vấn: năng lượng, thúc đẩy khách hành động, hỏi mục tiêu tập (giảm cân/tăng cơ/sức khỏe) và lịch trống trong tuần, mời khách để lại số điện thoại để đặt lịch tập thử miễn phí.
Ưu đãi: tập thử miễn phí buổi đầu, giảm giá khi đăng ký gói 6-12 tháng.`,
    hints:["Gói tập 1 tháng bao nhiêu vậy shop","Em muốn giảm cân, có PT không","Cho anh tập thử 1 buổi"]
  },
  yoga: {
    field:"Yoga / Pilates", name:"Lotus Yoga Studio",
    script:`Dịch vụ chính: lớp yoga cho người mới, yoga trị liệu, pilates reformer, lớp riêng theo yêu cầu.
Phong cách tư vấn: nhẹ nhàng, ấm áp, hỏi khách đã tập yoga bao giờ chưa và mục tiêu (giảm căng thẳng/dẻo dai/giảm đau lưng...), mời để lại số điện thoại để tư vấn lớp phù hợp và đặt buổi học thử.
Lưu ý: không tư vấn y khoa, nếu khách có chấn thương thì khuyên trao đổi trực tiếp với huấn luyện viên.`,
    hints:["Em chưa tập yoga bao giờ, học được không","Lớp pilates học phí sao ạ","Chị bị đau lưng, có lớp phù hợp không"]
  },
  tocnail: {
    field:"Salon tóc / Nail", name:"Bella Hair & Nail",
    script:`Dịch vụ chính: cắt/uốn/nhuộm tóc, làm nail, chăm sóc da đầu, trang điểm.
Phong cách tư vấn: vui vẻ, gần gũi, hỏi khách muốn làm dịch vụ gì và có ảnh mẫu tham khảo không, mời để lại số điện thoại để đặt lịch với stylist phù hợp.
Lưu ý: giá có thể thay đổi theo độ dài tóc/mẫu nail, hẹn tư vấn kỹ hơn qua điện thoại hoặc tại salon.`,
    hints:["Nhuộm tóc màu nâu giá nhiêu ạ","Làm nail gel bao lâu xong","Chị muốn đặt lịch làm tóc cuối tuần"]
  },
  petspa: {
    field:"Spa thú cưng", name:"Happy Paws Pet Spa",
    script:`Dịch vụ chính: tắm/cắt tỉa lông, spa thư giãn cho thú cưng, khám sức khỏe định kỳ, trông giữ thú cưng theo ngày.
Phong cách tư vấn: dễ thương, thân thiện, hỏi loại thú cưng (chó/mèo), giống, cân nặng để báo dịch vụ phù hợp, mời để lại số điện thoại để đặt lịch.
Lưu ý: nếu thú cưng có vấn đề sức khỏe thì khuyên đưa đến khám trực tiếp.`,
    hints:["Tắm cho poodle giá bao nhiêu","Bé mèo nhà em hay rụng lông, có spa trị không","Cho chị đặt lịch tắm cún thứ 7"]
  },
  giaoduc: {
    field:"Trung tâm Anh ngữ", name:"BrightPath English",
    script:`Dịch vụ chính: lớp tiếng Anh giao tiếp, luyện thi IELTS/TOEIC, lớp trẻ em, gia sư 1-kèm-1.
Phong cách tư vấn: nhiệt tình, hỏi trình độ hiện tại và mục tiêu học (giao tiếp/thi chứng chỉ/đi làm), mời để lại số điện thoại để làm bài test đầu vào miễn phí và tư vấn lộ trình.
Ưu đãi: test trình độ miễn phí, học thử 1 buổi.`,
    hints:["Học phí lớp giao tiếp bao nhiêu ạ","Em mất gốc tiếng Anh, học được không","Cho con em test đầu vào lớp thiếu nhi"]
  },
  luyenthi: {
    field:"Trung tâm luyện thi", name:"Ánh Sáng Education",
    script:`Dịch vụ chính: luyện thi lớp 10, luyện thi THPT Quốc gia, ôn tập theo lộ trình cá nhân hóa, lớp nhỏ 8-10 học sinh.
Phong cách tư vấn: chỉn chu, hỏi con đang học lớp mấy, môn cần cải thiện, mời phụ huynh để lại số điện thoại để tư vấn lộ trình và làm bài kiểm tra năng lực miễn phí.
Ưu đãi: kiểm tra năng lực miễn phí, học thử 1 buổi trước khi đăng ký.`,
    hints:["Con em lớp 9, học phí ôn thi lớp 10 sao ạ","Có lớp luyện thi Toán riêng không","Cho chị đăng ký kiểm tra năng lực"]
  },
  bds: {
    field:"Bất động sản", name:"Gold Land Realty",
    script:`Dịch vụ chính: mua bán/cho thuê căn hộ, nhà phố, đất nền; tư vấn pháp lý, hỗ trợ vay ngân hàng.
Phong cách tư vấn: chuyên nghiệp, hỏi khu vực quan tâm, tầm giá và mục đích (ở/đầu tư), mời để lại số điện thoại để gửi bảng giá chi tiết và sắp lịch xem nhà thực tế.
Lưu ý: không cam kết giá/pháp lý cụ thể qua tin nhắn, hẹn tư vấn kỹ với chuyên viên.`,
    hints:["Căn 2 phòng ngủ quận 7 giá nhiêu ạ","Em muốn thuê nhà nguyên căn tầm 10 triệu","Cho anh xem nhà cuối tuần này"]
  },
  noithat: {
    field:"Nội thất / Thiết kế", name:"Modern Home Design",
    script:`Dịch vụ chính: thiết kế nội thất trọn gói, thi công căn hộ/nhà phố, tư vấn phong cách (hiện đại, tối giản, indochine).
Phong cách tư vấn: tinh tế, hỏi diện tích, phong cách yêu thích và ngân sách dự kiến, mời để lại số điện thoại để kiến trúc sư tư vấn và khảo sát miễn phí.
Ưu đãi: khảo sát và lên concept sơ bộ miễn phí.`,
    hints:["Thiết kế căn hộ 70m2 giá bao nhiêu","Em thích phong cách tối giản, tư vấn giúp em","Cho anh đặt lịch khảo sát nhà"]
  },
  thoitrang: {
    field:"Thời trang", name:"Luna Boutique",
    script:`Dịch vụ chính: bán quần áo nữ thiết kế, phụ kiện, giao hàng toàn quốc.
Phong cách tư vấn: trẻ trung, gần gũi, hỏi size/dáng người và phong cách yêu thích, gợi ý sản phẩm phù hợp, mời để lại số điện thoại/địa chỉ để chốt đơn và giao hàng.
Lưu ý: luôn xác nhận size và màu trước khi chốt đơn.`,
    hints:["Váy này còn size M không shop","Cho em xem thêm mẫu áo sơ mi trắng","Chị chốt đơn cái váy đỏ, ib số đặt hàng"]
  },
  mypham: {
    field:"Mỹ phẩm", name:"Glow Beauty Store",
    script:`Dịch vụ chính: bán mỹ phẩm chính hãng (skincare, makeup), tư vấn theo loại da, freeship đơn từ 500k.
Phong cách tư vấn: am hiểu sản phẩm, hỏi loại da và vấn đề da đang gặp (mụn/khô/lão hóa), gợi ý sản phẩm phù hợp, mời để lại số điện thoại/địa chỉ để lên đơn.
Lưu ý: không cam kết trị dứt điểm bệnh da liễu, khuyên khám da liễu nếu tình trạng nặng.`,
    hints:["Da em dầu mụn, dùng kem gì phù hợp","Serum này giá bao nhiêu shop","Chị đặt 1 bộ skincare, ib địa chỉ giao"]
  },
  nhahang: {
    field:"Nhà hàng / Quán ăn", name:"Quán Ngon Sài Gòn",
    script:`Dịch vụ chính: đặt bàn ăn uống, đặt tiệc nhóm/công ty, giao hàng qua app.
Phong cách tư vấn: hiếu khách, hỏi số lượng khách, thời gian muốn đặt bàn, mời để lại số điện thoại để giữ bàn.
Lưu ý: xác nhận lại giờ cao điểm có thể phải chờ, gợi ý đặt trước.`,
    hints:["Cho anh đặt bàn 6 người tối nay","Quán có phòng riêng cho tiệc công ty không","Đặt bàn 7h tối được không em"]
  },
  cafe: {
    field:"Cà phê / Trà sữa", name:"Mộc Coffee",
    script:`Dịch vụ chính: cà phê, trà sữa, bánh ngọt, không gian làm việc/học nhóm, giao hàng.
Phong cách tư vấn: thân thiện, trẻ trung, hỏi khách muốn đặt món gì hoặc cần đặt chỗ nhóm, mời để lại số điện thoại nếu cần giao hàng hoặc giữ chỗ.
Lưu ý: xác nhận địa chỉ giao hàng rõ ràng.`,
    hints:["Quán có wifi mạnh không, học nhóm được không","Order 1 ly trà sữa trân châu ship về","Đặt chỗ cho 5 người chiều nay"]
  },
  khachsan: {
    field:"Khách sạn / Homestay", name:"Blue Sky Homestay",
    script:`Dịch vụ chính: cho thuê phòng theo ngày/đêm, homestay view đẹp, hỗ trợ đưa đón.
Phong cách tư vấn: nhiệt tình, hỏi ngày nhận/trả phòng, số lượng khách, mời để lại số điện thoại để giữ phòng và gửi thông tin thanh toán.
Lưu ý: xác nhận tình trạng phòng trống trước khi chốt.`,
    hints:["Còn phòng cuối tuần này không em","Giá phòng 2 người 1 đêm bao nhiêu","Cho chị đặt phòng homestay view biển"]
  },
  dulich: {
    field:"Du lịch / Tour", name:"Việt Travel Go",
    script:`Dịch vụ chính: tour trong nước/nước ngoài, combo vé máy bay + khách sạn, tour theo yêu cầu.
Phong cách tư vấn: am hiểu điểm đến, hỏi điểm đến mong muốn, số người và thời gian đi, mời để lại số điện thoại để tư vấn lịch trình và báo giá chi tiết.
Lưu ý: giá tour thay đổi theo mùa, hẹn tư vấn kỹ qua điện thoại.`,
    hints:["Tour Đà Lạt 3 ngày 2 đêm giá nhiêu","Đi Phú Quốc 4 người tháng sau, tư vấn giúp em","Có combo vé máy bay + khách sạn không"]
  },
  oto: {
    field:"Showroom ô tô", name:"Auto Prime Showroom",
    script:`Dịch vụ chính: bán xe mới/cũ, hỗ trợ trả góp, thu cũ đổi mới, bảo dưỡng.
Phong cách tư vấn: chuyên nghiệp, hỏi dòng xe quan tâm và nhu cầu (mua trả thẳng/trả góp), mời để lại số điện thoại để tư vấn viên gọi báo giá chi tiết và mời lái thử.
Lưu ý: không chốt giá cụ thể qua tin nhắn, giá tùy phiên bản và khuyến mãi hiện hành.`,
    hints:["Xe này giá lăn bánh bao nhiêu ạ","Em muốn mua trả góp, hỗ trợ được không","Cho anh đặt lịch lái thử"]
  },
  baohiem: {
    field:"Bảo hiểm", name:"An Tâm Insurance",
    script:`Dịch vụ chính: bảo hiểm nhân thọ, bảo hiểm sức khỏe, bảo hiểm xe, tư vấn gói phù hợp theo nhu cầu.
Phong cách tư vấn: đáng tin cậy, hỏi độ tuổi, nhu cầu bảo vệ (sức khỏe/tài chính gia đình), mời để lại số điện thoại để chuyên viên tư vấn miễn phí và so sánh các gói.
Lưu ý: không tư vấn điều khoản pháp lý chi tiết qua tin nhắn, hẹn tư vấn kỹ qua điện thoại.`,
    hints:["Gói bảo hiểm sức khỏe cho gia đình giá sao ạ","Em 30 tuổi, nên mua gói nào","Cho anh tư vấn bảo hiểm xe ô tô"]
  },
  phongkham: {
    field:"Phòng khám đa khoa", name:"Phòng Khám Đa Khoa An Khang",
    script:`Dịch vụ chính: khám tổng quát, xét nghiệm, khám chuyên khoa (tim mạch, tiêu hóa, da liễu...).
Phong cách tư vấn: chuyên nghiệp, ân cần, hỏi triệu chứng/nhu cầu khám tổng quát, mời để lại số điện thoại để đặt lịch khám với bác sĩ phù hợp.
Lưu ý quan trọng: KHÔNG chẩn đoán bệnh hay kê đơn qua tin nhắn, luôn khuyên đến khám trực tiếp hoặc gặp bác sĩ.`,
    hints:["Em muốn khám tổng quát, chi phí bao nhiêu","Đặt lịch khám tim mạch cho ba em","Phòng khám có làm việc chủ nhật không"]
  },
  studio: {
    field:"Studio chụp ảnh", name:"Sunlight Studio",
    script:`Dịch vụ chính: chụp ảnh cưới, ảnh gia đình, ảnh sản phẩm, quay phim sự kiện.
Phong cách tư vấn: sáng tạo, thân thiện, hỏi loại hình chụp cần và ngày dự kiến, mời để lại số điện thoại để tư vấn gói chụp và giữ lịch.
Lưu ý: giá tùy gói và địa điểm chụp, hẹn tư vấn chi tiết qua điện thoại.`,
    hints:["Gói chụp ảnh cưới trọn gói giá nhiêu","Em cần chụp ảnh sản phẩm cho shop","Cho anh đặt lịch chụp ảnh gia đình"]
  },
  custom: {
    field:"", name:"",
    script:`Dịch vụ chính: (mô tả sản phẩm/dịch vụ của bạn)
Phong cách tư vấn: (giọng điệu, cách xưng hô, quy trình chốt thông tin khách)
Lưu ý: (những điều bot không nên tự ý cam kết)`,
    hints:["Cho em hỏi thông tin dịch vụ","Giá bên mình như thế nào ạ","Em muốn đặt lịch tư vấn"]
  }
};

function applyPreset(key){
  const p = INDUSTRY_PRESETS[key];
  if(!p) return;
  if(p.field) document.getElementById('bizField').value = p.field;
  if(p.name) document.getElementById('bizName').value = p.name;
  document.getElementById('bizScript').value = p.script;
  document.getElementById('bizName').dispatchEvent(new Event('input'));
  document.getElementById('bizField').dispatchEvent(new Event('input'));
  hintRow.innerHTML = p.hints.map(h=>`<div class="chip" data-msg="${h.replace(/"/g,'&quot;')}">${h}</div>`).join('');
  hintRow.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      msgInput.value = chip.dataset.msg;
      handleSend();
    });
  });
}
document.getElementById('industryPreset').addEventListener('change', e=> applyPreset(e.target.value));

document.getElementById('bizName').addEventListener('input', e=>{
  document.getElementById('hName').textContent = e.target.value || 'Trang của bạn';
  document.getElementById('hAvatar').textContent = (e.target.value||'?').trim().charAt(0).toUpperCase();
  document.getElementById('fField').textContent = document.getElementById('bizField').value || '—';
});
document.getElementById('bizField').addEventListener('input', e=>{
  document.getElementById('fField').textContent = e.target.value || '—';
});
document.getElementById('fField').textContent = document.getElementById('bizField').value;

const convId = 'conv_' + Math.random().toString(36).slice(2,10) + '_' + Date.now().toString().slice(-10);
document.getElementById('convId').textContent = 'ID: ' + convId;
document.getElementById('convTime').textContent = new Date().toLocaleString('vi-VN');

let history = []; // {role:'user'|'assistant', content:string}  role user = khách, assistant = TV (page)
let busy = false;

hintRow.querySelectorAll('.chip').forEach(chip=>{
  chip.addEventListener('click', ()=>{
    msgInput.value = chip.dataset.msg;
    handleSend();
  });
});

sendBtn.addEventListener('click', handleSend);
msgInput.addEventListener('keydown', e=>{ if(e.key==='Enter') handleSend(); });

function addBubble(role, text){
  const empty = chatArea.querySelector('.empty-state');
  if(empty) empty.remove();
  const row = document.createElement('div');
  row.className = 'bubble-row ' + (role==='user' ? 'khach' : 'tv');
  const b = document.createElement('div');
  b.className = 'bubble ' + (role==='user' ? 'khach' : 'tv');
  b.textContent = text;
  row.appendChild(b);
  chatArea.appendChild(row);
  chatArea.scrollTop = chatArea.scrollHeight;
  return row;
}

function addTyping(){
  const row = document.createElement('div');
  row.className = 'bubble-row tv';
  row.id = 'typingRow';
  row.innerHTML = '<div class="typing"><span></span><span></span><span></span></div>';
  chatArea.appendChild(row);
  chatArea.scrollTop = chatArea.scrollHeight;
}
function removeTyping(){
  const t = document.getElementById('typingRow');
  if(t) t.remove();
}

async function callClaude(messages, system, maxTokens){
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({
      model:"claude-sonnet-4-6",
      max_tokens: maxTokens || 1000,
      system: system,
      messages: messages
    })
  });
  const data = await res.json();
  const text = (data.content||[]).map(b=>b.text||'').join('\n');
  return text;
}

async function handleSend(){
  const text = msgInput.value.trim();
  if(!text || busy) return;
  busy = true;
  msgInput.value='';
  sendBtn.disabled = true;

  addBubble('user', text);
  history.push({role:'user', content:text});

  addTyping();

  const bizName = document.getElementById('bizName').value || 'phòng khám';
  const bizField = document.getElementById('bizField').value || 'thẩm mỹ viện';
  const bizScript = document.getElementById('bizScript').value;

  const systemPrompt = `Bạn là nhân viên tư vấn nhắn tin (chăm sóc khách hàng qua Messenger) cho "${bizName}", lĩnh vực ${bizField}.
Thông tin/kịch bản tư vấn nội bộ:
${bizScript}

Quy tắc trả lời:
- Trả lời ngắn gọn (1-3 câu), tự nhiên như người thật đang nhắn tin, xưng "em" gọi khách "chị/anh" trừ khi khách xưng hô khác.
- Luôn hỏi thêm thông tin cần thiết (vùng quan tâm, tình trạng) trước khi tư vấn sâu.
- Không báo giá cụ thể qua tin nhắn; hướng khách để lại số điện thoại để chuyên viên gọi tư vấn kỹ và đặt lịch.
- Nếu khách đã hỏi 2-3 lượt mà chưa để số điện thoại, hãy khéo léo xin số.
- Không bịa thông tin y khoa ngoài kịch bản trên.
Chỉ trả lời bằng tin nhắn của nhân viên, không thêm giải thích hay nhãn vai trò.`;

  try{
    const reply = await callClaude(history, systemPrompt, 300);
    removeTyping();
    const cleanReply = reply.trim() || 'Dạ em cảm ơn thông tin của mình ạ, để em kiểm tra và phản hồi ngay nhé!';
    addBubble('assistant', cleanReply);
    history.push({role:'assistant', content:cleanReply});
    extractLead(bizField);
  }catch(err){
    removeTyping();
    addBubble('assistant', '[Lỗi kết nối — vui lòng thử lại]');
    console.error(err);
  }finally{
    busy = false;
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

let lastPhone = '';

async function extractLead(bizField){
  const transcript = history.map(h => (h.role==='user' ? 'Khách: ' : 'TV: ') + h.content).join('\n');
  const sys = `Bạn là công cụ trích xuất dữ liệu. Đọc đoạn hội thoại Messenger giữa "Khách" và "TV" (nhân viên tư vấn) rồi CHỈ trả về một object JSON thuần (không markdown, không giải thích, không dấu backtick) với các khóa:
{"ten": string hoặc null (tên khách nếu có nhắc tới), "quan_tam": string ngắn mô tả dịch vụ/vùng khách quan tâm hoặc null, "sdt": string số điện thoại Việt Nam nếu khách có để lại trong hội thoại hoặc null, "tom_tat": chuỗi tóm tắt 1 câu về nhu cầu khách}
Nếu không có thông tin, dùng null. Chỉ trả JSON.`;

  try{
    const raw = await callClaude([{role:'user', content:transcript}], sys, 300);
    const clean = raw.replace(/```json|```/g,'').trim();
    const data = JSON.parse(clean);
    updateCard(data, bizField);
  }catch(err){
    console.error('extract error', err);
  }
}

function setField(id, value, mono){
  const el = document.getElementById(id);
  if(value){
    el.textContent = value;
    el.classList.remove('empty');
  } else {
    el.textContent = id==='fPhone' ? 'chưa để lại' : 'chưa xác định';
    el.classList.add('empty');
  }
}

function updateCard(data, bizField){
  setField('fName', data.ten);
  document.getElementById('fField').textContent = bizField;
  setField('fInterest', data.quan_tam);
  setField('fPhone', data.sdt);
  setField('fSummary', data.tom_tat);
  document.getElementById('convTime').textContent = new Date().toLocaleString('vi-VN');

  const stamp = document.getElementById('stamp');
  const sendBtnTg = document.getElementById('sendTgBtn');
  if(data.sdt && data.sdt !== lastPhone){
    lastPhone = data.sdt;
    stamp.classList.add('show');
    sendBtnTg.disabled = false;
  } else if(data.sdt){
    sendBtnTg.disabled = false;
  }
}

// ---------- Telegram send ----------
document.getElementById('sendTgBtn').addEventListener('click', async ()=>{
  const token = document.getElementById('tgToken').value.trim();
  const chat = document.getElementById('tgChat').value.trim();
  const statusEl = document.getElementById('tgStatus');
  statusEl.className = 'send-status';

  const name = document.getElementById('fName').textContent;
  const field = document.getElementById('fField').textContent;
  const interest = document.getElementById('fInterest').textContent;
  const phone = document.getElementById('fPhone').textContent;
  const summary = document.getElementById('fSummary').textContent;

  const msg =
`🔔 <b>Khách mới từ Messenger</b>
👤 Khách: ${name}
🏷 Lĩnh vực: ${field}
📌 Quan tâm: ${interest}
📞 SĐT: <code>${phone}</code>
📝 Tóm tắt: ${summary}
🆔 ${convId}`;

  if(!token || !chat){
    statusEl.textContent = 'Chưa nhập Bot Token / Chat ID trong mục Cấu hình.';
    statusEl.classList.add('err');
    return;
  }

  const btn = document.getElementById('sendTgBtn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Đang gửi...';

  try{
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({chat_id: chat, text: msg, parse_mode:'HTML'})
    });
    const json = await res.json();
    if(json.ok){
      statusEl.textContent = '✓ Đã gửi thẻ khách hàng về Telegram.';
      statusEl.classList.add('ok');
    } else {
      statusEl.textContent = 'Telegram báo lỗi: ' + (json.description || 'không rõ nguyên nhân');
      statusEl.classList.add('err');
    }
  }catch(err){
    statusEl.textContent = 'Không gửi được — kiểm tra Token/Chat ID hoặc kết nối mạng.';
    statusEl.classList.add('err');
  }finally{
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
});
