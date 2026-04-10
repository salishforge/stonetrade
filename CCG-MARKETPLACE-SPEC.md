# CCG Marketplace — Claude Code Build Specification

## Project: StoneTrade (Working Title)

**A community-driven marketplace and price discovery platform for emerging CCGs, starting with Wonders of the First and Bo Jackson Battle Arena.**

---

## 1. Project Overview

### Problem Statement

Wonders of the First (WoTF) and Bo Jackson Battle Arena (BJBA) are new CCGs with no established market values. Neither game is listed on TCGPlayer. eBay sales exist for a subset of cards but there is no API access yet (developer token requested). Collectors and sellers have no centralized platform for trading, tracking collections, or understanding card values.

### Core Mission

Build a marketplace that simultaneously serves as a **price discovery engine** — gathering enough transaction and sentiment data to establish credible market values, positioning these games for eventual TCGPlayer inclusion or becoming the de facto pricing authority ourselves.

### Key Differentiators

- **Price discovery for games with no established values** — the platform IS the pricing oracle
- **Seller-managed stock** — no physical inventory held by the platform (like eBay, Purplemana, CardTrader)
- **Mystery pack support** — sellers create curated mystery packs with guaranteed value tiers
- **Carde.io integration path** — connect tournament performance to card valuation
- **Multi-game from day one** — WoTF and BJBA with architecture for adding games

---

## 2. Tech Stack

```
Framework:       Next.js 15 (App Router)
Language:        TypeScript (strict mode)
Database:        PostgreSQL 16 via Supabase
ORM:             Prisma
Auth:            Supabase Auth (email, Google, Discord OAuth)
Payments:        Stripe Connect (marketplace split payments)
Search:          Meilisearch (card search, filters, facets)
Real-time:       Supabase Realtime (offers, notifications)
File Storage:    Supabase Storage (card images, seller photos)
Email:           Resend (transactional emails)
AI:              Anthropic Claude API (price analysis, card identification)
Deployment:      Vercel (frontend) + Railway or Fly.io (services)
Monitoring:      Sentry + PostHog analytics
```

---

## 3. Data Model — Card Database

### 3.1 Game Registry

```prisma
model Game {
  id          String   @id @default(cuid())
  name        String   // "Wonders of the First", "Bo Jackson Battle Arena"
  slug        String   @unique // "wotf", "bjba"
  publisher   String
  website     String
  logoUrl     String?
  description String?
  createdAt   DateTime @default(now())
  sets        Set[]
  cards       Card[]
}
```

### 3.2 Sets and Cards

```prisma
model Set {
  id           String   @id @default(cuid())
  gameId       String
  game         Game     @relation(fields: [gameId], references: [id])
  name         String   // "Existence", "Alpha Edition"
  code         String   // "EX1", "ALPHA"
  releaseDate  DateTime?
  totalCards   Int
  description  String?
  cards        Card[]
}

model Card {
  id              String   @id @default(cuid())
  gameId          String
  game            Game     @relation(fields: [gameId], references: [id])
  setId           String
  set             Set      @relation(fields: [setId], references: [id])
  
  // Identity
  cardNumber      String   // "001/401", "#12"
  name            String   // "Existence The First", "Burrocious"
  
  // WoTF-specific
  orbital         String?  // "Petraia", "Solfera", "Thalwind", "Umbrathene", "Heliosynth", "Boundless"
  
  // BJBA-specific  
  athlete         String?  // Associated athlete name
  teamAffiliation String?
  
  // Shared attributes
  rarity          String   // Common, Uncommon, Rare, Epic, Mythic (WoTF) / SP, SSP (BJBA)
  cardType        String   // Wonder, Spell, Item, Land (WoTF) / Hero, Support, Action (BJBA)
  treatment       String   // Classic Paper, Classic Foil, Formless Foil, OCM, Stonefoil (WoTF)
                           // Base, Superfoil, Inspired Ink Auto (BJBA)
  buildPoints     Int?     // WoTF Dynamic Balance Score component
  
  // Serialization
  isSerialized    Boolean  @default(false)
  serialTotal     Int?     // e.g., /10 for Mythic OCM, /25 for Epic OCM
  
  // Media
  imageUrl        String?
  imageUrlBack    String?
  
  // Metadata
  flavorText      String?
  rulesText       String?
  artist          String?
  
  // Relations
  listings        Listing[]
  priceHistory    PriceDataPoint[]
  valuePollVotes  ValuePollVote[]
  buylistEntries  BuylistEntry[]
  collectionCards CollectionCard[]
  
  @@unique([setId, cardNumber, treatment])
  @@index([gameId, name])
  @@index([rarity])
  @@index([orbital])
}
```

