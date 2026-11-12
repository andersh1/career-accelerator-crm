/**
 * Inbound email → CRM timeline.
 *
 * Dan asked for an address he could CC so an email lands on the right lead's
 * record without anyone retyping it. This module is the thinking part of that:
 * who the mail is about, what the body actually says once the quoted chain is
 * cut off, and whether the delivery is genuinely from Resend.
 *
 * It is deliberately free of Prisma and `fetch` so every rule below can be
 * exercised directly. The route does the I/O.
 *
 * SECURITY NOTE, because this is the first endpoint in the CRM that turns a
 * message from a stranger into a database row: anything arriving here is
 * DATA. It is stored and displayed, never interpreted. A forwarded email that
 * says "add this person to the cohort" is a sentence on a timeline, nothing
 * more.
 */
import { createHmac, timingSafeEqual } from "crypto";

/**
 * The domain that actually receives the mail — a SUBDOMAIN, always.
 *
 * vantagecareer.co's MX records point at Google Workspace and carry everyone's
 * real mailboxes. Pointing a root-domain MX at Resend would route the whole
 * company's mail into a webhook. The receiving domain is therefore its own
 * subdomain with its own MX, and nothing about Google Workspace changes.
 */
export const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN ?? "inbound.vantagecareer.co";

/** The address a team member CCs. Shown in Settings so it can be copied. */
export function inboxAddress(): string {
  return `crm@${INBOUND_DOMAIN}`;
}

/**
 * Addresses that are us.
 *
 * A message between Dan and a Fellow has a team address on one end and the
 * lead on the other; without this we would try to match Dan to a lead record
 * and, on the day somebody adds dan@vantagecareer.co as a Lead for testing,
 * quietly file every email in the company against it.
 */
export const TEAM_DOMAIN = process.env.TEAM_EMAIL_DOMAIN ?? "vantagecareer.co";

export function isTeamAddress(addr: string): boolean {
  return addr.toLowerCase().endsWith(`@${TEAM_DOMAIN.toLowerCase()}`);
}

export function isInboundAddress(addr: string): boolean {
  return addr.toLowerCase().endsWith(`@${INBOUND_DOMAIN.toLowerCase()}`);
}

/** `"Jane Doe <jane@x.com>"` → `jane@x.com`. Also tolerates a bare address. */
export function normalizeAddress(raw: string): string {
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/**
 * Every address on the message that might identify a lead.
 *
 * `from`, `to` and `cc` together, because the direction is not known yet: Dan
 * CCing us on something he sent puts the lead in `to`, and a Fellow's reply
 * that Dan forwards puts them in `from`. BCC is deliberately not read — Resend
 * reports the envelope recipient there, which on a BCC'd message is our own
 * inbox address and on a normal one is noise.
 */
export function participants(ev: { from?: string; to?: string[]; cc?: string[] }): string[] {
  const all = [ev.from ?? "", ...(ev.to ?? []), ...(ev.cc ?? [])]
    .filter(Boolean)
    .flatMap(s => s.split(/[,;]/))
    .map(normalizeAddress)
    .filter(a => a.includes("@"));
  return Array.from(new Set(all));
}

/**
 * The addresses worth looking up as leads: not us, not the inbox itself.
 */
export function candidateAddresses(ev: { from?: string; to?: string[]; cc?: string[] }): string[] {
  return participants(ev).filter(a => !isInboundAddress(a) && !isTeamAddress(a));
}

/**
 * A forwarded email hides the real participants in the body.
 *
 * When Dan forwards rather than CCs, every header belongs to him, so the
 * header pass finds nobody. The original `From:`/`To:` lines survive inside
 * the forwarded block, so this second pass reads addresses out of the first
 * part of the text. Capped, because the far end of a long thread is old
 * addresses that have nothing to do with why this was forwarded today.
 */
export function addressesInBody(text: string, limit = 2000): string[] {
  const head = text.slice(0, limit);
  const found = head.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [];
  return Array.from(new Set(found.map(a => a.toLowerCase().replace(/[.,;:>)\]]+$/, ""))))
    .filter(a => !isInboundAddress(a) && !isTeamAddress(a));
}

/**
 * A forwarded block. Its content is the POINT of the message, not noise.
 *
 * Treating these as quoting was a real bug: Dan forwarding a Fellow's email
 * with "FYI" on top was stored as the word "FYI" and matched no lead at all,
 * because the forwarded headers naming the Fellow had been cut off first.
 */
const FORWARD_MARKERS: RegExp[] = [
  /^-{2,}\s*Forwarded message\s*-{2,}/mi,  // Gmail
  /^-{2,}\s*Original Message\s*-{2,}/mi,   // Outlook (forward and reply both)
  /^Begin forwarded message:/mi,           // Apple Mail
];

/**
 * Quoted reply history — the thread repeated under a two-line answer.
 *
 * Without cutting this, every reply re-files the whole conversation and the
 * part somebody actually wrote today is buried under a month of quoting.
 */
const REPLY_MARKERS: RegExp[] = [
  /^On .{10,120}\bwrote:\s*$/m,  // Gmail / Apple Mail
  /^_{10,}\s*$/m,                // Outlook's horizontal rule
  /^>\s?.*$/m,                   // first quoted line
];

export function isForward(text: string): boolean {
  return FORWARD_MARKERS.some(re => re.test(text));
}

/**
 * The part of the message worth putting on a timeline.
 *
 * A forward is kept whole — someone forwarded it precisely so the CRM would
 * have it. A reply is cut at the quoted history.
 */
