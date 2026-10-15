-- AlterTable
ALTER TABLE "key_code_key" ADD COLUMN "signed_action_id" INTEGER;

-- AlterTable
ALTER TABLE "message" ADD COLUMN "prev_hash" TEXT,
ADD COLUMN "signed_action_id" INTEGER;

-- AlterTable
ALTER TABLE "order" ADD COLUMN "checkout_action_id" INTEGER,
ADD COLUMN "confirm_action_id" INTEGER,
ADD COLUMN "dispute_action_id" INTEGER,
ADD COLUMN "verdict_action_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "message_signed_action_id_key" ON "message"("signed_action_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_chat_id_prev_hash_key" ON "message"("chat_id", "prev_hash");

-- AddForeignKey
ALTER TABLE "key_code_key" ADD CONSTRAINT "key_code_key_signed_action_id_fkey" FOREIGN KEY ("signed_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_signed_action_id_fkey" FOREIGN KEY ("signed_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_checkout_action_id_fkey" FOREIGN KEY ("checkout_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_confirm_action_id_fkey" FOREIGN KEY ("confirm_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_dispute_action_id_fkey" FOREIGN KEY ("dispute_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_verdict_action_id_fkey" FOREIGN KEY ("verdict_action_id") REFERENCES "signed_action"("id") ON DELETE SET NULL ON UPDATE CASCADE;