### 3.3 WoTF Card Data — Seed Reference

Existence Set: 401 base cards across 6 Orbitals + Boundless

| Rarity   | Count | OCM Serial Limit |
|----------|-------|------------------|
| Common   | 91    | /99              |
| Uncommon | 84    | /75              |
| Rare     | 84    | /50              |
| Epic     | 74    | /25              |
| Mythic   | 70    | /10              |

**Treatments per card:**
- Classic Paper (base)
- Classic Foil
- Formless Foil
- Orbital Color Match (OCM) — serialized, color-changing border
- Stonefoil — unique 1/1

**BJBA Alpha Edition** — base set with numbered parallels, SP heroes, Superfoil 1/1s, Inspired Ink on-card autographs.

---

## 4. Price Discovery Engine

This is the core innovation. With no TCGPlayer data and limited eBay sales, the platform must bootstrap market values through multiple signal types.

### 4.1 Price Signal Sources

```prisma
model PriceDataPoint {
  id          String   @id @default(cuid())
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  
  source      PriceSource
  price       Decimal  @db.Decimal(10, 2)
  condition   CardCondition
  treatment   String
  
  // Source-specific
  ebayListingId  String?   // When eBay API available
  listingId      String?   // Internal marketplace sale
  pollId         String?   // Community poll result
  
  reportedBy  String?      // userId for manual reports
  verified    Boolean  @default(false)
  
  createdAt   DateTime @default(now())
  
  @@index([cardId, createdAt])
  @@index([source])
}

enum PriceSource {
  SELLER_LISTING       // What sellers are asking
  COMPLETED_SALE       // Actual transaction on our platform
  EBAY_SOLD            // eBay completed sale (when API available)
  EBAY_LISTED          // eBay current listing (reference only)
  COMMUNITY_POLL       // Aggregated poll result
  BUYLIST_OFFER        // What buyers are willing to pay
  MANUAL_REPORT        // User-reported sale from Discord, Facebook, etc.
  AI_ESTIMATE          // Claude-generated estimate based on comparables
}

enum CardCondition {
  MINT
  NEAR_MINT
  LIGHTLY_PLAYED
  MODERATELY_PLAYED
  HEAVILY_PLAYED
  DAMAGED
}
```

### 4.2 Composite Market Value Algorithm

Since no single source is reliable alone, compute a weighted composite:

```typescript
interface MarketValueInputs {
  completedSales: PriceDataPoint[];      // Weight: 0.40 (highest confidence)
  activeListings: PriceDataPoint[];      // Weight: 0.15 (ceiling indicator)
  buylistOffers: PriceDataPoint[];       // Weight: 0.20 (floor indicator)
  communityPolls: PriceDataPoint[];      // Weight: 0.10
  ebaySold: PriceDataPoint[];           // Weight: 0.10 (when available)
  manualReports: PriceDataPoint[];      // Weight: 0.05
}

// Calculated fields stored on a materialized view or computed table:
model CardMarketValue {
  id              String   @id @default(cuid())
  cardId          String   @unique
  card            Card     @relation(fields: [cardId], references: [id])
  
  // Composite values by condition (NM default)
  marketLow       Decimal? @db.Decimal(10, 2)  // 25th percentile
  marketMid       Decimal? @db.Decimal(10, 2)  // Weighted median
  marketHigh      Decimal? @db.Decimal(10, 2)  // 75th percentile
  
  // Signal counts (transparency)
  totalSales      Int      @default(0)
  totalListings   Int      @default(0)
  totalBuylist    Int      @default(0)
  totalPollVotes  Int      @default(0)
  
  // Confidence score (0-100)
  confidence      Int      @default(0)  // Based on volume + recency + source diversity
  
  // Trend
  trend7d         Decimal? @db.Decimal(5, 2)  // % change over 7 days
  trend30d        Decimal? @db.Decimal(5, 2)
  
  lastUpdated     DateTime @default(now())
  
  @@index([confidence])
}
```

