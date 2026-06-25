-- AlterTable: add conclusion fields to order
ALTER TABLE "order"
  ADD COLUMN "refund_amount" integer,
  ADD COLUMN "conclusion_status" text,
  ADD COLUMN "refund_signature" text,
  ADD COLUMN "concluded_at" timestamp(6);

-- AlterTable: add refunded flag to key
ALTER TABLE "key"
  ADD COLUMN "refunded" boolean NOT NULL DEFAULT false;
