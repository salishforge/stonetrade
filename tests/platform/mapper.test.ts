import { describe, it, expect, beforeAll } from "vitest";
import type { PlatformCardData } from "@/types/platform";

let mapPlatformCardToMarketplace: typeof import("@/lib/platform/mapper").mapPlatformCardToMarketplace;

beforeAll(async () => {
  ({ mapPlatformCardToMarketplace } = await import("@/lib/platform/mapper"));
});

const baseCard: PlatformCardData = {
  card_number: "001",
  name: "Test",
  card_type: "Wonder",
  power: null,
  cost: 0,
  orbital: "Order",
  tier: "Primary",
  rarity: "common",
  abilities: ["Draw a card"],
  parsed_abilities: [],
  synergies: [],
  counters: [],
  dbs_score: 50,
  set_name: "Existence",
  release_date: null,
  classes: [],
  faction: null,
  is_core: false,
  is_equipment: false,
  is_token: false,
  flavor_text: "Once whispered, always heard.",
};

describe("mapPlatformCardToMarketplace", () => {
  it("emits one variant per WoTF treatment, all sharing core fields", async () => {
    const variants = mapPlatformCardToMarketplace(baseCard, "g1", "s1");
    expect(variants).toHaveLength(5); // WOTF_TREATMENTS length
    expect(variants.every((v) => v.name === "Test")).toBe(true);
    expect(variants.every((v) => v.cardNumber === "001/401")).toBe(true);
  });

  it("filters tokens out", async () => {
    const variants = mapPlatformCardToMarketplace({ ...baseCard, is_token: true }, "g1", "s1");
    expect(variants).toEqual([]);
  });

  it("imageUrl: bare collector number gets Existence_ prefix", async () => {
    const variants = mapPlatformCardToMarketplace(baseCard, "g1", "s1");
    expect(variants[0].imageUrl).toMatch(/\/Existence_001\.webp$/);
  });

  it("imageUrl: T- collector number gets Existence_T- prefix", async () => {
    const variants = mapPlatformCardToMarketplace({ ...baseCard, card_number: "T-029" }, "g1", "s1");
    expect(variants[0].imageUrl).toMatch(/\/Existence_T-029\.webp$/);
  });

  it("imageUrl: CotS prefix is preserved as-is", async () => {
    const variants = mapPlatformCardToMarketplace({ ...baseCard, card_number: "CotS_282" }, "g1", "s1");
    expect(variants[0].imageUrl).toMatch(/\/CotS_282\.webp$/);
  });

  it("imageUrl: E_ prefix is replaced with Existence_ (drops the E_)", async () => {
    const variants = mapPlatformCardToMarketplace({ ...baseCard, card_number: "E_036" }, "g1", "s1");
    expect(variants[0].imageUrl).toMatch(/\/Existence_036\.webp$/);
    expect(variants[0].imageUrl).not.toMatch(/E_036/);
  });

  it("imageUrl: existing image_url from platform takes precedence over derived", async () => {
    const variants = mapPlatformCardToMarketplace(
      { ...baseCard, image_url: "https://cdn.example/foo.webp" },
      "g1",
      "s1",
    );
    expect(variants[0].imageUrl).toBe("https://cdn.example/foo.webp");
  });

  it("flavorText is propagated", async () => {
    const variants = mapPlatformCardToMarketplace(baseCard, "g1", "s1");
    expect(variants[0].flavorText).toBe("Once whispered, always heard.");
  });

  it("rarity: single-letter codes expand to long forms (CotS exports use these)", async () => {
    const cases: Array<[string, string]> = [
      ["C", "Common"],
      ["U", "Uncommon"],
      ["R", "Rare"],
      ["E", "Epic"],
      ["M", "Mythic"],
    ];
    for (const [input, expected] of cases) {
      const variants = mapPlatformCardToMarketplace({ ...baseCard, rarity: input }, "g1", "s1");
      expect(variants[0].rarity).toBe(expected);
    }
  });

  it("rarity: long-form lowercase still capitalises (Existence platform format)", async () => {
    const variants = mapPlatformCardToMarketplace({ ...baseCard, rarity: "epic" }, "g1", "s1");
    expect(variants[0].rarity).toBe("Epic");
  });

  it("respects WONDERS_PLATFORM_IMAGE_BASE_URL override", async () => {
    const original = process.env.WONDERS_PLATFORM_IMAGE_BASE_URL;
    process.env.WONDERS_PLATFORM_IMAGE_BASE_URL = "https://cdn.example/wotf";
    try {
      const variants = mapPlatformCardToMarketplace(baseCard, "g1", "s1");
      expect(variants[0].imageUrl).toBe("https://cdn.example/wotf/Existence_001.webp");
    } finally {
      if (original === undefined) delete process.env.WONDERS_PLATFORM_IMAGE_BASE_URL;
      else process.env.WONDERS_PLATFORM_IMAGE_BASE_URL = original;
    }
  });
});
