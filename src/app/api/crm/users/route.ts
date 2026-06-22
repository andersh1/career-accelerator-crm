import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return all users with a crmRole set (ADMIN or MEMBER)
  const users = await prisma.user.findMany({
    where: { crmRole: { not: null } },
    select: { id: true, name: true, email: true, crmRole: true, createdAt: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
