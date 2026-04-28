import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "@/components/auth/UserMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StoneTrade — CCG Marketplace",
  description:
    "Community-driven marketplace and price discovery for Wonders of the First, Bo Jackson Battle Arena, and emerging collectible card games.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sign-out only meaningful in supabase mode; mock mode always shows "Sign in".
  const signedIn =
    process.env.AUTH_MODE === "supabase" && (await getCurrentUser()) !== null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-geist-sans)]">
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-bold tracking-tight">
                StoneTrade
              </Link>
              <nav className="hidden md:flex items-center gap-5 text-sm">
                <Link href="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
                  Browse
                </Link>
                <Link href="/prices" className="text-muted-foreground hover:text-foreground transition-colors">
                  Prices
                </Link>
                <Link href="/trending" className="text-muted-foreground hover:text-foreground transition-colors">
                  Trending
                </Link>
                <Link href="/polls" className="text-muted-foreground hover:text-foreground transition-colors">
                  Polls
                </Link>
                <Link href="/create-listing" className="text-muted-foreground hover:text-foreground transition-colors">
                  Sell
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/collection"
                className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Collection
              </Link>
              <Link
                href="/listings"
                className="hidden sm:inline-flex text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
              <UserMenu signedIn={signedIn} />
            </div>
          </div>
          {/* Mobile nav */}
          <div className="md:hidden border-t">
            <div className="container mx-auto px-4 flex items-center gap-4 overflow-x-auto py-2 text-sm">
              <Link href="/browse" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Browse</Link>
              <Link href="/prices" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Prices</Link>
              <Link href="/trending" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Trending</Link>
              <Link href="/create-listing" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Sell</Link>
              <Link href="/collection" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Collection</Link>
              <Link href="/listings" className="text-muted-foreground hover:text-foreground whitespace-nowrap">Dashboard</Link>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6 mt-8">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            StoneTrade &mdash; Price discovery for emerging CCGs
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
