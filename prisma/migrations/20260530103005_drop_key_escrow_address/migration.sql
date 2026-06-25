/*
  Warnings:

  - You are about to drop the column `escrow_address` on the `key` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "key" DROP CONSTRAINT "key_escrow_address_fkey";

-- DropIndex
DROP INDEX "key_escrow_address_key";

-- AlterTable
ALTER TABLE "key" DROP COLUMN "escrow_address";