### 4.3 Community Price Polls

Allow the community to vote on card values when transaction data is thin.

```prisma
model ValuePoll {
  id          String   @id @default(cuid())
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  treatment   String
  condition   CardCondition @default(NEAR_MINT)
  
  // Poll config
  priceRanges Json     // [{min: 0, max: 5, label: "$0-5"}, {min: 5, max: 15, label: "$5-15"}, ...]
  status      PollStatus @default(ACTIVE)
  
  expiresAt   DateTime
  createdAt   DateTime @default(now())
  
  votes       ValuePollVote[]
}

model ValuePollVote {
  id          String   @id @default(cuid())
  pollId      String
  poll        ValuePoll @relation(fields: [pollId], references: [id])
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  
  selectedRange Int    // Index into priceRanges
  exactEstimate Decimal? @db.Decimal(10, 2) // Optional exact value input
  
  // Voter credibility weighting
  voterWeight   Float  @default(1.0) // Increases with transaction history
  
  createdAt   DateTime @default(now())
  
  @@unique([pollId, userId])
}
```

### 4.4 Buylist System

Buyers publicly post what they're willing to pay — establishes price floors.

```prisma
model Buylist {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String   // "John's WoTF Wants"
  isPublic    Boolean  @default(true)
  
  entries     BuylistEntry[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model BuylistEntry {
  id          String   @id @default(cuid())
  buylistId   String
  buylist     Buylist  @relation(fields: [buylistId], references: [id])
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  
  maxPrice    Decimal  @db.Decimal(10, 2)
  condition   CardCondition @default(NEAR_MINT)
  treatment   String
  quantity    Int      @default(1)
  
  // Auto-match: notify when a listing appears at or below maxPrice
  autoNotify  Boolean  @default(true)
  
  @@unique([buylistId, cardId, treatment, condition])
}
```

### 4.5 Manual Sale Reports

Let users report sales from other channels (Discord, Facebook groups, LGS):

```prisma
model SaleReport {
  id          String   @id @default(cuid())
  reporterId  String
  reporter    User     @relation(fields: [reporterId], references: [id])
  cardId      String
  card        Card     @relation(fields: [cardId], references: [id])
  
  price       Decimal  @db.Decimal(10, 2)
  condition   CardCondition
  treatment   String
  platform    String   // "Discord", "Facebook", "LGS", "eBay", "Other"
  
  // Verification
  proofUrl    String?  // Screenshot URL
  verified    Boolean  @default(false)
  verifiedBy  String?  // Moderator userId
  
  saleDate    DateTime
  createdAt   DateTime @default(now())
}
```

---

## 5. Marketplace

### 5.1 Listings

```prisma
model Listing {
  id          String   @id @default(cuid())
  sellerId    String
  seller      User     @relation("SellerListings", fields: [sellerId], references: [id])
  
  // What's being sold
  type        ListingType
  cardId      String?
  card        Card?    @relation(fields: [cardId], references: [id])
  
  // Card details
  condition   CardCondition?
  treatment   String?
  serialNumber String? // For OCM/serialized cards
  
  // Pricing
  price       Decimal  @db.Decimal(10, 2)
  currency    String   @default("USD")
  allowOffers Boolean  @default(true)
  minimumOffer Decimal? @db.Decimal(10, 2) // Reject offers below this
  
  // Stock
  quantity    Int      @default(1)
  quantitySold Int     @default(0)
  
  // Media
  photos      String[] // Seller's actual card photos
  
  // Shipping
  shipsFrom   String?  // Country/region
  shippingOptions Json? // [{method: "PWE", price: 1.00}, {method: "Tracked", price: 4.00}]
  
  status      ListingStatus @default(ACTIVE)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  offers      Offer[]
  orders      Order[]
  
  @@index([cardId, status])
  @@index([sellerId])
  @@index([type])
}

enum ListingType {
  SINGLE          // Individual card
  BUNDLE          // Multiple named cards at a set price
  MYSTERY_PACK    // Curated mystery pack
  SEALED_PRODUCT  // Sealed booster, box, etc.
}

enum ListingStatus {
  ACTIVE
  SOLD
  RESERVED
  EXPIRED
  CANCELLED
}
```

### 5.2 Mystery Packs

Sellers create mystery packs with defined value tiers and guarantees.

