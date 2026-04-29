import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";
import { HeaderSearch } from "@/components/marketplace/HeaderSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { getBrand } from "@/lib/brand";
import "./globals.css";

// Stonetrade's typography mirrors the Wonders platform doctrine — same family
// across products so the look-and-feel is consistent. Fraunces for masthead +
// display headings (literary gravitas, not gamedev wordmark), Inter as the
// neutral workhorse for body and nav, JetBrains Mono for every monetary or
// numeric value so prices never shift width when digits change.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Title and description follow the active brand. Next will re-evaluate this
// at build time per deployment, so a stonetrade-branded build and a
// hobby-club-branded build differ only in env vars.
const brandForMetadata = getBrand();
export const metadata: Metadata = {
  title: `${brandForMetadata.name} — CCG Marketplace`,
  description: brandForMetadata.tagline,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // We need the User.id regardless of AUTH_MODE so the Novu <Inbox> can scope
  // notifications per subscriber. The signed-in chrome itself is still gated
  // on supabase mode — mock mode always shows "Sign in" because there is no
  // real session to sign out of.
  const currentUser = await getCurrentUser();
  const signedIn = process.env.AUTH_MODE === "supabase" && currentUser !== null;
  const brand = getBrand();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-surface-base/95 backdrop-blur">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-8">
              <Link href="/" className="flex items-center gap-3 leading-none group">
                {brand.logoSrc && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={brand.logoSrc}
                    alt=""
                    className="h-9 w-9 object-contain rounded-sm bg-surface-overlay/30 p-0.5"
                  />
                )}
                <span className="flex flex-col">
                  <span
                    className="font-display text-[22px] tracking-[0.01em] text-ink-primary leading-none"
                    style={{ fontVariationSettings: "'opsz' 48" }}
                  >
                    {brand.name}
                  </span>
                  {brand.poweredBy && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-muted mt-1 leading-none">
                      powered by {brand.poweredBy}
                    </span>
                  )}
                </span>
              </Link>
              <nav className="hidden md:flex items-center gap-6 text-[12px] uppercase tracking-[0.12em] text-ink-secondary">
                <Link href="/browse" className="hover:text-ink-primary transition-colors">Browse</Link>
                <Link href="/prices" className="hover:text-ink-primary transition-colors">Prices</Link>
                <Link href="/trending" className="hover:text-ink-primary transition-colors">Trending</Link>
                <Link href="/polls" className="hover:text-ink-primary transition-colors">Polls</Link>
                <Link href="/create-listing" className="hover:text-ink-primary transition-colors">Sell</Link>
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <Suspense fallback={null}>
                <HeaderSearch />
              </Suspense>
              <Link
                href="/collection"
                className="hidden sm:inline-flex text-[12px] uppercase tracking-[0.12em] text-ink-secondary hover:text-ink-primary transition-colors"
              >
                Collection
              </Link>
              <Link
                href="/listings"
                className="hidden sm:inline-flex text-[12px] uppercase tracking-[0.12em] text-ink-secondary hover:text-ink-primary transition-colors"
              >
                Dashboard
              </Link>
              {currentUser && <NotificationBell subscriberId={currentUser.id} />}
              <UserMenu signedIn={signedIn} />
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden border-t border-border/60">
            <div className="container mx-auto px-4 flex items-center gap-5 overflow-x-auto py-2 text-[11px] uppercase tracking-[0.12em] text-ink-secondary">
              <Link href="/browse" className="hover:text-ink-primary whitespace-nowrap">Browse</Link>
              <Link href="/prices" className="hover:text-ink-primary whitespace-nowrap">Prices</Link>
              <Link href="/trending" className="hover:text-ink-primary whitespace-nowrap">Trending</Link>
              <Link href="/create-listing" className="hover:text-ink-primary whitespace-nowrap">Sell</Link>
              <Link href="/collection" className="hover:text-ink-primary whitespace-nowrap">Collection</Link>
              <Link href="/listings" className="hover:text-ink-primary whitespace-nowrap">Dashboard</Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border/60 py-5 mt-12">
          <div className="container mx-auto px-4 flex items-center justify-between text-[11px] uppercase tracking-[0.12em] text-ink-muted">
            <span>
              {brand.legalEntity} · {brand.tagline}
              {brand.poweredBy && (
                <span className="ml-3 normal-case tracking-normal">
                  · powered by <span className="text-ink-secondary">{brand.poweredBy}</span>
                </span>
              )}
            </span>
            <span className="font-mono normal-case tracking-normal">v0.1</span>
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
