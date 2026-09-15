/**
 * POST /api/public/ignition-event?key=INTERNAL_API_SECRET
 *      (or the same secret in an `x-ignition-secret` header)
 *
 * Ignition tells the CRM when someone signs and when they pay. That is the whole
 * contract — Ignition owns the agreement and the money, QuickBooks owns the
 * books, and the pipeline here stops being something Dan has to update by hand.
 *
 * Phase 1 transport is Zapier, which only exposes proposal triggers; invoice
 * events arrive once Ignition's own signed webhook is pointed at this same route.
 * `normalizeEvent` already understands both envelopes.
 *
 * Two rules this endpoint holds to, because Ignition warns about both:
 *   · deliveries repeat — a payment is keyed on the Ignition invoice slug and
 *     upserted, so the same delivery twice never collects the money twice;
 *   · deliveries arrive out of order — a late `proposal.sent` must not drag an
 *     enrolled Fellow back to OFFER_SENT.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { routeLead } from "@/lib/lead-routing";
import {
  normalizeEvent,
  isKnownEvent,
  shouldAdvance,
  derivePaymentStatus,
  totalCents,
  type NormalizedEvent,
} from "@/lib/ignition";

const SECRET = process.env.IGNITION_WEBHOOK_SECRET || process.env.INTERNAL_API_SECRET || "";

function authorized(req: NextRequest): boolean {
  if (!SECRET) return false;
  const given = req.headers.get("x-ignition-secret") ?? req.nextUrl.searchParams.get("key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Fire-and-forget: a failed timeline entry must never fail the delivery. */
function logActivity(data: {
  leadId: string; type: string; content: string; metadata?: string;
}) {
  return prisma.leadActivity.create({
    data: { ...data, source: "IGNITION", createdBy: null },
  }).catch(() => {});
}

function notify(data: { type: string; title: string; body?: string; leadId: string }) {
  return prisma.cRMNotification.create({
    data: { ...data, href: `/leads/${data.leadId}` },
  }).catch(() => {});
}

/**
 * Find the person this event is about — by the CRM id we stamped into the
 * Ignition client, then by email, then by the student's email when a parent is
 * the payer.
 *
 * A signature for someone we have no record of is worse to drop than to file
 * imperfectly, so an accepted or sent proposal creates the lead and tags it for
 * a human to look at. An invoice for an unknown person is never enough to
 * invent one.
 */
async function resolveLead(ev: NormalizedEvent) {
  if (ev.leadRef) {
    const byRef = await prisma.lead.findUnique({ where: { id: ev.leadRef } });
    if (byRef) return byRef;
  }
  if (ev.email) {
    const byEmail = await prisma.lead.findUnique({ where: { email: ev.email } });
    if (byEmail) return byEmail;

    const byStudentEmail = await prisma.lead.findFirst({
      where: { studentEmail: ev.email, deletedAt: null },
    });
    if (byStudentEmail) return byStudentEmail;
  }
  if (!ev.email || !ev.type.startsWith("proposal.")) return null;

  const created = await prisma.lead.create({
    data: {
      firstName: ev.firstName ?? ev.email.split("@")[0],
      lastName:  ev.lastName ?? "",
      email:     ev.email,
      phone:     ev.phone,
      stage:      "LEAD",
      leadType:   "APPLICATION",
      source:     "IGNITION",
      assignedTo: routeLead("APPLICATION"),
      tags:       ["ignition-unmatched"],
      notes:      "Created from an Ignition proposal event — nobody in the CRM matched this email. Worth checking whether this is a duplicate of an existing record.",
    },
  });
  await logActivity({
    leadId: created.id,
    type: "CREATED",
    content: "Created from an Ignition proposal event — no existing lead matched this email.",
  });
  await notify({
    type: "NEW_INTAKE",
    title: `Unmatched Ignition client: ${created.firstName} ${created.lastName}`.trim(),
    body: `${ev.email} signed or was sent a proposal but had no CRM record.`,
    leadId: created.id,
  });
  return created;
}