```prisma
model MysteryPack {
  id          String   @id @default(cuid())
  listingId   String   @unique
  listing     Listing  @relation(fields: [listingId], references: [id])
  
  name        String   // "Orbital Surprise Pack"
  description String
  
  // Value guarantees
  guaranteedMinValue  Decimal @db.Decimal(10, 2) // Min total value of contents
  cardCount           Int                         // Number of cards included
  
  // Tier structure (what rarities/treatments buyer can expect)
  tiers       Json
  // Example: [
  //   { name: "Guaranteed Hit", count: 1, pool: "Rare+ or any Foil" },
  //   { name: "Uncommon+", count: 2, pool: "Uncommon or better" },
  //   { name: "Filler", count: 7, pool: "Any rarity" }
  // ]
  
  // Seller reputation protection
  revealPolicy  RevealPolicy @default(BUYER_CHOICE)
  
  // Track outcomes for seller trust score
  outcomes    MysteryPackOutcome[]
}

enum RevealPolicy {
  BUYER_CHOICE      // Buyer decides whether to share contents
  ALWAYS_REVEAL     // Contents always published (builds trust)
  SELLER_REVEALS    // Seller publishes pull rates
}

model MysteryPackOutcome {
  id            String   @id @default(cuid())
  mysteryPackId String
  mysteryPack   MysteryPack @relation(fields: [mysteryPackId], references: [id])
  orderId       String
  
  // What the buyer actually received
  contents      Json     // [{cardId, name, rarity, treatment, estimatedValue}]
  totalValue    Decimal  @db.Decimal(10, 2) // Based on market values at time of sale
  
  // Buyer satisfaction
  buyerRating   Int?     // 1-5
  buyerComment  String?
  
  createdAt     DateTime @default(now())
}
```

### 5.3 Offers and Negotiation

```prisma
model Offer {
  id          String   @id @default(cuid())
  listingId   String
  listing     Listing  @relation(fields: [listingId], references: [id])
  buyerId     String
  buyer       User     @relation(fields: [buyerId], references: [id])
  
  amount      Decimal  @db.Decimal(10, 2)
  message     String?
  
  status      OfferStatus @default(PENDING)
  
  // Counter-offer chain
  parentOfferId String?
  parentOffer   Offer?  @relation("OfferChain", fields: [parentOfferId], references: [id])
  counterOffers Offer[] @relation("OfferChain")
  
  expiresAt   DateTime // Auto-expire after 48h
  createdAt   DateTime @default(now())
  respondedAt DateTime?
}

enum OfferStatus {
  PENDING
  ACCEPTED
  DECLINED
  COUNTERED
  EXPIRED
  WITHDRAWN
}
```

### 5.4 Orders and Transactions

```prisma
model Order {
  id          String   @id @default(cuid())
  listingId   String
  listing     Listing  @relation(fields: [listingId], references: [id])
  buyerId     String
  buyer       User     @relation("BuyerOrders", fields: [buyerId], references: [id])
  sellerId    String
  seller      User     @relation("SellerOrders", fields: [sellerId], references: [id])
  
  // Financials
  subtotal    Decimal  @db.Decimal(10, 2)
  shipping    Decimal  @db.Decimal(10, 2)
  platformFee Decimal  @db.Decimal(10, 2) // Our cut (e.g., 5%)
  total       Decimal  @db.Decimal(10, 2)
  
  // Stripe
  stripePaymentIntentId String?
  stripeTransferId      String? // Payout to seller
  
  // Shipping
  shippingMethod  String
  trackingNumber  String?
  shippingAddress Json   // Encrypted
  
  status      OrderStatus @default(PENDING_PAYMENT)
  
  // Timestamps
  paidAt      DateTime?
  shippedAt   DateTime?
  deliveredAt DateTime?
  completedAt DateTime?
  
  // Feedback
  buyerRating   Int?    // 1-5
  sellerRating  Int?
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum OrderStatus {
  PENDING_PAYMENT
  PAID
  SHIPPED
  DELIVERED
  COMPLETED
  DISPUTED
  REFUNDED
  CANCELLED
}
```

---

## 6. Collection Tracking

