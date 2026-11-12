/**
 * Adds User.gmailSyncError — one nullable text column, nothing else touched.
 *
 *   cd "Career Accelerator CRM" && node --env-file=.env.local scripts/add-gmail-sync-error.mjs
 *
 * Why a script and not `prisma migrate`: .env.local is the PRODUCTION Neon
 * database, shared with the LMS, and the CRM's schema is a deliberate subset of
 * the LMS's. A push or migrate from this directory would drop every LMS-only
 * column.
 *
 * Idempotent — IF NOT EXISTS, so running it twice is a no-op.
 *
 * Undo:  ALTER TABLE "User" DROP COLUMN "gmailSyncError";
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gmailSyncError" TEXT`,
  );
  const [{ count }] = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'gmailSyncError'`,
  );
  console.log(count === 1 ? "✅ User.gmailSyncError present" : "❌ column missing after ALTER");
} finally {
  await prisma.$disconnect();
}
