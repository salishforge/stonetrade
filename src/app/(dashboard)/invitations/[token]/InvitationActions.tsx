"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function InvitationActions({
  token,
  packSlug,
}: {
  token: string;
  packSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function respond(action: "accept" | "decline") {
    const res = await fetch(`/api/invitations/${token}/${action}`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      alert(body.error ?? "Failed");
      return;
    }
    if (action === "accept") {
      startTransition(() => router.push(`/hunting-packs/${packSlug}`));
    } else {
      startTransition(() => router.push("/hunting-packs"));
    }
  }

  return (
    <div className="flex gap-2 pt-2">
      <Button onClick={() => respond("accept")} disabled={pending}>
        Accept
      </Button>
      <Button variant="outline" onClick={() => respond("decline")} disabled={pending}>
        Decline
      </Button>
    </div>
  );
}
