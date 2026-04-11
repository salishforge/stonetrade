import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

/** Platform fee percentage (5%) */
export const PLATFORM_FEE_PERCENT = 5;
