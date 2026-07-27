// ============================================================
// Edge Function: check-social-live
// Tự động kiểm tra Live/Die cho Facebook / TikTok / Instagram / Threads
// trong bảng social_care — KHÔNG cần đăng nhập bất kỳ nền tảng nào.
// Báo biến động 2 chiều (Die<->Live) qua Telegram + Push notification.
//
// LƯU Ý ĐỘ TIN CẬY:
//   - Facebook, TikTok: dùng endpoint/API công khai chính thức, ổn định.
//   - Instagram, Threads: không có API chính thức tương đương, phải tải
//     trang rồi soi nội dung -> Meta chặn IP server khá mạnh, có thể
//     trả về "unknown" thường xuyên, không phản ánh đúng 100% thực tế.
//
// ĐÃ SỬA (lần 1): bỏ thư viện "web-push" (không tương thích Deno, gây
// lỗi "Deno.core.runMicrotasks() is not supported"), thay bằng module
// tự viết ở _shared/webpush.ts dùng Web Crypto API gốc.
//
// ĐÃ SỬA (lần 2): thêm CORS headers — thiếu phần này khiến trình duyệt
// tự chặn request trước khi kịp gửi đi, admin.html gọi trực tiếp từ
// trình duyệt (khác với send-push-notification chỉ được gọi từ
// server/database trigger nên không cần CORS).
//
// Deploy: supabase functions deploy check-social-live --no-verify-jwt
//
// Secrets cần có (phần lớn đã set từ trước, dùng chung project):
//   WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (có sẵn)
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (đã set cho push notification)
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (đã set cho thông báo Telegram)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWebPush } from '../_shared/webpush.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY');

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

// Header CORS — bắt buộc phải có để trình duyệt (admin.html) gọi được trực tiếp
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/* ------------------------------------------------------------
   Trích username/id từ link theo từng nền tảng
------------------------------------------------------------ */
function extractHandle(link: string, platform: string): string | null {
  if (!link) return null;
  const s = link.trim();

  if (platform === 'Facebook') {
    const idMatch = s.match(/[?&]id=(\d+)/);
    if (idMatch) return idMatch[1];
    if (/^\d+$/.test(s)) return s;
    const m = s.match(/facebook\.com\/([A-Za-z0-9._-]+)\/?/);
    if (m && !['profile.php', 'people'].includes(m[1])) return m[1];
    return null;
  }

  const m = s.match(/(?:tiktok\.com\/@|instagram\.com\/|threads\.net\/@)([A-Za-z0-9._-]+)/);
  if (m) return m[1];
  const bare = s.replace(/^@/, '');
  if (/^[A-Za-z0-9._-]+$/.test(bare)) return bare;
  return null;
}

/* ------------------------------------------------------------
   Kiểm tra từng nền tảng — trả về 'Live' | 'Die' | 'unknown'
------------------------------------------------------------ */
async function checkFacebook(id: string) {
  try {
    const res = await fetch(`https://m.facebook.com/${id}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'vi-VN,vi;q=0.9' },
      redirect: 'follow',
    });
    if (res.status === 404) return 'Die';
    if (!res.ok) return 'unknown';

    const html = await res.text();
    const lower = html.toLowerCase();

    // Danh sách MỞ RỘNG — gồm cả trang bị xoá/khoá VÀ trang bị giới hạn
    // quyền xem (không xem được nội dung dù tài khoản vẫn tồn tại).
    // Với mục đích quản lý ở đây, "không xem/thao tác được" coi như Die.
    const dieMarkers = [
      'không xem được nội dung này',
      'không xem được',
      'chỉ chia sẻ nội dung với một nhóm nhỏ',
      'đã xóa nội dung',
      'đã bị vô hiệu hóa',
      'tài khoản này hiện không khả dụng',
      "content isn't available right now",
      "content isn't available",
      'trang này hiện không có sẵn',
      "this content isn't available",
      "this page isn't available",
      "isn't available",
      'vui lòng đăng nhập',
      'log in to facebook',
      'you must log in',
    ];
    if (dieMarkers.some(m => lower.includes(m))) return 'Die';

    // Chỉ coi là Live khi có dấu hiệu THỰC SỰ là trang cá nhân đang hoạt
    // động (không chỉ dựa vào og:title vì Facebook vẫn gắn thẻ này cho
    // cả trang bị giới hạn quyền xem).
    const hasStrongLiveSignal =
      /"profile_name"|"page_name"|timeline|profile_tab/i.test(html) &&
      (/<meta property="og:title"/i.test(html) || /<meta property="og:image"/i.test(html));

    if (hasStrongLiveSignal) return 'Live';
    return 'unknown'; // Không chắc chắn -> KHÔNG đổi trạng thái cũ, an toàn hơn báo sai
  } catch { return 'unknown'; }
}

async function checkTikTok(username: string) {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${username}`);
    if (res.status === 404) return 'Die';
    if (!res.ok) return 'unknown';
    const json = await res.json();
    return json?.author_name ? 'Live' : 'unknown';
  } catch { return 'unknown'; }
}

