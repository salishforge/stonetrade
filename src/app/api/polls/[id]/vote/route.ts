import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { z } from "zod/v4";

const voteSchema = z.object({
  selectedRange: z.number().int().min(0),
  exactEstimate: z.number().positive().nullable().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireUser();
  const body = await request.json();
  const parsed = voteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const poll = await prisma.valuePoll.findUnique({ where: { id } });
  if (!poll || poll.status !== "ACTIVE") {
    return NextResponse.json({ error: "Poll not found or closed" }, { status: 404 });
  }

  // Check for existing vote
  const existing = await prisma.valuePollVote.findUnique({
    where: { pollId_userId: { pollId: id, userId: user.id } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already voted" }, { status: 409 });
  }

  const vote = await prisma.valuePollVote.create({
    data: {
      pollId: id,
      userId: user.id,
      selectedRange: parsed.data.selectedRange,
      exactEstimate: parsed.data.exactEstimate ?? null,
      voterWeight: user.credibilityScore,
    },
  });

  return NextResponse.json({ data: vote }, { status: 201 });
}
