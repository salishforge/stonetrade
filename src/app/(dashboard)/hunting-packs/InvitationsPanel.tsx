"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Invitation = {
  id: string;
  token: string;
  pack: { name: string; slug: string };
  inviter: { username: string; displayName: string | null };
};

export function InvitationsPanel({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  async function respond(token: string, action: "accept" | "decline") {
    setBusy(token);
    try {
      const res = await fetch(`/api/invitations/${token}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        alert(body.error ?? "Failed");
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Pending invitations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between border rounded-md px-3 py-2"
          >
            <div className="text-sm">
              <span className="font-medium">{i.pack.name}</span>{" "}
              <span className="text-muted-foreground">
                — invited by {i.inviter.displayName ?? i.inviter.username}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => respond(i.token, "accept")}
                disabled={pending || busy === i.token}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => respond(i.token, "decline")}
                disabled={pending || busy === i.token}
              >
                Decline
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
