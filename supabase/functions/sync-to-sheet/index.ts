// ============================================================
// Edge Function: sync-to-sheet
// Trung gian giữa Supabase (trigger) và Apps Script Web App.
//
// LÝ DO CẦN FUNCTION NÀY: Apps Script Web App LUÔN trả về mã
// chuyển hướng (302) trước khi chạy code thật — nếu gọi thẳng bằng
// pg_net, request có thể bị đổi từ POST thành GET giữa đường, làm
// mất toàn bộ dữ liệu gửi đi. Function này TỰ xử lý đúng bước
// chuyển hướng: nhận 302, tự lấy địa chỉ mới, rồi tự gửi lại đúng
// bằng POST — đảm bảo dữ liệu luôn tới đích.
//
// Deploy: supabase functions deploy sync-to-sheet --no-verify-jwt
// Cần thêm Secret: APPS_SCRIPT_URL, SHEET_SYNC_SECRET
// ============================================================

const APPS_SCRIPT_URL = Deno.env.get('APPS_SCRIPT_URL')!;
const SHEET_SYNC_SECRET = Deno.env.get('SHEET_SYNC_SECRET');

Deno.serve(async (req) => {
  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== SHEET_SYNC_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
    }

    const payload = await req.json(); // { secret, action, data } — gửi nguyên cho Apps Script

    // Bước 1: gọi Apps Script, KHÔNG tự follow redirect (redirect:'manual')
    // để mình tự kiểm soát, tránh bị đổi method POST -> GET giữa đường.
    const firstRes = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let finalRes = firstRes;

    // Bước 2: nếu bị chuyển hướng (302/303) -> tự gửi lại đúng bằng POST
    // tới địa chỉ mới (KHÔNG đổi thành GET như cách làm mặc định).
    if (firstRes.status === 302 || firstRes.status === 303) {
      const location = firstRes.headers.get('location');
      if (location) {
        finalRes = await fetch(location, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
    }

    const text = await finalRes.text();
    return new Response(JSON.stringify({ ok: true, appsScriptStatus: finalRes.status, appsScriptResponse: text }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});