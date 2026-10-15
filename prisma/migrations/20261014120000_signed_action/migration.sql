-- CreateTable
CREATE TABLE "signed_action" (
    "id" SERIAL NOT NULL,
    "pubkey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "ts" BIGINT NOT NULL,
    "nonce" TEXT NOT NULL,
    "body_sha256" TEXT NOT NULL,
    "body" TEXT,
    "signature" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signed_action_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signed_action_nonce_key" ON "signed_action"("nonce");

-- CreateIndex
CREATE INDEX "idx_signed_action_pubkey" ON "signed_action"("pubkey");
