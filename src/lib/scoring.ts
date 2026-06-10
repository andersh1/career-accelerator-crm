/** Compute a 0–100 engagement/priority score for a lead. */
export function computeScore(lead: {
  stage:       string;
  updatedAt:   Date;
  priority:    string;
  dealValue:   number | null;
  phone:       string | null;
  company:     string | null;
  linkedinUrl: string | null;
  activityCount: number;
}): number {
  let score = 0;

  // Stage weight
  const stageScore: Record<string, number> = {
    LEAD: 5, CONTACTED: 15, QUALIFIED: 30, PROPOSAL: 50, ENROLLED: 0, LOST: 0,
  };
  score += stageScore[lead.stage] ?? 5;

  // Recency of last touch
  const daysStale = (Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000;
  if (daysStale <= 1)       score += 25;
  else if (daysStale <= 7)  score += 15;
  else if (daysStale <= 30) score += 5;

  // Engagement (activity count)
  score += Math.min(lead.activityCount * 3, 20);

  // Deal value
  const dv = lead.dealValue ?? 0;
  if (dv >= 5000)      score += 10;
  else if (dv >= 2500) score += 5;
  else if (dv >= 1000) score += 2;

  // Profile completeness
  if (lead.phone)       score += 3;
  if (lead.company)     score += 3;
  if (lead.linkedinUrl) score += 4;

  // Priority boost
  if (lead.priority === "URGENT") score += 10;
  else if (lead.priority === "HIGH") score += 5;

  return Math.min(Math.round(score), 100);
}

/** Color class based on score tier */
export function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-700";
  if (score >= 40) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}
