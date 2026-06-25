-- CreateTable
CREATE TABLE "message_key" (
    "id" SERIAL NOT NULL,
    "message_id" INTEGER NOT NULL,
    "recipient_pubkey" TEXT NOT NULL,
    "wrapper_pubkey" TEXT NOT NULL,
    "wrapped_cek" TEXT NOT NULL,

    CONSTRAINT "message_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_message_key_message_id" ON "message_key"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_key_message_id_recipient_pubkey_key" ON "message_key"("message_id", "recipient_pubkey");

-- AddForeignKey
ALTER TABLE "message_key" ADD CONSTRAINT "message_key_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