```prisma
model Collection {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  name        String   @default("My Collection")
  isPublic    Boolean  @default(false)
  
  cards       CollectionCard[]
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model CollectionCard {
  id            String   @id @default(cuid())
  collectionId  String
  collection    Collection @relation(fields: [collectionId], references: [id])
  cardId        String
  card          Card     @relation(fields: [cardId], references: [id])
  
  quantity      Int      @default(1)
  condition     CardCondition @default(NEAR_MINT)
  treatment     String
  serialNumber  String?
  
  // Acquisition tracking
  acquiredPrice  Decimal?  @db.Decimal(10, 2)
  acquiredDate   DateTime?
  acquiredFrom   String?   // "Booster Pack", "Trade", "Purchase", seller name
  
  // For trade/sale
  forTrade       Boolean   @default(false)
  forSale        Boolean   @default(false)
  askingPrice    Decimal?  @db.Decimal(10, 2)
  
  notes          String?
  
  @@unique([collectionId, cardId, treatment, condition, serialNumber])
}
```

### Collection Analytics (computed)

- Total collection value (sum of market mid for all owned cards)
- Value trend over time
- Set completion percentage by game/set/orbital
- Most valuable cards
- Unrealized gain/loss (current value vs acquisition cost)

---

## 7. User & Reputation System

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  username      String   @unique
  displayName   String?
  avatarUrl     String?
  bio           String?
  
  // Location (for shipping estimates)
  country       String?
  region        String?
  
  // Reputation
  sellerRating    Float?   @default(0)
  buyerRating     Float?   @default(0)
  totalSales      Int      @default(0)
  totalPurchases  Int      @default(0)
  memberSince     DateTime @default(now())
  
  // Verification
  isVerified      Boolean  @default(false)
  stripeAccountId String?  // Stripe Connect
  
  // Carde.io integration
  cardeioPlayerId String?  // Link to carde.io account
  
  // Voter credibility (for polls)
  credibilityScore Float  @default(1.0)
  // Increases with: completed transactions, verified sale reports, account age
  // Decreases with: disputed transactions, reported bad data
  
  // Relations
  collections     Collection[]
  buylists        Buylist[]
  sellerListings  Listing[] @relation("SellerListings")
  // ... other relations
}
```

---

## 8. Carde.io Integration Strategy

Carde.io already manages the Wonders of the First Collect & Play Network at compete.wondersccg.com, including card database, deck builder, DBS scoring, and tournament organization.

### 8.1 Integration Points

| Carde.io Has | StoneTrade Adds | Mutual Benefit |
|---|---|---|
| Card database + images | Market pricing data | Cards have prices in deck builder |
| Tournament results | Price impact from tournament performance | "This card spiked 40% after winning the World Championship" |
| Deck builder + DBS | Collection tracking + availability | "Build this deck — here's what it costs and who's selling" |
| Player profiles | Transaction history + reputation | Unified player identity |
| Event registration | Event-driven marketplace | "SCG CON Orlando sellers" — location-based marketplace for events |
| Organized Play data | Meta analysis → price prediction | Most-played cards surface as trending |

### 8.2 Technical Integration

```typescript
// Carde.io API integration (hypothetical — negotiate actual endpoints)
interface CardeioIntegration {
  // Card data sync
  syncCardDatabase(): Promise<Card[]>;
  
  // Tournament results feed
  getRecentTournamentResults(gameSlug: string): Promise<TournamentResult[]>;
  getTopDecks(format: string, timeframe: string): Promise<DeckList[]>;
  
  // Player identity linking
  linkCardeioAccount(userId: string, cardeioToken: string): Promise<void>;
  
  // Deck builder deep links
  generateDeckPriceLink(deckId: string): string;
  
