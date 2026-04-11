import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

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
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as EstimateResult;

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
