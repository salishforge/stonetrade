import Link from "next/link";
import { DashboardNav } from "@/components/dashboard/DashboardNav";

/**
 * Sidebar groups for the dashboard. Grouping reduces the dashboard's
 * "everything in one flat list" feel and lets each section read as a
 * separate concern: trading, ownership, the Wonders Dragon Cup product,
 * and account-level config.
 *
 * Order within a group is by frequency-of-use, not alphabetical — sellers
 * open Listings before Orders, collectors open Collection before Buylist.
 */
const NAV_GROUPS = [
  {
    label: "Trading",
    items: [
      { href: "/listings", label: "Listings" },
      { href: "/orders", label: "Orders" },
      { href: "/offers", label: "Offers" },
    ],
  },
  {
    label: "Watching",
    items: [
      { href: "/buylist", label: "Buylist" },
      { href: "/alerts", label: "Alerts" },
      { href: "/collection", label: "Collection" },
    ],
  },
  {
    label: "Dragon Cup",
    items: [
      { href: "/dragon-scales", label: "Dragon Scales" },
      { href: "/dragon-stable", label: "Dragon Stable" },
      { href: "/hunting-packs", label: "Hunting Packs" },
      { href: "/tournaments", label: "Tournaments" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/invitations", label: "Invitations" },
      { href: "/settings", label: "Settings" },
    ],
  },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-10 grid gap-12 md:grid-cols-[200px_1fr]">
      <aside className="hidden md:block">
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted hover:text-ink-secondary transition-colors block mb-8"
        >
          ← Marketplace
        </Link>

        <DashboardNav groups={NAV_GROUPS} />
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  );
}
