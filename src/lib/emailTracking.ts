/**
 * Email tracking helpers.
 * wrapLinksForTracking — rewrites href="http..." links in HTML to go through
 * the /api/crm/email-click redirect endpoint, enabling click tracking.
 */

/**
 * Replaces all http/https href links in an HTML string with tracked versions.
 * - Skips mailto: and tracking pixel URLs
 * - Only wraps if leadId is provided
 *
 * @param html       The email HTML body
 * @param leadId     The CRM lead ID (required — skipped if falsy)
 * @param activityId The LeadActivity ID of the sent email (optional, used for correlation)
 * @returns          HTML with tracked links
 */
export function wrapLinksForTracking(
  html: string,
  leadId: string,
  activityId: string = "",
): string {
  if (!leadId) return html;

  // Match href="http..." or href='http...' (both quote styles)
  return html.replace(
    /href=(["'])(https?:\/\/[^"'>\s]+)\1/gi,
    (_match: string, quote: string, url: string) => {
      // Don't wrap tracking pixel URLs (already internal) or unsubscribe links
      if (url.includes("/api/crm/email-open") || url.includes("/api/crm/unsubscribe")) {
        return `href=${quote}${url}${quote}`;
      }

      const tracked =
        `/api/crm/email-click?url=${encodeURIComponent(url)}` +
        `&leadId=${encodeURIComponent(leadId)}` +
        `&activityId=${encodeURIComponent(activityId)}`;

      return `href=${quote}${tracked}${quote}`;
    },
  );
}
