/**
 * What a Fellow is allowed to see when we name their group.
 *
 * Internally the groups are numbered ("Fellowship 2") so we can tell them
 * apart. Fellows never see the number: Dan's call is that a group should not
 * be able to tell how new the programme is from their own dashboard.
 *
 * "Fellowship 2" → "Fellowship".  "Career Accelerator - Cohort 2" → "Career Accelerator".
 */
export function publicCohortLabel(name: string | null | undefined): string | null {
  if (!name) return null;
  const stripped = name
    .replace(/[\s—–-]*(cohort|fellowship|group|class)?[\s#]*\d+\s*$/i, "")
    .replace(/[\s—–-]+$/, "")
    .trim();
  // If stripping left nothing (e.g. the name was just "Fellowship 2"), keep the
  // word without its number rather than showing a Fellow a blank label.
  if (stripped) return stripped;
  const word = name.match(/(fellowship|cohort|group|class)/i);
  return word ? word[1][0].toUpperCase() + word[1].slice(1).toLowerCase() : null;
}
