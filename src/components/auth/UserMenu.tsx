import Link from "next/link";

export function UserMenu({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </form>
    );
  }

  return (
    <Link
      href="/login"
      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      Sign in
    </Link>
  );
}
