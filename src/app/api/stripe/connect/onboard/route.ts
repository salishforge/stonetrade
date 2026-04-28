import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const user = await requireUser();
  let accountId = user.stripeAccountId;

  if (!accountId) {
    const account = await getStripe().accounts.create({
      type: "express",
      email: user.email,
      country: user.country ?? "US",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId: user.id },
    });
    accountId = account.id;
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeAccountId: accountId },
    });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await getStripe().accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/dashboard/settings/payouts?status=refresh`,
    return_url: `${baseUrl}/dashboard/settings/payouts?status=complete`,
    type: "account_onboarding",
  });

  return NextResponse.json({ data: { url: link.url, accountId } });
}
