-- AlterTable
ALTER TABLE "escrow" ADD COLUMN     "platform_fee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "order" ADD COLUMN     "admin_dispute_share" INTEGER,
ADD COLUMN     "platform_fee" INTEGER NOT NULL DEFAULT 0;
