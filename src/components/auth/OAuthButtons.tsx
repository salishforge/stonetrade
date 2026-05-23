"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Provider = "google" | "discord";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "google", label: "Continue with Google" },
  { id: "discord", label: "Continue with Discord" },
];

/**
 * OAuth buttons for Supabase-backed sign-in. Each button kicks off the
 * provider's hosted flow via `signInWithOAuth`; Supabase redirects to
 * `/auth/callback?code=...` where the existing route handler exchanges
 * the code for a session cookie.
 *
 * The redirect URL must be allow-listed in Supabase
 * (Authentication → URL Configuration → Redirect URLs). Use the *exact*
 * origin the user lands on — `http://localhost:3000/auth/callback`,
 * `http://100.97.161.7:3000/auth/callback`, and any prod URL all need
 * to be registered there.
 */
export function OAuthButtons() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Provider | null>(null);

  async function handleClick(provider: Provider) {
    setPending(provider);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        // window.origin is the only reliable way to handle the multi-host
        // dev story (localhost + Tailscale IP + future prod). Hard-coding
        // a single redirectTo here would break sign-in over Tailscale.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setPending(null);
    }
    // On success the browser navigates away — no need to clear state.
  }

  return (
    <div className="space-y-2">
      {PROVIDERS.map((p) => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          className="w-full"
          disabled={pending !== null}
          onClick={() => handleClick(p.id)}
        >
          {pending === p.id ? "Redirecting..." : p.label}
        </Button>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
