import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get lead and its enrolled user
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    select: { enrolledUserId: true },
  });

  if (!lead?.enrolledUserId) {
    return NextResponse.json({ error: "No enrolled student" }, { status: 404 });
  }

  const userId = lead.enrolledUserId;

  // Fetch everything in parallel
  const [
    user, allSections, progressRecords, submissions,
    attendance, preworkSubmissions, bookings, surveyResponses,
  ] = await Promise.all([
    prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, cohort: true, createdAt: true, onboardedAt: true },
    }),
    prisma.section.findMany({ select: { id: true, moduleId: true } }),
    prisma.progress.findMany({
      where:   { userId },
      select:  { sectionId: true, moduleId: true, completedAt: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.submission.findMany({
      where:   { userId },
      select: {
        id: true, moduleId: true, title: true, content: true,
        status: true, feedback: true, submittedAt: true,
        module: { select: { number: true, title: true } },
      },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.attendanceRecord.findMany({
      where:   { userId },
      include: { module: { select: { number: true, title: true } } },
    }),
    // Prework submissions with all Q&A
    prisma.preworkSubmission.findMany({
      where: { userId },
      include: {
        answers: {
          include: { question: { select: { question: true, order: true } } },
          orderBy: { question: { order: "asc" } },
        },
      },
    }),
    // 1-on-1 bookings
    prisma.oneOnOneBooking.findMany({
      where:   { studentId: userId, status: "CONFIRMED" },
      include: { slot: { select: { startTime: true, endTime: true } } },
    }),
    // Survey responses
    prisma.surveyResponse.findMany({
      where:   { userId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true, moduleId: true, submittedAt: true,
        overallRating: true, contentRating: true,
        facilitatorRating: true, practicalRating: true,
        wouldRecommend: true, biggestTakeaway: true,
        improveSuggestion: true, additionalComments: true,
      },
    }),
  ]);

  // Overall completion
  const totalSections = allSections.length;
  const doneSections  = progressRecords.filter(p => p.sectionId).length;
  const completionPct = totalSections > 0 ? Math.round((doneSections / totalSections) * 100) : 0;

  // Build lookup maps
  const preworkByModule  = Object.fromEntries(preworkSubmissions.map(ps => [ps.moduleId, ps]));
  const bookingByModule  = Object.fromEntries(bookings.map(b => [b.moduleId, b]));

  // Per-module breakdown
  const moduleIdSet = new Set(allSections.map(s => s.moduleId));
  const moduleIds   = Array.from(moduleIdSet);
  const modules = await prisma.module.findMany({
    where:   { id: { in: moduleIds } },
    select:  { id: true, number: true, title: true },
    orderBy: { number: "asc" },
  });

  const moduleBreakdown = modules.map(mod => {
    const modSections  = allSections.filter(s => s.moduleId === mod.id);
    const modCompleted = progressRecords.filter(p => p.moduleId === mod.id && p.sectionId).length;
    const modPct       = modSections.length > 0 ? Math.round((modCompleted / modSections.length) * 100) : 0;
    const sub          = submissions.find(s => s.moduleId === mod.id);
    const att          = attendance.find(a => a.moduleId === mod.id);
    const prework      = preworkByModule[mod.id] ?? null;
    const booking      = bookingByModule[mod.id] ?? null;

    return {
      moduleId:   mod.id,
      number:     mod.number,
      title:      mod.title,
      sections:   modSections.length,
      completed:  modCompleted,
      pct:        modPct,
      submission: sub ? {
        status:      sub.status,
        submittedAt: sub.submittedAt,
        feedback:    sub.feedback ?? null,
        content:     sub.content  ?? null,
      } : null,
      attended:   att?.attended ?? null,
      // New: prework
      prework: prework ? {
        submittedAt: prework.submittedAt,
        answers: prework.answers.map(a => ({
          question: a.question.question,
          answer:   a.answer,
        })),
      } : null,
      // New: 1-on-1 booking
      booking: booking ? {
        startTime: booking.slot.startTime,
        endTime:   booking.slot.endTime,
        status:    booking.status,
      } : null,
    };
  });

  // Submission summary
  const submissionSummary = {
    total:         submissions.length,
    pending:       submissions.filter(s => s.status === "PENDING").length,
    approved:      submissions.filter(s => s.status === "APPROVED").length,
    needsRevision: submissions.filter(s => s.status === "NEEDS_REVISION").length,
    reviewed:      submissions.filter(s => s.status === "REVIEWED").length,
  };

  // Last active
  const lastActive = progressRecords[0]?.completedAt ?? null;

  // Prework summary counts
  const preworkSummary = {
    submitted: preworkSubmissions.length,
    total:     modules.length,
  };

  // 1-on-1 summary counts
  const bookingSummary = {
    booked: bookings.length,
    total:  modules.length,
  };

  return NextResponse.json({
    user,
    completionPct,
    totalSections,
    doneSections,
    moduleBreakdown,
    submissionSummary,
    preworkSummary,
    bookingSummary,
    lastActive,
    recentSubmissions: submissions.slice(0, 5),
    surveyResponses,
  });
}
