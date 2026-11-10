/**
 * Adds the Testimonial table and Lead's marketing-release columns.
 *
 * Run from the CRM directory:
 *   node --env-file=.env.local scripts/add-testimonials.mjs
 *
 * This is deliberately a targeted script and not `prisma db push`. The CRM
 * schema is a SUBSET of the LMS schema against the same production database,
 * so a push from here drops every LMS-only column. Every statement below is
 * additive and idempotent: it creates a table nothing reads yet and adds
 * nullable columns to Lead. Re-running it changes nothing.
 *
 * To undo:
 *   DROP TABLE "Testimonial";
 *   ALTER TABLE "Lead" DROP COLUMN "marketingConsent",
 *     DROP COLUMN "marketingConsentScopes",
 *     DROP COLUMN "marketingConsentAt",
 *     DROP COLUMN "marketingConsentNote";
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS = [
  // Lead: the marketing release, recorded once per person.
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingConsent" TEXT`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingConsentScopes" TEXT[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3)`,
  `ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "marketingConsentNote" TEXT`,

  // Testimonial: one quotable line from one Fellow.
  `CREATE TABLE IF NOT EXISTS "Testimonial" (
     "id"          TEXT NOT NULL,
     "leadId"      TEXT,
     "userId"      TEXT,
     "studentName" TEXT NOT NULL,
     "cohort"      TEXT,
     "kind"        TEXT NOT NULL,
     "source"      TEXT NOT NULL,
     "sourceRef"   TEXT,
     "quote"       TEXT NOT NULL,
     "editedQuote" TEXT,
     "nps"         INTEGER,
     "status"      TEXT NOT NULL DEFAULT 'DRAFT',
     "approvedBy"  TEXT,
     "approvedAt"  TIMESTAMP(3),
     "usedIn"      TEXT,
     "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
   )`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "Testimonial_sourceRef_key" ON "Testimonial"("sourceRef")`,
  `CREATE INDEX IF NOT EXISTS "Testimonial_status_idx" ON "Testimonial"("status")`,
  `CREATE INDEX IF NOT EXISTS "Testimonial_leadId_idx" ON "Testimonial"("leadId")`,
  `CREATE INDEX IF NOT EXISTS "Testimonial_userId_idx" ON "Testimonial"("userId")`,

  /**
   * Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each foreign key is
   * guarded by a catalog lookup. ON DELETE SET NULL on both: a quote outlives
   * a merged lead or a deleted account, which is the point of denormalizing
   * studentName onto the row.
   */
  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Testimonial_leadId_fkey') THEN
       ALTER TABLE "Testimonial"
         ADD CONSTRAINT "Testimonial_leadId_fkey"
         FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,

  `DO $$ BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Testimonial_userId_fkey') THEN
       ALTER TABLE "Testimonial"
         ADD CONSTRAINT "Testimonial_userId_fkey"
         FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$`,
];

let applied = 0;
for (const sql of STATEMENTS) {
  const label = sql.trim().split("\n")[0].slice(0, 72);
  try {
    await prisma.$executeRawUnsafe(sql);
    applied += 1;
    console.log(`  ok   ${label}`);
  } catch (e) {
    console.error(`  FAIL ${label}\n       ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}

console.log(`\n${applied}/${STATEMENTS.length} statements applied.`);

// Prove the shape rather than trusting the absence of an error.
const cols = await prisma.$queryRawUnsafe(
  `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
    WHERE table_name = 'Testimonial'
    ORDER BY ordinal_position`,
);
console.log(`\nTestimonial columns (${cols.length}):`);
for (const c of cols) {
  console.log(`  ${c.column_name.padEnd(13)} ${c.data_type}${c.is_nullable === "NO" ? "  NOT NULL" : ""}`);
}

const leadCols = await prisma.$queryRawUnsafe(
  `SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Lead' AND column_name LIKE 'marketing%'
    ORDER BY column_name`,
);
console.log(`\nLead marketing columns: ${leadCols.map(c => c.column_name).join(", ") || "(none)"}`);

const count = await prisma.testimonial.count();
console.log(`Testimonial rows: ${count}`);

await prisma.$disconnect();
