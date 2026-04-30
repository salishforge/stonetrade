"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteForm({ packId }: { packId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const body: Record<string, string> = {};
    if (email) body.email = email;
    if (username) body.username = username;
    if (!body.email && !body.username) {
      setError("Provide an email or username");
      return;
    }
    const res = await fetch(`/api/hunting-packs/${packId}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Invite failed");
      return;
    }
    setSuccess(`Invitation sent to ${data.data.inviteeEmail}`);
    setEmail("");
    setUsername("");
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="hunter@example.com"
        />
      </div>
      <p className="text-xs text-muted-foreground">— or —</p>
      <div className="space-y-1.5">
        <Label htmlFor="invite-username">Username</Label>
        <Input
          id="invite-username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="dragonhunter42"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
      <Button type="submit" disabled={pending}>
        Send invitation
      </Button>
    </form>
  );
}
