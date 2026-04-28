import { prisma } from "@/lib/prisma";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserModel as User } from "@/generated/prisma/models";

type AuthMode = "supabase" | "mock";

function getAuthMode(): AuthMode {
  return process.env.AUTH_MODE === "supabase" ? "supabase" : "mock";
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
 */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  // Constant-time comparison would be ideal but the difference at this layer
  // (post-TLS, behind a CDN, with a job-controlled token) is not material.
  return match[1] === expected;
}
