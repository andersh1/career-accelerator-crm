/**
 * Adds the columns that let the CRM own a session's Zoom meeting and calendar
 * event, rather than only holding a link somebody pasted.
 *
 * Run from the CRM directory:
 *   node --env-file=.env.local scripts/add-session-provisioning.mjs
 *
 * A targeted script, not `prisma db push`: the CRM schema is a SUBSET of the
 * LMS schema against the same production database, so a push from here drops
 * every LMS-only column. Every statement is additive and idempotent.
 *
 * To undo:
 *   ALTER TABLE "CohortSchedule"
 *     DROP COLUMN "sessionZoomMeetingId",
 *     DROP COLUMN "sessionCalendarEventId",
 *     DROP COLUMN "sessionProvisionedAt";
 *   ALTER TABLE "Cohort" DROP COLUMN "calendarId";
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STATEMENTS = [
  `ALTER TABLE "CohortSchedule" ADD COLUMN IF NOT EXISTS "sessionZoomMeetingId" TEXT`,
  `ALTER TABLE "CohortSchedule" ADD COLUMN IF NOT EXISTS "sessionCalendarEventId" TEXT`,
  `ALTER TABLE "CohortSchedule" ADD COLUMN IF NOT EXISTS "sessionProvisionedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Cohort" ADD COLUMN IF NOT EXISTS "calendarId" TEXT`,
];

let applied = 0;
for (const sql of STATEMENTS) {
  try {
    await prisma.$executeRawUnsafe(sql);
    applied += 1;
    console.log(`  ok   ${sql.slice(0, 92)}`);
  } catch (e) {
    console.error(`  FAIL ${sql.slice(0, 92)}\n       ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  }
}
console.log(`\n${applied}/${STATEMENTS.length} applied.`);

// Prove the shape rather than trusting the absence of an error.
const cols = await prisma.$queryRawUnsafe(
  `SELECT table_name, column_name
     FROM information_schema.columns
    WHERE (table_name = 'CohortSchedule' AND column_name IN ('sessionZoomMeetingId','sessionCalendarEventId','sessionProvisionedAt'))
       OR (table_name = 'Cohort' AND column_name = 'calendarId')
    ORDER BY table_name, column_name`,
);
console.log(`\nColumns now present (${cols.length}/4):`);
for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

/**
 * Existing rows keep sessionZoomLink and get a null meeting id, which is the
 * correct reading: those links were pasted by hand, the CRM does not own the
 * meetings behind them, and provisioning must not quietly replace them.
 */
const rows = await prisma.cohortSchedule.count();
const withLink = await prisma.cohortSchedule.count({ where: { sessionZoomLink: { not: null } } });
const owned = await prisma.cohortSchedule.count({ where: { sessionZoomMeetingId: { not: null } } });
console.log(`\nSchedule rows: ${rows} | with a link: ${withLink} | meetings the CRM owns: ${owned}`);

await prisma.$disconnect();
