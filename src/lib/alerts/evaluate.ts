import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/resend";
import { renderAlertEmail } from "@/lib/email/templates/alert";

/** 24 hours between repeat fires for the same alert. */
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** META_SHIFT compares current PRI to a snapshot ≥ this many days ago. */
const META_SHIFT_LOOKBACK_DAYS = 7;
const META_SHIFT_LOOKBACK_MS = META_SHIFT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

/** Absolute PRI delta needed to fire a META_SHIFT alert. */
const META_SHIFT_PRI_DELTA = 10;

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
          engineMetrics: {
            select: { pri: true },
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
        case "META_SHIFT": {
          // Compares current PRI to the most recent snapshot taken ≥7d ago.
          // Fires when |current - past| ≥ META_SHIFT_PRI_DELTA. Cards without
          // engine metrics (no PRI) or without a 7+-day-old snapshot can't
          // fire — that's the right behavior; a card with no history hasn't
          // shifted by definition.
          const currentPri = card?.engineMetrics?.pri;
          if (currentPri == null) break;

          const lookbackBefore = new Date(now.getTime() - META_SHIFT_LOOKBACK_MS);
          const past = await prisma.cardEngineMetricsHistory.findFirst({
            where: { cardId: card!.id, capturedAt: { lte: lookbackBefore } },
            orderBy: { capturedAt: "desc" },
            select: { pri: true },
          });
          if (!past) break;

          const delta = currentPri - past.pri;
          if (Math.abs(delta) >= META_SHIFT_PRI_DELTA) {
            shouldFire = true;
            changePct = delta.toFixed(0); // integer PRI delta; reuse the field for the email
          }
          break;
        }
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
