/**
 * Searching for a person by name.
 *
 * Every lead search matched the WHOLE query against each field on its own:
 *
 *     OR: [ firstName contains q, lastName contains q, email contains q, … ]
 *
 * which means typing somebody's actual name finds nothing. "Dan Cohen" is
 * tested as `firstName contains "Dan Cohen"` and as `lastName contains
 * "Dan Cohen"`, and no single column holds both words. Searching "Cohen"
 * worked, so the records looked absent rather than unfindable, and the natural
 * conclusion was that they had been filed wrong. Reported by David on the Wake
 * Forest contacts, 2026-11-12.
 *
 * The fix is to split on whitespace and require EVERY word to match somewhere:
 * an AND of ORs rather than one OR. "Dan Cohen" then needs "Dan" to match a
 * field and "Cohen" to match a field, which first and last names do between
 * them. A single word behaves exactly as it did before.
 */

/** Columns a person can be found by. Same set every search used already. */
const FIELDS = ["firstName", "lastName", "email", "company"] as const;

type Contains = { contains: string; mode: "insensitive" };
type FieldClause = Partial<Record<(typeof FIELDS)[number], Contains>>;

/**
 * A Prisma `where` fragment for a free-text person search, or `{}` when the
 * query is empty.
 *
 * Spread it into a where object. It returns `AND` rather than `OR`, so it
 * composes with a sibling `OR` on the same object instead of overwriting it —
 * which is what a second `OR` key would silently have done.
 */
export function leadSearchWhere(
  q: string | null | undefined,
  fields: readonly (typeof FIELDS)[number][] = FIELDS,
): { AND?: { OR: FieldClause[] }[] } {
  const terms = (q ?? "").trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return {};

  return {
    AND: terms.map(term => ({
      OR: fields.map(field => ({ [field]: { contains: term, mode: "insensitive" as const } })),
    })),
  };
}
