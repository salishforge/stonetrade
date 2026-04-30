"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Picker rows from /api/dragon-scales/card-search. Each base card carries
// an array of treatment options; the dialog resolves (base card, treatment)
// to the underlying Card.id before posting.
type CardOption = {
  cardNumber: string;
  name: string;
  rarity: string;
  isStoneseeker: boolean;
  isLoreMythic: boolean;
  isToken: boolean;
  setCode: string;
  setName: string;
  treatments: Array<{ id: string; treatment: string }>;
};

const BONUS_VARIANTS = [
  { value: "NONE", label: "None" },
  { value: "AUTOGRAPH", label: "Autograph" },
  { value: "ALT_ART", label: "Alt Art" },
  { value: "ECHO", label: "Echo" },
  { value: "PROMO", label: "Promo" },
  { value: "ART_PROOF_DIGITAL", label: "Art Proof (Digital)" },
  { value: "PRE_RELEASE_FOIL", label: "Pre-Release Foil" },
] as const;

export function AddScaleDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CardOption[]>([]);
  const [picked, setPicked] = useState<CardOption | null>(null);
  const [pickedTreatmentId, setPickedTreatmentId] = useState<string>("");
  const [bonusVariant, setBonusVariant] = useState<string>("NONE");
  const [quantity, setQuantity] = useState<string>("1");
  const [serialNumber, setSerialNumber] = useState<string>("");
  const [previewPoints, setPreviewPoints] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Debounced search. Results are cleared synchronously by the input's
  // onChange when the query gets short, so the effect itself only fetches
  // and writes — never clears state inline.
  useEffect(() => {
    if (picked) return;
    if (search.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dragon-scales/card-search?q=${encodeURIComponent(search)}&limit=10`,
        );
        const body = await res.json();
        if (!cancelled) setResults(body.data ?? []);
      } catch {
        // Best-effort: keep previous results visible on transient failures.
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, picked]);

  // Live points preview. Refetches whenever the inputs that drive scoring
  // change. Preview is cleared synchronously by the click handlers that
  // change the "picked" state — the effect itself never calls setState
  // directly, only inside the async callback (after the cancellation check).
  useEffect(() => {
    if (!picked || !pickedTreatmentId) return;
    const qty = Math.max(1, parseInt(quantity || "1", 10));
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/dragon-scales/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: pickedTreatmentId,
            bonusVariant,
            quantity: qty,
          }),
        });
        const body = await res.json();
        if (!cancelled && res.ok) {
          setPreviewPoints(body.data?.total ?? 0);
        }
      } catch {
        // Preview is best-effort; leave the previous value in place.
      }
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [picked, pickedTreatmentId, bonusVariant, quantity]);

  function reset() {
    setSearch("");
    setResults([]);
    setPicked(null);
    setPickedTreatmentId("");
    setBonusVariant("NONE");
    setQuantity("1");
    setSerialNumber("");
    setPreviewPoints(null);
    setError(null);
  }

  async function handleSubmit() {
    if (!picked || !pickedTreatmentId) {
      setError("Pick a card and a treatment");
      return;
    }
    setError(null);
    try {
      const res = await fetch("/api/dragon-scales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: pickedTreatmentId,
          bonusVariant: picked.isToken ? "NONE" : bonusVariant,
          quantity: parseInt(quantity, 10) || 1,
          serialNumber: serialNumber.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Failed to add scale");
        return;
      }
      reset();
      setOpen(false);
      startTransition(() => router.refresh());
    } catch {
      setError("Something went wrong");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button>Add Scale</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Dragon Scale</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!picked ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="dragon-search">Search card</Label>
                <Input
                  id="dragon-search"
                  placeholder="Card name…"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearch(v);
                    if (v.trim().length < 2) setResults([]);
                  }}
                />
              </div>
              {results.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-y-auto divide-y">
                  {results.map((r) => (
                    <button
                      key={`${r.setCode}-${r.cardNumber}`}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => {
                        setPicked(r);
                        // Default to the first treatment option so points
                        // preview can fire immediately.
                        setPickedTreatmentId(r.treatments[0]?.id ?? "");
                      }}
                    >
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.setCode} · {r.cardNumber} · {r.rarity}
                        {r.isToken ? " · Token" : ""}
                        {r.isStoneseeker ? " · Stoneseeker" : ""}
                        {r.isLoreMythic ? " · Lore Mythic" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="rounded-md border p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{picked.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {picked.setCode} · {picked.cardNumber} · {picked.rarity}
                      {picked.isToken ? " · Token" : ""}
                      {picked.isStoneseeker ? " · Stoneseeker" : ""}
                      {picked.isLoreMythic ? " · Lore Mythic" : ""}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPicked(null);
                      setPickedTreatmentId("");
                      setPreviewPoints(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dragon-treatment">Treatment</Label>
                <select
                  id="dragon-treatment"
                  className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
                  value={pickedTreatmentId}
                  onChange={(e) => setPickedTreatmentId(e.target.value)}
                >
                  {picked.treatments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.treatment}
                    </option>
                  ))}
                </select>
              </div>

              {!picked.isToken && (
                <div className="space-y-1.5">
                  <Label htmlFor="dragon-bonus">Bonus variant</Label>
                  <select
                    id="dragon-bonus"
                    className="w-full h-9 rounded-md border bg-transparent px-2 text-sm"
                    value={bonusVariant}
                    onChange={(e) => setBonusVariant(e.target.value)}
                  >
                    {BONUS_VARIANTS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dragon-qty">Quantity</Label>
                  <Input
                    id="dragon-qty"
                    type="number"
                    min={1}
                    max={999}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dragon-serial">Serial # (optional)</Label>
                  <Input
                    id="dragon-serial"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                  />
                </div>
              </div>

              {previewPoints != null && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  Preview: <span className="font-semibold">{previewPoints.toLocaleString()}</span> Dragon Points
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !picked || !pickedTreatmentId}
          >
            Add to Binder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
