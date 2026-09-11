/**
 * The enrolment pipeline, in the order it actually happens.
 *
 * Set with Dan on 10 Sept: "lead, consultation, application, interview, offer,
 * and then enroll or lost." The old list had Interviewed sitting BEFORE Applied,
 * so someone who had had a consultation but not yet applied had nowhere sensible
 * to sit — he could not manage his week from the board.
 *
 * The keys are deliberately unchanged. They are internal and appear in 54 places
 * across analytics, three crons, the sequence engine and outbound webhooks;
 * renaming them buys nothing a user can see and risks a silent miss in something
 * that runs unattended. The labels are what anyone actually reads.
 *
 * Retired here and migrated in the data: CONTACTED (folded into Lead — in the
 * new flow you are a lead until a consultation is booked), ADMITTED and
 * COMPLETED (both collapsed into Offer and Enrolled respectively).
 */
export const STAGES = [
  { key: "WAITLIST",        label: "Waitlist",     color: "bg-sky-100 text-sky-700",         dot: "bg-sky-400"      },
  { key: "LEAD",            label: "Lead",         color: "bg-slate-100 text-slate-700",     dot: "bg-slate-400"    },
  { key: "WAITING_TO_MEET", label: "Consultation", color: "bg-cyan-100 text-cyan-700",       dot: "bg-cyan-500"     },
  { key: "APPLIED",         label: "Application",  color: "bg-blue-100 text-blue-700",       dot: "bg-blue-500"     },
  { key: "STRATEGY_CALL",   label: "Interview",    color: "bg-violet-100 text-violet-700",   dot: "bg-violet-500"   },
  { key: "OFFER_SENT",      label: "Offer",        color: "bg-amber-100 text-amber-700",     dot: "bg-amber-500"    },
  { key: "ENROLLED",        label: "Enrolled",     color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500"  },
  { key: "GRADUATED",       label: "Graduated",    color: "bg-stone-100 text-stone-600",     dot: "bg-stone-400"    },
  { key: "DECLINED",        label: "Denied",       color: "bg-orange-100 text-orange-700",   dot: "bg-orange-500"   },
  { key: "LOST",            label: "Lost",         color: "bg-red-100 text-red-700",         dot: "bg-red-400"      },
] as const;

/** Stages that no longer appear on the board but may still exist on old rows. */
export const RETIRED_STAGES: Record<string, string> = {
  CONTACTED: "LEAD",
  ADMITTED:  "OFFER_SENT",
  COMPLETED: "ENROLLED",
};

/** Every stage the board renders. */
export const STAGE_KEYS: string[] = STAGES.map(s => s.key);

/**
 * A retired stage read back as its current equivalent.
 *
 * Old rows and anything that still says "contacted" out loud land on a real
 * column instead of vanishing off the board.
 */
export function normalizeStage(key: string | null | undefined): string {
  const k = (key ?? "").trim().toUpperCase();
  return RETIRED_STAGES[k] ?? k;
}

/**
 * The funnel, for reporting — the stages a prospect passes THROUGH on the way
 * to enrolling. Waitlist sits before the funnel and the terminal stages after
 * it, so neither belongs on a conversion chart.
 *
 * One list, imported everywhere. The old hardcoded copies drifted: they still
 * counted CONTACTED, which no longer exists, and skipped Consultation and
 * Application entirely — so the funnel chart, the home dashboard and the
 * Monday leadership email each under-reported the middle of the pipeline.
 */
export const FUNNEL_STAGES = [
  "LEAD", "WAITING_TO_MEET", "APPLIED", "STRATEGY_CALL", "OFFER_SENT", "ENROLLED",
] as const;

/** Stages in play right now — someone is actively working these. */
export const ACTIVE_STAGES = [
  "LEAD", "WAITING_TO_MEET", "APPLIED", "STRATEGY_CALL", "OFFER_SENT",
] as const;

/** How close to enrolled a stage is; lower is closer. For "who to call first". */
export const STAGE_PROXIMITY: Record<string, number> = {
  OFFER_SENT: 0, STRATEGY_CALL: 1, APPLIED: 2, WAITING_TO_MEET: 3, LEAD: 4, WAITLIST: 5,
};

/**
 * Odds a lead at each stage ends up enrolled, for weighted pipeline value.
 *
 * Rough and deliberately so — it exists to stop a board full of early leads
 * reading as a board full of money. Every stage needs an entry: a stage missing
 * from here contributes nothing, which is how Consultation and Application
 * silently fell out of the weighted total.
 */
export const STAGE_PROBABILITY: Record<string, number> = {
  WAITLIST: 0.02, LEAD: 0.05, WAITING_TO_MEET: 0.15, APPLIED: 0.30,
  STRATEGY_CALL: 0.45, OFFER_SENT: 0.65, ENROLLED: 1, GRADUATED: 1,
  DECLINED: 0, LOST: 0,
};

/** Board label for a stage key, retired keys included. */
export const stageLabel = (key: string): string =>
  STAGES.find(s => s.key === normalizeStage(key))?.label ?? key;

/** The board's dot colour as a hex value, for HTML email where Tailwind cannot reach. */
export const STAGE_HEX: Record<string, string> = {
  WAITLIST: "#38bdf8", LEAD: "#94a3b8", WAITING_TO_MEET: "#06b6d4",
  APPLIED: "#3b82f6", STRATEGY_CALL: "#8b5cf6", OFFER_SENT: "#f59e0b",
  ENROLLED: "#10b981", GRADUATED: "#a8a29e", DECLINED: "#f97316", LOST: "#ef4444",
};

/**
 * Why a deal ended.
 *
 * Two lists, because Lost and Denied are not the same event and mixing them
 * answers neither question. LOST is a deal the family walked away from — the
 * thing we might have changed. DECLINED is a person we turned down — the thing
 * we meant to do. Rolling them together produces a chart that says nothing
 * about either.
 *
 * Fixed options rather than free text: typed reasons ("price", "Price too
 * high", "too expensive") split one real cause into three slices and the chart
 * stops being countable at exactly the point it starts to matter. The free-text
 * note lives alongside in lostReason.
 */
export const END_REASONS: Record<string, { heading: string; blurb: string; options: string[] }> = {
  LOST: {
    heading: "Why did we lose this one?",
    blurb: "They didn\u2019t move forward. Pick the closest cause \u2014 the detail goes in the note.",
    options: [
      "Price",
      "Timing \u2014 waiting for a later cohort",
      "Chose another program",
      "Parent said no",
      "Went silent",
      "Couldn\u2019t commit the hours",
      "Other",
    ],
  },
  DECLINED: {
    heading: "Why did we turn them down?",
    blurb: "We said no. Pick the closest cause \u2014 the detail goes in the note.",
    options: [
      "Not a fit for the program",
      "Too early in their career",
      "Wouldn\u2019t do the work",
      "Concerns from the interview",
      "Other",
    ],
  },
};

/** Stages that end a deal and therefore need a reason on the way in. */
export const END_STAGES = Object.keys(END_REASONS);

export const SOURCES = [
  { key: "3I_NEXTGEN",      label: "3i NextGen"        },
  { key: "REFERRAL",        label: "Referral"          },
  { key: "LINKEDIN",        label: "LinkedIn"          },
  { key: "INSTAGRAM",       label: "Instagram"         },
  { key: "WEBSITE",         label: "Website"           },
  { key: "EVENT",           label: "Event"             },
  { key: "COLD_OUTREACH",   label: "Cold Outreach"     },
  { key: "DIRECT_MAIL",     label: "Direct Mail"       },
  { key: "PAID_AD",         label: "Paid Ad"           },
  { key: "OTHER",           label: "Other"             },
];

export const OUTCOME_STATUSES = [
  { key: "PENDING",         label: "Pending",        color: "bg-slate-100 text-slate-600"   },
  { key: "PLACED",          label: "Placed",         color: "bg-emerald-100 text-emerald-700" },
  { key: "STILL_SEARCHING", label: "Still Searching",color: "bg-amber-100 text-amber-700"   },
  { key: "NOT_LOOKING",     label: "Not Looking",    color: "bg-slate-100 text-slate-500"   },
];

export function outcomeStatusInfo(key: string | null | undefined) {
  return OUTCOME_STATUSES.find(s => s.key === key) ?? OUTCOME_STATUSES[0];
}

export const NEXTGEN_SUB_SOURCES = [
  { key: "MEMBER",              label: "NextGen Member"       },
  { key: "NON_MEMBER_REFERRAL", label: "Unaffiliated" },
];

export function nextgenSubSourceLabel(key: string | null | undefined) {
  return NEXTGEN_SUB_SOURCES.find(s => s.key === key)?.label ?? "";
}

export const LEAD_TYPES = [
  { key: "WAITLIST",    label: "Waitlist",    color: "bg-sky-100 text-sky-700"         },
  { key: "APPLICATION", label: "Application", color: "bg-violet-100 text-violet-700"   },
  { key: "CONSULTATION", label: "Consultation", color: "bg-cyan-100 text-cyan-700"     },
  { key: "KEEP_IN_TOUCH", label: "Program Info", color: "bg-lime-100 text-lime-700"    },
  { key: "STUDENT",     label: "Student",     color: "bg-emerald-100 text-emerald-700" },
  { key: "PARTNER",     label: "Partner",     color: "bg-amber-100 text-amber-700"     },
  { key: "PARENT",      label: "Parent",      color: "bg-orange-100 text-orange-700"   },
  { key: "CONTACT",     label: "Contact",     color: "bg-slate-100 text-slate-600"     },
];

// Lead types that are relationship contacts (not program participants) — excluded from blast emails
export const NON_PARTICIPANT_TYPES = new Set(["CONTACT", "PARTNER"]);

export function leadTypeInfo(key: string | null | undefined) {
  return LEAD_TYPES.find(t => t.key === key) ?? { key: "WAITLIST", label: "Waitlist", color: "bg-sky-100 text-sky-700" };
}

export const PRIORITIES = [
  { key: "LOW",    label: "Low",    color: "text-slate-500"  },
  { key: "NORMAL", label: "Normal", color: "text-blue-600"   },
  { key: "HIGH",   label: "High",   color: "text-amber-600"  },
  { key: "URGENT", label: "Urgent", color: "text-red-600"    },
];

export const ACTIVITY_TYPES = [
  { key: "NOTE",     label: "Note",     icon: "📝" },
  { key: "EMAIL",    label: "Email",    icon: "📧" },
  { key: "CALL",     label: "Call",     icon: "📞" },
  { key: "MEETING",  label: "Meeting",  icon: "🤝" },
];

export const ACTIVITY_META: Record<string, { icon: string; label: string }> = {
  NOTE:         { icon: "📝", label: "Note" },
  EMAIL:        { icon: "📧", label: "Email" },
  CALL:         { icon: "📞", label: "Call" },
  MEETING:      { icon: "🤝", label: "Meeting" },
  STAGE_CHANGE: { icon: "➡️", label: "Stage change" },
  ENROLLED:     { icon: "🎓", label: "Enrolled" },
  CREATED:      { icon: "✨", label: "Created" },
};

export function stageInfo(key: string) {
  return STAGES.find(s => s.key === key) ?? STAGES[0];
}

export function sourceLabel(key: string) {
  return SOURCES.find(s => s.key === key)?.label ?? key;
}

export function priorityInfo(key: string) {
  return PRIORITIES.find(p => p.key === key) ?? PRIORITIES[1];
}

/**
 * What a partner contact IS to us. Multi-select: one person often holds several
 * — Dave Garvey offered to speak to students AND is worth a discovery call, and
 * filing him as only one of those loses the other.
 *
 * These are deliberately about the RELATIONSHIP, not the person's job title.
 * "Wealth manager" belongs in their company field; "Referral partner" is what
 * they are to us, and it is the thing you want to filter on.
 */
export const CONTACT_LABELS = [
  { key: "HIRING",    label: "Hiring partner",    hint: "Employs our people, or might",              color: "bg-emerald-100 text-emerald-700" },
  { key: "REFERRAL",  label: "Referral partner",  hint: "Sends us students — wealth managers, admissions consultants", color: "bg-cyan-100 text-cyan-700" },
  { key: "SPEAKER",   label: "Guest speaker",     hint: "Will talk to a cohort",                     color: "bg-violet-100 text-violet-700" },
  { key: "DISCOVERY", label: "Discovery call",    hint: "Someone a Fellow should interview",         color: "bg-amber-100 text-amber-700" },
  { key: "COACH",     label: "Prospective coach", hint: "Could coach for us when we scale past Dan", color: "bg-indigo-100 text-indigo-700" },
] as const;

export const contactLabel = (key: string) =>
  CONTACT_LABELS.find(l => l.key === key) ?? { key, label: key, hint: "", color: "bg-slate-100 text-slate-600" };
