"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignButton({
  packId,
  versionId,
  roles,
}: {
  packId: string;
  versionId: string;
  roles: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function sign() {
    if (
      !confirm(
        `By signing you record your approval of this version's terms (hash + IP + timestamp). Continue?`,
      )
    ) {
      return;
    }
    const res = await fetch(
      `/api/hunting-packs/${packId}/contract/versions/${versionId}/sign`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const body = await res.json();
    if (!res.ok) {
      alert(body.error ?? "Failed to sign");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <Button onClick={sign} disabled={pending}>
      Sign{roles.length > 1 ? ` (${roles.length} roles)` : ""}
    </Button>
  );
}
