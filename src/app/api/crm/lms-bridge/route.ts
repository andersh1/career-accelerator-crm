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

  // Resolve the account from whichever part of the session is still accurate.
  //
  // This looked the user up by email alone, which broke at the 10X → Vantage
  // cutover: CRM sessions are 30-day JWTs, so anyone signed in before their
  // address changed carried the old email in their token and got "User not
  // found" even though their account was fine. The id in the token survives an
  // email change, and the email survives an id change, so try both — and match
  // email case-insensitively while we are here.
  const sessionId    = (session.user as { id?: string }).id;
  const sessionEmail = session.user.email ?? undefined;

  const dbUser =
    (sessionId ? await prisma.user.findUnique({ where: { id: sessionId }, select: { id: true } }) : null) ??
    (sessionEmail
      ? await prisma.user.findFirst({
          where: { email: { equals: sessionEmail, mode: "insensitive" } },
          select: { id: true },
        })
      : null);

  if (!dbUser) {
    return NextResponse.json(
      { error: "Your session is out of date — sign out and back in, then try again." },
      { status: 404 },
    );
  }

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
