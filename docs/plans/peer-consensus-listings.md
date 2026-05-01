# Peer-Consensus Listings — pricing thin-market cards

**Status:** OUTLINE · framework only
**Owner:** TBD
**Differentiator wedge:** §5 of `differentiation-strategy.md`

---

## 1. The problem

A card with `<5` `PriceDataPoint` rows has no defensible composite value. Today we degrade gracefully to engine-prior estimates (`MIN_DATA_POINTS_FOR_TRANSACTIONAL` in `src/lib/pricing/constants.ts`), but for a serialized stonefoil 1/1 or a fresh-from-set rare with no completed sales, even that's thin.

Generic marketplaces give up here and let the price be whatever the seller says. **StoneTrade has a community.** We can route the price through them.

## 2. The mechanic

A seller listing a card whose composite-value confidence is **below threshold T** (say, 30/100) optionally toggles **Consensus mode**:

1. Seller proposes a price.
2. Listing enters `PENDING_CONSENSUS` status — visible to buyers but not purchasable.
3. The system invites N qualified valuators (selected from collectors who own this card or similar high-PRI cards) to confirm or counter the price.
4. Once K of N valuators have weighed in:
   - Median valuation within ±10% of seller's ask → listing **goes live** at the seller's price.
   - Median outside ±10% → seller is shown the median and asked to adjust or keep their price (which then publishes anyway, with a `ConsensusFlag` warning chip on the listing).

The valuator action is a single tap: "fair", "high", "low", with optional own-price suggestion. This generates the same kind of signal `ValuePoll` does today, but anchored to a specific listing.

## 3. What's already there

Schema fields exist on `Listing` (per the codebase audit): `requiresConsensus`, `consensusGroupId`. The wiring is missing but the slot is reserved.

`ValuePoll` already proves the community-voting machinery works.

## 4. Implementation outline

### Phase 1 — Reuse ValuePoll, extend listing flow
- Add `Listing.status = PENDING_CONSENSUS`
- When `requiresConsensus = true`, on listing create:
  - listing enters `PENDING_CONSENSUS`
  - spawn a `ValuePoll` with the seller's price as the central anchor
  - poll respondents: invited via existing alert/notification surface
- New cron worker: every hour, evaluate `PENDING_CONSENSUS` listings
  - if K responses received, compute median, decide go-live vs hold

### Phase 2 — Valuator selection
- Collector signal: users with this card in `Collection` get priority invites
- Engine signal: users who own ≥3 cards within ±15 PRI band get secondary invites
- Reputation signal: users whose past `ValuePoll` votes correlated with subsequent market moves get weighted higher
- Expose all of this as a `valuatorScore` per `(user, cardId)` pair, computed lazily

### Phase 3 — Listing surface
- Public listing card shows a `CONSENSUS PENDING` chip while in that state, replacing the price with "valuating · 3/7 votes in"
- Once live, a consensus-cleared listing gets a small `consensus ✓` badge — earned trust signal
- If listing publishes despite consensus disagreement, surface that honestly: `ABOVE CONSENSUS` warning chip, links to the poll outcome

### Phase 4 — Buyer protection
- Auto-flag listings priced >2σ above consensus median
- Optional: refund if the buyer can show within 30d the consensus median was substantially lower (this is the strongest version of the trust contract; lighter v1 doesn't need it)

## 5. Why this is hard to copy

The mechanic only works if you have:
1. A confidence score on every market value (we do)
2. A community willing to vote (we do — `ValuePoll` proves it)
3. Engine-derived ownership/skill data to select valuators (we do — `CardEngineMetrics`)
4. A way to reach valuators quickly (we do — `UserAlert` + email)

TCGplayer / Cardmarket have none of (1), (3), or the cultural fit for (2). This is a feature that's structurally hard to bolt onto an existing generic marketplace.

## 6. Risk and unknowns

- **Cold-start.** First few weeks, we don't have enough qualified valuators per card. Bootstrap with: any user with the card in Collection counts as qualified; admins manually vote on the first 50 cards through the system.
- **Valuator collusion.** A seller and friend co-vote to clear an inflated price. Mitigation: lookup connection graph (recent trades, mutual followings) and exclude socially-close pairs from the valuator set.
- **What if the seller doesn't want to wait?** They can still publish without consensus — they just don't get the badge. Consensus is opt-in for sellers who want the trust signal.
- **K and N tuning.** Probably K=5, N=10 to start; lower for very thin pools. Make these admin-tunable per game.

## 7. When to build

Only relevant once a non-trivial number of cards have `confidence < 30`. Right now the marketplace is small enough that most cards are in that bucket — but most users are too. Building this before there are valuators to participate would create a bad first impression. **Wait until ≥500 active users; then this is the next high-leverage trust feature.**

## 8. Pickup notes

The cleanest first commit is **schema + the consensus poll spawning logic**, with no UI. Listings flow through `PENDING_CONSENSUS` automatically when `requiresConsensus=true`. Then UI lands incrementally without rewriting the lifecycle.

The valuator-scoring code is the technically interesting part — it's where the "hard to copy" claim becomes real. Worth investing in proper testing (combinatorial mock collections, predictive validation against historical market moves) before letting it gate listings.
