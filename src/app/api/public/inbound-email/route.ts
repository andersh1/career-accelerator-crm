/**
 * POST /api/public/inbound-email — Resend `email.received` webhook.
 *
 * The CC address. A team member puts crm@inbound.vantagecareer.co on the Cc
 * line (or forwards a message to it) and the email lands on the right lead's
 * timeline without anyone copying it across by hand.
 *
 * This is the half the Gmail sync structurally cannot do. That sync reads
 * `in:sent`, so it only ever sees our side of a conversation; a Fellow's reply,
 * a partner's intro, a parent's question have never appeared in the CRM at all.
 *
 * ── How a message finds its lead ──────────────────────────────────────────
 *   1. Every address on From/To/Cc that is neither ours nor the inbox itself.
 *   2. Matched against Lead.email and Lead.studentEmail (a parent-submitted
 *      application stores the student separately, and the thread is usually
 *      with whichever of the two is not the one on `email`).
 *   3. Nothing matched? Read the addresses back out of the body, which is how
 *      a forwarded message carries its original participants.
 *   4. Still nothing: a notification, never silence. See below.
 *
 * Matching more than one lead logs to each of them. An email to a Fellow and
 * their parent is genuinely about both people.
 *
 * ── What is refused ───────────────────────────────────────────────────────
 * The signature proves Resend sent it. SPF/DKIM/DMARC prove the sender's
 * domain vouches for the From. Both have to hold, or a stranger who learned
 * this address could write anything onto a Fellow's record under Dan's name.
 *
 * Everything stored here is UNTRUSTED TEXT from outside the company. It is
 * displayed, never acted on.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature,
  candidateAddresses,
  addressesInBody,
  timelineBody,
  plainText,
  senderVerified,
  direction,
  normalizeAddress,
  isTeamAddress,
  type ReceivedEvent,
  type ReceivedEmail,
} from "@/lib/inbound-email";

export const dynamic = "force-dynamic";

const RESEND_API_KEY   = process.env.RESEND_API_KEY ?? "";
const WEBHOOK_SECRET   = process.env.RESEND_INBOUND_WEBHOOK_SECRET ?? "";

/**
 * Overridable so the whole path — signature, matching, the row that gets
 * written — can be exercised against a stub instead of a real delivery.
 * Unset everywhere except a local test run.
 */
const RESEND_API_BASE  = process.env.RESEND_API_BASE ?? "https://api.resend.com";

/**
 * Always 200 on anything we have decided not to store.
 *
 * Resend retries a non-2xx for hours. A spam message or an email about nobody
 * in the CRM is not a failure we want redelivered every few minutes — it is a
 * decision, and it has already been made. Genuine faults (the body fetch
 * failing, the database being down) still return 500 so the retry is useful.
 */
function done(reason: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, reason, ...extra });
}

