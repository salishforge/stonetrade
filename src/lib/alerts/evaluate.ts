import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/resend";
import { renderAlertEmail } from "@/lib/email/templates/alert";

/** 24 hours between repeat fires for the same alert. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

interface EvaluateResult {
  scanned: number;
  fired: number;
  errors: number;
}

/**
 * Walk active UserAlert rows and fire those whose conditions are met. Each
 * alert respects a 24h cooldown via lastFiredAt to avoid spam. Email
 * delivery uses the same gated sendEmail wrapper as orders — no-op in dev
 * when RESEND_API_KEY is unset; the lastFiredAt update still happens so
 * the cooldown logic reads correctly.
 *
 * META_SHIFT is intentionally not yet implemented — it requires PRI history
 * snapshots that the schema does not yet store. Returning early on that
 * type is honest about the gap.
 */
export async function evaluateAlerts(opts: { now?: Date } = {}): Promise<EvaluateResult> {
  const now = opts.now ?? new Date();
  const cooldownCutoff = new Date(now.getTime() - ALERT_COOLDOWN_MS);

  const alerts = await prisma.userAlert.findMany({
    where: { active: true },
    include: {
      user: { select: { id: true, email: true } },
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          marketValue: {
            select: { trend7d: true, totalAvailable: true, marketMid: true },
          },
        },
      },
    },
  });

  let fired = 0;
  let errors = 0;
  for (const alert of alerts) {
    try {
      // Cooldown guard: don't refire within 24h of last fire.
      if (alert.lastFiredAt && alert.lastFiredAt > cooldownCutoff) continue;

      const card = alert.card;
      const market = card?.marketValue;

      let shouldFire = false;
      let changePct: string | null = null;

      switch (alert.type) {
        case "PRICE_DROP": {
          if (!market || market.trend7d == null || alert.thresholdPct == null) break;
          const trend = Number(market.trend7d);
          const threshold = Number(alert.thresholdPct);
          if (trend <= -threshold) {
            shouldFire = true;
            changePct = trend.toFixed(2);
          }
          break;
        }
        case "PRICE_SPIKE": {
          if (!market || market.trend7d == null || alert.thresholdPct == null) break;
          const trend = Number(market.trend7d);
          const threshold = Number(alert.thresholdPct);
          if (trend >= threshold) {
            shouldFire = true;
            changePct = trend.toFixed(2);
          }
          break;
        }
        case "BACK_IN_STOCK": {
          // Fires when the card has stock right now. Without a snapshot of
          // prior availability, the cooldown is the only thing preventing
          // repeated fires while stock stays positive — which is acceptable
          // for v1: the user wanted to know it's available; one notification
          // every 24h while it remains available is reasonable.
          if (market && market.totalAvailable > 0) {
            shouldFire = true;
          }
          break;
        }
        case "META_SHIFT":
          // Not yet implemented — needs PRI history snapshots.
          continue;
      }

      if (!shouldFire) continue;

      await prisma.userAlert.update({
        where: { id: alert.id },
        data: { lastFiredAt: now },
      });

      const { subject, html } = renderAlertEmail({
        type: alert.type,
        cardName: card?.name ?? null,
        cardNumber: card?.cardNumber ?? null,
        changePct,
        marketMid: market?.marketMid?.toString() ?? null,
        appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        cardId: card?.id ?? null,
      });
      await sendEmail({ to: alert.user.email, subject, html });

      fired++;
    } catch (err) {
      console.error("Alert evaluation failed for", alert.id, err);
      errors++;
    }
  }

  return { scanned: alerts.length, fired, errors };
}
