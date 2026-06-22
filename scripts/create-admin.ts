// Set DB connection before importing Prisma
process.env.POSTGRES_PRISMA_URL =
  "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&connect_timeout=15&sslmode=require";
process.env.POSTGRES_URL_NON_POOLING =
  "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashed = await bcrypt.hash("admin123!", 12);

  const user = await prisma.user.upsert({
    where: { email: "dan@10ximpact.co" },
    // Never update password — LMS and CRM share one User table, one password wins
    update: { role: "ADMIN", crmRole: "ADMIN", name: "Dan" },
    create: {
      email: "dan@10ximpact.co",
      name: "Dan",
      password: hashed,
      role: "ADMIN",
      crmRole: "ADMIN",
    },
  });

  console.log("✅ CRM admin created:", user.email, "| role:", user.role, "| crmRole:", user.crmRole);
}

main().catch(console.error).finally(() => prisma.$disconnect());
