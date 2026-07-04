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

let listGET: typeof import("@/app/api/polls/route").GET;
let listPOST: typeof import("@/app/api/polls/route").POST;
let votePOST: typeof import("@/app/api/polls/[id]/vote/route").POST;

beforeAll(async () => {
  ({ GET: listGET, POST: listPOST } = await import("@/app/api/polls/route"));
  ({ POST: votePOST } = await import("@/app/api/polls/[id]/vote/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const card = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "C", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const user = await prisma.user.create({ data: { email: "u@x.com", username: "u", credibilityScore: 1.5 } });
  return { card, user };
}

function postReq(url: string, body: object): NextRequest {
  return new NextRequest(new URL(url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/polls", () => {
  it("creates an active 7-day poll", async () => {
    const { card, user } = await seed();
    setMockUser(user.id);
    const res = await listPOST(postReq("http://localhost/api/polls", { cardId: card.id, treatment: "Classic Paper" }));
    expect(res.status).toBe(201);
    const poll = (await res.json()).data;
    expect(poll.status).toBe("ACTIVE");
    expect(poll.cardId).toBe(card.id);
    expect(Array.isArray(poll.priceRanges)).toBe(true);
    // expiresAt should be ~7d in the future
    const days = (new Date(poll.expiresAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("400 on missing cardId or treatment", async () => {
    const { user } = await seed();
    setMockUser(user.id);
    const res = await listPOST(postReq("http://localhost/api/polls", {}));
    expect(res.status).toBe(400);
  });

  it("409 when an ACTIVE poll already exists for the card + treatment", async () => {
    const { card, user } = await seed();
    setMockUser(user.id);
    await listPOST(postReq("http://localhost/api/polls", { cardId: card.id, treatment: "Classic Paper" }));
    const res2 = await listPOST(postReq("http://localhost/api/polls", { cardId: card.id, treatment: "Classic Paper" }));
    expect(res2.status).toBe(409);
  });
});

describe("GET /api/polls", () => {
  it("filters by status (ACTIVE default)", async () => {
    const { card } = await seed();
    await prisma.valuePoll.create({
      data: { cardId: card.id, treatment: "Classic Paper", priceRanges: [{ min: 0, max: 1 }], status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) },
    });
    await prisma.valuePoll.create({
      data: { cardId: card.id, treatment: "Classic Foil", priceRanges: [{ min: 0, max: 1 }], status: "CLOSED", expiresAt: new Date(Date.now() - 86400000) },
    });

    const url = new URL("http://localhost/api/polls");
    const res = await listGET(new NextRequest(url, { method: "GET" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].status).toBe("ACTIVE");
  });
});

describe("POST /api/polls/[id]/vote", () => {
  async function seedPoll() {
    const seed_ = await seed();
    const poll = await prisma.valuePoll.create({
      data: { cardId: seed_.card.id, treatment: "Classic Paper", priceRanges: [{ min: 0, max: 1 }], status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) },
    });
    return { ...seed_, poll };
  }

  it("creates a vote with voter weight from credibility", async () => {
    const { poll, user } = await seedPoll();
    setMockUser(user.id);
    const res = await votePOST(postReq("http://localhost/x", { selectedRange: 2, exactEstimate: 7.5 }), { params: Promise.resolve({ id: poll.id }) });
    expect(res.status).toBe(201);
    const vote = (await res.json()).data;
    expect(vote.selectedRange).toBe(2);
    expect(Number(vote.exactEstimate)).toBe(7.5);
    expect(vote.voterWeight).toBe(1.5); // user.credibilityScore from seed
  });

  it("409 on duplicate vote", async () => {
    const { poll, user } = await seedPoll();
    setMockUser(user.id);
    const r1 = await votePOST(postReq("http://localhost/x", { selectedRange: 1 }), { params: Promise.resolve({ id: poll.id }) });
    expect(r1.status).toBe(201);
    const r2 = await votePOST(postReq("http://localhost/x", { selectedRange: 2 }), { params: Promise.resolve({ id: poll.id }) });
    expect(r2.status).toBe(409);
  });

  it("404 when poll is not ACTIVE", async () => {
    const { poll, user } = await seedPoll();
    await prisma.valuePoll.update({ where: { id: poll.id }, data: { status: "CLOSED" } });
    setMockUser(user.id);
    const res = await votePOST(postReq("http://localhost/x", { selectedRange: 0 }), { params: Promise.resolve({ id: poll.id }) });
    expect(res.status).toBe(404);
  });

  it("400 on validation failure", async () => {
    const { poll, user } = await seedPoll();
    setMockUser(user.id);
    const res = await votePOST(postReq("http://localhost/x", { selectedRange: -1 }), { params: Promise.resolve({ id: poll.id }) });
    expect(res.status).toBe(400);
  });
});
