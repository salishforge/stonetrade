"use client";

import { Inbox } from "@novu/react";
import { inboxDarkTheme } from "@novu/js/themes";

interface NotificationBellProps {
  /** Stonetrade User.id — used as Novu subscriberId. */
  subscriberId: string;
}

/**
 * Header notification bell + popover, backed by Novu's <Inbox>.
 *
 * Returns null if NEXT_PUBLIC_NOVU_APP_IDENTIFIER isn't configured — keeps
 * the dev environment clean before Novu credentials are wired.
 *
 * P4-redo (see docs/handoff.md): the ambition was a fully custom popover
 * built on @novu/react's headless primitives, but <Bell>/<Notifications>/
 * <InboxContent> all consume `NovuUIContext` while only <Inbox> provides
 * it (the <NovuUI> provider is not a public export). The correct rebuild
 * uses `useCounts()` + `useNotifications()` hooks directly under
 * <NovuProvider> — those need only SDK context, not UI context.
 */
export function NotificationBell({ subscriberId }: NotificationBellProps) {
  const appId = process.env.NEXT_PUBLIC_NOVU_APP_IDENTIFIER;
  if (!appId) return null;

  return (
    <div className="flex items-center">
      <Inbox
        applicationIdentifier={appId}
        subscriberId={subscriberId}
        appearance={{
          baseTheme: inboxDarkTheme,
          variables: {
            colorBackground: "var(--surface-raised)",
            colorForeground: "var(--ink-primary)",
            colorPrimary: "var(--gold)",
            colorPrimaryForeground: "#1a1208",
            colorSecondary: "var(--surface-overlay)",
            colorSecondaryForeground: "var(--ink-secondary)",
            colorNeutral: "var(--ink-muted)",
            fontSize: "13px",
            borderRadius: "6px",
          },
        }}
      />
    </div>
  );
}