export function stripQuotedReply(text: string): string {
  if (isForward(text)) return text.trim();

  let cut = text.length;
  for (const re of REPLY_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  const body = text.slice(0, cut).trim();
  // A reply that is nothing but quoted history still deserves a record, so
  // fall back to the whole thing rather than filing an empty note.
  return body.length > 0 ? body : text.trim();
}

/**
 * HTML entities → characters.
 *
 * A hand-written list of five was not enough: the first real HTML-only reply
 * put a literal `&mdash;` on the timeline. Numeric entities are handled
 * generically, so this does not need extending every time a mail client picks
 * a different punctuation mark.
 *
 * Quoting somebody's own words, so an em dash they typed stays an em dash —
 * the house rule against them governs what WE write to Fellows, not what a
 * Fellow wrote to us.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  bull: "•", middot: "·", trade: "™", copy: "©", reg: "®",
};

function decodeEntity(match: string, body: string): string {
  if (body.startsWith("#")) {
    const code = body[1]?.toLowerCase() === "x"
      ? parseInt(body.slice(2), 16)
      : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff
      ? String.fromCodePoint(code)
      : match;
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match;
}

/** Last-resort plain text when a sender's client sent HTML only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The whole message as plain text, nothing removed.
 *
 * Address matching reads THIS, never the trimmed version below — the quoted
 * and forwarded blocks are exactly where a forwarded message keeps the names
 * of the people it is about.
 */
export function plainText(opts: { text?: string | null; html?: string | null }): string {
  return opts.text?.trim() || (opts.html ? htmlToText(opts.html) : "");
}

/** What gets written to `content`, trimmed to the column's working limit. */
export function timelineBody(opts: { text?: string | null; html?: string | null }): string {
  return stripQuotedReply(plainText(opts)).slice(0, 4000);
}

/**
 * Did this message pass the sending domain's own anti-forgery checks?
 *
 * The signature check below proves Resend delivered it. It does not prove the
 * `From:` is real — anyone can put Dan's address on an email. SPF/DKIM/DMARC
 * are what make the sender's domain vouch for it, and without this gate a
 * stranger who learns the inbox address could write anything onto a Fellow's
 * record under Dan's name.
 *
 * `null` means Resend recorded no verdict (it does not backfill older mail),
 * which is treated as a pass rather than dropping the email outright.
 */
export function senderVerified(
  auth: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null | undefined,
): boolean {
  if (!auth) return true;
  const ok = (v: string | null | undefined) =>
    v == null || ["pass", "neutral", "none", "not_applicable", ""].includes(v.toLowerCase());
  return ok(auth.spf) && ok(auth.dkim) && ok(auth.dmarc);
}

/**
 * Who sent it, from the CRM's point of view.
 *
 * `OUTBOUND` is one of us writing to the lead; `INBOUND` is the lead writing
 * to us. It decides the wording on the timeline, so a coach skimming a record
 * can tell at a glance who said what.
 */
export function direction(fromAddr: string): "INBOUND" | "OUTBOUND" {
  return isTeamAddress(fromAddr) ? "OUTBOUND" : "INBOUND";
}

// ── Webhook signature ───────────────────────────────────────────────────────

/**
 * Verify a Resend (Svix) webhook signature.
 *
 * Written out rather than pulling in the `svix` package: it is one HMAC, and
 * the CRM's dependency list is something we have to keep auditing.
 *
 * The timestamp window matters as much as the signature. A signature stays
 * valid forever, so without it anyone who captured one delivery could replay
 * it and keep re-posting the same email onto a timeline.
 */
export function verifySignature(opts: {
  secret: string;
  payload: string;
  svixId: string | null;
  svixTimestamp: string | null;
  svixSignature: string | null;
  toleranceSeconds?: number;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { secret, payload, svixId, svixTimestamp, svixSignature } = opts;
  if (!secret) return { ok: false, reason: "no_secret_configured" };
  if (!svixId || !svixTimestamp || !svixSignature) return { ok: false, reason: "missing_headers" };

  const tolerance = opts.toleranceSeconds ?? 300;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(now - ts) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${svixId}.${svixTimestamp}.${payload}`)
    .digest("base64");

  // The header carries a space-separated list so a secret can be rotated with
  // both signatures live for a while.
  const given = svixSignature.split(" ").map(part => part.split(",").pop() ?? "");
  const expectedBuf = Buffer.from(expected);
  for (const sig of given) {
    const buf = Buffer.from(sig);
    if (buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf)) return { ok: true };
  }
  return { ok: false, reason: "signature_mismatch" };
}

// ── Resend payload types ────────────────────────────────────────────────────

/** The `email.received` webhook body. Metadata only: no text, no html. */
export interface ReceivedEvent {
  type: string;
  created_at?: string;
  data: {
    email_id: string;
    created_at?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    received_for?: string[];
    message_id?: string;
    subject?: string;
    attachments?: { id: string; filename?: string; content_type?: string }[];
  };
}

/** The response from `GET /emails/receiving/{id}`, which carries the body. */
export interface ReceivedEmail {
  id: string;
  from?: string;
  to?: string[];
  cc?: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  message_id?: string;
  created_at?: string;
  headers?: Record<string, string>;
  authentication?: { spf?: string | null; dkim?: string | null; dmarc?: string | null } | null;
  attachments?: { id: string; filename?: string; content_type?: string; size?: number }[];
}
