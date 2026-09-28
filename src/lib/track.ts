/**
 * Delivery track — mirrored from the LMS, which owns this concept.
 *
 * The LMS copy (src/lib/track.ts there) is the full version and decides what
 * each track includes. The CRM only needs the one rule that affects outbound
 * mail: whether a Fellow should be told the name of their cohort.
 *
 * A private cohort is named after the client ("Private: Nick"), so naming it
 * in an email tells them they have been enrolled in themselves.
 *
 * Anything that is not exactly "PRIVATE" behaves as a normal cohort, so a null
 * cohort or an unexpected value keeps today's behaviour.
 */

export function showsCohortLabel(track: string | null | undefined): boolean {
  return track !== "PRIVATE";
}
