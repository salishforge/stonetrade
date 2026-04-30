import { Decimal } from "decimal.js";

type EbaySoldItem = {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  soldDate: string;
  imageUrl: string | null;
  itemUrl: string;
};

export function mapEbayItemsToPriceDataPoints(
  cardId: string,
  items: EbaySoldItem[],
): Array<{
  cardId: string;
  source: "EBAY_SOLD";
  price: Decimal;
  condition: "NEAR_MINT";
  treatment: string;
  ebayListingId: string;
  createdAt: Date;
}> {
  const validRows = items
    .map((item) => {
      const soldDate = new Date(item.soldDate);
      const price = new Decimal(item.price);

      if (price.isZero() || price.isNegative()) {
        return null;
      }

      if (Number.isNaN(soldDate.getTime())) {
        return null;
      }

      return {
        cardId,
        source: "EBAY_SOLD" as const,
        price,
        condition: "NEAR_MINT" as const,
        // Condition not reliably exposed by eBay Browse API; default NM. Treatment + condition refinement is future work.
        treatment: "Classic Paper",
        ebayListingId: item.itemId,
        createdAt: soldDate,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return validRows;
}

export type { EbaySoldItem };
