process.env.POSTGRES_PRISMA_URL = "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&connect_timeout=15&sslmode=require";
process.env.POSTGRES_URL_NON_POOLING = "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const staleDate = new Date(now.getTime() - 14 * 86400000);

  try {
    console.log("Testing tasks...");
    await prisma.task.findMany({ where: { completedAt: null }, take: 1 });
    console.log("✅ tasks ok");
  } catch(e: any) { console.log("❌ tasks:", e.message); }

  try {
    console.log("Testing hotLeads...");
    await prisma.lead.findMany({ where: { deletedAt: null }, take: 1 });
    console.log("✅ leads ok");
  } catch(e: any) { console.log("❌ leads:", e.message); }

  try {
    console.log("Testing cohort...");
    await prisma.cohort.findMany({
      where: { isActive: true },
      select: { id: true, name: true, capacity: true, _count: { select: { users: true } } },
      take: 1,
    });
    console.log("✅ cohort ok");
  } catch(e: any) { console.log("❌ cohort:", e.message); }

  try {
    console.log("Testing leadActivity...");
    await prisma.leadActivity.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * 86400000) } },
      include: { lead: { select: { id: true, firstName: true, lastName: true } } },
      take: 1,
    });
    console.log("✅ leadActivity ok");
  } catch(e: any) { console.log("❌ leadActivity:", e.message); }

  try {
    console.log("Testing allLeads count...");
    await prisma.lead.count();
    console.log("✅ allLeads ok");
  } catch(e: any) { console.log("❌ allLeads:", e.message); }
}

main().catch(console.error).finally(() => prisma.$disconnect());
