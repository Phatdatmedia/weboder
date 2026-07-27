// ============================================================
// Edge Function: send-push-notification
// Nhận sự kiện từ database trigger (đơn mới / tin nhắn chat mới),
// gửi Web Push tới đúng thiết bị đã cài app (admin hoặc khách).
//
// ĐÃ SỬA: bỏ thư viện "web-push" (không tương thích Deno), thay bằng
// module tự viết ở _shared/webpush.ts dùng Web Crypto API gốc.
// Đã thêm CORS headers phòng trường hợp có nơi gọi trực tiếp từ trình duyệt.
//
// Deploy: supabase functions deploy send-push-notification --no-verify-jwt
//
// Cần set các Secret sau (Supabase Dashboard -> Edge Functions -> Secrets):
//   WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tự có sẵn)
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendWebPush } from '../_shared/webpush.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const secret = req.headers.get('x-webhook-secret');
    if (secret !== Deno.env.get('WEBHOOK_SECRET')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await req.json();
    let title = '', body = '', url = '/', targetIsAdmin = false, targetUserId: string | null = null;

    if (payload.type === 'new_order') {
      title = '🎉 Đơn hàng mới!';
      body = `${payload.customer_name} vừa đặt "${payload.service_type}" (${payload.order_code})`;
      url = '/admin.html';
      targetIsAdmin = true;
    } else if (payload.type === 'new_chat_message') {
      if (payload.sender_type === 'customer') {
        title = '💬 Tin nhắn chat mới';
        body = `${payload.sender_name || 'Khách'}: ${String(payload.message).slice(0, 80)}`;
        url = '/admin.html#livechat';
        targetIsAdmin = true;
      } else {
        title = '💬 Phatdatagency đã trả lời';
        body = String(payload.message).slice(0, 100);
        url = '/account.html';
        targetIsAdmin = false;
        targetUserId = payload.target_user_id;
      }
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Unknown type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let query = supabase.from('push_subscriptions').select('*');
    if (targetIsAdmin) {
      query = query.eq('is_admin', true);
    } else if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    } else {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subs, error } = await query;
    if (error) throw error;

    let sent = 0;
    for (const sub of subs || []) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
        { title, body, url, tag: payload.type },
        VAPID_PUBLIC, VAPID_PRIVATE
      ).catch(() => null);

      if (result?.expired) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      } else if (result?.ok) {
        sent++;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});