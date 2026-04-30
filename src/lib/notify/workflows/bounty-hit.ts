import { workflow } from "@novu/framework";
import { z } from "zod/v4";

/**
 * Bounty owner notification when a matching listing or collection-add
 * appears. Fires from `src/lib/bounties/match.ts`. The `source` discriminator
 * is "listing" (a public listing matched the bounty — actionable: buy it) or
 * "collection" (a collector added the card to their collection — actionable:
 * reach out, since the collector hasn't agreed to sell).
 */
export const bountyHitWorkflow = workflow(
  "bounty-hit",
  async ({ step, payload }) => {
    await step.inApp("bounty-feed", async () => ({
      subject: `Bounty hit: ${payload.cardName}`,
      body:
        payload.source === "listing"
          ? payload.autoBuy
            ? `Auto-buy WOULD fire — listing $${payload.listingPrice} (max $${payload.maxPrice}).`
            : `New listing at $${payload.listingPrice} (your max $${payload.maxPrice}).`
          : `Collector has it (max $${payload.maxPrice}). They haven't listed — reach out via your bounty.`,
      data: { url: payload.listingUrl ?? payload.bountyUrl ?? "" },
    }));

    await step.email("bounty-email", async () => ({
      subject:
        payload.source === "listing"
          ? `Bounty match: ${payload.cardName} listed`
          : `Someone has ${payload.cardName} in their collection`,
      body:
        payload.source === "listing"
          ? [
              `<p>A listing matched your bounty for <strong>${payload.cardName}</strong>.</p>`,
              `<p>Price: $${payload.listingPrice} · Your max: $${payload.maxPrice}</p>`,
              `<p>${payload.treatment} · ${payload.condition}</p>`,
              payload.listingUrl ? `<p><a href="${payload.listingUrl}">View listing</a></p>` : "",
            ].join("")
          : [
              `<p>A collector just added <strong>${payload.cardName}</strong> to their collection.</p>`,
              `<p>They haven't listed it for sale, but your bounty (max $${payload.maxPrice}) is public — they may reach out.</p>`,
              payload.bountyUrl ? `<p><a href="${payload.bountyUrl}">Manage bounties</a></p>` : "",
            ].join(""),
    }));
  },
  {
    // listingPrice / listingUrl are optional because collection-source matches
    // don't have either. Same payload shape for both source variants keeps the
    // trigger call site simple.
    payloadSchema: z.object({
      bountyId: z.string(),
      source: z.enum(["listing", "collection"]),
      cardName: z.string(),
      treatment: z.string(),
      condition: z.string(),
      maxPrice: z.string(),
      autoBuy: z.boolean(),
      listingId: z.string().optional(),
      listingPrice: z.string().optional(),
      listingUrl: z.url().optional(),
      collectorId: z.string().optional(),
      bountyUrl: z.url().optional(),
    }),
  },
);
