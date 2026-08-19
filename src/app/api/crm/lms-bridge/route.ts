import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

const LMS_URL = process.env.LMS_URL ?? "https://lms.vantagecareer.co";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.crmRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { targetUrl?: string };
  const targetUrl = body.targetUrl ?? "/admin";

  // Re-fetch user by email to get the live DB id (session.user.id can be stale after migrations)
  const dbUser = await prisma.user.findUnique({
    where: { email: session.user.email! },
    select: { id: true },
  });
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Clean up any expired tokens for this user
  await prisma.crmBridgeToken.deleteMany({
    where: { userId: dbUser.id, expiresAt: { lt: new Date() } },
  });

  const token = randomBytes(32).toString("hex");
  await prisma.crmBridgeToken.create({
    data: {
      userId:    dbUser.id,
      token,
      targetUrl,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
    },
  });

  return NextResponse.json({
    url: `${LMS_URL}/api/auth/bridge?token=${token}`,
  });
}
