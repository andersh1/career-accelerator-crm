/**
 * What is left to do before a cohort can run, in the order it has to happen.
 *
 * Pure: it takes what was read from the database and returns the checklist, so
 * the same logic can be exercised against a real cohort without standing up a
 * request. The route does the fetching.
 *
 * Read from data rather than from a checklist someone ticks, because a ticked
 * checklist goes stale the moment anyone changes anything, and the failures
 * that actually hurt are silent: a module with no unlock date quietly inherits
 * the previous cohort's calendar, a kick-off with no date never sends, a cohort
 * that was never published has students who cannot log in. None of those look
 * wrong on a screen. They look like nothing at all.
 */

import { hasCommunitySlack } from "@/lib/track";

export type ReadinessStatus = "done" | "todo" | "warn" | "optional";

export interface ReadinessStep {
  key: string;
  title: string;
  status: ReadinessStatus;
  /** One line, in the admin's words, about what is or isn't there. */
  detail: string;
  /** Where to do it: a tab on the cohort card, or a link out to the LMS. */
  where: string;
  href?: string;
  /** A tab on this card the UI can switch to, so the step is one click. */
  tab?: "setup" | "roster" | "schedule" | "sessions";
}

export interface ReadinessInput {
  cohort: {
    track: string; capacity: number | null; publishedAt: Date | null;
    orientationDate: Date | null; orientationZoomLink: string | null;
    /** This cohort's own Slack workspace, if it has one. */
    slackInviteUrl: string | null;
  };
  moduleCount: number;
  schedules: {
    startDate: Date | null; sessionDate: Date | null; assignmentDue: Date | null;
    preworkDue: Date | null; preambleDate: Date | null; sessionZoomLink: string | null;
    preambleSkipped: boolean;
    module: { number: number };
  }[];
  students: { onboardedAt: Date | null; invitedAt: Date | null }[];
  liveSessions: { published: boolean; zoomLink: string | null }[];
  /** Kick-off templates, with the body this cohort would actually be sent
   *  (its own override where it has one, otherwise the shared copy). */
  templates: { key: string; enabled: boolean; body?: string | null }[];
  lmsUrl: string;
}

/**
 * A Slack invite link sitting in free-text email copy.
 *
 * Matches the two shapes a Slack invite takes — join.slack.com/... and a
 * workspace's own subdomain — which is the same pair the LMS validates an
 * invite against when an admin saves one.
 */
const SLACK_INVITE_IN_COPY = /https:\/\/(?:join\.slack\.com\/|[a-z0-9-]+\.slack\.com\/)/i;

