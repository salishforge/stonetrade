import { Novu } from "@novu/api";

/**
 * Notification wrapper around Novu (https://novu.co). Single call site so
 * future migrations away from Novu (or in parallel: Resend, in-app feed,
 * SMS, push) all swap out behind this interface rather than touching every
 * caller.
 *
 * Behavior:
 *   - When NOVU_API_KEY is unset, all triggers no-op silently. The dev
 *     server runs without Novu credentials configured; tests don't need it.
 *     Existing sendEmail() and UserAlert.create() callers stay in parallel
 *     during migration.
 *   - Trigger failures are caught and logged. A notification outage MUST
 *     NOT roll back the user's primary action (paying for an order, etc.).
 *     Same contract as `sendEmail()` in src/lib/email/resend.ts.
 *   - Subscribers are auto-created by Novu on first trigger. We pass the
 *     stonetrade User.id as subscriberId so it stays stable across renames.
 *
 * Workflow IDs ("triggerIdentifier" in Novu UI) are defined in the Novu
 * dashboard and referenced here by string. P1 supports just "order-paid".
 *
 * To activate: see docs/novu-setup.md.
 */

let _client: Novu | null = null;

function getClient(): Novu | null {
  const key = process.env.NOVU_API_KEY;
  if (!key) return null;
  if (!_client) {
    _client = new Novu({ secretKey: key });
  }
  return _client;
}

export interface NotifySubscriber {
  /** Stonetrade User.id — used as Novu's stable subscriberId. */
  id: string;
  email?: string | null;
  username?: string | null;
}

export interface TriggerNotificationInput {
  /** Workflow identifier as configured in the Novu dashboard. */
  workflowId: string;
  to: NotifySubscriber | NotifySubscriber[];
  /** Free-form data made available to workflow templates. */
  payload?: Record<string, unknown>;
  /**
   * Optional idempotency key. When the same key is reused inside Novu's
   * retention window, the trigger is silently ignored — useful for retried
   * webhooks. Stripe payment_intent ids are good keys for order-paid.
   */
  transactionId?: string;
}

function toRecipient(s: NotifySubscriber) {
  return {
    subscriberId: s.id,
    email: s.email ?? undefined,
    firstName: s.username ?? undefined,
  };
}

/**
 * Fire-and-forget trigger. Returns true if the trigger reached Novu (or was
 * a no-op because credentials aren't set), false if Novu returned an error.
 * Callers should not block on the result; logging is handled here.
 */
export async function triggerNotification(input: TriggerNotificationInput): Promise<boolean> {
  const client = getClient();
  if (!client) return true; // no credentials, treat as success no-op

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  if (recipients.length === 0) return true;

  try {
    await client.trigger(
      {
        workflowId: input.workflowId,
        to: recipients.map(toRecipient),
        payload: input.payload ?? {},
      },
      input.transactionId,
    );
    return true;
  } catch (err) {
    console.error(`Novu trigger failed [${input.workflowId}]:`, err);
    return false;
  }
}