  // Event marketplace
  getUpcomingEvents(location?: GeoPoint): Promise<Event[]>;
}
```

### 8.3 Value Proposition for Carde.io Partnership

**For Carde.io:**
- Adds marketplace revenue stream (commission on sales)
- Increases platform stickiness (players stay for buying/selling)
- Price data enhances deck builder utility
- Mystery pack / sealed product sales at events

**For StoneTrade:**
- Authoritative card database (no need to build from scratch)
- Tournament meta drives pricing intelligence
- Built-in user base of active WoTF players
- Event integration creates organic marketplace activity

**Demo pitch to Carde.io:** Present a working prototype showing their card database with live pricing overlays, a deck builder cost calculator using our market data, and tournament-result price impact charts.

---

## 9. Key Features — UI/UX Specifications

### 9.1 Card Detail Page

- Large card image with zoom
- All treatments shown as tabs (Classic Paper, Foil, Formless, OCM, Stonefoil)
- **Price panel**: Market Low / Mid / High with confidence indicator
- **Price chart**: Time series with source annotations (sale, listing, poll)
- **Signal breakdown**: How many sales, listings, poll votes, reports contribute
- **Active listings**: Sorted by price, filterable by condition
- **Buylist offers**: What buyers are paying
- **Recent sales**: Completed transactions with prices
- **Community poll**: Current active poll if data is thin
- **Deck usage**: (via Carde.io) — what % of tournament decks include this card
- **Related cards**: Same orbital, similar role, alternatives

### 9.2 Marketplace Browse

- Filter: Game → Set → Orbital/Team → Rarity → Treatment → Condition → Price range
- Sort: Price (low/high), Recently Listed, Most Watched, Trending
- View toggle: Grid (card images) / List (compact data)
- **Smart search**: Type card name, get instant results with current market price
- **Bulk listing tool**: Sellers paste a list or scan cards to create multiple listings

### 9.3 Price Discovery Dashboard

- **Cards needing data**: Cards with < 3 price signals — encourages community participation
- **Active polls**: Vote on card values
- **Recent sales feed**: Live stream of completed transactions
- **Top movers**: Cards with biggest price changes (7d, 30d)
- **Confidence heatmap**: Visual showing which cards have reliable pricing vs. sparse data
- **Meta impact tracker**: Tournament results correlated with price changes

### 9.4 Mystery Pack Builder (Seller Tool)

- Select cards from inventory to include in pool
- Define tier structure (guaranteed hit, filler, etc.)
- System calculates guaranteed minimum value based on current market data
- Preview how the pack appears to buyers
- Outcome tracking — after sale, seller records what was pulled

### 9.5 Collection Manager

- Add cards manually, by search, or (future) by camera scan
- Track acquisition price, date, source
- Mark cards as "for trade" or "for sale" with asking price
- Set completion tracker with visual progress bars per set/orbital
- Portfolio value chart over time
- Export collection as CSV
- **Wishlist**: Automatically notified when wanted cards are listed

### 9.6 User Dashboard

- Active listings with quick-edit
- Incoming offers with accept/counter/decline
- Order management (pending shipment, tracking)
- Sales history and earnings
- Buylist management
- Reputation score breakdown

---

## 10. eBay Integration (Phased)

### Phase 1 — No API (Current)

- Manual sale report form: User pastes eBay sold listing URL, system scrapes title/price
- Periodic manual data collection by moderators
- Community members report eBay sold prices

### Phase 2 — eBay Developer API (When Token Received)

```typescript
// eBay Browse API — search completed listings
interface EbayIntegration {
  // Search for completed/sold items
  searchSoldItems(query: string, categoryId?: string): Promise<EbaySoldItem[]>;
  
  // Scheduled job: daily scrape of sold prices for all cards in database
  dailyPriceScrape(): Promise<void>;
  