export function buildReadiness(input: ReadinessInput): { steps: ReadinessStep[]; ready: boolean; outstanding: number } {
  const { cohort, schedules, students, liveSessions, templates, lmsUrl: lms } = input;
  const modules = input.moduleCount;
  type Step = ReadinessStep;
  const steps: Step[] = [];
  const missing = (sel: (s: (typeof schedules)[number]) => unknown) =>
    schedules.filter(s => !sel(s)).map(s => s.module.number).sort((a, b) => a - b);

  // 1 ── Basics
  steps.push({
    key: "basics",
    title: "Cohort details",
    status: "done",
    detail: `${cohort.track === "PRIVATE" ? "Private 1:1 client" : "Group cohort"}${cohort.capacity ? ` · capacity ${cohort.capacity}` : ""}`,
    where: "Edit on this card",
    tab: "setup",
  });

  // 2 ── Schedule. The unlock date is called out on its own because its failure
  //      mode is silent: the module still opens, just on the wrong day.
  const noUnlock = missing(s => s.startDate);
  const noSession = missing(s => s.sessionDate);
  const noDue = missing(s => s.assignmentDue);
  if (schedules.length === 0) {
    steps.push({
      key: "schedule", title: "Module schedule", status: "todo",
      detail: `Nothing set. All ${modules} modules would use the LMS global dates, which belong to the previous cohort.`,
      where: "Go to the Schedule tab", tab: "schedule",
    });
  } else if (noUnlock.length || noSession.length || noDue.length) {
    const bits: string[] = [];
    if (noUnlock.length) bits.push(`no opening date on M${noUnlock.join(", M")} — those will use the previous cohort's dates`);
    if (noSession.length) bits.push(`no session date on M${noSession.join(", M")}`);
    if (noDue.length) bits.push(`no assignment deadline on M${noDue.join(", M")}`);
    steps.push({
      key: "schedule", title: "Module schedule", status: "warn",
      detail: `${schedules.length} of ${modules} modules set, but ${bits.join("; ")}.`,
      where: "Go to the Schedule tab", tab: "schedule",
    });
  } else {
    const noZoom = missing(s => s.sessionZoomLink);
    steps.push({
      key: "schedule", title: "Module schedule", status: noZoom.length ? "warn" : "done",
      detail: noZoom.length
        ? `All ${modules} modules dated. No Zoom link on M${noZoom.join(", M")}.`
        : `All ${modules} modules dated, with Zoom links.`,
      where: noZoom.length ? "Schedule tab → Zoom link for every module" : "Go to the Schedule tab",
      tab: "schedule",
    });
  }

  // 3 ── Orientation
  steps.push({
    key: "orientation",
    title: "Orientation",
    status: cohort.orientationDate ? (cohort.orientationZoomLink ? "done" : "warn") : "todo",
    detail: cohort.orientationDate
      ? (cohort.orientationZoomLink ? "Date and Zoom link set." : "Date set, but no Zoom link — nobody can join.")
      : "No orientation date yet.",
    where: "Orientation box below", tab: "setup",
  });

  // 4 ── Working sessions. Optional: plenty of cohorts run without extras.
  const unpublished = liveSessions.filter(s => !s.published).length;
  const noSessionZoom = liveSessions.filter(s => !s.zoomLink).length;
  steps.push({
    key: "sessions",
    title: "Working sessions",
    status: liveSessions.length === 0 ? "optional" : (unpublished || noSessionZoom ? "warn" : "done"),
    detail: liveSessions.length === 0
      ? "None yet. Only needed if this cohort has build sessions or office hours."
      : `${liveSessions.length} session${liveSessions.length !== 1 ? "s" : ""}` +
        (unpublished ? ` · ${unpublished} still hidden from Fellows` : "") +
        (noSessionZoom ? ` · ${noSessionZoom} with no Zoom link` : ""),
    // Links and publishing are here now; only creating a session and writing
    // its description still needs the LMS.
    ...(liveSessions.length === 0
      ? { where: "Create them in the LMS", href: `${lms}/admin/sessions` }
      : { where: "Go to the Sessions tab", tab: "sessions" as const }),
  });

  // 5 ── Kick-off emails. Dated here, written and switched on globally.
  // A row deliberately skipped is not missing anything, so it must not be
  // warned about — otherwise a real gap hides among the intentional ones,
  // which is the whole reason the flag exists.
  const skipped = schedules.filter(s => s.preambleSkipped).map(s => s.module.number).sort((a, b) => a - b);
  const noPreamble = schedules
    .filter(s => !s.preambleSkipped && !s.preambleDate)
    .map(s => s.module.number).sort((a, b) => a - b);
  // Sorted by module number, not by however the rows came back — "M5, M6, M1"
  // reads like a bug in the checklist rather than a fact about the cohort.
  const disabled = templates
    .filter(t => !t.enabled)
    .map(t => parseInt(t.key.replace("module-preamble-", ""), 10))
    .filter(n => !isNaN(n))
    .sort((a, b) => a - b)
    .map(n => `M${n}`);
  if (schedules.length === 0) {
    steps.push({ key: "preamble", title: "Kick-off emails", status: "todo",
      detail: "Set the schedule first. Kick-off dates come from it.", where: "Go to the Schedule tab", tab: "schedule" });
  } else {
    steps.push({
      key: "preamble", title: "Kick-off emails",
      status: noPreamble.length ? "warn" : (disabled.length ? "warn" : "done"),
      detail: [
        noPreamble.length ? `No send date on M${noPreamble.join(", M")} — those kick-offs will never go out.` : "All modules have a send date.",
        skipped.length ? `Deliberately skipped for this cohort: M${skipped.join(", M")}.` : null,
        disabled.length ? `Switched off globally: ${disabled.join(", ")}.` : null,
      ].filter(Boolean).join(" "),
      where: disabled.length ? "Automation → Email Playbook" : "Go to the Schedule tab",
      ...(disabled.length ? { href: "/automation" } : { tab: "schedule" as const }),
    });
  }

  // 5b ── A Slack invite in kick-off copy, sent to someone with no Slack.
  //
  // The LMS resolver refuses to hand a private client the shared workspace, so
  // the dashboard card and the onboarding step both disappear for them. The
  // kick-off emails route around all of that: their bodies are free text in the
  // Email Playbook, and module-preamble-1 has a live join.slack.com link
  // written into it. Nothing in the send path reads that link, so nothing can
  // decide not to send it — which is how the first private client ended up in
  // the group's workspace.
  //
  // This is the check rather than a strip-the-link rule because the paragraph
  // around the link is wrong for a private client too ("where the cohort runs
  // between sessions"), and only a person can rewrite that. Fix it with a
  // per-cohort override of the kick-off copy.
  if (!hasCommunitySlack(cohort.track) && !cohort.slackInviteUrl?.trim()) {
    const leaky = templates
      .filter(t => t.body && SLACK_INVITE_IN_COPY.test(t.body))
      .map(t => parseInt(t.key.replace("module-preamble-", ""), 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b)
      .map(n => `M${n}`);
    if (leaky.length) {
      steps.push({
        key: "slack-leak",
        title: "Slack invite in kick-off copy",
        status: "todo",
        detail: `This client has no Slack, but the ${leaky.join(", ")} kick-off copy contains a Slack invite link. Sending it hands them the group cohort's workspace. Write a per-cohort override for ${leaky.join(", ")} with the Slack paragraph removed.`,
        where: "Automation → Email Playbook",
        href: "/automation",
      });
    }
  }

  // 6 ── People
  const invited = students.filter(s => s.invitedAt || s.onboardedAt).length;
  const onboarded = students.filter(s => s.onboardedAt).length;
  steps.push({
    key: "people",
    title: "Students",
    status: students.length === 0 ? "todo" : "done",
    detail: students.length === 0
      ? "Nobody added yet."
      : `${students.length} added · ${invited} invited · ${onboarded} have set up their account.`,
    where: "Go to the Roster tab", tab: "roster",
  });

  // 7 ── Launch
  const uninvited = students.length - invited;
  steps.push({
    key: "launch",
    title: "Publish to the LMS",
    status: students.length === 0 ? "todo" : (uninvited > 0 ? "todo" : "done"),
    detail: students.length === 0
      ? "Add students first."
      : uninvited > 0
        ? `${uninvited} student${uninvited !== 1 ? "s have" : " has"} never been invited. Publishing emails them a setup link.`
        : `Everyone invited${cohort.publishedAt ? ` · first published ${cohort.publishedAt.toISOString().slice(0, 10)}` : ""}.`,
    where: "Publish button on this card",
  });
  const blocking = steps.filter(s => s.status === "todo" || s.status === "warn").length;
  return { steps, ready: blocking === 0, outstanding: blocking };
}
