import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserModel as User } from "@/generated/prisma/models";

type AuthMode = "supabase" | "mock";

/**
 * Resolve which auth mode the running process should use.
 *
 * Mock mode auto-creates a `dev-user` and returns it for every request —
 * which is correct in `next dev` and tests, and catastrophic in production.
 * To prevent a misconfiguration (env var unset, misspelled, dropped during
 * a deploy) from silently giving every visitor the same admin-capable
 * identity, we **fail closed** when NODE_ENV=production unless AUTH_MODE
 * is explicitly "supabase". Setting AUTH_MODE=mock in production is allowed
 * for emergencies but has to be done deliberately, with eyes open.
 */
function getAuthMode(): AuthMode {
  const explicit = process.env.AUTH_MODE;
  if (explicit === "supabase" || explicit === "mock") return explicit;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_MODE must be explicitly set in production (expected 'supabase'). " +
        "Refusing to fall back to mock auth — every request would authenticate as dev-user.",
    );
  }
  return "mock";
}

async function getMockUser(): Promise<User> {
  const existing = await prisma.user.findFirst({ where: { username: "dev-user" } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      email: "dev@stonetrade.local",
      username: "dev-user",
      displayName: "Dev User",
      country: "US",
      region: "WA",
    },
  });
}

async function getSupabaseUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();
  if (!supabaseUser?.email) return null;

  const localUser = await prisma.user.findUnique({ where: { email: supabaseUser.email } });
  if (localUser) return localUser;

  // First sign-in for this Supabase identity — provision a local User record.
  // Email is the join key. Username derives from Supabase metadata or the email
  // local-part, with the user id appended to guarantee uniqueness.
  const metadata = (supabaseUser.user_metadata ?? {}) as Record<string, unknown>;
  const usernameSeed =
    (typeof metadata.username === "string" && metadata.username) ||
    supabaseUser.email.split("@")[0];
  const username = `${usernameSeed}-${supabaseUser.id.slice(0, 6)}`;
  const displayName =
    (typeof metadata.display_name === "string" && metadata.display_name) || usernameSeed;

  return prisma.user.create({
    data: {
      email: supabaseUser.email,
      username,
      displayName,
    },
  });
}

export async function getCurrentUser(): Promise<User | null> {
  if (getAuthMode() === "supabase") {
    return getSupabaseUser();
  }
  return getMockUser();
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

export async function getAdminUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "ADMIN") return null;
  return user;
}

/**
 * True when the request carries a valid Bearer token that matches CRON_TOKEN.
 * Only checks header presence + equality — no user lookup. Used by admin
 * endpoints to allow scheduled jobs (GitHub Actions, Vercel Cron, etc.) to
 * call them without a user session.
 *
 * Comparison is constant-time so an attacker can't recover the token via
 * response-timing side channels. Length-equalised so timingSafeEqual doesn't
 * reject mismatched-length inputs (which would itself leak a single bit per
 * try — the probe would learn the secret's length).
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return constantTimeStringEqual(match[1], expected);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  // Pad shorter buffer with zeros so the byte-level compare runs in time
  // proportional to max(|a|,|b|) regardless of input lengths. We still XOR
  // the length difference into the result so length mismatch always fails.
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  const len = Math.max(aBuf.length, bBuf.length);
  const aPad = Buffer.alloc(len);
  const bPad = Buffer.alloc(len);
  aBuf.copy(aPad);
  bBuf.copy(bPad);
  const equalBytes = timingSafeEqual(aPad, bPad);
  return equalBytes && aBuf.length === bBuf.length;
}
