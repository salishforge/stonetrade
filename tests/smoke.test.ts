import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";

describe("smoke", () => {
  it("imports and runs", () => {
    expect(new Decimal("1.50").plus("0.25").toString()).toBe("1.75");
  });
});
