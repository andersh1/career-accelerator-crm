/**
 * Who owns a new lead the moment it lands.
 *
 * Agreed on the Sept 10 call: program-info enquiries go to David, consultation
 * bookings go to Dan. Applications go to Dan too (Caleb, Sept 11). Everyone is
 * copied on the alert email regardless — that is the LEAD_ALERT_EMAILS list,
 * not this file.
 *
 * `Lead.assignedTo` stores an EMAIL, not a user id — the owner dropdown, the
 * assignee filter and the per-rep analytics all compare against `User.email`.
 * A user id in that column reads as unassigned everywhere.
 */
export const DAN   = "dan@vantagecareer.co";
export const DAVID = "david@vantagecareer.co";

const ROUTES: Record<string, string> = {
  APPLICATION:   DAN,
  CONSULTATION:  DAN,
  KEEP_IN_TOUCH: DAVID,
  WAITLIST:      DAVID,
  CONTACT:       DAVID,
};

/** Email of the admin who should own this lead, or null to leave it open. */
export function routeLead(leadType?: string | null): string | null {
  return ROUTES[(leadType ?? "").trim().toUpperCase()] ?? null;
}

/** Human-readable first name, for the activity line that records the routing. */
export function ownerName(email: string): string {
  return email === DAN ? "Dan" : email === DAVID ? "David" : email;
}
