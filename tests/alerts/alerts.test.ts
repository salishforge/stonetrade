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

let GET: typeof import("@/app/api/alerts/route").GET;
let POST: typeof import("@/app/api/alerts/route").POST;
let DELETE: typeof import("@/app/api/alerts/[id]/route").DELETE;

beforeAll(async () => {
  ({ GET, POST } = await import("@/app/api/alerts/route"));
  ({ DELETE } = await import("@/app/api/alerts/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u" } });
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  return { user, card };
}

function postReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/api/alerts"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/alerts", () => {
  it("creates a PRICE_DROP alert with threshold", async () => {
    const { user, card } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "PRICE_DROP", cardId: card.id, thresholdPct: 15 }));
    expect(res.status).toBe(201);
    const alert = (await res.json()).data;
    expect(alert.type).toBe("PRICE_DROP");
    expect(Number(alert.thresholdPct)).toBe(15);
    expect(alert.active).toBe(true);
  });

  it("creates a META_SHIFT alert without cardId or threshold", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "META_SHIFT" }));
    expect(res.status).toBe(201);
  });

  it("400 when PRICE_DROP missing thresholdPct", async () => {
    const { user, card } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "PRICE_DROP", cardId: card.id }));
    expect(res.status).toBe(400);
  });

  it("400 when PRICE_SPIKE missing cardId", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "PRICE_SPIKE", thresholdPct: 20 }));
    expect(res.status).toBe(400);
  });

  it("400 when BACK_IN_STOCK missing cardId", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "BACK_IN_STOCK" }));
    expect(res.status).toBe(400);
  });

  it("404 when cardId references a non-existent card", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await POST(postReq({ type: "PRICE_DROP", cardId: "ckxxxxxxxxxxxxxxxxxxxxxxx", thresholdPct: 10 }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/alerts", () => {
  it("returns the caller's alerts only", async () => {
    const { user, card } = await seed();
    const other = await prisma.user.create({ data: { email: "o@x.com", username: "other" } });
    await prisma.userAlert.create({ data: { userId: user.id, type: "PRICE_DROP", cardId: card.id, thresholdPct: "10" } });
    await prisma.userAlert.create({ data: { userId: other.id, type: "META_SHIFT" } });

    setMockUser(user.id);
    const res = await GET();
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].userId).toBe(user.id);
  });
});

describe("DELETE /api/alerts/[id]", () => {
  it("owner can delete", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const alert = await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT" } });
    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: alert.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.userAlert.findUnique({ where: { id: alert.id } });
    expect(reloaded).toBeNull();
  });

  it("404 when not the owner", async () => {
    const { user } = await seed();
    const stranger = await prisma.user.create({ data: { email: "x@x.com", username: "stranger" } });
    const alert = await prisma.userAlert.create({ data: { userId: user.id, type: "META_SHIFT" } });
    setMockUser(stranger.id);
    const res = await DELETE(new Request("http://localhost/x"), { params: Promise.resolve({ id: alert.id }) });
    expect(res.status).toBe(404);
  });
});
