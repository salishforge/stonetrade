import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/**
 * Server action: delete an alert. Owned check: the alert.userId must match
 * the requireUser() id; same guard the [id] DELETE API enforces.
 */
async function deleteAlert(formData: FormData) {
  "use server";

  const user = await requireUser();
  const alertId = formData.get("alertId");
  if (typeof alertId !== "string") return;

  const alert = await prisma.userAlert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== user.id) return;

  await prisma.userAlert.delete({ where: { id: alertId } });
  revalidatePath("/alerts");
}

/**
 * Server action: toggle active flag on an alert. Inactive alerts are kept in
 * place so re-enabling preserves the lastFiredAt cooldown timer.
 */
async function toggleActive(formData: FormData) {
  "use server";

  const user = await requireUser();
  const alertId = formData.get("alertId");
  if (typeof alertId !== "string") return;

  const alert = await prisma.userAlert.findUnique({ where: { id: alertId } });
  if (!alert || alert.userId !== user.id) return;

  await prisma.userAlert.update({
    where: { id: alertId },
    data: { active: !alert.active },
  });
  revalidatePath("/alerts");
}

const TYPE_LABEL = {
  PRICE_DROP: "Price drop",
  PRICE_SPIKE: "Price spike",
  BACK_IN_STOCK: "Back in stock",
  META_SHIFT: "Meta shift",
} as const;

const TYPE_HINT = {
  PRICE_DROP: "Fires when 7d trend ≤ -threshold",
  PRICE_SPIKE: "Fires when 7d trend ≥ +threshold",
  BACK_IN_STOCK: "Fires when any seller lists this card",
  META_SHIFT: "Fires when PRI moves ≥10 within 7d",
} as const;

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const ms = Date.now() - date.getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function firedWithin(date: Date | null, ms: number): boolean {
  if (!date) return false;
  return Date.now() - date.getTime() < ms;
}

export default async function AlertsPage() {
  const user = await requireUser();

  const alerts = await prisma.userAlert.findMany({
    where: { userId: user.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          treatment: true,
          set: { select: { code: true } },
        },
      },
    },
  });

  const activeCount = alerts.filter((a) => a.active).length;
  const firedRecentlyCount = alerts.filter((a) => firedWithin(a.lastFiredAt, 7 * 86_400_000)).length;

  return (
    <div>
      <header className="mb-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted mb-2">
          Dashboard
        </p>
        <h1
          className="font-display text-[36px] leading-[1.05] tracking-[-0.012em] text-ink-primary"
          style={{ fontVariationSettings: "'opsz' 96" }}
        >
          Alerts
        </h1>
        <p className="mt-2 text-[13px] text-ink-secondary leading-relaxed max-w-prose">
          Quiet, scoped notifications. We watch your cards for price moves,
          new listings, and meta shifts — and email you once per day when
          something crosses the threshold you set.
        </p>

        <dl className="mt-6 flex gap-10 font-mono text-[12px] tabular-nums">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">Active</dt>
            <dd className="text-[22px] text-ink-primary leading-none mt-1">{activeCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">Fired (7d)</dt>
            <dd className="text-[22px] text-ink-primary leading-none mt-1">{firedRecentlyCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.12em] text-ink-muted">Total</dt>
            <dd className="text-[22px] text-ink-secondary leading-none mt-1">{alerts.length}</dd>
          </div>
        </dl>
      </header>

      {alerts.length === 0 ? (
        <div className="border-l-2 border-gold-dark/40 pl-5 py-2 max-w-prose">
          <p className="text-[14px] text-ink-secondary leading-relaxed">
            You haven&rsquo;t set any alerts yet.
          </p>
          <p className="text-[13px] text-ink-muted leading-relaxed mt-2">
            Open any card and toggle <span className="font-mono text-[12px] text-gold-light">Watch this card</span>{" "}
            in the right rail. The four switches there create the alerts that show up here.
          </p>
          <Link
            href="/browse"
            className="inline-block mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-gold hover:text-gold-light transition-colors"
          >
            Browse cards →
          </Link>
        </div>
      ) : (
        <div className="border border-border/40 rounded-md overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_auto_auto_auto] gap-6 px-5 py-2.5 bg-surface-raised/60 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
            <span>Card · Type</span>
            <span>Threshold</span>
            <span className="text-right">Last fired</span>
            <span className="text-right">Status</span>
            <span></span>
          </div>

          {alerts.map((a) => {
            const cardLabel = a.card
              ? `${a.card.name}${a.card.treatment ? ` · ${a.card.treatment}` : ""}`
              : "Account-wide";
            const cardSubtitle = a.card
              ? `${a.card.set.code} · ${a.card.cardNumber}`
              : "all cards";

            return (
              <div
                key={a.id}
                className="grid grid-cols-[2fr_1fr_auto_auto_auto] gap-6 px-5 py-3 border-t border-border/40 items-baseline"
              >
                <div className="min-w-0">
                  {a.card ? (
                    <Link
                      href={`/card/${a.card.id}`}
                      className="text-[13px] text-ink-primary hover:text-gold-light transition-colors truncate block"
                    >
                      {cardLabel}
                    </Link>
                  ) : (
                    <span className="text-[13px] text-ink-secondary">{cardLabel}</span>
                  )}
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted mt-0.5">
                    {TYPE_LABEL[a.type]} · {cardSubtitle}
                  </p>
                  <p className="text-[11px] text-ink-muted mt-1">{TYPE_HINT[a.type]}</p>
                </div>

                <span className="font-mono text-[12px] tabular-nums text-ink-secondary">
                  {a.thresholdPct != null ? `±${Number(a.thresholdPct).toFixed(0)}%` : "—"}
                </span>

                <span className="font-mono text-[11px] tabular-nums text-ink-muted text-right whitespace-nowrap">
                  {relativeTime(a.lastFiredAt)}
                </span>

                <form action={toggleActive}>
                  <input type="hidden" name="alertId" value={a.id} />
                  <button
                    type="submit"
                    className={`font-mono text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded border transition-colors ${
                      a.active
                        ? "border-gold/60 bg-gold-dark/20 text-gold-light hover:bg-gold-dark/40"
                        : "border-border/50 text-ink-muted hover:text-ink-secondary hover:border-border"
                    }`}
                  >
                    {a.active ? "on" : "off"}
                  </button>
                </form>

                <form action={deleteAlert}>
                  <input type="hidden" name="alertId" value={a.id} />
                  <button
                    type="submit"
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted hover:text-crimson-light transition-colors"
                    aria-label="Delete alert"
                  >
                    remove
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