async function checkInstagram(username: string) {
  try {
    const res = await fetch(`https://www.instagram.com/${username}/`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return 'Die';
    if (!res.ok) return 'unknown';
    const html = await res.text();
    if (/Sorry, this page isn.t available/i.test(html)) return 'Die';
    if (/<meta property="og:title"/i.test(html)) return 'Live';
    return 'unknown';
  } catch { return 'unknown'; }
}

async function checkThreads(username: string) {
  try {
    const res = await fetch(`https://www.threads.net/@${username}`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return 'Die';
    if (!res.ok) return 'unknown';
    const html = await res.text();
    if (/Sorry, this page isn.t available/i.test(html)) return 'Die';
    if (/<meta property="og:title"/i.test(html)) return 'Live';
    return 'unknown';
  } catch { return 'unknown'; }
}

const CHECKERS: Record<string, (h: string) => Promise<string>> = {
  Facebook: checkFacebook,
  TikTok: checkTikTok,
  Instagram: checkInstagram,
  Threads: checkThreads,
};

/* ------------------------------------------------------------
   Gửi thông báo khi có biến động (Telegram + Push cho admin)
------------------------------------------------------------ */
async function sendTelegramAlert(text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, parse_mode: 'Markdown', text }),
    });
  } catch { /* không chặn luồng chính */ }
}

async function sendAdminPush(title: string, body: string) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('is_admin', true);
    for (const sub of subs || []) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
        { title, body, url: '/admin.html#social', tag: 'social_status' },
        VAPID_PUBLIC, VAPID_PRIVATE
      ).catch(() => null);
      if (result?.expired) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
    }
  } catch { /* không chặn luồng chính */ }
}

/* ------------------------------------------------------------
   Handler chính
------------------------------------------------------------ */
Deno.serve(async (req) => {
  // Trình duyệt luôn gửi request "dò đường" (preflight) bằng method OPTIONS
  // trước khi gửi request thật -> phải trả lời ngay, không được xử lý gì thêm.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get('x-webhook-secret');
    let authorized = secret === Deno.env.get('WEBHOOK_SECRET');

    if (!authorized) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user) {
          const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', userData.user.id).single();
          authorized = !!profile?.is_admin;
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rows, error } = await supabase
      .from('social_care')
      .select('id, platform, link, account_owner, account_status')
      .not('link', 'is', null);
    if (error) throw error;

    let checked = 0, changed = 0;

    for (const row of rows || []) {
      const checker = CHECKERS[row.platform];
      if (!checker) continue;

      const handle = extractHandle(row.link, row.platform);
      if (!handle) continue;

      const result = await checker(handle);
      checked++;
      if (result === 'unknown' || result === row.account_status) continue;

      await supabase.from('social_care').update({ account_status: result, updated_at: new Date().toISOString() }).eq('id', row.id);
      changed++;

      const isDying = row.account_status !== 'Die' && result === 'Die';
      const emoji = isDying ? '🔴' : '🟢';
      const label = isDying ? 'VỪA DIE' : 'ĐÃ SỐNG LẠI';
      const text = `${emoji} *TÀI KHOẢN ${label}*\n\nNền tảng: ${row.platform}\nChủ TK: ${row.account_owner || '—'}\nLink: ${row.link}`;

      await sendTelegramAlert(text);
      await sendAdminPush(`${emoji} ${row.platform}: ${label}`, `${row.account_owner || row.link}`);
    }

    return new Response(JSON.stringify({ ok: true, checked, changed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});