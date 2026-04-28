# StoneTrade Frontend Design Doctrine

**Status:** v0.1
**Sister doc:** `wonders-ccg-platform/docs/beta-plan/frontend-design-doctrine.md` is the source of truth for the shared design language. This document inherits everything there and articulates the marketplace-specific adaptations.

---

## 1. Thesis

If the Wonders platform is **a card table at 11pm in a quiet backroom**, StoneTrade is **the dealer's counter at a card show in the same building**. Same warm wood, same low light, same brass nameplates, same room-tone — but the staging is different. Cards are laid out on velvet for inspection. Prices are written on the felt in a clean hand. The seller knows their stock; the buyer knows their value; the dealer's read on a card is a **price stack**, not a chatbot opinion.

The one-sentence test: *if a spectator walks past and sees the screen from six feet away, they know this is a price-discovery terminal for serious collectors, not an e-commerce template.*

The two products feel like **rooms in the same building**, not like the same product. The platform is the table; StoneTrade is the showcase. They share fonts, palette, motion, and tone. They diverge in what's surfaced: the platform foregrounds gameplay state; StoneTrade foregrounds **prices, supply, demand, and provenance**.

---

## 2. Adopted from the platform doctrine, verbatim

- **Palette.** Warm-backroom dark — `surface.base #0e0c11` / `surface.raised #18151f` / `surface.overlay #231f2d`, parchment ink, aged-brass gold (`#c49a3c`) as the accent, oxidized crimson for danger/cancelled. No light mode. Defined in `src/app/globals.css`, mirrored from the platform's `tokens.css.ts`.
- **Typography.** Fraunces (display, with `opsz` axis), Inter (body and nav), JetBrains Mono (every numeric value).
- **Anti-references.** Every item from §3 of the platform doctrine applies here too. Specifically: no shadcn purple-gradient defaults, no glassmorphism, no Lucide icon soup, no rainbow utility gradients on buttons, no Framer hero shimmer, no toast spam, no emoji.
- **Motion.** Settle / pop / glide easings, no idle motion, prefers-reduced-motion is a supported mode. The marketplace has fewer reserved 600ms moments than the game; we save those for **price reveals on a successful negotiation** and **listing-published confirmation**.

---

## 3. Adapted: marketplace metaphors

| Platform concept | StoneTrade analogue |
|---|---|
| The seven-realm playmat | The card showcase grid |
| The active realm light cone | The **price stack** that opens beside a card on hover |
| The AI coach sidebar | The **price advisory panel** — same precise voice, same "my read" register, but it's reasoning about market value, not rules legality |
| Stones on a divider (resource state) | **Market mid + low + high + confidence + scarcity tier**, displayed in a tight monospace stack on every card surface |
| Card play landing with weight | A listing being published, settling onto the showcase with the same overshoot |
| Rules-check warm-amber border | "Awaiting moderation" or "Listing flagged" — same warm-amber treatment for advisory states |

The **price stack** is the single most important UI atom in the marketplace. It is what distinguishes StoneTrade from "another card marketplace" — the same way the rules-check sidebar distinguishes the platform from Tabletop Simulator. A buyer should be able to look at a card and read, in one glance:

- The composite market mid
- The low/high range
- A confidence percentage
- A trend indicator (7d arrow)
- A scarcity tier badge (abundant / available / scarce / acute)
- A volatility tier badge (stable / moderate / volatile / extreme)

All in tight tabular monospace. Bloomberg Terminal density. No "Show details" accordion. **The numbers are the product.**

---

## 4. Tone of voice

The marketplace's voice is the **dealer's voice**: precise, factual, slightly old-fashioned. Not a chatbot. Not a marketing brand. A person who has handled enough cards to know what they're worth and won't tell you a story about it.

- **Empty states** are factual, not playful. *"No listings yet for this card."* Not *"Looks pretty empty in here! 👀"*
- **Errors** name what happened. *"This listing was claimed by another buyer."* Not *"Oops — something went wrong!"*
- **Calls to action** are imperatives in plain English. *"List a card"* / *"Make an offer"*. Not *"Get started for free"*.
- **Numbers are never rounded for vibes.** $42.50, not "around $43". $0.87 confidence, not "high confidence" alone.

Every advisory message should pass the test: *would a dealer at a card show actually phrase it this way?* If the answer is "they'd just point at the card and shrug", the copy is too chatty.

---

## 5. Anti-vibe-coded checklist

When reviewing a screen, ask:

- [ ] Could this be the landing page for any B2B SaaS launched in the last 18 months? → if yes, restart.
- [ ] Are there `from-X-500 to-Y-500` gradient utilities anywhere? → strip.
- [ ] Are there 16px Lucide icons next to every label? → drop the icon, keep the label.
- [ ] Are numbers in the body font? → wrong. Numbers are mono.
- [ ] Is there a "Hero section" with a fade-up headline and a shimmer button? → wrong screen format. We start in a **showcase**, not on a marketing page.
- [ ] Is there an emoji anywhere in the chrome? → remove.
- [ ] Does a competitive collector know what they're looking at from six feet away? → if not, the information density is wrong.

---

## 6. Implementation status

- ✅ Tokens in `src/app/globals.css` (mirrors platform `tokens.css.ts`)
- ✅ Fonts in `src/app/layout.tsx` (Fraunces / Inter / JetBrains Mono)
- ✅ Header chrome refined (small caps nav, Fraunces wordmark)
- ✅ Home page rewritten as a "dealer counter" — recent listings + recent sales, no marketing hero
- ✅ `PriceStack` component for inline Bloomberg-density price display
- 🟡 Card detail page — uses tokens but information density not yet at terminal level
- 🟡 Browse + search pages — use the new tokens, still need a more "showcase" feel
- ⏸ Motion polish (settle eases on card grid, listing publish confirmation) — TODO
- ⏸ Custom shadcn primitives (Button, Card, Badge variant overrides) — currently theme-driven via CSS vars; explicit variants come once the design system stabilizes

## 7. Next slices

1. Apply the price-stack to the card detail page hero — the price is the loudest thing on the page, not the image.
2. Listings index — Bloomberg-style row layout for power users; card-grid is the default for browsers.
3. Empty states — sweep the codebase for stub copy and replace with the dealer voice.
4. Motion: card grid hover lift (`settle` ease, 4px), listing publish settle (`pop` ease, 220ms).
