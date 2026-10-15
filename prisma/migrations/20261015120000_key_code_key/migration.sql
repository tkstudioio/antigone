-- CreateTable
CREATE TABLE "key_code_key" (
    "id" SERIAL NOT NULL,
    "key_id" INTEGER NOT NULL,
    "recipient_pubkey" TEXT NOT NULL,
    "wrapper_pubkey" TEXT NOT NULL,
    "wrapped_cek" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_code_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_key_code_key_key_id" ON "key_code_key"("key_id");

-- CreateIndex
CREATE UNIQUE INDEX "key_code_key_key_id_recipient_pubkey_key" ON "key_code_key"("key_id", "recipient_pubkey");

-- AddForeignKey
ALTER TABLE "key_code_key" ADD CONSTRAINT "key_code_key_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "key"("id") ON DELETE CASCADE ON UPDATE CASCADE;
