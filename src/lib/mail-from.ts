/**
 * Who our email comes from, and where a reply to it goes.
 *
 * Everything used to fall back to hello@vantagecareer.co, which is not a
 * mailbox that exists. Mail still delivered — the domain is verified, so any
 * address on it sends fine — but every reply went to nobody. A Fellow answering
 * "I can't make Tuesday" was replying into a void.
 *
 * careeraccelerator@vantagecareer.co is the real shared inbox. Mail from Dan or
 * Caleb personally is the exception and sets its own from address.
 *
 * Two env names were in use across the codebase (EMAIL_FROM and
 * RESEND_FROM_EMAIL), so a route reading the one that happened not to be set
 * silently used the broken default. Both are honoured here, in one place.
 */
const SHARED_INBOX = "careeraccelerator@vantagecareer.co";

export function mailFrom(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    `Vantage Career Accelerator <${SHARED_INBOX}>`
  );
}

/**
 * Reply-To for anything a Fellow or a prospect receives. Without it, replies go
 * to the From address; naming it explicitly means a change of sender never
 * quietly redirects people's replies.
 */
export function mailReplyTo(): string {
  return process.env.EMAIL_REPLY_TO || SHARED_INBOX;
}
