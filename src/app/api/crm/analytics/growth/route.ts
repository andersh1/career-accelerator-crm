import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ── Source summary ────────────────────────────────────────────────────────────
  const allLeads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: { id: true, source: true, stage: true, promoCode: true, referralCode: true },
  });

  const sourceBuckets: Record<string, { leads: number; applied: number; enrolled: number }> = {
    EVENT:    { leads: 0, applied: 0, enrolled: 0 },
    REFERRAL: { leads: 0, applied: 0, enrolled: 0 },
    PROMO:    { leads: 0, applied: 0, enrolled: 0 },
    DIRECT:   { leads: 0, applied: 0, enrolled: 0 },
  };

  for (const l of allLeads) {
    let bucket = "DIRECT";
    if (l.source === "EVENT")    bucket = "EVENT";
    else if (l.source === "REFERRAL") bucket = "REFERRAL";
    else if (l.promoCode)        bucket = "PROMO";

    sourceBuckets[bucket].leads++;
    if (["APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "ENROLLED"].includes(l.stage))
      sourceBuckets[bucket].applied++;
    if (l.stage === "ENROLLED")
      sourceBuckets[bucket].enrolled++;
  }

  const BUCKET_LABELS: Record<string, string> = {
    EVENT: "Events", REFERRAL: "Referrals", PROMO: "Promo Codes", DIRECT: "Website / Direct",
  };

  const summary = Object.entries(sourceBuckets).map(([key, v]) => ({
    source:   key,
    label:    BUCKET_LABELS[key],
    leads:    v.leads,
    applied:  v.applied,
    enrolled: v.enrolled,
    applyRate:   v.leads ? Math.round((v.applied  / v.leads) * 100) : 0,
    enrollRate:  v.leads ? Math.round((v.enrolled / v.leads) * 100) : 0,
  }));

  // ── Events breakdown ──────────────────────────────────────────────────────────
  const events = await prisma.event.findMany({
    select: {
      id: true, title: true, eventType: true, startsAt: true, location: true,
      registrations: {
        select: { attendedAt: true, leadId: true },
      },
    },
    orderBy: { startsAt: "desc" },
    take: 20,
  });

  // Gather all leadIds from event registrations to batch-check stages
  const allEventLeadIds = events.flatMap(e => e.registrations.map(r => r.leadId).filter(Boolean)) as string[];
  const eventLeads = allEventLeadIds.length
    ? await prisma.lead.findMany({
        where: { id: { in: allEventLeadIds }, deletedAt: null },
        select: { id: true, stage: true },
      })
    : [];
  const eventLeadMap = new Map(eventLeads.map(l => [l.id, l.stage]));

  const eventsData = events.map(e => {
    const registered = e.registrations.length;
    const attended   = e.registrations.filter(r => r.attendedAt).length;
    const applied    = e.registrations.filter(r => {
      const stage = r.leadId ? eventLeadMap.get(r.leadId) : null;
      return stage && ["APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "ENROLLED"].includes(stage);
    }).length;
    const enrolled = e.registrations.filter(r => {
      const stage = r.leadId ? eventLeadMap.get(r.leadId) : null;
      return stage === "ENROLLED";
    }).length;
    return {
      id:          e.id,
      title:       e.title,
      eventType:   e.eventType,
      startsAt:    e.startsAt.toISOString(),
      location:    e.location,
      registered,
      attended,
      applied,
      enrolled,
      attendRate:  registered ? Math.round((attended  / registered) * 100) : 0,
      enrollRate:  registered ? Math.round((enrolled  / registered) * 100) : 0,
    };
  });

  // ── Referrals breakdown ───────────────────────────────────────────────────────
  const referralLeads = await prisma.lead.findMany({
    where: { deletedAt: null, source: "REFERRAL", referralCode: { not: null } },
    select: { referralCode: true, stage: true },
  });

  const refMap: Record<string, { leads: number; enrolled: number }> = {};
  for (const l of referralLeads) {
    const code = l.referralCode!;
    if (!refMap[code]) refMap[code] = { leads: 0, enrolled: 0 };
    refMap[code].leads++;
    if (l.stage === "ENROLLED") refMap[code].enrolled++;
  }

  // Resolve referral codes to user names
  const refCodes = Object.keys(refMap);
  const referrers = refCodes.length
    ? await prisma.user.findMany({
        where: { referralCode: { in: refCodes } },
        select: { referralCode: true, name: true, email: true },
      })
    : [];
  const referrerMap = new Map(referrers.map(u => [u.referralCode!, { name: u.name, email: u.email }]));

  const referralsData = refCodes
    .map(code => ({
      code,
      referrerName:  referrerMap.get(code)?.name  ?? null,
      referrerEmail: referrerMap.get(code)?.email ?? null,
      leads:    refMap[code].leads,
      enrolled: refMap[code].enrolled,
      enrollRate: refMap[code].leads
        ? Math.round((refMap[code].enrolled / refMap[code].leads) * 100) : 0,
    }))
    .sort((a, b) => b.enrolled - a.enrolled);

  // ── Promo codes breakdown ─────────────────────────────────────────────────────
  const promoCodes = await prisma.promoCode.findMany({
    orderBy: { usedCount: "desc" },
    select: { code: true, label: true, discountPct: true, usedCount: true, active: true },
  });

  // Count enrolled leads per promo code
  const promoLeads = await prisma.lead.groupBy({
    by: ["promoCode"],
    where: { deletedAt: null, promoCode: { not: null }, stage: "ENROLLED" },
    _count: { id: true },
  });
  const promoEnrolledMap = new Map(promoLeads.map(p => [p.promoCode!, p._count.id]));

  const promoData = promoCodes.map(p => ({
    code:       p.code,
    label:      p.label,
    discountPct: p.discountPct,
    active:     p.active,
    leads:      p.usedCount,
    enrolled:   promoEnrolledMap.get(p.code) ?? 0,
    enrollRate: p.usedCount
      ? Math.round(((promoEnrolledMap.get(p.code) ?? 0) / p.usedCount) * 100) : 0,
  }));

  return NextResponse.json({ summary, events: eventsData, referrals: referralsData, promoCodes: promoData });
}