/** Recompute status from what has actually been collected, and save if it moved. */
async function refreshPaymentStatus(leadId: string, current: string | null, dealValue: number | null) {
  const rows = await prisma.paymentRecord.findMany({
    where: { leadId },
    select: { amount: true, amountCents: true },
  });
  const paid = totalCents(rows);
  const next = derivePaymentStatus(current, paid, dealValue);
  if (next !== current) {
    await prisma.lead.update({ where: { id: leadId }, data: { paymentStatus: next } });
  }
  return { paid, status: next };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Expected a JSON object" }, { status: 400 });
  }

  const ev = normalizeEvent(raw as Record<string, unknown>);

  // 200 rather than an error: an event we don't act on is not a delivery failure,
  // and anything else puts Ignition into a day of retries for nothing.
  if (!isKnownEvent(ev.type)) {
    return NextResponse.json({ ok: true, skipped: `unhandled event: ${ev.type || "(none)"}` });
  }

  // Our own writes come back to us. Phase 2 only — Zapier sends no source block.
  if (ev.appSlug && process.env.IGNITION_APP_SLUG && ev.appSlug === process.env.IGNITION_APP_SLUG) {
    return NextResponse.json({ ok: true, skipped: "our own write" });
  }

  // A payment we can't key is a payment we can't dedupe, and double-counted
  // revenue is worse than a delivery that visibly fails. Fail it visibly.
  if (ev.type === "invoice.paid" && !ev.invoiceRef) {
    return NextResponse.json(
      { error: "invoice.paid needs an invoice reference to stay idempotent — map invoice_slug in the Zap" },
      { status: 400 },
    );
  }

  const lead = await resolveLead(ev);
  if (!lead) {
    return NextResponse.json({ ok: true, skipped: "no matching lead, and not enough to create one" });
  }

  const dollars = ev.amountCents !== null ? Math.round(ev.amountCents / 100) : null;

  switch (ev.type) {
    // ── the proposal went out ────────────────────────────────────────────────
    case "proposal.sent": {
      if (!shouldAdvance(lead.stage, "OFFER_SENT")) break;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: "OFFER_SENT",
          ...(dollars && !lead.dealValue ? { dealValue: dollars } : {}),
        },
      });
      await logActivity({
        leadId: lead.id,
        type: "STAGE_CHANGE",
        content: `Proposal sent from Ignition${ev.proposalRef ? ` (${ev.proposalRef})` : ""}.`,
        metadata: JSON.stringify({ from: lead.stage, to: "OFFER_SENT" }),
      });
      break;
    }

    // ── they signed ──────────────────────────────────────────────────────────
    case "proposal.accepted": {
      const advancing = shouldAdvance(lead.stage, "ENROLLED");
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...(advancing ? { stage: "ENROLLED" } : {}),
          // The accepted total is the contract; a later invoice is only a slice of it.
          ...(dollars ? { dealValue: dollars } : {}),
          ...(lead.leadType === "APPLICATION" || !lead.leadType ? { leadType: "STUDENT" } : {}),
        },
      });
      await logActivity({
        leadId: lead.id,
        type: "ENROLLED",
        content: `Signed in Ignition${ev.proposalRef ? ` (${ev.proposalRef})` : ""}${dollars ? ` — $${dollars.toLocaleString()}` : ""}.`,
        metadata: JSON.stringify({ from: lead.stage, to: "ENROLLED" }),
      });
      if (advancing) {
        await notify({
          type: "LEAD_ENROLLED",
          title: `Signed: ${lead.firstName} ${lead.lastName}`.trim(),
          body: dollars ? `$${dollars.toLocaleString()} — accepted in Ignition` : "Accepted in Ignition",
          leadId: lead.id,
        });
      }
      break;
    }

    // ── they walked ──────────────────────────────────────────────────────────
    case "proposal.lost": {
      if (lead.stage === "ENROLLED" || lead.stage === "COMPLETED") break; // a signed Fellow stays signed
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          stage: "LOST",
          // lostCategory stays a human call — it is a fixed list the charts count,
          // and Ignition has no field that maps onto it cleanly.
          lostReason: ev.detail ?? "Proposal marked lost in Ignition.",
        },
      });
      await logActivity({
        leadId: lead.id,
        type: "STAGE_CHANGE",
        content: `Proposal marked lost in Ignition${ev.detail ? ` — ${ev.detail}` : ""}. Set a lost category when you get a chance.`,
        metadata: JSON.stringify({ from: lead.stage, to: "LOST" }),
      });
      break;
    }

    // ── an invoice was raised ────────────────────────────────────────────────
    case "invoice.created": {
      const { status } = await refreshPaymentStatus(lead.id, lead.paymentStatus, dollars ?? lead.dealValue);
      await logActivity({
        leadId: lead.id,
        type: "NOTE",
        content: `Invoice raised in Ignition${ev.invoiceRef ? ` (${ev.invoiceRef})` : ""}${ev.amountCents !== null ? ` for ${money(ev.amountCents)}` : ""}. Payment status: ${status.replace("_", " ").toLowerCase()}.`,
      });
      break;
    }

    // ── the money landed ─────────────────────────────────────────────────────
    case "invoice.paid": {
      if (ev.amountCents === null || ev.amountCents <= 0) {
        return NextResponse.json({ error: "invoice.paid needs an amount" }, { status: 400 });
      }
      const existing = await prisma.paymentRecord.findUnique({ where: { externalId: ev.invoiceRef! } });

      await prisma.paymentRecord.upsert({
        where:  { externalId: ev.invoiceRef! },
        create: {
          leadId:      lead.id,
          amount:      Math.round(ev.amountCents / 100),
          amountCents: ev.amountCents,
          source:      "IGNITION",
          externalId:  ev.invoiceRef!,
          note:        `Ignition invoice ${ev.invoiceRef}`,
          paidAt:      ev.occurredAt,
        },
        update: {
          amount:      Math.round(ev.amountCents / 100),
          amountCents: ev.amountCents,
          paidAt:      ev.occurredAt,
        },
      });

      const { paid, status } = await refreshPaymentStatus(lead.id, lead.paymentStatus, lead.dealValue);

      // A redelivery is not news. Only say something the first time.
      if (!existing) {
        await logActivity({
          leadId: lead.id,
          type: "NOTE",
          content: `Payment received via Ignition: ${money(ev.amountCents)} (invoice ${ev.invoiceRef}). Total collected: ${money(paid)}.`,
        });
        await notify({
          type: "PAYMENT_RECEIVED",
          title: `Paid: ${lead.firstName} ${lead.lastName}`.trim(),
          body: `${money(ev.amountCents)} — ${money(paid)} collected of ${lead.dealValue ? `$${lead.dealValue.toLocaleString()}` : "an unset contract value"}`,
          leadId: lead.id,
        });
      }

      return NextResponse.json({
        ok: true, leadId: lead.id, event: ev.type,
        duplicate: Boolean(existing), collectedCents: paid, paymentStatus: status,
      });
    }
  }

  return NextResponse.json({ ok: true, leadId: lead.id, event: ev.type });
}
