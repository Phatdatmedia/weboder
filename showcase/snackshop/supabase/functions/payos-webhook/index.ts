// ============================================================
// EDGE FUNCTION: payos-webhook
// Nhận webhook từ PayOS khi có giao dịch thanh toán, xác minh chữ ký
// bằng Checksum Key (lưu ở admin/settings.html → PayOS & Webhook), rồi
// tự động đổi orders.payment_status = 'paid'.
//
// DEPLOY:
//   supabase functions deploy payos-webhook --no-verify-jwt
// Sau khi deploy, copy URL function (dạng
// https://<project-ref>.supabase.co/functions/v1/payos-webhook) và khai
// báo trong PayOS Dashboard → Webhook. URL này cũng được hiển thị sẵn ở
// trang admin/settings.html.
//
// LƯU Ý QUAN TRỌNG:
// PayOS dùng orderCode dạng số nguyên, còn đơn hàng ở đây dùng uuid. Hàm
// này tìm đơn hàng bằng cách so khớp 8 ký tự đầu của order.id nằm trong
// nội dung chuyển khoản (data.description) — CÙNG QUY ƯỚC "DH XXXXXXXX"
// đang dùng cho chuyển khoản QR (xem js/payment-config.js). Khi bạn tạo
// payment link PayOS lúc checkout, hãy đặt description theo đúng quy ước
// này (hoặc tự thêm cột payos_order_code vào bảng orders và map trực
// tiếp theo orderCode nếu muốn chính xác hơn).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Sắp xếp key theo alphabet rồi nối thành chuỗi key1=value1&key2=value2...
// (đúng cách PayOS ký dữ liệu — xem tài liệu "Verify Data" của PayOS).
function buildSignatureString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .sort()
    .map((key) => `${key}=${data[key] ?? ""}`)
    .join("&");
}

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { data, signature } = body || {};
  if (!data || !signature) {
    return new Response("Missing data/signature", { status: 400 });
  }

  // Lấy checksum key đã lưu ở trang Cấu hình (bảng chỉ admin đọc được,
  // nhưng service role key dùng ở đây bỏ qua RLS).
  const { data: secret, error: secretErr } = await supabaseAdmin
    .from("site_settings_secret")
    .select("payos_checksum_key")
    .eq("id", 1)
    .single();

  if (secretErr || !secret?.payos_checksum_key) {
    console.error("Chưa cấu hình Checksum Key ở admin/settings.html", secretErr);
    return new Response("Webhook not configured", { status: 500 });
  }

  const expectedSignature = await hmacSha256Hex(secret.payos_checksum_key, buildSignatureString(data));
  if (expectedSignature !== signature) {
    console.error("Chữ ký webhook không hợp lệ");
    return new Response("Invalid signature", { status: 401 });
  }

  // Chỉ xử lý giao dịch thành công
  if (body.success !== true && body.code !== "00") {
    return new Response(JSON.stringify({ received: true, skipped: true }), { status: 200 });
  }

  const description: string = data.description || "";
  const match = description.match(/([A-F0-9]{8})/i);
  if (!match) {
    console.error("Không tìm thấy mã đơn hàng trong nội dung:", description);
    return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });
  }
  const shortId = match[1].toLowerCase();

  const { data: orders, error: findErr } = await supabaseAdmin
    .from("orders")
    .select("id, payment_status")
    .ilike("id", `${shortId}%`)
    .limit(1);

  if (findErr || !orders?.length) {
    console.error("Không tìm thấy đơn hàng khớp mã:", shortId, findErr);
    return new Response(JSON.stringify({ received: true, matched: false }), { status: 200 });
  }

  const order = orders[0];
  if (order.payment_status !== "paid") {
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ payment_status: "paid" })
      .eq("id", order.id);

    if (updateErr) {
      console.error("Cập nhật trạng thái thất bại:", updateErr);
      return new Response("Update failed", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true, order_id: order.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
