import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { mapEbayItemsToPriceDataPoints } from "@/lib/ebay/ingest";

type EbaySoldItem = {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  soldDate: string;
  imageUrl: string | null;
  itemUrl: string;
};

function mkItem(overrides: Partial<EbaySoldItem>): EbaySoldItem {
  return {
    price: 10,
    soldDate: "2026-04-01T00:00:00Z",
    itemId: "ebay_default",
    title: "Test",
    currency: "USD",
    imageUrl: null,
    itemUrl: "https://example.com",
    ...overrides,
  };
}

describe("mapEbayItemsToPriceDataPoints", () => {
  it("returns empty array for empty input", () => {
    expect(mapEbayItemsToPriceDataPoints("card_1", [])).toEqual([]);
  });

  it("maps a single valid item to a price data point", () => {
    const items = [
      mkItem({
        price: 12.5,
        soldDate: "2026-04-01T00:00:00Z",
        itemId: "ebay_42",
      }),
    ];

    const result = mapEbayItemsToPriceDataPoints("card_1", items);

    expect(result.length).toBe(1);
    expect(result[0].cardId).toBe("card_1");
    expect(result[0].source).toBe("EBAY_SOLD");
    expect(result[0].condition).toBe("NEAR_MINT");
    expect(result[0].treatment).toBe("Classic Paper");
    expect(result[0].ebayListingId).toBe("ebay_42");
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[0].createdAt.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(result[0].price.eq(new Decimal(12.5))).toBe(true);
  });

  it("filters out non-positive prices", () => {
    const items = [
      mkItem({ price: 10, itemId: "item_1" }),
      mkItem({ price: 0, itemId: "item_2" }),
      mkItem({ price: -5, itemId: "item_3" }),
      mkItem({ price: 7.5, itemId: "item_4" }),
    ];

    const result = mapEbayItemsToPriceDataPoints("card_1", items);

    expect(result.length).toBe(2);
    expect(result[0].price.eq(new Decimal(10))).toBe(true);
    expect(result[1].price.eq(new Decimal(7.5))).toBe(true);
  });

  it("filters out items with invalid soldDate", () => {
    const items = [
      mkItem({ soldDate: "not-a-date", itemId: "bad" }),
      mkItem({ soldDate: "2026-04-01T00:00:00Z", itemId: "good" }),
    ];

    const result = mapEbayItemsToPriceDataPoints("card_1", items);

    expect(result.length).toBe(1);
    expect(result[0].ebayListingId).toBe("good");
  });

  it("drops a row when either date is invalid OR price is non-positive", () => {
    const items = [
      mkItem({ soldDate: "not-a-date", price: 10 }),
      mkItem({ soldDate: "2026-04-01T00:00:00Z", price: 0 }),
      mkItem({ soldDate: "2026-04-01T00:00:00Z", price: 5 }),
    ];

    const result = mapEbayItemsToPriceDataPoints("card_1", items);

    expect(result.length).toBe(1);
    expect(result[0].price.eq(new Decimal(5))).toBe(true);
  });

  it("returns price as a Decimal instance", () => {
    const items = [mkItem({ price: 9.99 })];

    const result = mapEbayItemsToPriceDataPoints("card_1", items);

    expect(result[0].price).toBeInstanceOf(Decimal);
  });
});
