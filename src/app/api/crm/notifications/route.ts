import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

// GET — list recent notifications
export async function GET() {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const notifications = await prisma.cRMNotification.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const unread = await prisma.cRMNotification.count({ where: { read: false } });

  return NextResponse.json({ notifications, unread });
}

// PATCH — mark notifications as read
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as { ids?: string[]; all?: boolean };

  if (body.all) {
    await prisma.cRMNotification.updateMany({ where: { read: false }, data: { read: true } });
  } else if (body.ids?.length) {
    await prisma.cRMNotification.updateMany({
      where: { id: { in: body.ids } },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}
