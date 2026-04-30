"use client";

import { useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { NovuProvider, Bell, Notifications, Inbox } from "@novu/react";
import { inboxDarkTheme } from "@novu/js/themes";
import { Bell as BellIcon } from "lucide-react";

interface NotificationBellProps {
  /** Stonetrade User.id — used as Novu subscriberId. */
  subscriberId: string;
}

/**
 * Header notification bell + popover, built on @novu/react's headless
 * primitives (NovuProvider + Bell + Notifications) wrapped in our own
 * Base UI Popover. Replaces the default <Inbox> so the popover matches
 * the warm-backroom palette pixel-for-pixel.
 *
 * Renders nothing if NEXT_PUBLIC_NOVU_APP_IDENTIFIER isn't configured —
 * keeps the dev environment clean before Novu credentials are wired.
 *
 * Migration note: the bundled <Inbox> still ships with @novu/react and we
 * keep the import around as a one-line fallback (used when
 * NEXT_PUBLIC_NOVU_USE_INBOX=true) so we can A/B the visual fit during the
 * P4 rollout. Remove the env-flagged branch once we're confident in the
 * custom skin.
 */
export function NotificationBell({ subscriberId }: NotificationBellProps) {
  const appId = process.env.NEXT_PUBLIC_NOVU_APP_IDENTIFIER;
  if (!appId) return null;

  const useInbox = process.env.NEXT_PUBLIC_NOVU_USE_INBOX === "true";

  if (useInbox) {
    return (
      <div className="flex items-center">
        <Inbox
          applicationIdentifier={appId}
          subscriberId={subscriberId}
          appearance={{ baseTheme: inboxDarkTheme }}
        />
      </div>
    );
  }

  return (
    <NovuProvider applicationIdentifier={appId} subscriberId={subscriberId}>
      <NotificationPopover />
    </NovuProvider>
  );
}

function NotificationPopover() {
  // Manual `open` state because Base UI's Popover.Root is uncontrolled by
  // default and we want to close the popover when a notification is clicked.
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label="Notifications"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-overlay/50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 data-[popup-open]:text-ink-primary data-[popup-open]:bg-surface-overlay/50"
      >
        <Bell renderBell={(unreadCount) => (
          <span className="relative inline-flex">
            <BellIcon className="h-[18px] w-[18px]" strokeWidth={1.75} />
            {unreadCount.total > 0 && (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-gold px-1 font-mono text-[10px] font-medium leading-[16px] text-[#1a1208]">
                {unreadCount.total > 99 ? "99+" : unreadCount.total}
              </span>
            )}
          </span>
        )} />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner sideOffset={8} align="end">
          <PopoverPrimitive.Popup
            className="z-50 w-[380px] max-h-[80vh] overflow-hidden rounded-md border border-border/60 bg-surface-raised shadow-xl outline-none flex flex-col"
          >
            <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <span className="font-display text-[15px] tracking-[0.01em] text-ink-primary">
                Notifications
              </span>
            </header>
            <div className="flex-1 overflow-y-auto novu-notifications-host">
              {/* @novu/react's <Notifications> renders its own list. We
                  scope the styling via the wrapper's CSS class so the rows
                  inherit our palette without forking the renderer. */}
              <Notifications
                onNotificationClick={(n) => {
                  if (n.redirect?.url) {
                    window.location.href = n.redirect.url;
                  }
                  setOpen(false);
                }}
              />
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
