-- AlterTable "chat": replace key_id+buyer_pubkey model with order_id FK

-- Drop the old unique constraint (key_id, buyer_pubkey)
ALTER TABLE "chat" DROP CONSTRAINT IF EXISTS "chat_key_id_buyer_pubkey_key";

-- Drop old index on key_id
DROP INDEX IF EXISTS "idx_chat_key_id";

-- Drop old FK constraints
ALTER TABLE "chat" DROP CONSTRAINT IF EXISTS "chat_key_id_fkey";
ALTER TABLE "chat" DROP CONSTRAINT IF EXISTS "chat_buyer_pubkey_fkey";
ALTER TABLE "chat" DROP CONSTRAINT IF EXISTS "chat_arbiter_pubkey_fkey";

-- Drop old columns
ALTER TABLE "chat" DROP COLUMN IF EXISTS "key_id";
ALTER TABLE "chat" DROP COLUMN IF EXISTS "buyer_pubkey";
ALTER TABLE "chat" DROP COLUMN IF EXISTS "arbiter_pubkey";

-- Add order_id column
ALTER TABLE "chat" ADD COLUMN "order_id" INTEGER NOT NULL;

-- Add unique constraint on order_id
ALTER TABLE "chat" ADD CONSTRAINT "chat_order_id_key" UNIQUE ("order_id");

-- Add FK constraint to order
ALTER TABLE "chat" ADD CONSTRAINT "chat_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
