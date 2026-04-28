import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetDatabase, prisma } from "../db";

let currentMockUserId: string | null = null;
function setMockUser(id: string | null) { currentMockUserId = id; }
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!currentMockUserId) throw new Error("No mock user set");
    const user = await prisma.user.findUnique({ where: { id: currentMockUserId } });
    if (!user) throw new Error("Mock user not found");
    return user;
  },
}));

let pricesGET: typeof import("@/app/api/prices/route").GET;
let historyGET: typeof import("@/app/api/prices/[cardId]/history/route").GET;
let reportPOST: typeof import("@/app/api/prices/report/route").POST;
let recalcPOST: typeof import("@/app/api/prices/recalculate/route").POST;

beforeAll(async () => {
  ({ GET: pricesGET } = await import("@/app/api/prices/route"));
  ({ GET: historyGET } = await import("@/app/api/prices/[cardId]/history/route"));
  ({ POST: reportPOST } = await import("@/app/api/prices/report/route"));
  ({ POST: recalcPOST } = await import("@/app/api/prices/recalculate/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u" } });
  return { card, user };
}

describe("GET /api/prices", () => {
  it("400 when cardId missing", async () => {
    const url = new URL("http://localhost/api/prices");
    const res = await pricesGET(new NextRequest(url, { method: "GET" }));
    expect(res.status).toBe(400);
  });

  it("returns marketValue + recent data points + sourceCounts", async () => {
    const { card } = await seed();
    await prisma.cardMarketValue.create({ data: { cardId: card.id, marketMid: "10.00" } });
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "COMPLETED_SALE", price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "EBAY_SOLD", price: "9.50", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });

    const url = new URL("http://localhost/api/prices");
    url.searchParams.set("cardId", card.id);
    const res = await pricesGET(new NextRequest(url, { method: "GET" }));
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.marketValue).not.toBeNull();
    expect(data.recentDataPoints).toHaveLength(2);
    expect(data.sourceCounts).toEqual({ COMPLETED_SALE: 1, EBAY_SOLD: 1 });
  });
});

describe("GET /api/prices/[cardId]/history", () => {
  it("returns time-series for the last N days (default 90)", async () => {
    const { card } = await seed();
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "COMPLETED_SALE", price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });
    await prisma.priceDataPoint.create({
      data: { cardId: card.id, source: "COMPLETED_SALE", price: "11.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true, createdAt: new Date(Date.now() - 100 * 86400000) },
    });

    const url = new URL("http://localhost/x");
    const res = await historyGET(new NextRequest(url, { method: "GET" }), { params: Promise.resolve({ cardId: card.id }) });
    const body = await res.json();
    // 100-day-old point is outside the 90-day window
    expect(body.data).toHaveLength(1);
    expect(body.data[0].price).toBe(10);
  });

  it("respects custom days param", async () => {
    const { card } = await seed();
    await prisma.priceDataPoint.create({
      data: { cardId: card.id, source: "COMPLETED_SALE", price: "11.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true, createdAt: new Date(Date.now() - 100 * 86400000) },
    });
    const url = new URL("http://localhost/x");
    url.searchParams.set("days", "120");
    const res = await historyGET(new NextRequest(url, { method: "GET" }), { params: Promise.resolve({ cardId: card.id }) });
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /api/prices/report", () => {
  function reportReq(body: object): NextRequest {
    return new NextRequest(new URL("http://localhost/api/prices/report"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("creates a SaleReport + an unverified MANUAL_REPORT data point", async () => {
    const { card, user } = await seed();
    setMockUser(user.id);
    const res = await reportPOST(reportReq({
      cardId: card.id,
      price: 12.5,
      condition: "NEAR_MINT",
      treatment: "Classic Paper",
      platform: "twitter",
      saleDate: new Date().toISOString(),
    }));
    expect(res.status).toBe(201);

    const reports = await prisma.saleReport.findMany({ where: { cardId: card.id } });
    expect(reports).toHaveLength(1);
    expect(reports[0].verified).toBe(false);

    const points = await prisma.priceDataPoint.findMany({ where: { cardId: card.id, source: "MANUAL_REPORT" } });
    expect(points).toHaveLength(1);
    expect(points[0].verified).toBe(false);
  });

  it("404 when card does not exist", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await reportPOST(reportReq({
      cardId: "ckxxxxxxxxxxxxxxxxxxxxxxx",
      price: 10,
      condition: "NEAR_MINT",
      treatment: "Classic Paper",
      platform: "twitter",
      saleDate: new Date().toISOString(),
    }));
    expect(res.status).toBe(404);
  });

  it("400 on invalid input", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await reportPOST(reportReq({ cardId: "x" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/prices/recalculate", () => {
  function recalcReq(body: object | null = null): NextRequest {
    return new NextRequest(new URL("http://localhost/api/prices/recalculate"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : "",
    });
  }

  it("recalculates a single card when cardId provided", async () => {
    const { card } = await seed();
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "COMPLETED_SALE", price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });

    const res = await recalcPOST(recalcReq({ cardId: card.id }));
    expect(res.status).toBe(200);
    const market = await prisma.cardMarketValue.findUnique({ where: { cardId: card.id } });
    expect(market).not.toBeNull();
  });

  it("recalculates all cards when no cardId provided", async () => {
    const { card } = await seed();
    await prisma.priceDataPoint.create({ data: { cardId: card.id, source: "COMPLETED_SALE", price: "10.00", condition: "NEAR_MINT", treatment: "Classic Paper", verified: true } });

    const res = await recalcPOST(recalcReq());
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.updated).toBe(1);
  });
});
