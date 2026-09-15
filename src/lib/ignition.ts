/**
 * Ignition → CRM: turning a proposal or invoice event into a change on a lead.
 *
 * Ignition owns the agreement and the money; the CRM owns the pipeline. The only
 * facts that cross the line are "they signed" and "they paid", and this file is
 * where those arrive in a shape the CRM understands.
 *
 * Phase 1 feeds it from Zapier, whose POST body we define ourselves in the Zap.
 * Phase 2 points Ignition's own signed webhook at the same route; that envelope
 * is { type, occurred_at, source, data }. Both shapes normalise here, so moving
 * to the real webhook later is a change of transport, not of meaning.
 *
 * Ignition states outright that deliveries repeat and arrive out of order, so
 * nothing below may assume it is seeing an event for the first time — or that a
 * later event has not already been handled.
 */

export const IGNITION_EVENTS = [
  "proposal.sent",
  "proposal.accepted",
  "proposal.lost",
  "invoice.created",
  "invoice.paid",
] as const;

export type IgnitionEventType = (typeof IGNITION_EVENTS)[number];

export interface NormalizedEvent {
  type: string;
  occurredAt: Date;
  /** CRM lead id, when we stamped it into the Ignition client's external reference. */
  leadRef: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  /** Money in cents. Ignition reports cents; a Zap may well hand us dollars. */
  amountCents: number | null;
  /** Ignition invoice slug — the idempotency key for a payment. */
  invoiceRef: string | null;
  proposalRef: string | null;
  /** The OAuth app that caused the change, so phase 2 can skip our own echo. */
  appSlug: string | null;
  /** Free text worth keeping on the timeline (a lost reason, an invoice number). */
  detail: string | null;
}

// ── parsing helpers ──────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** First of these that is a non-empty string, trimmed. */
function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Cents, preferring an explicit cents field and falling back to a dollar figure.
 * Zapier hands money over as a display string more often than not — "$6,000.00"
 * has to survive the trip, because a silently dropped amount looks exactly like
 * a free enrollment on the revenue page.
 */
function toCents(cents: unknown, dollars: unknown): number | null {
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);
  if (typeof cents === "string" && cents.trim() !== "" && Number.isFinite(Number(cents))) {
    return Math.round(Number(cents));
  }
  const raw = typeof dollars === "string" ? dollars.replace(/[$,\s]/g, "") : dollars;
  const n =
    typeof raw === "number" ? raw
      : typeof raw === "string" && raw !== "" ? Number(raw)
      : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function splitName(full: string | null): { firstName: string | null; lastName: string | null } {
  if (!full) return { firstName: null, lastName: null };
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || null };
}

// ── normalisation ────────────────────────────────────────────────────────────

/**
 * Flatten whichever shape arrived into one set of facts.
 *
 * Field names are deliberately permissive: the Zap author picks them from a
 * dropdown, and a mapping that silently misses is a payment that never lands.
 */
