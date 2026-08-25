export const STAGES = [
  { key: "WAITLIST",      label: "Waitlist",    color: "bg-sky-100 text-sky-700",       dot: "bg-sky-400"     },
  { key: "LEAD",          label: "Lead",        color: "bg-slate-100 text-slate-700",   dot: "bg-slate-400"   },
  { key: "WAITING_TO_MEET", label: "Waiting to Meet", color: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500"  },
  { key: "CONTACTED",     label: "Contacted",   color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"    },
  { key: "APPLIED",       label: "Applied",     color: "bg-sky-100 text-sky-700",       dot: "bg-sky-500"     },
  { key: "STRATEGY_CALL", label: "Interviewed", color: "bg-violet-100 text-violet-700", dot: "bg-violet-500"  },
  { key: "ADMITTED",      label: "Admitted",    color: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500"  },
  { key: "OFFER_SENT",    label: "Offer Sent",  color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500"   },
  { key: "COMPLETED",     label: "Enrolled",        color: "bg-teal-100 text-teal-700",     dot: "bg-teal-500"    },
  { key: "ENROLLED",      label: "Active Student",  color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { key: "GRADUATED",     label: "Graduated",   color: "bg-stone-100 text-stone-600",   dot: "bg-stone-400"   },
  { key: "DECLINED",      label: "Declined",    color: "bg-orange-100 text-orange-700", dot: "bg-orange-500"  },
  { key: "LOST",          label: "Lost",        color: "bg-red-100 text-red-700",       dot: "bg-red-400"     },
] as const;

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
