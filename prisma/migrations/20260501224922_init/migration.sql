-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "account" (
    "pubkey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_arbiter" BOOLEAN DEFAULT false,

    CONSTRAINT "account_pkey" PRIMARY KEY ("pubkey")
);

-- CreateTable
CREATE TABLE "challenge" (
    "nonce" TEXT NOT NULL,
    "pubkey" TEXT NOT NULL,
    "expiry" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "rating" DOUBLE PRECISION,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "key" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "seller_pubkey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "escrow_address" TEXT,
    "reserved_by" TEXT,
    "reserved_until" TIMESTAMP(6),
    "order_id" INTEGER,
    "buyer_pubkey" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "key_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite" (
    "id" SERIAL NOT NULL,
    "account_pubkey" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat" (
    "id" SERIAL NOT NULL,
    "key_id" INTEGER NOT NULL,
    "buyer_pubkey" TEXT NOT NULL,
    "arbiter_pubkey" TEXT,
    "signature" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" SERIAL NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "message" TEXT,
    "sender_pubkey" TEXT,
    "signature" TEXT,
    "is_system" BOOLEAN DEFAULT false,
    "sent_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow" (
    "address" TEXT NOT NULL,
    "buyer_pubkey" TEXT NOT NULL,
    "seller_pubkey" TEXT NOT NULL,
    "server_pubkey" TEXT NOT NULL,
    "arbiter_pubkey" TEXT,
    "price" INTEGER NOT NULL,
    "timelock_expiry" INTEGER NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'awaitingFunds',
    "seller_signed_collab_psbt" TEXT,
    "collab_ark_txid" TEXT,
    "server_signed_checkpoints" TEXT,
    "buyer_signed_checkpoints" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "funded_at" TIMESTAMP(6),
    "released_at" TIMESTAMP(6),

    CONSTRAINT "escrow_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "order" (
    "id" SERIAL NOT NULL,
    "buyer_pubkey" TEXT NOT NULL,
    "seller_pubkey" TEXT NOT NULL,
    "arbiter_pubkey" TEXT,
    "total_sats" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "escrow_address" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review" (
    "id" SERIAL NOT NULL,
    "reviewed_pubkey" TEXT NOT NULL,
    "reviewer_pubkey" TEXT NOT NULL,
    "reviewer_role" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "escrow_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_pubkey_key" ON "account"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_pubkey_key" ON "challenge"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "product_slug_key" ON "product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "key_escrow_address_key" ON "key"("escrow_address");

-- CreateIndex
CREATE INDEX "idx_key_product_id" ON "key"("product_id");

-- CreateIndex
CREATE INDEX "idx_key_seller_pubkey" ON "key"("seller_pubkey");

-- CreateIndex
CREATE INDEX "idx_key_seller_product" ON "key"("seller_pubkey", "product_id");

-- CreateIndex
CREATE INDEX "idx_key_seller_product_price" ON "key"("seller_pubkey", "product_id", "price");

-- CreateIndex
CREATE INDEX "idx_key_reserved_by_until" ON "key"("reserved_by", "reserved_until");

-- CreateIndex
CREATE INDEX "idx_key_order_id" ON "key"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_account_pubkey_product_id_key" ON "favorite"("account_pubkey", "product_id");

-- CreateIndex
CREATE INDEX "idx_chat_key_id" ON "chat"("key_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_key_id_buyer_pubkey_key" ON "chat"("key_id", "buyer_pubkey");

-- CreateIndex
CREATE INDEX "idx_message_chat_id" ON "message"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_chat_id_key" ON "escrow"("chat_id");

-- CreateIndex
CREATE INDEX "idx_escrow_chat_id" ON "escrow"("chat_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_escrow_address_key" ON "order"("escrow_address");

-- CreateIndex
CREATE INDEX "idx_order_buyer_pubkey" ON "order"("buyer_pubkey");

-- CreateIndex
CREATE INDEX "idx_order_seller_pubkey" ON "order"("seller_pubkey");

-- CreateIndex
CREATE INDEX "idx_review_reviewed_pubkey" ON "review"("reviewed_pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "review_escrow_address_reviewer_pubkey_key" ON "review"("escrow_address", "reviewer_pubkey");

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_seller_pubkey_fkey" FOREIGN KEY ("seller_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_reserved_by_fkey" FOREIGN KEY ("reserved_by") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_buyer_pubkey_fkey" FOREIGN KEY ("buyer_pubkey") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "key" ADD CONSTRAINT "key_escrow_address_fkey" FOREIGN KEY ("escrow_address") REFERENCES "escrow"("address") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_account_pubkey_fkey" FOREIGN KEY ("account_pubkey") REFERENCES "account"("pubkey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat" ADD CONSTRAINT "chat_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "key"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat" ADD CONSTRAINT "chat_buyer_pubkey_fkey" FOREIGN KEY ("buyer_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat" ADD CONSTRAINT "chat_arbiter_pubkey_fkey" FOREIGN KEY ("arbiter_pubkey") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_sender_pubkey_fkey" FOREIGN KEY ("sender_pubkey") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_buyer_pubkey_fkey" FOREIGN KEY ("buyer_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_seller_pubkey_fkey" FOREIGN KEY ("seller_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_arbiter_pubkey_fkey" FOREIGN KEY ("arbiter_pubkey") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow" ADD CONSTRAINT "escrow_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_buyer_pubkey_fkey" FOREIGN KEY ("buyer_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_seller_pubkey_fkey" FOREIGN KEY ("seller_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order" ADD CONSTRAINT "order_arbiter_pubkey_fkey" FOREIGN KEY ("arbiter_pubkey") REFERENCES "account"("pubkey") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_reviewed_pubkey_fkey" FOREIGN KEY ("reviewed_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_reviewer_pubkey_fkey" FOREIGN KEY ("reviewer_pubkey") REFERENCES "account"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review" ADD CONSTRAINT "review_escrow_address_fkey" FOREIGN KEY ("escrow_address") REFERENCES "escrow"("address") ON DELETE CASCADE ON UPDATE CASCADE;

