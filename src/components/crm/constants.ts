export const STAGES = [
  { key: "LEAD",      label: "Lead",      color: "bg-slate-100 text-slate-700",   dot: "bg-slate-400"   },
  { key: "CONTACTED", label: "Contacted", color: "bg-blue-100 text-blue-700",     dot: "bg-blue-500"    },
  { key: "QUALIFIED", label: "Qualified", color: "bg-violet-100 text-violet-700", dot: "bg-violet-500"  },
  { key: "PROPOSAL",  label: "Proposal",  color: "bg-amber-100 text-amber-700",   dot: "bg-amber-500"   },
  { key: "ENROLLED",  label: "Enrolled",  color: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  { key: "LOST",      label: "Lost",      color: "bg-red-100 text-red-700",       dot: "bg-red-400"     },
] as const;

export const SOURCES = [
  { key: "REFERRAL",        label: "Referral"          },
  { key: "LINKEDIN",        label: "LinkedIn"          },
  { key: "INSTAGRAM",       label: "Instagram"         },
  { key: "WEBSITE",         label: "Website"           },
  { key: "EVENT",           label: "Event"             },
  { key: "COLD_OUTREACH",   label: "Cold Outreach"     },
  { key: "PAID_AD",         label: "Paid Ad"           },
  { key: "OTHER",           label: "Other"             },
];

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
