import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  const user = await requireUser();

  if (!user.stripeAccountId) {
    return NextResponse.json({
      data: {
        onboarded: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
    });
  }

  const account = await getStripe().accounts.retrieve(user.stripeAccountId);
  return NextResponse.json({
    data: {
      onboarded: account.details_submitted && account.charges_enabled,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    },
  });
}
