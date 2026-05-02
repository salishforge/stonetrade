import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

/**
 * Validates the shape of an LLM response before we trust it.
 *
 * Without this, a hostile or malformed model output (prompt injection in
 * `card.name` is the obvious vector) could write arbitrary numeric values
 * — including negative or astronomically large ones — into PriceDataPoint,
 * which feeds the composite market value engine. Zod constrains every
 * field to a sane range and rejects anything outside it.
 *
 * Bounds picked deliberately:
 *   - prices ≥ 0 (negative makes no sense; hostile output)
 *   - prices ≤ $100k (CCG cards rarely exceed this; an outlier estimate
 *     is a stronger signal something's wrong than that we mispriced
 *     a 1-of-1 — the human review path can override)
 *   - reasoning capped to keep DB rows reasonable
 */
const estimateResponseSchema = z
  .object({
    estimatedLow: z.number().min(0).max(100_000),
    estimatedMid: z.number().min(0).max(100_000),
    estimatedHigh: z.number().min(0).max(100_000),
    reasoning: z.string().min(1).max(500),
  })
  .refine((r) => r.estimatedLow <= r.estimatedMid && r.estimatedMid <= r.estimatedHigh, {
    message: "estimatedLow ≤ estimatedMid ≤ estimatedHigh required",
  });

interface EstimateResult {
  estimatedLow: number;
  estimatedMid: number;
  estimatedHigh: number;
  reasoning: string;
}

/**
 * Use Claude to estimate a card's price when there are zero transaction data points.
 * Bases estimate on:
 * - Rarity tier pricing patterns from cards with data
 * - Comparable cards (same orbital, similar rarity/type)
 * - Treatment multipliers (observed ratios)
 */
export async function estimateCardPrice(cardId: string): Promise<EstimateResult | null> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    include: { game: true, set: true },
  });

  if (!card) return null;

  // Gather comparable card prices
  const comparables = await prisma.cardMarketValue.findMany({
    where: {
      card: {
        gameId: card.gameId,
        rarity: card.rarity,
        treatment: card.treatment,
      },
      marketMid: { not: null },
    },
    include: { card: { select: { name: true, cardType: true, orbital: true } } },
    take: 10,
  });

  // Get rarity-level averages
  const rarityAvgs = await prisma.cardMarketValue.groupBy({
    by: ["cardId"],
    where: {
      card: { gameId: card.gameId },
      marketMid: { not: null },
    },
    _avg: { marketMid: true },
  });

  const comparableText = comparables.length > 0
    ? comparables.map((c) => `- ${c.card.name} (${c.card.cardType}, ${c.card.orbital}): $${Number(c.marketMid).toFixed(2)}`).join("\n")
    : "No comparable cards have prices yet.";

  const prompt = `You are a CCG card pricing analyst. Estimate the market value of a card based on available data.

Card to price:
- Name: ${card.name}
- Game: ${card.game.name}
- Set: ${card.set.name}
- Rarity: ${card.rarity}
- Type: ${card.cardType}
- Orbital: ${card.orbital ?? "N/A"}
- Treatment: ${card.treatment}
- Serialized: ${card.isSerialized ? `Yes (/${card.serialTotal})` : "No"}

Comparable cards with known prices (same rarity + treatment):
${comparableText}

Total cards with any price data in this game: ${rarityAvgs.length}

Based on rarity tier patterns, treatment type, and comparable cards, estimate a Low / Mid / High price range in USD. Be conservative — this is an emerging CCG with thin data.

Respond in this exact JSON format only:
{"estimatedLow": <number>, "estimatedMid": <number>, "estimatedHigh": <number>, "reasoning": "<1-2 sentences>"}`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("AI price estimation: model returned non-JSON", { cardId, text: text.slice(0, 200) });
      return null;
    }

    const validated = estimateResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("AI price estimation: response failed schema validation", {
        cardId,
        issues: validated.error.issues,
      });
      return null;
    }
    const result = validated.data;

    // Store as AI_ESTIMATE price data point
    await prisma.priceDataPoint.create({
      data: {
        cardId,
        source: "AI_ESTIMATE",
        price: result.estimatedMid,
        condition: "NEAR_MINT",
        treatment: card.treatment,
        verified: false,
      },
    });

    return result;
  } catch (error) {
    console.error("AI price estimation failed:", error);
    return null;
  }
}
