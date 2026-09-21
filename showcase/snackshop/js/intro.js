document.addEventListener("DOMContentLoaded", async () => {
  try {
    const { data, error } = await supabaseClient.from("site_settings").select("logo_url, logo_text, about_title, about_text, footer_description, contact_phone, contact_email, contact_address, facebook_url, tiktok_url").eq("id", 1).single();
    if (error || !data) return;

    document.querySelectorAll("[data-site-logo]").forEach((el) => {
      el.innerHTML = data.logo_url
        ? `<img class="site-logo-img" src="${escapeHtml(data.logo_url)}" alt="${escapeHtml(data.logo_text || "Logo")}">`
        : escapeHtml(data.logo_text || "Vặt Ơi");
    });
    const title = document.getElementById("intro-title");
    const content = document.getElementById("intro-content");
    if (title) title.textContent = data.about_title || "Giới thiệu";
    if (content) content.textContent = data.about_text || "Đồ ăn vặt ngon mỗi ngày, được chọn lọc kỹ từ hương vị đến chất lượng.";

    document.querySelector("[data-footer-name]")?.replaceChildren(document.createTextNode(data.logo_text || "Vặt Ơi"));
    const desc = document.querySelector("[data-footer-description]"); if (desc) desc.textContent = data.footer_description || "Đồ ăn vặt online — giao tận nơi.";
    const setText = (sel, value) => { const el=document.querySelector(sel); if(el){el.textContent=value||""; el.style.display=value?"":"none";} };
    setText("[data-footer-address]", data.contact_address);
    const phone=document.querySelector("[data-footer-phone]"); if(phone){phone.textContent=data.contact_phone||""; phone.href=data.contact_phone?`tel:${String(data.contact_phone).replace(/[^+\d]/g,"")}`:"#"; phone.parentElement.style.display=data.contact_phone?"":"none";}
    const email=document.querySelector("[data-footer-email]"); if(email){email.textContent=data.contact_email||""; email.href=data.contact_email?`mailto:${data.contact_email}`:"#"; email.parentElement.style.display=data.contact_email?"":"none";}
    const social=document.getElementById("footer-social-links");
    if(social){
      const facebookIcon=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M13.5 21v-8h2.7l.4-3h-3.1V8.1c0-.9.3-1.5 1.5-1.5h1.7V4a20 20 0 0 0-2.5-.2c-2.5 0-4.2 1.5-4.2 4.3V10H7.2v3H10v8h3.5Z"/></svg>`;
      const tiktokIcon=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M16.8 3c.3 1.9 1.4 3.4 3.2 4.1v3.2c-1.3 0-2.5-.4-3.5-1.1v5.5c0 4-2.6 6.3-6 6.3-3.1 0-5.5-2.2-5.5-5.3 0-3.2 2.5-5.5 5.8-5.5.3 0 .6 0 .9.1v3.2a3.8 3.8 0 0 0-.9-.1c-1.4 0-2.4.9-2.4 2.2 0 1.2.9 2.1 2.2 2.1 1.5 0 2.5-1 2.5-3V3h3.7Z"/></svg>`;
      social.innerHTML=`${data.facebook_url?`<a class="social-link" href="${escapeHtml(data.facebook_url)}" target="_blank" rel="noopener noreferrer" aria-label="Facebook">${facebookIcon}</a>`:""}${data.tiktok_url?`<a class="social-link" href="${escapeHtml(data.tiktok_url)}" target="_blank" rel="noopener noreferrer" aria-label="TikTok">${tiktokIcon}</a>`:""}`;
    }
  } catch(e) { console.error("Không tải được giới thiệu:", e); }
});
function escapeHtml(str){
  return (str || "").replace(/[&<>"']/g, function(c){
    if(c === "&") return "&amp;";
    if(c === "<") return "&lt;";
    if(c === ">") return "&gt;";
    if(c === "\"") return "&quot;";
    return "&#39;";
  });
}
