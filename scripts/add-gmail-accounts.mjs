/**
 * Creates the GmailAccount table and backfills the mailbox each admin already
 * has connected.
 *
 *   cd "Career Accelerator CRM" && node --env-file=.env.local scripts/add-gmail-accounts.mjs
 *
 * Why a script and not `prisma migrate`: .env.local is the PRODUCTION Neon
 * database, shared with the LMS, and the CRM's schema is a deliberate subset of
 * the LMS's. A push or migrate from this directory would drop every LMS-only
 * column.
 *
 * Idempotent. The table creation is IF NOT EXISTS and the backfill is an
 * upsert on the address, so running it twice changes nothing.
 *
 * Nothing is removed: User.gmailRefreshToken and friends keep their values and
 * keep driving session provisioning's calendar access. The backfilled row is
 * marked isPrimary so the two stay in step.
 *
 * Undo:  DROP TABLE "GmailAccount";
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GmailAccount" (
      "id"           TEXT PRIMARY KEY,
      "userId"       TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      "email"        TEXT NOT NULL,
      "refreshToken" TEXT NOT NULL,
      "syncedAt"     TIMESTAMP,
      "syncError"    TEXT,
      "isPrimary"    BOOLEAN NOT NULL DEFAULT false,
      "createdAt"    TIMESTAMP NOT NULL DEFAULT now()
    )`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "GmailAccount_email_key" ON "GmailAccount"("email")`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "GmailAccount_userId_idx" ON "GmailAccount"("userId")`);

  // Backfill: whatever each person has connected today becomes their primary.
  const connected = await prisma.user.findMany({
    where:  { gmailRefreshToken: { not: null }, gmailEmail: { not: null } },
    select: { id: true, email: true, gmailEmail: true, gmailRefreshToken: true,
              gmailSyncedAt: true, gmailSyncError: true },
  });

  for (const u of connected) {
    const address = u.gmailEmail.toLowerCase();
    const existing = await prisma.gmailAccount.findUnique({ where: { email: address } });
    if (existing) {
      console.log(`  = ${u.email} → ${address} (already present)`);
      continue;
    }
    await prisma.gmailAccount.create({
      data: {
        userId:       u.id,
        email:        address,
        refreshToken: u.gmailRefreshToken,
        syncedAt:     u.gmailSyncedAt,
        syncError:    u.gmailSyncError,
        isPrimary:    true,
      },
    });
    console.log(`  + ${u.email} → ${address}`);
  }

  const total = await prisma.gmailAccount.count();
  console.log(`✅ GmailAccount ready — ${total} mailbox${total === 1 ? "" : "es"} connected`);
} finally {
  await prisma.$disconnect();
}
