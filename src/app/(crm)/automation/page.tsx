import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { Zap, Clock, GitBranch, AlertTriangle, CheckCircle2, Webhook } from "lucide-react";
import { WebhooksSection } from "./WebhooksSection";

function ActiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Active
    </span>
  );
}

interface AutomationRule {
  id: string;
  icon: React.ReactNode;
  title: string;
  trigger: string;
  action: string;
  schedule?: string;
}

const rules: AutomationRule[] = [
  {
    id: "stale-escalation",
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    title: "Stale Lead Auto-Escalation",
    trigger: "HIGH or URGENT lead not contacted in 7+ days",
    action: "Priority set to URGENT + activity note logged: \"⚠️ Auto-escalated to URGENT: 7+ days without contact\"",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "stale-notification",
    icon: <Clock className="w-4 h-4 text-blue-500" />,
    title: "Cold Lead Notification",
    trigger: "HIGH or URGENT lead not touched in 7+ days",
    action: "CRM notification created + Slack alert sent",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "proposal-followup",
    icon: <Clock className="w-4 h-4 text-purple-500" />,
    title: "Proposal Follow-Up Reminder",
    trigger: "Lead in PROPOSAL stage with no activity for 5+ days",
    action: "CRM notification: \"Follow up with [Name] — proposal has been open for 5 days\"",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "qualified-trigger",
    icon: <GitBranch className="w-4 h-4 text-blue-500" />,
    title: "Qualified Stage Action",
    trigger: "Lead stage changes TO \"Qualified\"",
    action: "Activity note logged: \"📋 Lead qualified — consider sending proposal within 48 hours\"",
    schedule: "Instant (on stage change)",
  },
  {
    id: "proposal-trigger",
    icon: <GitBranch className="w-4 h-4 text-indigo-500" />,
    title: "Proposal Stage Action",
    trigger: "Lead stage changes TO \"Proposal\"",
    action: "CRM notification: \"New proposal out to [Name] — follow up in 3 days\"",
    schedule: "Instant (on stage change)",
  },
  {
    id: "enrolled-trigger",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
    title: "Enrolled Stage Action",
    trigger: "Lead stage changes TO \"Enrolled\"",
    action: "Activity note logged: \"🎉 Enrolled! Remember to introduce them to the student community\"",
    schedule: "Instant (on stage change)",
  },
];

export default async function AutomationPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session || role !== "ADMIN") redirect("/home");

  return (
    <div className="p-7 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-violet-600/10 flex items-center justify-center">
            <Zap className="w-4 h-4 text-violet-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Automation Rules</h1>
        </div>
        <p className="text-sm text-slate-500 ml-10">
          Smart automations that run in the background — no manual intervention needed.
        </p>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 flex items-start gap-3">
        <Zap className="w-4 h-4 text-violet-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Hardcoded smart defaults</p>
          <p className="text-xs text-violet-600 mt-0.5">
            These rules are always active. Cron-based rules run daily at 8 AM UTC via{" "}
            <code className="bg-violet-100 px-1 rounded font-mono text-[11px]">/api/cron/notifications</code>.
            Stage-change rules fire instantly when a lead is updated.
          </p>
        </div>
      </div>

      {/* Rules list */}
      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-start gap-4"
          >
            <div className="mt-0.5 shrink-0">{rule.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <p className="text-sm font-semibold text-slate-900">{rule.title}</p>
                <ActiveBadge />
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-slate-500 w-14 shrink-0 mt-0.5">Trigger</span>
                  <span className="text-slate-700">{rule.trigger}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-slate-500 w-14 shrink-0 mt-0.5">Action</span>
                  <span className="text-slate-700">{rule.action}</span>
                </div>
                {rule.schedule && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-slate-500 w-14 shrink-0 mt-0.5">Runs</span>
                    <span className="text-slate-500">{rule.schedule}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center pb-4">
        To add or modify rules, update{" "}
        <code className="font-mono">src/app/api/cron/notifications/route.ts</code> or{" "}
        <code className="font-mono">src/app/api/crm/leads/[id]/route.ts</code>.
      </p>

      {/* Outbound Webhooks */}
      <WebhooksSection />
    </div>
  );
}
