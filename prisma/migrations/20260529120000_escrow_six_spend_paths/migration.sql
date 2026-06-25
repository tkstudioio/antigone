-- Escrow VTXO now uses six spending paths (3 collaborative + 3 CSV exit twins).
-- The escrow no longer stores an absolute CLTV expiry; it stores the operator's
-- relative CSV exit delay used to derive the exit paths. Rename preserves data.
ALTER TABLE "escrow" RENAME COLUMN "timelock_expiry" TO "exit_delay";
