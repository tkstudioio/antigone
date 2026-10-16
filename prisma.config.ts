import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Migrations need a direct connection: Neon's pooled DATABASE_URL (PgBouncer, transaction mode)
    // breaks Prisma's advisory locks, so prefer the unpooled URL the Neon integration also sets.
    url: process.env.DATABASE_URL_UNPOOLED ?? env("DATABASE_URL"),
  },
});
