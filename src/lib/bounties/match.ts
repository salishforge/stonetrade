import { prisma } from "@/lib/prisma";

/**
 * Bounty matching — runs when a Listing is created or a CollectionCard is
 * added. Finds bounties (BuylistEntry rows with isBounty=true) that match
 * the card identity + condition + price, and emits notifications to the
 * bounty owner.
 *
 * Today this is a stub: it creates UserAlert rows of type BACK_IN_STOCK so
 * the bounty owner sees the activity in their alert feed, and console-logs
 * "would auto-buy" when the bounty has autoBuy=true. The real auto-buy
 * path — creating an Order on behalf of the bounty owner, charging their
 * saved payment method, redirecting Stripe — is real-money plumbing and
 * out of scope here.
 *
 * All matchers are best-effort: failures log but never throw. The user's
 * primary action (publishing a listing, adding to a collection) must not
 * fail because a bounty notification went sideways.
 */

// Condition severity — higher number means better-condition card. A bounty
// asking for NEAR_MINT is satisfied by NEAR_MINT or MINT but not by LIGHTLY_PLAYED.
const CONDITION_RANK: Record<string, number> = {
  MINT: 5,
  NEAR_MINT: 4,
  LIGHTLY_PLAYED: 3,
  MODERATELY_PLAYED: 2,
  HEAVILY_PLAYED: 1,
  DAMAGED: 0,
};

export interface MatchedBounty {
  bountyId: string;
  ownerId: string;
  autoBuy: boolean;
}

/**
 * Find bounties matching a freshly-created Listing.
 * Match conditions: same cardId + same treatment + listing.condition rank
 * >= bounty's rank + listing.price <= bounty.maxPrice.
 */
export async function matchAgainstNewListing(opts: {
  listingId: string;
  cardId: string | null;
  treatment: string | null;
  condition: string | null;
  price: number; // dollars (Decimal converted upstream)
  sellerId: string;
}): Promise<MatchedBounty[]> {
  if (!opts.cardId || !opts.treatment || !opts.condition) return [];

  try {
    const bounties = await prisma.buylistEntry.findMany({
      where: {
        cardId: opts.cardId,
        isBounty: true,
        treatment: opts.treatment,
        maxPrice: { gte: opts.price },
      },
      include: { buylist: { select: { userId: true } } },
    });

    const listingRank = CONDITION_RANK[opts.condition] ?? 0;
    const matched: MatchedBounty[] = [];

    for (const b of bounties) {
      const requiredRank = CONDITION_RANK[b.condition] ?? 0;
      if (listingRank < requiredRank) continue; // listing condition is too low
      if (b.buylist.userId === opts.sellerId) continue; // seller has a bounty on their own listing — skip

      matched.push({
        bountyId: b.id,
        ownerId: b.buylist.userId,
        autoBuy: b.autoBuy,
      });

      // Notify the bounty owner via the existing alert feed. BACK_IN_STOCK
      // is the closest existing AlertType — reuse it rather than introducing
      // a new BOUNTY_HIT type for this stub.
      await prisma.userAlert.create({
        data: {
          userId: b.buylist.userId,
          type: "BACK_IN_STOCK",
          cardId: opts.cardId,
          lastFiredAt: new Date(),
        },
      }).catch((err) => console.error("bounty alert create failed:", err));

      if (b.autoBuy) {
        // TODO(auto-buy): create an Order on behalf of b.buylist.userId at
        // the listing price, redirect Stripe checkout, etc. Real money flow,
        // not a stub thing.
        console.info(
          `bounty auto-buy WOULD FIRE: bounty=${b.id} owner=${b.buylist.userId} listing=${opts.listingId} price=$${opts.price.toFixed(2)} max=$${Number(b.maxPrice).toFixed(2)}`,
        );
      }
    }

    return matched;
  } catch (err) {
    console.error("matchAgainstNewListing failed:", err);
    return [];
  }
}

/**
 * Find bounties matching a CollectionCard add. The collector might be willing
 * to sell their copy at the bounty's price — we notify the bounty owner so
 * they can reach out, but we never auto-buy from a collection (it's not a
 * listing, the collector hasn't agreed to sell).
 *
 * The autoBuy flag is intentionally ignored on this path. We only fire alerts.
 */
export async function matchAgainstCollectionAdd(opts: {
  cardId: string;
  treatment: string;
  condition: string;
  collectorId: string;
}): Promise<MatchedBounty[]> {
  try {
    const bounties = await prisma.buylistEntry.findMany({
      where: { cardId: opts.cardId, isBounty: true, treatment: opts.treatment },
      include: { buylist: { select: { userId: true } } },
    });

    const collectionRank = CONDITION_RANK[opts.condition] ?? 0;
    const matched: MatchedBounty[] = [];

    for (const b of bounties) {
      const requiredRank = CONDITION_RANK[b.condition] ?? 0;
      if (collectionRank < requiredRank) continue;
      if (b.buylist.userId === opts.collectorId) continue; // own collection

      matched.push({
        bountyId: b.id,
        ownerId: b.buylist.userId,
        autoBuy: false,
      });

      await prisma.userAlert.create({
        data: {
          userId: b.buylist.userId,
          type: "BACK_IN_STOCK",
          cardId: opts.cardId,
          lastFiredAt: new Date(),
        },
      }).catch((err) => console.error("bounty (collection) alert create failed:", err));
    }

    return matched;
  } catch (err) {
    console.error("matchAgainstCollectionAdd failed:", err);
    return [];
  }
}
