/**
 * One institution is one row. This is the only place that decides whether two
 * names are the same account.
 *
 * There are four ways an Organization gets created — the Organizations page,
 * the MCP's create_organization, the MCP's create_lead (which mints one from
 * whatever name appears in Dan's call notes), and the website partner
 * on-ramp — and they had three different ideas of "already exists". All of
 * them matched case-insensitively, so "3i" and "3I" were safe, but every one
 * of these would have produced a second row:
 *
 *   "Wake Forest University."        a trailing full stop
 *   "The University of New Haven"    a leading article
 *   "UC  Berkeley"                   a double space from a paste
 *   "Texas A&M"  vs  "Texas A and M" the ampersand written out
 *
 * Duplicate accounts are quiet and expensive: the contacts split, the deals
 * split, and nobody notices until someone asks how many conversations are
 * running at a university and gets two answers.
 */
import { prisma } from "@/lib/prisma";

/**
 * A name reduced to the part worth matching on.
 *
 * Order matters. Collapsing and trimming happens BEFORE the leading "the" is
 * stripped: done the other way round, " The University of New Haven" keeps its
 * article because the pattern is anchored at a space, and silently becomes a
 * second account. That bug was real and caught in testing.
 *
 * Acronyms are deliberately NOT resolved. "BHSU" and "Black Hills State
 * University" stay separate, because silently merging two genuinely different
 * institutions is far more expensive to undo than merging two rows by hand.
 */
export function normalizeOrgName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * The existing account for this name, or null.
 *
 * Matching happens in JS rather than SQL because the comparison is on the
 * normalised form, which no column holds. The table is small by nature — one
 * row per institution we have ever spoken to — so reading it is cheap, and the
 * cap only exists so this can never become the slow part of a request.
 */
export async function findOrganizationByName(
  name: string,
): Promise<{ id: string; name: string } | null> {
  const key = normalizeOrgName(name);
  if (!key) return null;
  const all = await prisma.organization.findMany({
    select: { id: true, name: true },
    take: 2000,
  });
  return all.find(o => normalizeOrgName(o.name) === key) ?? null;
}

/**
 * Accounts whose names look close to this one, for a "did you mean".
 *
 * Used when a caller asks for an organisation we do not have: better to show
 * the five nearest and let a person choose than to create a near-duplicate.
 */
export async function nearbyOrganizations(name: string, limit = 5): Promise<string[]> {
  const key = normalizeOrgName(name);
  if (!key) return [];
  const first = key.split(" ")[0];
  if (!first) return [];
  const all = await prisma.organization.findMany({ select: { name: true }, take: 2000 });
  return all
    .filter(o => {
      const k = normalizeOrgName(o.name);
      return k.includes(first) || key.includes(k.split(" ")[0]);
    })
    .map(o => o.name)
    .slice(0, limit);
}
