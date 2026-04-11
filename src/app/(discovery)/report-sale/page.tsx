"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONDITIONS = ["MINT", "NEAR_MINT", "LIGHTLY_PLAYED", "MODERATELY_PLAYED", "HEAVILY_PLAYED", "DAMAGED"];
const PLATFORMS = ["Discord", "Facebook", "LGS", "eBay", "TCGPlayer", "Other"];

export default function ReportSalePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [cardSearch, setCardSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; cardNumber: string; treatment: string }>>([]);
  const [selectedCard, setSelectedCard] = useState<{ id: string; name: string; treatment: string } | null>(null);

  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState("NEAR_MINT");
  const [platform, setPlatform] = useState("Discord");
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split("T")[0]);

  async function searchCards(query: string) {
    setCardSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/cards?q=${encodeURIComponent(query)}&limit=10&treatment=all`);
    const data = await res.json();
    setSearchResults((data.data ?? []).map((c: Record<string, unknown>) => ({
      id: c.id, name: c.name, cardNumber: c.cardNumber, treatment: c.treatment,
    })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard) { setError("Select a card"); return; }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/prices/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCard.id,
          price: parseFloat(price),
          condition,
          treatment: selectedCard.treatment,
          platform,
          saleDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed");
        return;
      }
      setSuccess(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="container mx-auto max-w-2xl py-16 px-4 text-center">
        <h2 className="text-2xl font-bold mb-2">Sale Reported</h2>
        <p className="text-muted-foreground mb-6">
          Thank you for contributing to price discovery. Your report will be reviewed by moderators.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => { setSuccess(false); setSelectedCard(null); setPrice(""); }}>
            Report Another
          </Button>
          <Button variant="outline" onClick={() => router.push("/prices")}>
            View Prices
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-2">Report a Sale</h1>
      <p className="text-muted-foreground mb-6">
        Help establish fair market prices by reporting sales from Discord, Facebook, LGS, or other platforms.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Card</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Search card name..." value={cardSearch} onChange={(e) => searchCards(e.target.value)} />
            {searchResults.length > 0 && !selectedCard && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {searchResults.map((c) => (
                  <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                    onClick={() => { setSelectedCard(c); setSearchResults([]); }}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{c.cardNumber} &middot; {c.treatment}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedCard && (
              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <span className="text-sm font-medium">{selectedCard.name} ({selectedCard.treatment})</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedCard(null); setCardSearch(""); }}>Change</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Sale Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sale Price (USD)</Label>
                <Input type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </div>
              <div>
                <Label>Sale Date</Label>
                <Input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => v && setCondition(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={platform} onValueChange={(v) => v && setPlatform(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading || !selectedCard} className="w-full">
          {loading ? "Submitting..." : "Submit Report"}
        </Button>
      </form>
    </div>
  );
}
