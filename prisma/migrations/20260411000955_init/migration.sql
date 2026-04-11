-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('SELLER_LISTING', 'COMPLETED_SALE', 'EBAY_SOLD', 'EBAY_LISTED', 'COMMUNITY_POLL', 'BUYLIST_OFFER', 'MANUAL_REPORT', 'AI_ESTIMATE');

-- CreateEnum
CREATE TYPE "CardCondition" AS ENUM ('MINT', 'NEAR_MINT', 'LIGHTLY_PLAYED', 'MODERATELY_PLAYED', 'HEAVILY_PLAYED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('SINGLE', 'BUNDLE', 'MYSTERY_PACK', 'SEALED_PRODUCT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'RESERVED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RevealPolicy" AS ENUM ('BUYER_CHOICE', 'ALWAYS_REVEAL', 'SELLER_REVEALS');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "logoUrl" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Set" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "totalCards" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "Set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orbital" TEXT,
    "athlete" TEXT,
    "teamAffiliation" TEXT,
    "rarity" TEXT NOT NULL,
    "cardType" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "buildPoints" INTEGER,
    "isSerialized" BOOLEAN NOT NULL DEFAULT false,
    "serialTotal" INTEGER,
    "imageUrl" TEXT,
    "imageUrlBack" TEXT,
    "flavorText" TEXT,
    "rulesText" TEXT,
    "artist" TEXT,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceDataPoint" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "source" "PriceSource" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "condition" "CardCondition" NOT NULL,
    "treatment" TEXT NOT NULL,
    "ebayListingId" TEXT,
    "listingId" TEXT,
    "pollId" TEXT,
    "reportedBy" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceDataPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardMarketValue" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "marketLow" DECIMAL(10,2),
    "marketMid" DECIMAL(10,2),
    "marketHigh" DECIMAL(10,2),
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalListings" INTEGER NOT NULL DEFAULT 0,
    "totalBuylist" INTEGER NOT NULL DEFAULT 0,
    "totalPollVotes" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "trend7d" DECIMAL(5,2),
    "trend30d" DECIMAL(5,2),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardMarketValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuePoll" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "condition" "CardCondition" NOT NULL DEFAULT 'NEAR_MINT',
    "priceRanges" JSONB NOT NULL,
    "status" "PollStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuePoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValuePollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedRange" INTEGER NOT NULL,
    "exactEstimate" DECIMAL(10,2),
    "voterWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValuePollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Buylist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Buylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuylistEntry" (
    "id" TEXT NOT NULL,
    "buylistId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "maxPrice" DECIMAL(10,2) NOT NULL,
    "condition" "CardCondition" NOT NULL DEFAULT 'NEAR_MINT',
    "treatment" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "autoNotify" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BuylistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "condition" "CardCondition" NOT NULL,
    "treatment" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "proofUrl" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBy" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "cardId" TEXT,
    "condition" "CardCondition",
    "treatment" TEXT,
    "serialNumber" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "allowOffers" BOOLEAN NOT NULL DEFAULT true,
    "minimumOffer" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "photos" TEXT[],
    "shipsFrom" TEXT,
    "shippingOptions" JSONB,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryPack" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "guaranteedMinValue" DECIMAL(10,2) NOT NULL,
    "cardCount" INTEGER NOT NULL,
    "tiers" JSONB NOT NULL,
    "revealPolicy" "RevealPolicy" NOT NULL DEFAULT 'BUYER_CHOICE',

    CONSTRAINT "MysteryPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryPackOutcome" (
    "id" TEXT NOT NULL,
    "mysteryPackId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contents" JSONB NOT NULL,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "buyerRating" INTEGER,
    "buyerComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryPackOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "message" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "parentOfferId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "shipping" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "stripePaymentIntentId" TEXT,
    "stripeTransferId" TEXT,
    "shippingMethod" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "shippingAddress" JSONB NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paidAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "buyerRating" INTEGER,
    "sellerRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Collection',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionCard" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "condition" "CardCondition" NOT NULL DEFAULT 'NEAR_MINT',
    "treatment" TEXT NOT NULL,
    "serialNumber" TEXT,
    "acquiredPrice" DECIMAL(10,2),
    "acquiredDate" TIMESTAMP(3),
    "acquiredFrom" TEXT,
    "forTrade" BOOLEAN NOT NULL DEFAULT false,
    "forSale" BOOLEAN NOT NULL DEFAULT false,
    "askingPrice" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "CollectionCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "region" TEXT,
    "sellerRating" DOUBLE PRECISION DEFAULT 0,
    "buyerRating" DOUBLE PRECISION DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalPurchases" INTEGER NOT NULL DEFAULT 0,
    "memberSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "stripeAccountId" TEXT,
    "cardeioPlayerId" TEXT,
    "credibilityScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Set_gameId_code_key" ON "Set"("gameId", "code");

-- CreateIndex
CREATE INDEX "Card_gameId_name_idx" ON "Card"("gameId", "name");

-- CreateIndex
CREATE INDEX "Card_rarity_idx" ON "Card"("rarity");

-- CreateIndex
CREATE INDEX "Card_orbital_idx" ON "Card"("orbital");

-- CreateIndex
CREATE UNIQUE INDEX "Card_setId_cardNumber_treatment_key" ON "Card"("setId", "cardNumber", "treatment");

-- CreateIndex
CREATE INDEX "PriceDataPoint_cardId_createdAt_idx" ON "PriceDataPoint"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "PriceDataPoint_source_idx" ON "PriceDataPoint"("source");

-- CreateIndex
CREATE UNIQUE INDEX "CardMarketValue_cardId_key" ON "CardMarketValue"("cardId");

-- CreateIndex
CREATE INDEX "CardMarketValue_confidence_idx" ON "CardMarketValue"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "ValuePollVote_pollId_userId_key" ON "ValuePollVote"("pollId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "BuylistEntry_buylistId_cardId_treatment_condition_key" ON "BuylistEntry"("buylistId", "cardId", "treatment", "condition");

-- CreateIndex
CREATE INDEX "Listing_cardId_status_idx" ON "Listing"("cardId", "status");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "Listing"("sellerId");

-- CreateIndex
CREATE INDEX "Listing_type_idx" ON "Listing"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MysteryPack_listingId_key" ON "MysteryPack"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionCard_collectionId_cardId_treatment_condition_seri_key" ON "CollectionCard"("collectionId", "cardId", "treatment", "condition", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "Set" ADD CONSTRAINT "Set_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "Set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceDataPoint" ADD CONSTRAINT "PriceDataPoint_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardMarketValue" ADD CONSTRAINT "CardMarketValue_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePoll" ADD CONSTRAINT "ValuePoll_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePollVote" ADD CONSTRAINT "ValuePollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "ValuePoll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValuePollVote" ADD CONSTRAINT "ValuePollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Buylist" ADD CONSTRAINT "Buylist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuylistEntry" ADD CONSTRAINT "BuylistEntry_buylistId_fkey" FOREIGN KEY ("buylistId") REFERENCES "Buylist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuylistEntry" ADD CONSTRAINT "BuylistEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReport" ADD CONSTRAINT "SaleReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReport" ADD CONSTRAINT "SaleReport_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryPack" ADD CONSTRAINT "MysteryPack_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryPackOutcome" ADD CONSTRAINT "MysteryPackOutcome_mysteryPackId_fkey" FOREIGN KEY ("mysteryPackId") REFERENCES "MysteryPack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCard" ADD CONSTRAINT "CollectionCard_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionCard" ADD CONSTRAINT "CollectionCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
