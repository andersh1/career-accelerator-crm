/**
 * The proof library: which answers may become a testimonial, and how they get
 * there.
 *
 * Nothing here collects anything new. The Module 8 finale survey has been
 * asking Fellows for a pitch line, a parent answer, their before-and-after arc
 * and the caveat they would whisper since it shipped, and those answers sit in
 * GrowthBattery under `answers._finale`. Marketing was re-chasing quotes by
 * hand because nobody could see them. This module reads them.
 *
 * SOURCES ARE AN ALLOWLIST, NOT A SWEEP. Weekly check-ins, 1:1 pulses,
 * coaching notes, intervention flags and 360 responses are private to the
 * Fellow and their coaches. They are not listed below and must never be added:
 * "put all the feedback in one place" is how a private note reaches a landing
 * page. Adding a source here is a decision about what a Fellow consented to,
 * not a convenience.
 */

/** A finale answer key that produces a quotable line, and what it produced. */
export interface QuoteSource {
  /** The key inside GrowthBattery.answers._finale. */
  key: string;
  /** Testimonial.kind */
  kind: string;
  /** Short label for the CRM. */
  label: string;
  /** The question the Fellow actually answered. Most of the context is here. */
  question: string;
}

/**
 * The four finale answers that are usable as proof.
 *
 * f_arc, f_keep, f_kill, f_gap and the rest of the battery are programme
 * feedback, not testimonials, and they stay where they are. f_arc is the one
 * judgement call: it is a before-and-after in the Fellow's own words, which is
 * the most useful thing marketing can have, so it is included and left as a
 * long quote for somebody to trim.
 */
export const QUOTE_SOURCES: QuoteSource[] = [
  {
    key: "f_pitch", kind: "PITCH", label: "Pitch line",
    question: "The one sentence you would use on a friend who is on the fence",
  },
  {
    key: "f_parent", kind: "PARENT", label: "Parent answer",
    question: "Imagine a parent asking: is this worth it for my kid? What would you honestly tell them?",
  },
  {
    key: "f_arc", kind: "ARC", label: "Before and after",
    question: "Where you started and where you stand now",
  },
  {
    key: "f_caveat", kind: "CAVEAT", label: "Caveat",
    question: "And the caveat you would whisper",
  },
];

export const QUOTE_KINDS = QUOTE_SOURCES.map(s => s.kind).concat("TAKEAWAY", "MANUAL");

export function kindInfo(kind: string | null | undefined) {
  const found = QUOTE_SOURCES.find(s => s.kind === kind);
  if (found) return { label: found.label, question: found.question };
  if (kind === "TAKEAWAY") return { label: "Takeaway", question: "Biggest takeaway from the module" };
  return { label: "Added by hand", question: "" };
}

export const TESTIMONIAL_STATUSES = [
  { key: "DRAFT",     label: "Needs review", color: "bg-slate-100 text-slate-600"     },
  { key: "APPROVED",  label: "Approved",     color: "bg-emerald-100 text-emerald-700" },
  { key: "PUBLISHED", label: "In use",       color: "bg-teal-100 text-teal-700"       },
  { key: "ARCHIVED",  label: "Archived",     color: "bg-slate-100 text-slate-400"     },
];

export function testimonialStatusInfo(key: string | null | undefined) {
  return TESTIMONIAL_STATUSES.find(s => s.key === key) ?? TESTIMONIAL_STATUSES[0];
}

/**
 * What a Fellow can say yes to, asked separately because they are separate
 * permissions. "You can quote me" is not "you can name my employer", and
 * reading one as the other is the failure this whole module exists to prevent.
 */
export const CONSENT_SCOPES = [
  { key: "NAME",       label: "Use my name",            help: "Attribute the quote to them by name." },
  { key: "QUOTE_ANON", label: "Quote me anonymously",   help: "Quote the words without the name, e.g. \"a 2026 Fellow\"." },
  { key: "EMPLOYER",   label: "Name where I landed",    help: "Use the company and role from their outcome." },
  { key: "PHOTO",      label: "Use my photo",           help: "Headshot or session photo alongside the quote." },
];

