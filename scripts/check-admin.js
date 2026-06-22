const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "caleb.andersh@gmail.com" },
    select: { id: true, email: true, name: true, role: true, password: true },
  });
  if (!user) {
    console.log("❌ User NOT found in database");
    return;
  }
  console.log("✅ User found — role:", user.role);
  const valid = await bcrypt.compare("admin123!", user.password);
  console.log("Password 'admin123!' matches:", valid);
  if (!valid) {
    // Re-hash and update
    const hash = await bcrypt.hash("admin123!", 10);
    await prisma.user.update({ where: { email: "caleb.andersh@gmail.com" }, data: { password: hash } });
    console.log("🔧 Password re-hashed and updated — try logging in again");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
