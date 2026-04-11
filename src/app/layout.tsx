import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b">
          <div className="container mx-auto flex h-14 items-center justify-between px-4">
            <a href="/" className="text-lg font-bold tracking-tight">
              StoneTrade
            </a>
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <a href="/browse" className="text-muted-foreground hover:text-foreground transition-colors">
                Browse
              </a>
              <a href="/prices" className="text-muted-foreground hover:text-foreground transition-colors">
                Prices
              </a>
              <a href="/trending" className="text-muted-foreground hover:text-foreground transition-colors">
                Trending
              </a>
              <a href="/create-listing" className="text-muted-foreground hover:text-foreground transition-colors">
                Sell
              </a>
            </nav>
            <div className="flex items-center gap-4">
              <a
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </a>
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t py-6">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            StoneTrade &mdash; Price discovery for emerging CCGs
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