export const CONSENT_STATES = [
  { key: "PENDING",  label: "Asked, waiting", color: "bg-amber-100 text-amber-700"     },
  { key: "GRANTED",  label: "Granted",        color: "bg-emerald-100 text-emerald-700" },
  { key: "DECLINED", label: "Declined",       color: "bg-rose-100 text-rose-700"       },
];

export function consentInfo(key: string | null | undefined) {
  return CONSENT_STATES.find(s => s.key === key)
    ?? { key: "NONE", label: "Not asked", color: "bg-slate-100 text-slate-500" };
}

/**
 * Is this quote cleared to run publicly, and if not, what is missing?
 *
 * Two independent gates, and the answer names the one that is open. Dan
 * approving the wording does not mean the Fellow agreed to be quoted, and a
 * Fellow agreeing does not mean this particular line was read by anyone. The
 * CRM shows both so nobody has to remember which they checked.
 */
export function clearance(t: {
  status: string;
  lead?: { marketingConsent: string | null; marketingConsentScopes: string[] } | null;
}): { ok: boolean; reason: string } {
  const consent = t.lead?.marketingConsent ?? null;
  const scopes  = t.lead?.marketingConsentScopes ?? [];
  const approved = t.status === "APPROVED" || t.status === "PUBLISHED";

  if (consent === "DECLINED")  return { ok: false, reason: "Fellow declined. Do not use." };
  if (!approved && consent !== "GRANTED") return { ok: false, reason: "Needs Dan's approval and the Fellow's permission" };
  if (!approved)               return { ok: false, reason: "Needs Dan's approval" };
  if (consent !== "GRANTED")   return { ok: false, reason: "Needs the Fellow's permission" };
  if (!scopes.length)          return { ok: false, reason: "Permission granted but no scope recorded" };

  const attribution = scopes.includes("NAME")
    ? "with their name"
    : scopes.includes("QUOTE_ANON") ? "anonymously only" : "no attribution cleared";
  return { ok: true, reason: `Cleared ${attribution}` };
}

/** The quote marketing should use: the trimmed version if someone wrote one. */
export function usableText(t: { quote: string; editedQuote: string | null }) {
  return (t.editedQuote?.trim() || t.quote).trim();
}

/**
 * Pull the finale answers out of a GrowthBattery row.
 *
 * The finale answers are nested under `_finale` rather than sitting at the top
 * level, because one survey writes to two tables: the Module 8 questions land
 * in SurveyResponse and the battery keeps the rest. Read the nest, do not
 * assume the shape.
 */
export function finaleAnswers(answers: unknown): Record<string, unknown> {
  if (!answers || typeof answers !== "object") return {};
  const top = answers as Record<string, unknown>;
  const nested = top._finale;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return top;
}

/** Quotes are free text; drop anything too short or too boilerplate to use. */
export function isUsableQuote(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  const t = raw.trim();
  if (t.length < 12) return false;
  // A Fellow answering "Nothing" or "N/A" is a valid survey answer and a
  // useless quote.
  return !/^(n\/?a|none|nothing|no|yes|idk|nope)[.!]?$/i.test(t);
}

export interface ImportCandidate {
  sourceRef:   string;
  userId:      string;
  leadId:      string | null;
  studentName: string;
  cohort:      string | null;
  kind:        string;
  quote:       string;
  nps:         number | null;
}

/**
 * Turn one GrowthBattery FINALE row into its candidate quotes.
 *
 * Pure, so the import route stays thin and this is testable without a
 * database.
 */
export function candidatesFrom(row: {
  id: string;
  userId: string;
  answers: unknown;
  user: { name: string; cohort: string | null } | null;
  leadId: string | null;
}): ImportCandidate[] {
  const a   = finaleAnswers(row.answers);
  const nps = typeof a.f_nps === "number" ? a.f_nps : null;
  const out: ImportCandidate[] = [];

  for (const src of QUOTE_SOURCES) {
    const raw = a[src.key];
    if (!isUsableQuote(raw)) continue;
    out.push({
      sourceRef:   `finale:${row.id}:${src.key}`,
      userId:      row.userId,
      leadId:      row.leadId,
      studentName: row.user?.name ?? "Unknown Fellow",
      cohort:      row.user?.cohort ?? null,
      kind:        src.kind,
      quote:       raw.trim(),
      nps,
    });
  }
  return out;
}
