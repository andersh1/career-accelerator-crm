/**
 * The cohort board: every cohort in the column that matches what is actually
 * true of it, with the one thing that needs doing next written on the card.
 *
 * ── Why a registry and not another checklist ──
 *
 * There was already a checklist, and it still missed things. Three features
 * shipped in a single day — a per-cohort Slack invite, a curriculum version,
 * a pre-orientation email — and none of them appeared in setup, because setup
 * had nowhere for a new step to register itself. The orientation email was the
 * expensive one: it was the actual next action for a live private client, five
 * days from his orientation, and nothing on any screen asked for it.
 *
 * So every step is declared ONCE, below, with four things: which phase it
 * belongs to, whether it is required, how to tell from the data whether it is
 * done, and where to go and do it. Adding a step is adding an entry. That is
 * the whole point — the next feature cannot be forgotten by accident, only
 * left out on purpose.
 *
 * ── Why the cards move themselves ──
 *
 * A board you drag is a tickbox with better graphics: right the day you set it
 * up, lying a week later. A cohort is in Launched because it is published with
 * its Fellows invited, not because somebody remembered to move it. You do the
 * work; the card advances. It cannot tell you a cohort is ready when it is not.
 *
 * ── Launched is terminal, on purpose ──
 *
 * A cohort runs for ten weeks after launch, and that work is not a phase to
 * move through — it is a weekly rhythm. So it lives ON the Launched card as
 * the running insight ("Module 4's session was Tuesday and no recording is
 * posted") rather than as a column nothing ever leaves.
 */

export type Phase = "building" | "preparing" | "ready" | "launched";

export const PHASES: { key: Phase; label: string; blurb: string }[] = [
  { key: "building",  label: "Building",  blurb: "Dates, curriculum, the shape of it" },
  { key: "preparing", label: "Preparing", blurb: "Zoom, orientation, Slack, emails" },
  { key: "ready",     label: "Ready",     blurb: "Everything set, not published yet" },
  { key: "launched",  label: "Launched",  blurb: "Fellows are in and it is running" },
];

export type StepStatus = "done" | "todo" | "warn" | "optional" | "na";

export interface BoardStep {
  key: string;
  phase: Phase;
  title: string;
  status: StepStatus;
  /** One line, in the admin's words, about what is or is not there. */
  detail: string;
  /** Where to go and do it. */
  where: string;
  tab?: "setup" | "roster" | "schedule" | "sessions" | "emails";
  href?: string;
  /**
   * Required steps hold a cohort in its phase. Optional ones are shown but
   * never block — a cohort without working sessions is a choice, not a
   * mistake, and making someone dismiss it is how people learn to dismiss
   * things without reading them.
   */
  required: boolean;
  /**
   * Something that has become true since launch and wants attention now: a
   * session that has happened with no recording, a kick-off whose date has
   * passed unsent. Dated so the card can say how long it has been waiting.
   */
  nudgeSince?: Date | null;
}

export interface BoardInput {
  cohort: {
    id: string; name: string; track: string; isActive: boolean;
    capacity: number | null; startDate: Date | null; publishedAt: Date | null;
    orientationDate: Date | null; orientationZoomLink: string | null; orientationDeckUrl: string | null;
    orientationEmailSentAt: Date | null;
    slackInviteUrl: string | null;
    contentVersionId: string | null; contentVersionName: string | null; contentVersionStatus: string | null;
  };
  moduleCount: number;
  schedules: {
    startDate: Date | null; sessionDate: Date | null; assignmentDue: Date | null;
    preworkDue: Date | null; preambleDate: Date | null; preambleSentAt: Date | null;
    preambleSkipped: boolean; sessionZoomLink: string | null;
    module: { number: number; id: string };
  }[];
  students: { onboardedAt: Date | null; invitedAt: Date | null }[];
  liveSessions: { published: boolean; zoomLink: string | null; startsAt: Date | null }[];
  /** Module numbers that already have a recording posted for THIS cohort. */
  modulesWithRecording: number[];
  /** True when the shared slack_invite_url is set, so the fallback exists. */
  sharedSlackSet: boolean;
  now: Date;
}

export interface BoardCard {
  id: string;
  name: string;
  track: string;
  isActive: boolean;
  phase: Phase;
  steps: BoardStep[];
  /** Outstanding REQUIRED steps in the cohort's current phase. */
  outstanding: number;
  /** The one line that goes on the card. */
  headline: string | null;
  /** Why it matters now. Null when the headline speaks for itself. */
  subline: string | null;
  urgent: boolean;
  fellows: number;
}

