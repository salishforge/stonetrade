import { prisma } from "@/lib/prisma";

/**
 * Get the current authenticated user.
 *
 * Currently returns a mock user for development. Will be replaced with
 * Supabase auth when the project is configured.
 */
export async function getCurrentUser() {
  // TODO: Replace with Supabase auth
  // const supabase = await createSupabaseServerClient();
  // const { data: { user } } = await supabase.auth.getUser();
  // if (!user) return null;

  const user = await prisma.user.findFirst({
    where: { username: "dev-user" },
  });

  if (user) return user;

  // Auto-create dev user on first call
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

/**
 * Require authentication. Returns user or throws.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}
