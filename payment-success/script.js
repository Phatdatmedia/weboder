/* ====================================================================
   Gắn sự kiện Purchase cho Facebook Pixel / TikTok Pixel (nếu admin đã
   cấu hình ID ở tab Marketing). Nếu URL có orderCode (PayOS trả về), sẽ
   tra cứu Supabase để lấy đúng số tiền cho sự kiện; nếu không có, vẫn
   bắn sự kiện Purchase nhưng không kèm giá trị.
==================================================================== */
const sb = supabase.createClient(
  "https://npsylbxggliczhtnzzgl.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wc3lsYnhnZ2xpY3podG56emdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTg0NTcsImV4cCI6MjA5ODQ3NDQ1N30.sSe3zD5A2EjOnwTmGLAifzPGOn0xQwMSYTqXbAKZrig"
);

(async function trackPurchase(){
  try{
    // Nếu web đang bảo trì -> bỏ qua theo dõi pixel (không gọi thêm dữ liệu),
    // nhưng vẫn giữ nguyên màn hình xác nhận thanh toán cho khách (vì khách
    // vừa trả tiền thật, không nên chặn xác nhận này).
    const { data: mtData } = await sb.from('site_config').select('value').eq('key', 'maintenance_mode').single().catch(() => ({ data: null }));
    if(mtData?.value?.enabled) return;

    const { data, error } = await sb.from('site_config').select('value').eq('key', 'marketing_config').single();
    if(error || !data?.value) return;
    const cfg = data.value;

    let amount = null;
    const params = new URLSearchParams(window.location.search);
    const orderCode = params.get('orderCode') || params.get('orderId') || params.get('code');
    if(orderCode){
      try{
        const { data: order } = await sb.from('orders').select('amount').eq('order_code', orderCode).single();
        if(order?.amount) amount = Number(order.amount);
      } catch(e){ /* không tìm thấy đơn cũng không sao */ }
    }

    if(cfg.fbPixelId){
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
      n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
      document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', cfg.fbPixelId);
      fbq('track', 'Purchase', amount ? { value: amount, currency: 'VND' } : {});
    }

    if(cfg.ttPixelId){
      !function (w, d, t) {
        w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var s=d.createElement("script");s.type="text/javascript",s.async=!0,s.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(s,a)};
        ttq.load(cfg.ttPixelId);
        ttq.page();
      }(window, document, 'ttq');
      ttq.track('CompletePayment', amount ? { value: amount, currency: 'VND' } : {});
    }
  } catch(e){ console.warn('Pixel purchase tracking lỗi:', e.message); }
})();
