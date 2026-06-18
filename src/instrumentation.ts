/**
 * Next.js instrumentation hook (called once at server boot).
 *
 * We use it for one job: validate required env vars before the server
 * accepts traffic. If validation throws in production, Next refuses to
 * start — which is what we want: silent boot with a missing
 * NEXT_PUBLIC_APP_URL or unset AUTH_MODE would route real traffic to
 * localhost or authenticate every visitor as dev-user.
 *
 * The Edge runtime doesn't get assertEnv because (a) it doesn't have access
 * to the same secret surface and (b) crashing the edge runtime is messier
 * than crashing the Node side. The Node-side assertion is enough — if the
 * Node server refuses to start, the deploy fails fast.
 *
 * See `src/lib/env.ts` for the validation rules.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertEnv } = await import("./lib/env");
  assertEnv(process.env);
}
