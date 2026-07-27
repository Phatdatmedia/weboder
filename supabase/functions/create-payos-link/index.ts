// supabase/functions/create-payos-link/index.ts
// Deploy: npx supabase functions deploy create-payos-link
//
// Biến môi trường cần set tại Supabase Dashboard → Settings → Edge Functions:
//   PAYOS_CLIENT_ID      — lấy tại my.payos.vn
//   PAYOS_API_KEY        — lấy tại my.payos.vn
//   PAYOS_CHECKSUM_KEY   — lấy tại my.payos.vn

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tạo chữ ký HMAC-SHA256 theo chuẩn PayOS ──────────────────────────────
function createSignature(data: {
  amount: number;
  cancelUrl: string;
  description: string;
  orderCode: number;
  returnUrl: string;
}, checksumKey: string): string {
  // PayOS yêu cầu sort theo alphabet và nối bằng &
  const signData = [
    `amount=${data.amount}`,
    `cancelUrl=${data.cancelUrl}`,
    `description=${data.description}`,
    `orderCode=${data.orderCode}`,
    `returnUrl=${data.returnUrl}`,
  ].join("&");

  return createHmac("sha256", checksumKey)
    .update(signData)
    .digest("hex");
}

// ── Chuyển mã đơn chuỗi → số nguyên dương (PayOS yêu cầu số) ─────────────
// VD: "DH-250704-1234" → lấy phần số cuối + timestamp để đảm bảo unique
function orderCodeToNumber(code: string): number {
  // Lấy 4 số cuối của mã đơn + 6 chữ số timestamp ms cuối → unique
  const tail = code.replace(/\D/g, "").slice(-4);
  const ts   = Date.now().toString().slice(-6);
  return parseInt(ts + tail, 10);
}

serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const {
      orderCode,
      amount,
      description,
      returnUrl,
      cancelUrl,
      buyerName,
      buyerEmail,
      buyerPhone,
    } = await req.json();

    // Validate đầu vào
    if (!orderCode || !amount || !returnUrl || !cancelUrl) {
      return Response.json(
        { ok: false, error: "Thiếu tham số bắt buộc (orderCode, amount, returnUrl, cancelUrl)" },
        { status: 400, headers: CORS }
      );
    }

    const CLIENT_ID    = Deno.env.get("PAYOS_CLIENT_ID")    ?? "";
    const API_KEY      = Deno.env.get("PAYOS_API_KEY")      ?? "";
    const CHECKSUM_KEY = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";

    if (!CLIENT_ID || !API_KEY || !CHECKSUM_KEY) {
      return Response.json(
        { ok: false, error: "Chưa cấu hình PayOS credentials trên server" },
        { status: 500, headers: CORS }
      );
    }

    const numericOrderCode = orderCodeToNumber(orderCode);
    const safeDesc = (description || "Dat coc don hang").slice(0, 25); // PayOS giới hạn 25 ký tự

    const signature = createSignature(
      { amount, cancelUrl, description: safeDesc, orderCode: numericOrderCode, returnUrl },
      CHECKSUM_KEY
    );

    // ── Gọi PayOS API ──────────────────────────────────────────────────────
    const body: Record<string, unknown> = {
      orderCode: numericOrderCode,
      amount,
      description: safeDesc,
      returnUrl,
      cancelUrl,
      signature,
      // Thông tin người mua (tuỳ chọn, giúp PayOS điền sẵn)
      ...(buyerName  && { buyerName }),
      ...(buyerEmail && { buyerEmail }),
      ...(buyerPhone && { buyerPhone }),
      // Danh sách sản phẩm (PayOS yêu cầu ít nhất 1 item)
      items: [
        {
          name: safeDesc,
          quantity: 1,
          price: amount,
        },
      ],
    };

    const payosRes = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-client-id": CLIENT_ID,
        "x-api-key":   API_KEY,
      },
      body: JSON.stringify(body),
    });

    const payosData = await payosRes.json();

    // PayOS trả về: { code: "00", desc: "success", data: { checkoutUrl, paymentLinkId, ... } }
    if (payosData.code === "00" && payosData.data?.checkoutUrl) {
      return Response.json(
        {
          ok: true,
          checkoutUrl:   payosData.data.checkoutUrl,
          paymentLinkId: payosData.data.paymentLinkId,
          qrCode:        payosData.data.qrCode,        // QR string nếu cần
        },
        { headers: CORS }
      );
    } else {
      return Response.json(
        {
          ok: false,
          error: payosData.desc || payosData.message || "PayOS trả về lỗi không xác định",
          raw: payosData,
        },
        { status: 200, headers: CORS } // vẫn 200 để client xử lý graceful
      );
    }

  } catch (err) {
    return Response.json(
      { ok: false, error: String(err) },
      { status: 500, headers: CORS }
    );
  }
});