const DAY = 24 * 60 * 60 * 1000;

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

/** "in 5 days" / "2 days ago" / "today". */
function when(target: Date, now: Date): string {
  const d = daysBetween(target, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${plural(d, "day")}` : `${plural(-d, "day")} ago`;
}

export function buildBoard(input: BoardInput): BoardCard {
  const { cohort, schedules, students, liveSessions, modulesWithRecording, now } = input;
  const steps: BoardStep[] = [];
  const missing = (sel: (s: BoardInput["schedules"][number]) => unknown) =>
    schedules.filter(s => !sel(s)).map(s => s.module.number).sort((a, b) => a - b);
  const invited = students.filter(s => s.invitedAt).length;
  const onboarded = students.filter(s => s.onboardedAt).length;

  // ── BUILDING ────────────────────────────────────────────────────────────
  steps.push({
    key: "basics", phase: "building", required: true, status: "done",
    title: "Cohort details",
    detail: `${cohort.track === "PRIVATE" ? "Private 1:1 client" : "Group cohort"}`
      + `${cohort.capacity ? ` · capacity ${cohort.capacity}` : ""}`
      + `${cohort.startDate ? ` · starts ${cohort.startDate.toISOString().slice(0, 10)}` : " · no start date"}`,
    where: "Setup tab", tab: "setup",
  });

  // The curriculum. Missing this is silent and total: the cohort reads
  // whatever is deployed, so a rewrite for a later cohort rewrites theirs.
  steps.push({
    key: "curriculum", phase: "building", required: true,
    status: !cohort.contentVersionId ? "todo"
      : cohort.contentVersionStatus === "PUBLISHED" ? "done" : "warn",
    title: "Curriculum version",
    detail: !cohort.contentVersionId
      ? "Not set, so this cohort reads whatever is deployed. Rewriting a module for a future cohort would rewrite theirs too."
      : cohort.contentVersionStatus === "PUBLISHED"
        ? `Running ${cohort.contentVersionName}.`
        : `Running ${cohort.contentVersionName}, which is still a ${String(cohort.contentVersionStatus).toLowerCase()}. Edits reach these Fellows immediately.`,
    where: "Setup tab", tab: "setup",
  });

  const noUnlock = missing(s => s.startDate);
  const noSession = missing(s => s.sessionDate);
  const noDue = missing(s => s.assignmentDue);
  steps.push({
    key: "schedule", phase: "building", required: true,
    status: schedules.length === 0 ? "todo"
      : (noUnlock.length || noSession.length || noDue.length) ? "warn" : "done",
    title: "Module schedule",
    detail: schedules.length === 0
      ? `Nothing set. All ${input.moduleCount} modules would use the LMS global dates, which belong to the previous cohort.`
      : (noUnlock.length || noSession.length || noDue.length)
        ? [
            noUnlock.length ? `no opening date on M${noUnlock.join(", M")} — those use the previous cohort's` : "",
            noSession.length ? `no session date on M${noSession.join(", M")}` : "",
            noDue.length ? `no deadline on M${noDue.join(", M")}` : "",
          ].filter(Boolean).join("; ")
        : `All ${schedules.length} modules dated.`,
    where: "Schedule tab", tab: "schedule",
  });

  // ── PREPARING ───────────────────────────────────────────────────────────
  const noZoom = missing(s => s.sessionZoomLink);
  steps.push({
    key: "module-zoom", phase: "preparing", required: true,
    status: schedules.length === 0 ? "todo" : noZoom.length ? "warn" : "done",
    title: "Session Zoom links",
    detail: schedules.length === 0 ? "Set the schedule first."
      : noZoom.length ? `No link on M${noZoom.join(", M")}.`
      : "Every module has its link.",
    where: "Schedule tab", tab: "schedule",
  });

  steps.push({
    key: "orientation", phase: "preparing", required: true,
    status: !cohort.orientationDate ? "todo" : !cohort.orientationZoomLink ? "warn" : "done",
    title: "Orientation",
    detail: !cohort.orientationDate ? "No date set."
      : !cohort.orientationZoomLink
        ? `${cohort.orientationDate.toISOString().slice(0, 10)}, but no Zoom link — the invite would have nowhere to go.`
        : `${cohort.orientationDate.toISOString().slice(0, 10)} with a Zoom link${cohort.orientationDeckUrl ? " and a deck" : ", no deck yet"}.`,
    where: "Setup tab", tab: "setup",
  });

  // Slack. Required for a group, deliberately not for a private client: the
  // shared workspace is the group's, and a 1:1 client landing in it is the
  // bug this step exists to stop happening twice.
  const isPrivate = cohort.track === "PRIVATE";
  steps.push({
    key: "slack", phase: "preparing", required: !isPrivate,
    status: cohort.slackInviteUrl ? "done"
      : isPrivate ? "optional"
      : input.sharedSlackSet ? "done" : "todo",
    title: "Slack",
    detail: cohort.slackInviteUrl
      ? "This cohort has its own workspace."
      : isPrivate
        ? "No workspace of their own, and a private client is deliberately never given the shared one. Set a link here if they should have Slack at all."
        : input.sharedSlackSet
          ? "Using the shared Vantage workspace."
          : "No workspace. Fellows will see no Slack anywhere.",
    where: "Setup tab", tab: "setup",
  });

  const noPreamble = schedules.filter(s => !s.preambleDate && !s.preambleSkipped).map(s => s.module.number);
  steps.push({
    key: "preamble", phase: "preparing", required: true,
    status: schedules.length === 0 ? "todo" : noPreamble.length ? "warn" : "done",
    title: "Kick-off emails",
    detail: schedules.length === 0 ? "Set the schedule first."
      : noPreamble.length
        ? `No send date on M${noPreamble.join(", M")}. Those will never go out.`
        : "Every module's kick-off is dated or deliberately skipped.",
    where: "Schedule tab", tab: "schedule",
  });

  const unpublishedSessions = liveSessions.filter(s => !s.published).length;
  const sessionsNoZoom = liveSessions.filter(s => !s.zoomLink).length;
  steps.push({
    key: "working-sessions", phase: "preparing", required: false,
    status: liveSessions.length === 0 ? "optional"
      : (unpublishedSessions || sessionsNoZoom) ? "warn" : "done",
    title: "Working sessions",
    detail: liveSessions.length === 0
      ? "None, which is fine if this cohort is not having any."
      : [
          `${plural(liveSessions.length, "session")}`,
          unpublishedSessions ? `${unpublishedSessions} not published, so Fellows cannot see them` : "",
          sessionsNoZoom ? `${sessionsNoZoom} with no Zoom link` : "",
        ].filter(Boolean).join(" · "),
    where: "Sessions tab", tab: "sessions",
  });

  // ── READY ───────────────────────────────────────────────────────────────
  steps.push({
    key: "roster", phase: "ready", required: true,
    status: students.length === 0 ? "todo" : "done",
    title: "Roster",
    detail: students.length === 0 ? "Nobody added yet."
      : `${plural(students.length, "Fellow")} · ${invited} invited · ${onboarded} set up their account.`,
    where: "Roster tab", tab: "roster",
  });

  steps.push({
    key: "publish", phase: "ready", required: true,
    status: students.length === 0 ? "todo"
      : students.length - invited > 0 ? "todo" : "done",
    title: "Publish to the LMS",
    detail: students.length === 0 ? "Add Fellows first."
      : students.length - invited > 0
        ? `${plural(students.length - invited, "Fellow has", "Fellows have")} never been invited. Publishing emails them a setup link.`
        : `Everyone invited${cohort.publishedAt ? ` · published ${cohort.publishedAt.toISOString().slice(0, 10)}` : ""}.`,
    where: "Publish button", tab: "setup",
  });

  // ── LAUNCHED ────────────────────────────────────────────────────────────
  // The orientation email. This is the step whose absence cost us: it was the
  // real next action for a live client and no screen asked for it.
  const oriIn = cohort.orientationDate ? daysBetween(cohort.orientationDate, now) : null;
  // Once orientation has happened, a PRE-orientation email is moot. Nagging
  // about it forever is how a board teaches people to stop reading it — and
  // the cohorts that ran before this email existed would nag indefinitely.
  const orientationPast = oriIn !== null && oriIn < 0;
  steps.push({
    key: "orientation-email", phase: "launched",
    required: !orientationPast,
    status: cohort.orientationEmailSentAt ? "done"
      : orientationPast ? "na"
      : !cohort.orientationDate ? "todo"
      : (oriIn !== null && oriIn <= 10) ? "warn" : "todo",
    title: "Send the orientation email",
    detail: cohort.orientationEmailSentAt
      ? `Sent ${cohort.orientationEmailSentAt.toISOString().slice(0, 10)}.`
      : orientationPast
        ? `Orientation was ${when(cohort.orientationDate!, now)}, so this one has passed.`
        : !cohort.orientationDate
          ? "No orientation date, so there is nothing to tell them yet."
          : `Not sent. Orientation is ${when(cohort.orientationDate, now)}. It carries the LMS link, the schedule and every session.`,
    where: "Setup tab", tab: "setup",
    nudgeSince: (cohort.orientationEmailSentAt || orientationPast) ? null : cohort.orientationDate,
  });

  // Running work: only what has actually come due.
  const past = schedules
    .filter(s => s.sessionDate && s.sessionDate.getTime() < now.getTime())
    .sort((a, b) => (b.sessionDate!.getTime() - a.sessionDate!.getTime()));
  const missingRecording = past.filter(s => !modulesWithRecording.includes(s.module.number));
  if (past.length > 0) {
    const latest = missingRecording[0];
    steps.push({
      key: "recordings", phase: "launched", required: false,
      status: missingRecording.length === 0 ? "done" : "warn",
      title: "Recordings and decks",
      detail: missingRecording.length === 0
        ? `Posted for all ${plural(past.length, "session")} held so far.`
        : `No recording for M${missingRecording.map(s => s.module.number).sort((a, b) => a - b).join(", M")}.`
          + (latest?.sessionDate ? ` M${latest.module.number}'s session was ${when(latest.sessionDate, now)}.` : ""),
      where: "Schedule tab", tab: "schedule",
      nudgeSince: latest?.sessionDate ?? null,
    });
  }

  const missedPreamble = schedules.filter(s =>
    !s.preambleSkipped && s.preambleDate && s.preambleDate.getTime() < now.getTime() && !s.preambleSentAt);
  if (missedPreamble.length > 0) {
    const first = missedPreamble.sort((a, b) => a.preambleDate!.getTime() - b.preambleDate!.getTime())[0];
    steps.push({
      key: "preamble-missed", phase: "launched", required: true, status: "warn",
      title: "Kick-off emails that did not send",
      detail: `M${missedPreamble.map(s => s.module.number).sort((a, b) => a - b).join(", M")} `
        + `${missedPreamble.length === 1 ? "was" : "were"} dated to send and never went. `
        + `M${first.module.number}'s was due ${when(first.preambleDate!, now)}.`,
      where: "Schedule tab", tab: "schedule",
      nudgeSince: first.preambleDate,
    });
  }

  // ── Which column is it in? ──────────────────────────────────────────────
  // The first phase with an outstanding REQUIRED step, and Launched once it is
  // published with everyone invited. Derived, never dragged.
  const blockedIn = (p: Phase) =>
    steps.some(s => s.phase === p && s.required && (s.status === "todo" || s.status === "warn"));

  let phase: Phase;
  if (cohort.publishedAt && students.length > 0 && students.length === invited) phase = "launched";
  else if (blockedIn("building")) phase = "building";
  else if (blockedIn("preparing")) phase = "preparing";
  else phase = "ready";

  const inPhase = steps.filter(s => s.phase === phase);
  const outstanding = inPhase.filter(s => s.required && (s.status === "todo" || s.status === "warn")).length;

  // ── What goes on the card ───────────────────────────────────────────────
  // The most pressing thing, not a progress bar. Dated nudges first, because
  // those are the ones with a clock on them.
  const pressing = [...steps]
    .filter(s => s.phase === phase && (s.status === "todo" || s.status === "warn"))
    .sort((a, b) => {
      if (!!a.nudgeSince !== !!b.nudgeSince) return a.nudgeSince ? -1 : 1;
      if (a.nudgeSince && b.nudgeSince) return a.nudgeSince.getTime() - b.nudgeSince.getTime();
      if (a.required !== b.required) return a.required ? -1 : 1;
      return 0;
    })[0] ?? null;

  const urgent = !!pressing && (
    pressing.status === "warn" ||
    (!!pressing.nudgeSince && daysBetween(pressing.nudgeSince, now) <= 7)
  );

  return {
    id: cohort.id, name: cohort.name, track: cohort.track, isActive: cohort.isActive,
    phase, steps, outstanding,
    headline: pressing?.title ?? null,
    subline: pressing?.detail ?? null,
    urgent,
    fellows: students.length,
  };
}
