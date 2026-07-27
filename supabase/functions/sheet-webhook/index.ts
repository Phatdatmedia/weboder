// ============================================================
// Edge Function: sheet-webhook
// Nhận dữ liệu TỪ Apps Script (khi ai đó sửa tay trên Google Sheet),
// ghi vào bảng social_boost.
//
// ĐÃ SỬA LỖI TẠO TRÙNG DÒNG: trước đây dùng "tìm dòng cũ rồi quyết
// định insert/update" — nếu vì lý do gì đó có 2 dòng trùng sheet_row,
// bước tìm sẽ báo lỗi (không rõ dòng nào), khiến code âm thầm tạo
// thêm dòng mới, lặp lại mỗi lần sửa. Giờ đổi sang UPSERT — 1 lệnh
// duy nhất, dựa vào ràng buộc UNIQUE(sheet_row) ở database, không
// bao giờ tạo trùng được nữa dù có chuyện gì xảy ra.
//
// Deploy: supabase functions deploy sheet-webhook --no-verify-jwt
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const SHEET_SYNC_SECRET = Deno.env.get('SHEET_SYNC_SECRET');

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    if (body.secret !== SHEET_SYNC_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
    }

    const row = {
      link: body.link || null,
      status: body.status || null,
      owner: body.owner || null,
      target_amount: body.target_amount != null ? String(body.target_amount) : null,
      current_amount: body.current_amount != null ? String(body.current_amount) : null,
      remaining: body.remaining != null ? String(body.remaining) : null,
      note: body.note || null,
      order_date: body.order_date || null,
      note2: body.note2 || null,
      sheet_row: body.sheet_row,
      source: 'sheet',
      updated_at: new Date().toISOString(),
    };

    // UPSERT theo sheet_row — nếu đã có dòng với sheet_row này thì CẬP NHẬT
    // đúng dòng đó, chưa có thì mới tạo mới. Nhờ ràng buộc UNIQUE(sheet_row)
    // ở database, không bao giờ có thể tạo ra 2 dòng trùng sheet_row nữa.
    const { error } = await supabase
      .from('social_boost')
      .upsert(row, { onConflict: 'sheet_row' });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});