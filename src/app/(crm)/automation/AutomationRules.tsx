"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Clock, GitBranch, CheckCircle2, Loader2, Zap } from "lucide-react";

interface RuleDef {
  id:       string;
  iconType: string;
  title:    string;
  trigger:  string;
  action:   string;
  schedule?: string;
}

const RULES: RuleDef[] = [
  {
    id: "stale-escalation", iconType: "warning",
    title:    "Stale Lead Auto-Escalation",
    trigger:  "HIGH or URGENT lead not contacted in 7+ days",
    action:   "Priority set to URGENT + activity note logged: \"⚠️ Auto-escalated to URGENT: 7+ days without contact\"",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "stale-notification", iconType: "clock-blue",
    title:    "Cold Lead Notification",
    trigger:  "HIGH or URGENT lead not touched in 7+ days",
    action:   "CRM notification created + Slack alert sent",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "proposal-followup", iconType: "clock-purple",
    title:    "Offer Follow-Up Reminder",
    trigger:  "Lead in OFFER_SENT stage with no activity for 5+ days",
    action:   "CRM notification: \"Follow up with [Name] — offer has been out for 5 days\"",
    schedule: "Daily at 8 AM UTC",
  },
  {
    id: "qualified-trigger", iconType: "branch-blue",
    title:    "Interviewed Stage Action",
    trigger:  "Lead stage changes TO \"Interviewed\"",
    action:   "Activity note logged: \"📋 Strategy call scheduled — send offer within 48 hours if they're a fit\"",
    schedule: "Instant (on stage change)",
  },
  {
    id: "proposal-trigger", iconType: "branch-indigo",
    title:    "Offer Sent Stage Action",
    trigger:  "Lead stage changes TO \"Offer Sent\"",
    action:   "CRM notification: \"Offer sent to [Name] — follow up in 3 days\"",
    schedule: "Instant (on stage change)",
  },
  {
    id: "enrolled-trigger", iconType: "check",
    title:    "Enrolled Stage Action",
    trigger:  "Lead stage changes TO \"Enrolled\"",
    action:   "Activity note logged: \"🎉 Enrolled! Remember to introduce them to the student community\"",
    schedule: "Instant (on stage change)",
  },
];

function RuleIcon({ type }: { type: string }) {
  if (type === "warning")      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  if (type === "clock-blue")   return <Clock        className="w-4 h-4 text-blue-500" />;
  if (type === "clock-purple") return <Clock        className="w-4 h-4 text-purple-500" />;
  if (type === "branch-blue")  return <GitBranch    className="w-4 h-4 text-blue-500" />;
  if (type === "branch-indigo")return <GitBranch    className="w-4 h-4 text-indigo-500" />;
  return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
}

export function AutomationRules() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [saving,  setSaving]  = useState<string | null>(null);
  const [loaded,  setLoaded]  = useState(false);

  useEffect(() => {
    fetch("/api/crm/app-settings")
      .then(r => r.json())
      .then((settings: Record<string, string>) => {
        const map: Record<string, boolean> = {};
        for (const rule of RULES) {
          // Default to enabled (true) if no setting saved yet
          map[rule.id] = settings[`automation.${rule.id}`] !== "false";
        }
        setEnabled(map);
        setLoaded(true);
      })
      .catch(() => {
        // Default all to enabled on error
        const map: Record<string, boolean> = {};
        for (const rule of RULES) map[rule.id] = true;
        setEnabled(map);
        setLoaded(true);
      });
  }, []);

  async function toggle(ruleId: string) {
    const next = !enabled[ruleId];
    setEnabled(prev => ({ ...prev, [ruleId]: next }));
    setSaving(ruleId);
    try {
      await fetch("/api/crm/app-settings", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ [`automation.${ruleId}`]: String(next) }),
      });
    } catch {
      // Revert on error
      setEnabled(prev => ({ ...prev, [ruleId]: !next }));
    } finally {
      setSaving(null);
    }
  }

  const activeCount = loaded ? Object.values(enabled).filter(Boolean).length : null;

  return (
    <div className="space-y-4">
      {/* Dynamic banner */}
      <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: "#edf5f4", borderColor: "#bfe6e2" }}>
        <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#0a6b64" }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "#0a6b64" }}>
            {activeCount === null ? "Loading…" : `${activeCount} of ${RULES.length} rules active`}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "#5a6663" }}>
            Cron-based rules trigger daily at 8 AM UTC. Stage-change rules fire the moment a lead is updated.
            Use the toggles to pause any rule without losing its configuration.
          </p>
        </div>
      </div>

    <div className="space-y-3">
      {RULES.map(rule => {
        const on = enabled[rule.id] ?? true;
        return (
          <div key={rule.id}
            className="rounded-xl border shadow-sm p-4 flex items-start gap-4 transition-opacity"
            style={{ background: "#fff", borderColor: "#e4e0d6", opacity: loaded && !on ? 0.6 : 1 }}>
            <div className="mt-0.5 shrink-0"><RuleIcon type={rule.iconType} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{rule.title}</p>
                {!loaded ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#f1efe8] text-[#8a938f]">
                    <Loader2 size={10} className="animate-spin" /> Loading
                  </span>
                ) : on ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-[#f1efe8] text-[#5a6663] border border-[#e4e0d6]">
                    Paused
                  </span>
                )}
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="font-semibold w-14 shrink-0 mt-0.5" style={{ color: "#8a938f" }}>Trigger</span>
                  <span style={{ color: "#5a6663" }}>{rule.trigger}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold w-14 shrink-0 mt-0.5" style={{ color: "#8a938f" }}>Action</span>
                  <span style={{ color: "#5a6663" }}>{rule.action}</span>
                </div>
                {rule.schedule && (
                  <div className="flex items-start gap-2">
                    <span className="font-semibold w-14 shrink-0 mt-0.5" style={{ color: "#8a938f" }}>Runs</span>
                    <span style={{ color: "#8a938f" }}>{rule.schedule}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => toggle(rule.id)}
              disabled={saving === rule.id || !loaded}
              className="flex-shrink-0 mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
              style={{ background: on ? "#0a6b64" : "#e4e0d6" }}
              title={on ? "Disable rule" : "Enable rule"}>
              <span
                className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                style={{ transform: on ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        );
      })}
    </div>
    </div>
  );
}
