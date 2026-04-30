-- Stonefoil cards are 1/1 — exactly one copy of each Stonefoil exists in the
-- world. A Dragon Scale row claims ownership of a specific physical card,
-- so at most one DragonScale row can exist globally per Stonefoil cardId.
-- Enforced as a partial unique index keyed on the denormalised treatment
-- column. Other treatments aren't subject to this constraint (Common Classic
-- Foil has no global cap; OCMs have per-rarity caps that need a different
-- index keyed on serialNumber too).
CREATE UNIQUE INDEX "DragonScale_stonefoil_global_unique"
  ON "DragonScale" ("cardId")
  WHERE treatment = 'Stonefoil';
