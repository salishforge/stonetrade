"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Appoint or change the rider on the current user's personal Dragon.
// Picker is a username text input — the API resolves to a User and rejects
// if that user already rides another active Dragon.
export function AppointPersonalRider({
  currentRiderId,
}: {
  currentRiderId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function appoint() {
    setError(null);
    if (!username.trim()) {
      setError("Enter a username");
      return;
    }
    // Resolve username → id via /api/cards or a user lookup; the rider
    // endpoint takes id, so look up first.
    const resolveRes = await fetch(
      `/api/users/lookup?username=${encodeURIComponent(username.trim())}`,
    );
    if (!resolveRes.ok) {
      setError("User not found");
      return;
    }
    const { data } = await resolveRes.json();
    const userId = data?.id;
    if (!userId) {
      setError("User not found");
      return;
    }

    const res = await fetch("/api/dragon-stable/personal/rider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to appoint");
      return;
    }
    setUsername("");
    startTransition(() => router.refresh());
  }

  async function clearRider() {
    if (!confirm("Remove the appointed Dragon Rider?")) return;
    const res = await fetch("/api/dragon-stable/personal/rider", { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) {
      alert(body.error ?? "Failed");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Stoneseeker username"
        className="max-w-xs"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Button onClick={appoint} disabled={pending || !username}>
        {currentRiderId ? "Change rider" : "Appoint rider"}
      </Button>
      {currentRiderId && (
        <Button variant="ghost" onClick={clearRider} disabled={pending}>
          Clear
        </Button>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
