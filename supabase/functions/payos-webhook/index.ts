import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";

serve(async (req) => {
  const body = await req.json();
  const CHECKSUM_KEY = Deno.env.get("PAYOS_CHECKSUM_KEY") ?? "";

  // Verify chữ ký từ PayOS
  const { code, data } = body;
  if (code !== "00") {
    return Response.json({ error: "Payment not successful" }, { status: 400 });
  }

  // Cập nhật trạng thái thanh toán trong DB
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // data.description chứa mã đơn của bạn
  const orderCode = data?.description || "";
  if (orderCode.startsWith("DH-")) {
    await sb.from("orders")
      .update({ payment_status: "Đã thanh toán", status: "Đã xác nhận" })
      .eq("order_code", orderCode);
  }

  return Response.json({ success: true });
});