-- AlterTable
ALTER TABLE "key" ADD COLUMN     "code_hash" TEXT;

-- CreateIndex
CREATE INDEX "idx_key_seller_product_codehash" ON "key"("seller_pubkey", "product_id", "code_hash");
