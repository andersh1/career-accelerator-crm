/**
 * GET /api/crm/my-sessions — the logged-in admin's upcoming LMS 1-on-1 sessions
 * (shared DB with the LMS; slots booked by students or synced from Calendly).
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = (session as { user: { id: string } }).user.id;

  const bookings = await prisma.oneOnOneBooking.findMany({
    where: {
      status: "CONFIRMED",
      slot: { adminId: userId, startTime: { gte: new Date() } },
    },
    include: {
      slot:    { select: { startTime: true, endTime: true } },
      student: { select: { name: true, email: true } },
      module:  { select: { id: true, number: true, title: true } },
    },
    orderBy: { slot: { startTime: "asc" } },
    take: 10,
  });

  return NextResponse.json(bookings.map(b => ({
    id: b.id,
    startTime: b.slot.startTime,
    student: b.student.name,
    studentEmail: b.student.email,
    moduleNumber: b.module.number,
    moduleTitle: b.module.title,
    moduleId: b.module.id,
    zoomStartUrl: b.zoomStartUrl,
  })));
}