export function normalizeEvent(body: Record<string, unknown>): NormalizedEvent {
  const data    = asRecord(body.data) ?? body;
  const client  = asRecord(data.client)  ?? asRecord(body.client)  ?? {};
  const contact = asRecord(data.contact) ?? asRecord(client.default_contact) ?? asRecord(body.contact) ?? {};
  const source  = asRecord(body.source)  ?? {};

  const type = (firstString(body.type, body.event, data.event) ?? "").toLowerCase();

  const email = firstString(
    body.email, data.email, contact.email, client.email,
    body.client_email, data.client_email, contact.email_address,
  );

  const name = firstString(
    body.name, data.name, contact.name, client.name,
    body.client_name, data.client_name, body.contact_name,
  );
  const explicitFirst = firstString(body.first_name, data.first_name, contact.first_name);
  const explicitLast  = firstString(body.last_name,  data.last_name,  contact.last_name);
  const split = splitName(name);

  const occurredRaw = firstString(body.occurred_at, data.occurred_at, body.occurredAt, body.timestamp);
  const occurredAt = occurredRaw && !Number.isNaN(Date.parse(occurredRaw))
    ? new Date(occurredRaw)
    : new Date();

  return {
    type,
    occurredAt,
    leadRef: firstString(
      body.external_id, data.external_id, client.external_id,
      body.external_reference, data.external_reference, client.external_reference,
      body.lead_id, data.lead_id,
    ),
    email: email ? email.toLowerCase() : null,
    firstName: explicitFirst ?? split.firstName,
    lastName:  explicitLast  ?? split.lastName,
    phone: firstString(body.phone, data.phone, contact.phone, contact.mobile),
    amountCents: toCents(
      firstString(body.amount_cents, data.amount_cents, body.total_cents, data.total_cents),
      firstString(body.amount, data.amount, body.total, data.total, body.value, data.value),
    ),
    invoiceRef: firstString(
      body.invoice_slug, data.invoice_slug, body.invoice_id, data.invoice_id,
      body.slug && type.startsWith("invoice.") ? body.slug : null,
      data.slug && type.startsWith("invoice.") ? data.slug : null,
      body.number, data.number,
    ),
    proposalRef: firstString(
      body.proposal_slug, data.proposal_slug, body.proposal_id, data.proposal_id,
      body.slug && type.startsWith("proposal.") ? body.slug : null,
      data.slug && type.startsWith("proposal.") ? data.slug : null,
      body.reference, data.reference,
    ),
    appSlug: firstString(source.application_slug, body.application_slug),
    detail: firstString(body.reason, data.reason, body.note, data.note, body.title, data.title),
  };
}

export function isKnownEvent(type: string): type is IgnitionEventType {
  return (IGNITION_EVENTS as readonly string[]).includes(type);
}

// ── pipeline rules ───────────────────────────────────────────────────────────

/**
 * The pipeline in order. LOST sits outside it deliberately: a lost lead who
 * comes back and signs should move to ENROLLED, not be held where they fell.
 */
const STAGE_ORDER = [
  "LEAD", "CONTACTED", "APPLIED", "STRATEGY_CALL", "ADMITTED", "OFFER_SENT", "ENROLLED", "COMPLETED",
];

/**
 * Whether an Ignition event should move this lead. Events arrive out of order,
 * so a late `proposal.sent` must not drag a signed Fellow back to OFFER_SENT.
 */
export function shouldAdvance(from: string | null | undefined, to: string): boolean {
  if (!to || from === to) return false;
  const target = STAGE_ORDER.indexOf(to);
  if (target < 0) return false;
  const current = STAGE_ORDER.indexOf(from ?? "");
  if (current < 0) return true; // LOST, or a stage we don't rank — let the event win
  return target > current;
}

/**
 * Statuses a person chose on purpose. A scholarship or a partner-funded seat is
 * a decision, not a sum of invoices, and no webhook gets to overwrite it.
 */
const HUMAN_SET_STATUSES = new Set(["SCHOLARSHIP", "PAID_PARTNER"]);

/**
 * Payment status read off what has actually been collected, rather than set by
 * hand and left to drift. With instalments there is no single moment where
 * someone "paid", so the only honest answer is the running total against the
 * contract value.
 */
export function derivePaymentStatus(
  current: string | null | undefined,
  totalPaidCents: number,
  dealValueDollars: number | null | undefined,
): string {
  if (current && HUMAN_SET_STATUSES.has(current)) return current;

  const contractCents = (dealValueDollars ?? 0) * 100;

  if (totalPaidCents <= 0) return contractCents > 0 ? "OUTSTANDING" : (current ?? "UNPAID");
  if (contractCents <= 0) return "PAYMENT_PLAN";

  // A dollar of slack: the contract total is stored in whole dollars while the
  // invoices settle in cents, so an exactly-paid plan can land a few cents short.
  return totalPaidCents + 100 >= contractCents ? "PAID_FULL" : "PAYMENT_PLAN";
}

/**
 * What a payment row is worth, in cents. Rows synced from Ignition carry the
 * exact figure; rows a human typed only ever had whole dollars to give.
 */
export function rowCents(row: { amount: number; amountCents?: number | null }): number {
  return row.amountCents ?? row.amount * 100;
}

/** Sum of payment rows in cents, mixing synced and hand-entered rows safely. */
export function totalCents(rows: { amount: number; amountCents?: number | null }[]): number {
  return rows.reduce((sum, r) => sum + rowCents(r), 0);
}
