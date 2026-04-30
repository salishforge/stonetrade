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

let listGET: typeof import("@/app/api/trades/route").GET;
let listPOST: typeof import("@/app/api/trades/route").POST;
let detailGET: typeof import("@/app/api/trades/[id]/route").GET;
let detailPATCH: typeof import("@/app/api/trades/[id]/route").PATCH;

beforeAll(async () => {
  ({ GET: listGET, POST: listPOST } = await import("@/app/api/trades/route"));
  ({ GET: detailGET, PATCH: detailPATCH } = await import("@/app/api/trades/[id]/route"));
});

beforeEach(async () => {
  await resetDatabase();
  setMockUser(null);
});

async function seed() {
  const game = await prisma.game.create({ data: { name: "W", slug: "w", publisher: "S", website: "https://e.com" } });
  const set = await prisma.set.create({ data: { gameId: game.id, name: "Set", code: "S", totalCards: 1 } });
  const cardA = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "001", name: "A", rarity: "Rare", cardType: "Unit", treatment: "Classic Paper" } });
  const cardB = await prisma.card.create({ data: { gameId: game.id, setId: set.id, cardNumber: "002", name: "B", rarity: "Common", cardType: "Unit", treatment: "Classic Paper" } });
  const proposer = await prisma.user.create({ data: { email: "p@x.com", username: "proposer" } });
  const recipient = await prisma.user.create({ data: { email: "r@x.com", username: "recipient" } });
  return { cardA, cardB, proposer, recipient };
}

function postReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/api/trades"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function patchReq(body: object): NextRequest {
  return new NextRequest(new URL("http://localhost/x"), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = (extras: { recipientId: string; fromProposerCard: string; fromRecipientCard: string }) => ({
  recipientId: extras.recipientId,
  fromProposer: [{ cardId: extras.fromProposerCard, treatment: "Classic Paper", quantity: 1, condition: "NEAR_MINT" }],
  fromRecipient: [{ cardId: extras.fromRecipientCard, treatment: "Classic Paper", quantity: 1, condition: "NEAR_MINT" }],
  message: "Wanna swap?",
});

describe("POST /api/trades", () => {
  it("creates a trade with items split by side", async () => {
    const { cardA, cardB, proposer, recipient } = await seed();
    setMockUser(proposer.id);
    const res = await listPOST(postReq(validBody({ recipientId: recipient.id, fromProposerCard: cardA.id, fromRecipientCard: cardB.id })));
    expect(res.status).toBe(201);
    const trade = (await res.json()).data;

    expect(trade.proposerId).toBe(proposer.id);
    expect(trade.recipientId).toBe(recipient.id);
    expect(trade.status).toBe("PROPOSED");
    expect(trade.items).toHaveLength(2);
    expect(trade.items.find((i: { cardId: string }) => i.cardId === cardA.id)?.fromProposer).toBe(true);
    expect(trade.items.find((i: { cardId: string }) => i.cardId === cardB.id)?.fromProposer).toBe(false);
  });

  it("400 when proposing to yourself", async () => {
    const { cardA, cardB, proposer } = await seed();
    setMockUser(proposer.id);
    const res = await listPOST(postReq(validBody({ recipientId: proposer.id, fromProposerCard: cardA.id, fromRecipientCard: cardB.id })));
    expect(res.status).toBe(400);
  });

  it("404 when recipient does not exist", async () => {
    const { cardA, cardB, proposer } = await seed();
    setMockUser(proposer.id);
    const res = await listPOST(postReq(validBody({ recipientId: "ckxxxxxxxxxxxxxxxxxxxxxxx", fromProposerCard: cardA.id, fromRecipientCard: cardB.id })));
    expect(res.status).toBe(404);
  });

  it("404 when a card does not exist", async () => {
    const { cardA, proposer, recipient } = await seed();
    setMockUser(proposer.id);
    const res = await listPOST(postReq(validBody({ recipientId: recipient.id, fromProposerCard: cardA.id, fromRecipientCard: "ckxxxxxxxxxxxxxxxxxxxxxxx" })));
    expect(res.status).toBe(404);
  });

  it("400 with empty side", async () => {
    const { proposer, recipient } = await seed();
    setMockUser(proposer.id);
    const res = await listPOST(postReq({
      recipientId: recipient.id,
      fromProposer: [],
      fromRecipient: [],
    }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/trades", () => {
  it("returns trades involving the caller (both sides)", async () => {
    const { cardA, cardB, proposer, recipient } = await seed();
    await prisma.trade.create({
      data: {
        proposerId: proposer.id, recipientId: recipient.id, expiresAt: new Date(Date.now() + 86400000),
        items: { create: [
          { cardId: cardA.id, fromProposer: true, treatment: "Classic Paper" },
          { cardId: cardB.id, fromProposer: false, treatment: "Classic Paper" },
        ] },
      },
    });

    setMockUser(recipient.id);
    const res = await listGET(new NextRequest(new URL("http://localhost/api/trades"), { method: "GET" }));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe("PATCH /api/trades/[id]", () => {
  async function seedTrade() {
    const { cardA, cardB, proposer, recipient } = await seed();
    const trade = await prisma.trade.create({
      data: {
        proposerId: proposer.id, recipientId: recipient.id, expiresAt: new Date(Date.now() + 86400000),
        items: { create: [
          { cardId: cardA.id, fromProposer: true, treatment: "Classic Paper" },
          { cardId: cardB.id, fromProposer: false, treatment: "Classic Paper" },
        ] },
      },
    });
    return { trade, proposer, recipient };
  }

  it("recipient can ACCEPT", async () => {
    const { trade, recipient } = await seedTrade();
    setMockUser(recipient.id);
    const res = await detailPATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.trade.findUnique({ where: { id: trade.id } });
    expect(reloaded?.status).toBe("ACCEPTED");
    expect(reloaded?.respondedAt).not.toBeNull();
  });

  it("recipient can DECLINE", async () => {
    const { trade, recipient } = await seedTrade();
    setMockUser(recipient.id);
    const res = await detailPATCH(patchReq({ action: "decline" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.trade.findUnique({ where: { id: trade.id } });
    expect(reloaded?.status).toBe("DECLINED");
  });

  it("proposer can WITHDRAW", async () => {
    const { trade, proposer } = await seedTrade();
    setMockUser(proposer.id);
    const res = await detailPATCH(patchReq({ action: "withdraw" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(200);
    const reloaded = await prisma.trade.findUnique({ where: { id: trade.id } });
    expect(reloaded?.status).toBe("WITHDRAWN");
  });

  it("proposer cannot ACCEPT", async () => {
    const { trade, proposer } = await seedTrade();
    setMockUser(proposer.id);
    const res = await detailPATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(403);
  });

  it("recipient cannot WITHDRAW", async () => {
    const { trade, recipient } = await seedTrade();
    setMockUser(recipient.id);
    const res = await detailPATCH(patchReq({ action: "withdraw" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(403);
  });

  it("409 when trade is not PROPOSED", async () => {
    const { trade, recipient } = await seedTrade();
    await prisma.trade.update({ where: { id: trade.id }, data: { status: "ACCEPTED" } });
    setMockUser(recipient.id);
    const res = await detailPATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: trade.id }) });
    expect(res.status).toBe(409);
  });

  it("404 when trade does not exist", async () => {
    const { recipient } = await seedTrade();
    setMockUser(recipient.id);
    const res = await detailPATCH(patchReq({ action: "accept" }), { params: Promise.resolve({ id: "ckxxxxxxxxxxxxxxxxxxxxxxx" }) });
    expect(res.status).toBe(404);
  });
});
