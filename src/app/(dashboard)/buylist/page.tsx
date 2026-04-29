import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { CardImage } from "@/components/cards/CardImage";

/**
 * Server action: toggle bounty / autoBuy / delete on a buylist entry.
 * Single action with a discriminator field so we don't need separate
 * routes/forms for each mutation.
 */
async function mutateEntry(formData: FormData) {
  "use server";

  const user = await requireUser();
  const entryId = formData.get("entryId");
  const op = formData.get("op");
  if (typeof entryId !== "string" || typeof op !== "string") return;

  const entry = await prisma.buylistEntry.findUnique({
    where: { id: entryId },
    include: { buylist: { select: { userId: true } } },
  });
  if (!entry || entry.buylist.userId !== user.id) return;

  if (op === "delete") {
    await prisma.buylistEntry.delete({ where: { id: entryId } });
  } else if (op === "toggle-bounty") {
    await prisma.buylistEntry.update({
      where: { id: entryId },
      data: {
        isBounty: !entry.isBounty,
        bountyPostedAt: !entry.isBounty ? new Date() : null,
        // Demoting from bounty also clears autoBuy — autoBuy is bounty-only.
        autoBuy: !entry.isBounty ? entry.autoBuy : false,
      },
    });
  } else if (op === "toggle-auto") {
    if (!entry.isBounty) return; // autoBuy only meaningful on bounties
    await prisma.buylistEntry.update({
      where: { id: entryId },
      data: { autoBuy: !entry.autoBuy },
    });
  }

  revalidatePath("/buylist");
  revalidatePath("/");
}

