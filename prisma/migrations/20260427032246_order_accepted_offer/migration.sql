-- AlterTable: link Order to its origin Offer when created from acceptance
ALTER TABLE "Order" ADD COLUMN "acceptedOfferId" TEXT;

-- CreateIndex (unique — each accepted offer produces at most one order)
CREATE UNIQUE INDEX "Order_acceptedOfferId_key" ON "Order"("acceptedOfferId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptedOfferId_fkey" FOREIGN KEY ("acceptedOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
