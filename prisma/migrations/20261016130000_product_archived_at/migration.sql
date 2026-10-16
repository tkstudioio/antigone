-- Admin catalog management: archived products are hidden from the storefront.
ALTER TABLE "product" ADD COLUMN "archived_at" TIMESTAMP(6);
