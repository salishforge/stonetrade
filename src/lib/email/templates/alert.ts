interface AlertEmailInput {
  type: "PRICE_DROP" | "PRICE_SPIKE" | "BACK_IN_STOCK" | "META_SHIFT";
  cardName: string | null;
  cardNumber: string | null;
  changePct: string | null;
  marketMid: string | null;
  appBaseUrl: string;
  cardId: string | null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function headlineFor(input: AlertEmailInput): string {
  const card = input.cardName ?? "your watched card";
  switch (input.type) {
    case "PRICE_DROP":
      return `${card} dropped ${input.changePct}%`;
    case "PRICE_SPIKE":
      return `${card} spiked ${input.changePct}%`;
    case "BACK_IN_STOCK":
      return `${card} is back in stock`;
    case "META_SHIFT":
      return `${card} engine rating shifted`;
  }
}

export function renderAlertEmail(input: AlertEmailInput): { subject: string; html: string } {
  const headline = headlineFor(input);
  const subject = `StoneTrade — ${headline}`;
  const link = input.cardId
    ? `${input.appBaseUrl}/card/${input.cardId}`
    : input.appBaseUrl;

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px;">
  <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(headline)}</h1>
  ${input.marketMid ? `<p style="color:#555;">Current market mid: $${escapeHtml(input.marketMid)}</p>` : ""}
  <p style="margin-top:16px;"><a href="${escapeHtml(link)}" style="color:#2563eb;">View card</a></p>
  <p style="color:#888;font-size:12px;margin-top:32px;">You can manage your alerts in your StoneTrade dashboard.</p>
</body></html>`;

  return { subject, html };
}