  // Map eBay listing to our card database
  matchEbayToCard(ebayItem: EbaySoldItem): Promise<Card | null>;
}
```

### Phase 3 — eBay Listing Integration

- Cross-list: Seller creates listing on StoneTrade, option to also list on eBay
- Price comparison: Show eBay current listings alongside StoneTrade listings

---

## 11. AI-Powered Features

### 11.1 Price Estimation for Unlisted Cards

When a card has zero transaction data, use Claude to estimate based on:
- Rarity tier pricing patterns from cards with data
- Comparable cards (same orbital, similar rarity/role)
- Treatment multipliers (Foil vs Paper observed ratios)
- Set-level demand indicators

### 11.2 Card Identification (Future)

- Camera scan → identify card name, set, treatment, condition
- Use for collection management and listing creation

### 11.3 Market Commentary

- Weekly AI-generated market report: trending cards, meta shifts, price alerts
- Card-level analysis: "This card is undervalued relative to its tournament usage"

---

## 12. Revenue Model

| Source | Rate | Notes |
|--------|------|-------|
| Transaction fee | 5% of sale | Charged to seller, paid via Stripe Connect |
| Promoted listings | $1-5/listing | Boost visibility in search |
| Pro membership | $4.99/mo | Advanced analytics, unlimited collection tracking, priority support |
| Mystery pack listing fee | $0.50/pack | Per mystery pack listed |

---

## 13. Implementation Phases

### Phase 1 — Foundation (Weeks 1-4)

- [ ] Project setup: Next.js, Prisma, Supabase, Stripe Connect
- [ ] Card database: Seed WoTF Existence set (401 cards × treatments) and BJBA Alpha Edition
- [ ] Auth: Email + Discord OAuth
- [ ] Basic marketplace: Create listing, browse, buy at listed price
- [ ] Seller dashboard: Manage listings, view orders
- [ ] Buyer flow: Browse → Purchase → Stripe payment → Order tracking
- [ ] Collection tracker: Add/remove cards, view total value

### Phase 2 — Price Discovery (Weeks 5-8)

- [ ] Price data model and composite algorithm
- [ ] Community polls: Create, vote, aggregate
- [ ] Buylist system: Create buylist, auto-match notifications
- [ ] Manual sale reports with moderation
- [ ] Card detail page with full price panel
- [ ] Price history charts (Recharts or similar)
- [ ] Confidence scoring

### Phase 3 — Advanced Marketplace (Weeks 9-12)

- [ ] Offer/counter-offer system with real-time notifications
- [ ] Mystery pack builder + outcome tracking
- [ ] Seller reputation scoring
- [ ] Advanced search with Meilisearch
- [ ] Shipping label generation (EasyPost or Shippo)
- [ ] Dispute resolution workflow

### Phase 4 — Integration & Intelligence (Weeks 13-16)

- [ ] eBay API integration (when token available)
- [ ] Carde.io API integration (card database sync, tournament data)
- [ ] AI price estimation for zero-data cards
- [ ] Meta impact tracker (tournament results → price correlation)
- [ ] Deck cost calculator (via Carde.io deck builder link)
- [ ] Weekly AI market reports

### Phase 5 — Growth (Ongoing)

- [ ] Mobile-responsive PWA optimization
- [ ] Camera-based card scanning
- [ ] Additional game support (architecture already multi-game)
- [ ] Seller storefront pages
- [ ] Trade system (direct card-for-card trades)
- [ ] API for third-party integrations
- [ ] Localization / international shipping support

---

## 14. Key Design Principles

1. **Data transparency**: Always show users how a price was derived — how many sales, listings, votes. Never present a number without context.

2. **Community-first pricing**: The community IS the pricing oracle. Make it easy and rewarding to contribute data (report sales, vote in polls, maintain buylists).

3. **Seller empowerment**: Sellers manage their own inventory. The platform provides tools (bulk listing, price suggestions, analytics) but never holds stock.

4. **Trust through transparency**: Mystery pack outcomes are tracked. Seller ratings are visible. Sale reports are verified by moderators.

5. **Mobile-first responsive**: Many TCG players browse on phones at events and LGS. Every view must work beautifully on mobile.

6. **Emerging-game friendly**: The architecture assumes sparse data and builds from there. Every feature should degrade gracefully when data is thin (show "insufficient data" rather than misleading numbers).

---

## 15. Environment Variables Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Meilisearch
MEILISEARCH_HOST=
MEILISEARCH_API_KEY=

# Anthropic (AI features)
ANTHROPIC_API_KEY=

# eBay (when available)
EBAY_APP_ID=
EBAY_CERT_ID=
EBAY_DEV_ID=

# Resend (email)
RESEND_API_KEY=

# Carde.io (when partnership established)
CARDEIO_API_KEY=
CARDEIO_API_BASE_URL=
```

---

