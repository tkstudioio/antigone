-- Add the explicit favoured-party selection set by the admin at dispute conclusion.
-- Additive and nullable: existing concluded orders fall back to the legacy outcome-based mapping.
ALTER TABLE "order" ADD COLUMN "favoured_role" TEXT;
