/**
 * Signed unsubscribe links.
 *
 * The old link was /api/crm/unsubscribe?email=someone@example.com, which had
 * two problems:
 *
 *  1. Anyone could unsubscribe anyone by editing the query string, and the
 *     address itself sat in plain text in a URL that ends up in logs, browser
 *     history and referrer headers.
 *
 *  2. Worse in practice: corporate mail security (Outlook Safe Links,
 *     Proofpoint, Mimecast) PREFETCHES every link in an inbound message. A GET
 *     that unsubscribes on sight means a recipient at any company running one
 *     of those is silently unsubscribed the moment the mail arrives, without
 *     ever seeing it. Someone who never opted out stops hearing from us and
 *     nobody knows why.
 *
 * So: an opaque token that cannot be forged or edited into someone else's
 * address, and a link that only CONFIRMS — the unsubscribe itself happens on
 * POST, which scanners do not perform.
 */
import crypto from "crypto";

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET || process.env.INTERNAL_API_SECRET;
  if (!s) throw new Error("No secret available to sign unsubscribe tokens");
  return s;
}

const sign = (leadId: string) =>
  crypto.createHmac("sha256", secret())
    .update(`unsub:${leadId}`)
    .digest("base64url")
    .slice(0, 24);

/** Token for an email's unsubscribe link. Stable per lead, so old mail keeps working. */
export function unsubscribeToken(leadId: string): string {
  return `${leadId}.${sign(leadId)}`;
}

/** The lead id if the token is genuine, else null. */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const leadId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  let expected: string;
  try {
    expected = sign(leadId);
  } catch {
    return null;
  }
  // Constant-time compare so the signature cannot be guessed a byte at a time.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return leadId;
}

export function unsubscribeUrl(leadId: string): string {
  const base = process.env.CRM_URL
    || process.env.NEXTAUTH_URL
    || "https://crm.vantagecareer.co";
  return `${base}/api/crm/unsubscribe?t=${encodeURIComponent(unsubscribeToken(leadId))}`;
}
