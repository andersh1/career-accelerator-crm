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

/**
 * Whether this track gets the SHARED participant Slack workspace.
 *
 * Mirrors `communitySlack` in the LMS track table. Off for a private client:
 * the first one was onboarded straight into the group cohort's workspace, and a
 * paying 1:1 client landed among a dozen Fellows he was not in a programme
 * with. The LMS now refuses to hand out the shared invite, but the kick-off
 * email copy is free text in the Email Playbook and can carry a join link that
 * no resolver ever sees — which is what the cohort readiness check looks for.
 *
 * Off does not mean no Slack: a private client with their own workspace has it
 * on `Cohort.slackInviteUrl`, and that is honoured everywhere.
 */
export function hasCommunitySlack(track: string | null | undefined): boolean {
  return track !== "PRIVATE";
}
