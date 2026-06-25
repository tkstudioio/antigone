-- AlterTable
ALTER TABLE "message" ADD COLUMN     "attachment_key" TEXT,
ADD COLUMN     "attachment_name" TEXT,
ADD COLUMN     "attachment_size" INTEGER,
ADD COLUMN     "attachment_type" TEXT;
