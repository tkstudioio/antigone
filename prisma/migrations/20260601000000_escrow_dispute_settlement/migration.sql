-- AddColumn: dispute settlement relay fields on escrow table (all nullable — additive migration)
ALTER TABLE "escrow" ADD COLUMN "dispute_favoured_signed_ark_psbt" TEXT;
ALTER TABLE "escrow" ADD COLUMN "dispute_checkpoint_psbts" TEXT;
ALTER TABLE "escrow" ADD COLUMN "dispute_server_signed_checkpoints" TEXT;
ALTER TABLE "escrow" ADD COLUMN "dispute_admin_signed_checkpoints" TEXT;
ALTER TABLE "escrow" ADD COLUMN "dispute_ark_txid" TEXT;
ALTER TABLE "escrow" ADD COLUMN "settled_at" TIMESTAMP(6);
-- Reserved for Stage 2 (unilateral CSV exit):
ALTER TABLE "escrow" ADD COLUMN "dispute_exit_state" TEXT;
