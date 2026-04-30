interface OrderConfirmationInput {
  orderId: string;
  cardName: string;
  treatment: string;
  condition: string;
  quantity: number;
  subtotal: string;
  shipping: string;
  total: string;
  shippingAddress: { name?: string; line1?: string; line2?: string; city?: string; region?: string; postalCode?: string; country?: string } | null;
  appBaseUrl: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderAddress(addr: OrderConfirmationInput["shippingAddress"]): string {
  if (!addr) return "(no shipping address on file)";
  const parts = [addr.name, addr.line1, addr.line2, [addr.city, addr.region, addr.postalCode].filter(Boolean).join(", "), addr.country]
    .filter(Boolean)
    .map((p) => escapeHtml(String(p)));
  return parts.join("<br>");
}

export function renderOrderConfirmationHtml(input: OrderConfirmationInput): { subject: string; html: string } {
  const subject = `Your StoneTrade order is confirmed — ${input.cardName}`;
  const orderUrl = `${input.appBaseUrl}/orders/${input.orderId}`;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">Order confirmed</h1>
  <p>Thanks for your purchase. The seller has been notified and will ship soon.</p>

  <h2 style="font-size:16px;margin-top:24px;">${escapeHtml(input.cardName)}</h2>
  <p style="color:#555;margin:4px 0;">${escapeHtml(input.treatment)} • ${escapeHtml(input.condition)} • Qty ${input.quantity}</p>

  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <tr><td style="padding:4px 0;">Subtotal</td><td style="text-align:right;">$${escapeHtml(input.subtotal)}</td></tr>
    <tr><td style="padding:4px 0;">Shipping</td><td style="text-align:right;">$${escapeHtml(input.shipping)}</td></tr>
    <tr><td style="padding:4px 0;border-top:1px solid #ddd;font-weight:600;">Total</td><td style="text-align:right;border-top:1px solid #ddd;font-weight:600;">$${escapeHtml(input.total)}</td></tr>
  </table>

  <h3 style="font-size:14px;margin-top:24px;">Shipping to</h3>
  <p style="color:#555;line-height:1.5;">${renderAddress(input.shippingAddress)}</p>

  <p style="margin-top:24px;"><a href="${escapeHtml(orderUrl)}" style="color:#2563eb;">View order</a></p>
  <p style="color:#888;font-size:12px;margin-top:32px;">Order #${escapeHtml(input.orderId)}</p>
</body></html>`;

  return { subject, html };
}
