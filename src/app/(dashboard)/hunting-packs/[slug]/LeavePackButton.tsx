"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LeavePackButton({
  packId,
  disabled,
  disabledReason,
}: {
  packId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function leave() {
    if (!confirm("Leave this Hunting Pack? Your scales will no longer count toward the pack Dragon.")) return;
    const res = await fetch(`/api/hunting-packs/${packId}/leave`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      alert(body.error ?? "Failed");
      return;
    }
    startTransition(() => router.push("/hunting-packs"));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={leave} disabled={pending || disabled}>
        Leave pack
      </Button>
      {disabled && disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
    </div>
  );
}
