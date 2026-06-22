const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// Load .env.local manually
const envFile = path.join(__dirname, "../.env.local");
fs.readFileSync(envFile, "utf8").split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim();
  }
});

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("admin123!", 10);
  const user = await prisma.user.upsert({
    where: { email: "caleb.andersh@gmail.com" },
    update: { name: "Caleb", role: "ADMIN", password: hash },
    create: { email: "caleb.andersh@gmail.com", name: "Caleb", role: "ADMIN", password: hash },
  });
  console.log("Admin user ready:", user.email, "| role:", user.role);
}

main().catch(console.error).finally(() => prisma.$disconnect());
