document.addEventListener("DOMContentLoaded", async () => {
  renderCheckoutSummary();
  applyPayosAvailability();

  // Nếu đã đăng nhập, điền sẵn thông tin
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (user) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (profile) {
      document.getElementById("f-name").value = profile.full_name || "";
      document.getElementById("f-phone").value = profile.phone || "";
      document.getElementById("f-address").value = profile.address || "";
    }
  }

  document.getElementById("checkout-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const cart = getCart();
    const alertBox = document.getElementById("checkout-alert");

    if (!cart.length) {
      showAlert(alertBox, "Giỏ hàng đang trống.", "error");
      return;
    }

    const name = document.getElementById("f-name").value.trim();
    const phone = document.getElementById("f-phone").value.trim();
    const address = document.getElementById("f-address").value.trim();
    const note = document.getElementById("f-note").value.trim();
    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || "cod";

    if (!name || !phone || !address) {
      showAlert(alertBox, "Vui lòng điền đầy đủ họ tên, số điện thoại và địa chỉ.", "error");
      return;
    }

    const submitBtn = document.getElementById("submit-order");
    submitBtn.disabled = true;
    submitBtn.textContent = "Đang xử lý...";

    const { data: orderId, error: orderErr } = await supabaseClient.rpc("create_order", {
      p_guest_name: name,
      p_guest_phone: phone,
      p_guest_address: address,
      p_note: note,
      p_items: cart.map((i) => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.quantity })),
      p_payment_method: paymentMethod,
    });

    if (orderErr || !orderId) {
      showAlert(alertBox, "Không thể tạo đơn hàng. Vui lòng thử lại.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Đặt hàng";
      console.error(orderErr);
      return;
    }

    localStorage.removeItem("snack_cart");

    if (paymentMethod === "bank_transfer") {
      window.location.href = `payment-qr.html?id=${orderId}&phone=${encodeURIComponent(phone)}`;
    } else {
      window.location.href = `order-success.html?id=${orderId}&phone=${encodeURIComponent(phone)}`;
    }
  });
});

function renderCheckoutSummary() {
  const cart = getCart();
  const wrap = document.getElementById("checkout-items");
  if (!cart.length) {
    wrap.innerHTML = `<p class="empty-state">Giỏ hàng trống. <a href="index.html">Quay lại mua sắm</a></p>`;
    document.getElementById("submit-order").disabled = true;
    return;
  }
  wrap.innerHTML = cart
    .map(
      (i) => `
    <div class="cart-item">
      <img src="${i.image_url || 'https://placehold.co/120/f4e9d4/3a2a1a?text=Snack'}" alt="${i.name}">
      <div class="cart-item-info">
        <div>${i.name}</div>
        <div>${i.quantity} × ${formatVND(i.price)}</div>
      </div>
    </div>`
    )
    .join("");
  document.getElementById("checkout-total").textContent = formatVND(cartTotal());
}

// Bật/tắt lựa chọn PayOS theo cấu hình admin (mục Cấu hình → PayOS & Webhook)
async function applyPayosAvailability() {
  const settings = await getSiteSettings();
  const payosInput = document.querySelector('input[name="payment_method"][value="payos"]');
  if (!payosInput) return;
  const label = payosInput.closest(".payment-option");

  if (settings.payos_enabled) {
    payosInput.disabled = false;
    label?.classList.remove("payment-option-disabled");
    const span = label?.querySelector("span");
    if (span) span.textContent = "💳 Thanh toán online (PayOS)";
  } else {
    payosInput.disabled = true;
    label?.classList.add("payment-option-disabled");
  }
}

function showAlert(el, msg, type) {
  el.textContent = msg;
  el.className = `alert show alert-${type}`;
}
