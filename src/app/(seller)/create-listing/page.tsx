"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONDITIONS = [
  { value: "MINT", label: "Mint" },
  { value: "NEAR_MINT", label: "Near Mint" },
  { value: "LIGHTLY_PLAYED", label: "Lightly Played" },
  { value: "MODERATELY_PLAYED", label: "Moderately Played" },
  { value: "HEAVILY_PLAYED", label: "Heavily Played" },
  { value: "DAMAGED", label: "Damaged" },
];

export default function CreateListingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card search state
  const [cardSearch, setCardSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; cardNumber: string; treatment: string; rarity: string }>>([]);
  const [selectedCard, setSelectedCard] = useState<{ id: string; name: string; treatment: string } | null>(null);

  // Form state
  const [condition, setCondition] = useState("NEAR_MINT");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [allowOffers, setAllowOffers] = useState(true);
  const [shipsFrom, setShipsFrom] = useState("");

  async function searchCards(query: string) {
    setCardSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const res = await fetch(`/api/cards?q=${encodeURIComponent(query)}&limit=10&treatment=all`);
    const data = await res.json();
    setSearchResults(
      (data.data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id,
        name: c.name,
        cardNumber: c.cardNumber,
        treatment: c.treatment,
        rarity: c.rarity,
      })),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCard) {
      setError("Please select a card");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedCard.id,
          condition,
          treatment: selectedCard.treatment,
          price: parseFloat(price),
          quantity: parseInt(quantity, 10),
          allowOffers,
          shipsFrom: shipsFrom || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create listing");
        return;
      }

      router.push(`/listing/${data.data.id}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Create Listing</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card Search */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Card</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by card name..."
              value={cardSearch}
              onChange={(e) => searchCards(e.target.value)}
            />
            {searchResults.length > 0 && !selectedCard && (
              <div className="border rounded-md max-h-48 overflow-y-auto">
                {searchResults.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                    onClick={() => {
                      setSelectedCard({ id: card.id, name: card.name, treatment: card.treatment });
                      setSearchResults([]);
                    }}
                  >
                    <span className="font-medium">{card.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {card.cardNumber} &middot; {card.treatment} &middot; {card.rarity}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {selectedCard && (
              <div className="flex items-center justify-between bg-muted p-2 rounded-md">
                <span className="text-sm font-medium">{selectedCard.name} ({selectedCard.treatment})</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedCard(null); setCardSearch(""); }}
                >
                  Change
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Listing Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Condition</Label>
              <Select value={condition} onValueChange={(v) => v && setCondition(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (USD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allowOffers"
                checked={allowOffers}
                onChange={(e) => setAllowOffers(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="allowOffers">Allow offers from buyers</Label>
            </div>

            <div>
              <Label>Ships From</Label>
              <Input
                placeholder="e.g., United States"
                value={shipsFrom}
                onChange={(e) => setShipsFrom(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button type="submit" disabled={loading || !selectedCard} className="w-full">
          {loading ? "Creating..." : "Create Listing"}
        </Button>
      </form>
    </div>
  );
}
