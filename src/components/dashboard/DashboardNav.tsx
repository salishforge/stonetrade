"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

interface DashboardNavProps {
  groups: readonly NavGroup[];
}

/**
 * DashboardNav — left rail for the dashboard.
 *
 * Visual: small-caps mono group headers, refined active state (gold-dark
 * tinted background + gold-light text + a 1px gold rule on the left). Hover
 * raises the row to surface-overlay. Compared to the prior layout this:
 *   - groups by purpose (trading / watching / dragon-cup / account)
 *   - replaces shadcn's generic muted hover with the warm-backroom palette
 *   - matches the card detail page's typographic system (font-mono tracking
 *     labels, ink-muted/ink-secondary/ink-primary hierarchy)
 */
export function DashboardNav({ groups }: DashboardNavProps) {
  const pathname = usePathname();

  return (
    <nav className="space-y-7">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted mb-2">
            {group.label}
          </p>
          <ul className="space-y-px">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`relative block px-3 py-1.5 text-[13px] transition-colors rounded-sm ${
                      active
                        ? "text-gold-light bg-gold-dark/20"
                        : "text-ink-secondary hover:text-ink-primary hover:bg-surface-overlay/50"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1.5 bottom-1.5 w-px bg-gold"
                      />
                    )}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