export default async function BuylistPage() {
  const user = await requireUser();

  const entries = await prisma.buylistEntry.findMany({
    where: { buylist: { userId: user.id } },
    orderBy: [{ isBounty: "desc" }, { bountyPostedAt: "desc" }, { card: { name: "asc" } }],
    include: {
      card: {
        select: {
          id: true, name: true, cardNumber: true, orbital: true, rarity: true, imageUrl: true,
          marketValue: { select: { marketMid: true } },
        },
      },
      buylist: { select: { name: true } },
    },
  });

  const bounties = entries.filter((e) => e.isBounty);
  const wants = entries.filter((e) => !e.isBounty);

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <header className="border-b border-border/40 pb-5 mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted mb-1">Dashboard · Want list</p>
          <h1
            className="font-display text-[36px] leading-[1.05] tracking-[-0.012em] text-ink-primary"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            Buylist & bounties
          </h1>
        </div>
        <p className="font-mono text-[12px] tabular-nums text-ink-secondary">
          <span className="text-gold text-[16px]">{bounties.length}</span>
          <span className="ml-1 uppercase tracking-[0.1em] text-[10px] text-ink-muted">bounties</span>
          <span className="mx-2 text-ink-muted">·</span>
          <span className="text-ink-primary text-[16px]">{wants.length}</span>
          <span className="ml-1 uppercase tracking-[0.1em] text-[10px] text-ink-muted">wants</span>
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-muted py-16 text-center">
          You haven&apos;t added any cards yet — open any card&apos;s page and use &ldquo;Want this card?&rdquo;
        </p>
      ) : (
        <div className="space-y-10">
          {bounties.length > 0 && (
            <Section title="Bounties" subtitle="public — appears on the home page" tone="gold">
              {bounties.map((e) => <EntryRow key={e.id} entry={e} mutateAction={mutateEntry} />)}
            </Section>
          )}
          {wants.length > 0 && (
            <Section title="Want list" subtitle="private — for your reference">
              {wants.map((e) => <EntryRow key={e.id} entry={e} mutateAction={mutateEntry} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  tone,
  children,
}: {
  title: string;
  subtitle: string;
  tone?: "gold";
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className={`font-display text-[20px] tracking-tight ${tone === "gold" ? "text-gold-light" : "text-ink-primary"}`}
          style={{ fontVariationSettings: "'opsz' 36" }}
        >
          {title}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">{subtitle}</span>
      </div>
      <div className={`border ${tone === "gold" ? "border-gold-dark/40" : "border-border/40"} rounded-md overflow-hidden`}>
        {children}
      </div>
    </section>
  );
}

interface EntryRowProps {
  entry: {
    id: string;
    maxPrice: unknown;
    condition: string;
    treatment: string;
    isBounty: boolean;
    autoBuy: boolean;
    card: {
      id: string;
      name: string;
      cardNumber: string;
      orbital: string | null;
      rarity: string;
      imageUrl: string | null;
      marketValue: { marketMid: unknown } | null;
    };
  };
  mutateAction: (formData: FormData) => Promise<void>;
}

function EntryRow({ entry, mutateAction }: EntryRowProps) {
  const max = Number(entry.maxPrice);
  const market = entry.card.marketValue?.marketMid != null ? Number(entry.card.marketValue.marketMid) : null;
  const delta = market != null ? ((max - market) / market) * 100 : null;
  const aboveMarket = delta != null && delta > 5;

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 border-b border-border/40 last:border-b-0 items-center hover:bg-surface-raised/40 transition-colors">
      <Link href={`/card/${entry.card.id}`}>
        <CardImage
          name={entry.card.name}
          imageUrl={entry.card.imageUrl}
          orbital={entry.card.orbital}
          rarity={entry.card.rarity}
          className="w-12"
        />
      </Link>
      <div className="min-w-0">
        <Link href={`/card/${entry.card.id}`} className="text-[14px] text-ink-primary hover:text-gold-light transition-colors truncate block">
          {entry.card.name}
        </Link>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-muted">
          {entry.card.cardNumber} · {entry.treatment} · {entry.condition.toLowerCase().replace("_", " ")}
        </p>
        {entry.autoBuy && (
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-gold-light mt-0.5">⚡ auto-buy on match</p>
        )}
      </div>
      <div className="text-right">
        <p className="font-mono text-[14px] tabular-nums text-ink-primary">
          ${max.toFixed(2)}
        </p>
        {market != null && (
          <p className={`font-mono text-[10px] tabular-nums ${aboveMarket ? "text-crimson-light" : "text-ink-muted"}`}>
            mkt ${market.toFixed(2)}
            {delta != null && <> · {delta > 0 ? "+" : ""}{delta.toFixed(0)}%</>}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <form action={mutateAction}>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="op" value="toggle-bounty" />
          <button
            type="submit"
            className={`px-2 py-1 rounded text-[9px] uppercase tracking-[0.1em] border transition-colors ${
              entry.isBounty
                ? "border-gold/60 bg-gold-dark/30 text-gold-light hover:bg-gold-dark/50"
                : "border-border/60 text-ink-secondary hover:border-gold/40 hover:text-gold-light"
            }`}
          >
            {entry.isBounty ? "Unlist bounty" : "Make bounty"}
          </button>
        </form>
        {entry.isBounty && (
          <form action={mutateAction}>
            <input type="hidden" name="entryId" value={entry.id} />
            <input type="hidden" name="op" value="toggle-auto" />
            <button
              type="submit"
              className={`w-full px-2 py-1 rounded text-[9px] uppercase tracking-[0.1em] border transition-colors ${
                entry.autoBuy
                  ? "border-gold/60 text-gold-light hover:bg-gold-dark/30"
                  : "border-border/60 text-ink-muted hover:border-gold/40 hover:text-gold-light"
              }`}
            >
              {entry.autoBuy ? "Auto: on" : "Auto: off"}
            </button>
          </form>
        )}
        <form action={mutateAction}>
          <input type="hidden" name="entryId" value={entry.id} />
          <input type="hidden" name="op" value="delete" />
          <button
            type="submit"
            className="w-full px-2 py-1 rounded text-[9px] uppercase tracking-[0.1em] border border-border/40 text-ink-muted hover:border-crimson/60 hover:text-crimson-light transition-colors"
          >
            Remove
          </button>
        </form>
      </div>
    </div>
  );
}