## 16. File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (marketplace)/
│   │   ├── browse/
│   │   ├── card/[id]/
│   │   ├── listing/[id]/
│   │   └── search/
│   ├── (dashboard)/
│   │   ├── listings/
│   │   ├── orders/
│   │   ├── offers/
│   │   ├── collection/
│   │   ├── buylist/
│   │   └── settings/
│   ├── (seller)/
│   │   ├── create-listing/
│   │   ├── mystery-pack-builder/
│   │   └── bulk-import/
│   ├── (discovery)/
│   │   ├── prices/
│   │   ├── polls/
│   │   ├── trending/
│   │   └── report-sale/
│   ├── api/
│   │   ├── cards/
│   │   ├── listings/
│   │   ├── orders/
│   │   ├── prices/
│   │   ├── polls/
│   │   ├── stripe/
│   │   │   └── webhook/
│   │   └── ebay/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── cards/
│   │   ├── CardImage.tsx
│   │   ├── CardDetailPanel.tsx
│   │   ├── PriceChart.tsx
│   │   └── TreatmentTabs.tsx
│   ├── marketplace/
│   │   ├── ListingCard.tsx
│   │   ├── OfferDialog.tsx
│   │   ├── MysteryPackPreview.tsx
│   │   └── SearchFilters.tsx
│   ├── collection/
│   │   ├── CollectionGrid.tsx
│   │   ├── SetCompletionBar.tsx
│   │   └── PortfolioChart.tsx
│   ├── pricing/
│   │   ├── PriceSignalBreakdown.tsx
│   │   ├── ConfidenceBadge.tsx
│   │   ├── PollVoteWidget.tsx
│   │   └── MarketValueCard.tsx
│   └── ui/ (shadcn components)
├── lib/
│   ├── prisma.ts
│   ├── supabase.ts
│   ├── stripe.ts
│   ├── meilisearch.ts
│   ├── pricing/
│   │   ├── composite-value.ts
│   │   ├── confidence-score.ts
│   │   └── poll-aggregation.ts
│   ├── ebay/
│   │   └── client.ts
│   └── cardeio/
│       └── client.ts
├── prisma/
│   ├── schema.prisma
│   └── seed/
│       ├── wotf-existence.ts
│       └── bjba-alpha.ts
└── types/
    └── index.ts
```

---

## 17. Claude Code Session Kickoff Prompt

When starting a Claude Code session to build this project, use:

```
Read the file CCG-MARKETPLACE-SPEC.md for the full project specification.

This is a Next.js 15 marketplace for emerging CCGs (Wonders of the First, Bo Jackson Battle Arena). Key priorities:

1. Start with Phase 1: project scaffolding, Prisma schema, Supabase auth, basic listing CRUD, and card database seed.
2. The price discovery engine (Section 4) is the core innovation — implement the composite market value algorithm early.
3. Use shadcn/ui for all components. Mobile-first responsive design.
4. Stripe Connect for marketplace payments (sellers get paid directly minus platform fee).
5. Every card page must show price confidence — never display a number without showing how many data points support it.

Begin by setting up the project structure, installing dependencies, and creating the Prisma schema from the spec.
```

---

## 18. Card Database Seeding Strategy

### WoTF Existence Set

1. **Primary source**: Download checklist PDF from wondersccg.com (`Wonders-of-The-First-Checklist-Existence-Set.pdf`)
2. **Card images**: Scrape from compete.wondersccg.com card database (or request from Carde.io partnership)
3. **Parse**: Extract card number, name, orbital, rarity from checklist
4. **Expand treatments**: For each base card, create entries for Classic Paper, Classic Foil, Formless Foil, OCM (with serial limits), and Stonefoil (1/1)

### BJBA Alpha Edition

1. **Source**: CGC population report + eBay listings for card names/numbers
2. **Card images**: Scrape from COMC or eBay listings
3. **Parse**: Extract card number, name, rarity, parallel type

### Data Format (seed JSON)

```json
{
  "game": "wotf",
  "set": "existence",
  "cards": [
    {
      "cardNumber": "001/401",
      "name": "Existence The First",
      "orbital": "Boundless",
      "rarity": "Common",
      "cardType": "Wonder",
      "treatments": ["Classic Paper", "Classic Foil", "Formless Foil", "OCM", "Stonefoil"],
      "ocmSerialLimit": 99,
      "buildPoints": null
    }
  ]
}
```

---

## 19. Open Questions for Product Decisions

1. **Platform fee structure**: 5% flat? Tiered by seller volume? Lower for early adopters?
2. **Mystery pack regulation**: Some jurisdictions treat mystery packs as gambling — need legal review
3. **Carde.io data access**: What endpoints exist? Is there a public API or does this require partnership agreement?
4. **Card image licensing**: Can we use official card images, or do we need to rely on user-uploaded photos?
5. **Moderation**: How to handle fake sale reports? Moderator team or community flagging?
6. **International shipping**: Support from day one or US-only initially?
7. **Grading support**: Allow PSA/CGC/BGS graded cards? Different pricing model for graded vs raw?
