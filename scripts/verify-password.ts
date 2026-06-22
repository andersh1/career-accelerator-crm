process.env.POSTGRES_PRISMA_URL = "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl-pooler.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&connect_timeout=15&sslmode=require";
process.env.POSTGRES_URL_NON_POOLING = "postgresql://neondb_owner:npg_AH4j0idfengk@ep-long-dust-apcl9uwl.c-7.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "dan@10ximpact.co" } });
  if (!user) { console.log("❌ User not found"); return; }
  console.log("email:", user.email, "| role:", user.role, "| crmRole:", (user as any).crmRole);
  console.log("password hash:", user.password?.slice(0, 20));
  const ok = await bcrypt.compare("admin123!", user.password!);
  console.log("password 'admin123!' matches:", ok);
}

main().catch(console.error).finally(() => prisma.$disconnect());
