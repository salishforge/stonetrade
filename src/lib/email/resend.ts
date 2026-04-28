import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) {
    _resend = new Resend(key);
  }
  return _resend;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send a transactional email via Resend. No-op (returns null) when
 * RESEND_API_KEY is not configured — callers treat this as expected dev
 * behavior, not an error. The boundary "do we have a real provider"
 * is checked once here, not duplicated across callers.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string } | null> {
  const client = getResend();
  if (!client) return null;

  const from = process.env.RESEND_FROM_ADDRESS ?? "StoneTrade <noreply@stonetrade.app>";
  const result = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  });

  if (result.error) {
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
  return result.data ? { id: result.data.id } : null;
}