async function fetchFullEmail(emailId: string): Promise<ReceivedEmail | null> {
  const res = await fetch(`${RESEND_API_BASE}/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) return null;
  return await res.json() as ReceivedEmail;
}

export async function POST(req: NextRequest) {
  // The raw bytes, before any JSON parsing — the signature covers the exact
  // string Resend sent, and re-serializing an object would not reproduce it.
  const raw = await req.text();

  const sig = verifySignature({
    secret:        WEBHOOK_SECRET,
    payload:       raw,
    svixId:        req.headers.get("svix-id"),
    svixTimestamp: req.headers.get("svix-timestamp"),
    svixSignature: req.headers.get("svix-signature"),
  });
  if (!sig.ok) {
    return NextResponse.json({ error: "Unauthorized", reason: sig.reason }, { status: 401 });
  }

  let event: ReceivedEvent;
  try {
    event = JSON.parse(raw) as ReceivedEvent;
  } catch {
    return done("unparseable_payload");
  }

  if (event.type !== "email.received") return done("ignored_event_type", { type: event.type });

  const emailId = event.data?.email_id;
  if (!emailId) return done("no_email_id");

  // Resend redelivers; the same message must not land on a timeline twice.
  // Keyed on the Resend id rather than the RFC Message-ID, which a forwarding
  // client is free to reuse.
  const already = await prisma.leadActivity.findFirst({
    where: { source: "EMAIL_CC", metadata: { contains: emailId } },
    select: { id: true },
  });
  if (already) return done("already_logged", { emailId });

  if (!RESEND_API_KEY) {
    // A real fault: the message exists at Resend and we cannot read it. Let the
    // retry pick it up once the key is set.
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const full = await fetchFullEmail(emailId);
  if (!full) return NextResponse.json({ error: "Could not retrieve email body" }, { status: 500 });

  if (!senderVerified(full.authentication)) {
    return done("sender_failed_authentication", {
      emailId,
      spf: full.authentication?.spf, dkim: full.authentication?.dkim, dmarc: full.authentication?.dmarc,
    });
  }

  const fromAddr = normalizeAddress(full.from ?? event.data.from ?? "");
  const subject  = (full.subject ?? event.data.subject ?? "").trim() || "(no subject)";
  const fullText = plainText({ text: full.text, html: full.html });
  const body     = timelineBody({ text: full.text, html: full.html });
  const sentAt   = full.created_at ? new Date(full.created_at) : new Date();

  // 1–2. The headers.
  let addresses = candidateAddresses({
    from: full.from ?? event.data.from,
    to:   full.to   ?? event.data.to,
    cc:   full.cc   ?? event.data.cc,
  });

  let leads = await findLeads(addresses);

  // 3. A forward: the real participants are in the text, not the headers.
  let matchedVia: "headers" | "body" = "headers";
  if (leads.length === 0) {
    // The full text, not `body` — a forward's own header block is the thing
    // being read, and trimming happens before this on a reply.
    const fromBody = addressesInBody(fullText);
    if (fromBody.length > 0) {
      leads = await findLeads(fromBody);
      if (leads.length > 0) { addresses = fromBody; matchedVia = "body"; }
    }
  }

  // 4. Nobody. Say so rather than dropping it.
  if (leads.length === 0) {
    // Only when one of us sent it. An unmatched message from a stranger is
    // spam arriving at a public address, and turning that into a notification
    // hands anyone who learns the address a way to fill the bell icon.
    if (isTeamAddress(fromAddr)) {
      await prisma.cRMNotification.create({
        data: {
          type:  "EMAIL_UNMATCHED",
          title: "Forwarded email matched no lead",
          body:  `"${subject}" from ${fromAddr} — no CRM record for ${addresses.join(", ") || "any address on the message"}.`,
          href:  "/leads",
        },
      }).catch(() => {});
      return done("unmatched_notified", { emailId, addresses });
    }
    return done("unmatched_ignored", { emailId });
  }

  const dir = direction(fromAddr);

  // `createdBy` is the team member when one of us sent it, so the timeline
  // shows an author rather than an anonymous entry. An inbound message from
  // the lead has no author on our side and stays null.
  const author = dir === "OUTBOUND"
    ? await prisma.user.findFirst({ where: { email: fromAddr }, select: { id: true } })
    : null;

  for (const lead of leads) {
    await prisma.leadActivity.create({
      data: {
        leadId:    lead.id,
        type:      "EMAIL",
        subject,
        // The lead's own address either way. The column names the person this
        // row is filed under, which is what the timeline renders; who sent it
        // is `direction` plus `from` in the metadata. Storing the sender here
        // on an inbound message put a non-lead address in a field every other
        // source fills with the lead's.
        emailTo:   lead.email,
        content:   body,
        source:    "EMAIL_CC",
        createdBy: author?.id ?? null,
        createdAt: sentAt,
        metadata:  JSON.stringify({
          resendEmailId: emailId,
          messageId:     full.message_id ?? event.data.message_id ?? null,
          direction:     dir,
          from:          fromAddr,
          matchedVia,
          attachments:   (full.attachments ?? []).map(a => a.filename).filter(Boolean),
        }),
      },
    });
  }

  return NextResponse.json({
    ok: true,
    emailId,
    logged: leads.map(l => ({ id: l.id, email: l.email })),
    direction: dir,
    matchedVia,
  });
}

/**
 * Leads reachable at any of these addresses.
 *
 * `studentEmail` is searched alongside `email` because a parent-submitted
 * application puts the parent on `email` and the student on `studentEmail`,
 * and the thread worth filing is usually with whichever one is not the lead's
 * primary address.
 */
async function findLeads(addresses: string[]) {
  if (addresses.length === 0) return [];
  const found = await prisma.lead.findMany({
    where: {
      OR: [
        { email: { in: addresses, mode: "insensitive" } },
        { studentEmail: { in: addresses, mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true },
  });
  return found;
}
