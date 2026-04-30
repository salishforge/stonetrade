import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { resetDatabase, prisma } from "../db";

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

let evaluateAlerts: typeof import("@/lib/alerts/evaluate").evaluateAlerts;

beforeAll(async () => {
  ({ evaluateAlerts } = await import("@/lib/alerts/evaluate"));
});

beforeEach(async () => {
  await resetDatabase();
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ id: "msg_test" });
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "Test Card", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u" } });
  return { card, user };
}

async function setMarketValue(cardId: string, fields: { trend7d?: string; totalAvailable?: number; marketMid?: string }) {
  return prisma.cardMarketValue.upsert({
    where: { cardId },
    create: {
      cardId,
      trend7d: fields.trend7d ?? null,
      totalAvailable: fields.totalAvailable ?? 0,
      marketMid: fields.marketMid ?? null,
    },
    update: {
      trend7d: fields.trend7d ?? null,
      totalAvailable: fields.totalAvailable ?? 0,
      marketMid: fields.marketMid ?? null,
    },
  });
}

describe("evaluateAlerts: PRICE_DROP", () => {
  it("fires when trend7d ≤ -threshold", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "-15.50", marketMid: "8.00" });
    const alert = await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10.00" },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledOnce();

    const reloaded = await prisma.userAlert.findUnique({ where: { id: alert.id } });
    expect(reloaded?.lastFiredAt).not.toBeNull();
  });

  it("does not fire when trend is above threshold", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "-5.00" });
    await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10.00" },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("respects 24h cooldown", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "-15.00" });
    const recentFire = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10.00", lastFiredAt: recentFire },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
  });

  it("re-fires after cooldown elapses", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "-15.00" });
    const oldFire = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago
    await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10.00", lastFiredAt: oldFire },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
  });

  it("inactive alerts are skipped", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "-20.00" });
    await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10.00", active: false },
    });
    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
    expect(result.scanned).toBe(0);
  });
});

describe("evaluateAlerts: PRICE_SPIKE", () => {
  it("fires when trend7d >= threshold", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { trend7d: "25.00" });
    await prisma.userAlert.create({
      data: { userId: user.id, type: "PRICE_SPIKE", cardId: card.id, thresholdPct: "20.00" },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
  });
});

describe("evaluateAlerts: BACK_IN_STOCK", () => {
  it("fires when totalAvailable > 0", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { totalAvailable: 3 });
    await prisma.userAlert.create({
      data: { userId: user.id, type: "BACK_IN_STOCK", cardId: card.id },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
  });

  it("does not fire when totalAvailable is 0", async () => {
    const { card, user } = await seed();
    await setMarketValue(card.id, { totalAvailable: 0 });
    await prisma.userAlert.create({
      data: { userId: user.id, type: "BACK_IN_STOCK", cardId: card.id },
    });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
  });
});

describe("evaluateAlerts: META_SHIFT", () => {
  it("fires when current PRI shifted ≥ 10 from a 7+-day-old snapshot", async () => {
    const { card, user } = await seed();
    await prisma.cardEngineMetrics.create({ data: { cardId: card.id, pri: 75 } });
    // Snapshot taken 8 days ago at PRI 60 → +15 delta, fires
    await prisma.cardEngineMetricsHistory.create({
      data: { cardId: card.id, pri: 60, capturedAt: new Date(Date.now() - 8 * 86400000) },
    });
    await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT", cardId: card.id } });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
  });

  it("does not fire when delta is below threshold", async () => {
    const { card, user } = await seed();
    await prisma.cardEngineMetrics.create({ data: { cardId: card.id, pri: 65 } });
    await prisma.cardEngineMetricsHistory.create({
      data: { cardId: card.id, pri: 60, capturedAt: new Date(Date.now() - 8 * 86400000) },
    });
    await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT", cardId: card.id } });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
  });

  it("does not fire when no 7+-day-old snapshot exists", async () => {
    const { card, user } = await seed();
    await prisma.cardEngineMetrics.create({ data: { cardId: card.id, pri: 80 } });
    // Snapshot only 2 days old — too recent
    await prisma.cardEngineMetricsHistory.create({
      data: { cardId: card.id, pri: 50, capturedAt: new Date(Date.now() - 2 * 86400000) },
    });
    await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT", cardId: card.id } });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
  });

  it("fires on negative shift (drop) too", async () => {
    const { card, user } = await seed();
    await prisma.cardEngineMetrics.create({ data: { cardId: card.id, pri: 40 } });
    await prisma.cardEngineMetricsHistory.create({
      data: { cardId: card.id, pri: 70, capturedAt: new Date(Date.now() - 10 * 86400000) },
    });
    await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT", cardId: card.id } });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(1);
  });

  it("does not fire when card has no engineMetrics", async () => {
    const { card, user } = await seed();
    await prisma.cardEngineMetricsHistory.create({
      data: { cardId: card.id, pri: 60, capturedAt: new Date(Date.now() - 10 * 86400000) },
    });
    await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT", cardId: card.id } });

    const result = await evaluateAlerts();
    expect(result.fired).toBe(0);
  });
});
