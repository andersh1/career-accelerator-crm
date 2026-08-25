"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Eye, X, Clock, Users, Zap, Pencil, CheckCircle2, Loader2 } from "lucide-react";

/**
 * The Email Playbook — every automated email the program sends.
 * Templates marked ✏️ live in the database: edits here save automatically and
 * the next send uses the new copy. The rest are dynamic (data-driven) and are
 * documented with representative previews.
 */

interface PlaybookEmail {
  id: string;
  name: string;
  subject: string;          // fallback display subject (DB overrides when editable)
  audience: string;
  when: string;
  trigger: string;
  source: "LMS" | "CRM";
  guard?: string;
  templateKey?: string;     // present = editable, DB-backed
  sampleVars?: Record<string, string>;
  preview?: string;         // static preview for non-editable emails
}

interface DbTemplate { key: string; name: string; subject: string; body: string; placeholders: string; updatedAt: string; enabled: boolean; editable: boolean }

const GREEN = "#086c64";

function subVars(s: string, vars: Record<string, string>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}
function textToHtml(t: string) {
  const esc = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.trim().split(/\n\n+/).map(p =>
    `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.7;">${p
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br/>")}</p>`).join("");
}
function wrap(title: string, body: string, cta?: { label: string }) {
  const button = cta ? `<a href="#" style="display:inline-block;background:${GREEN};color:#fff;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;text-decoration:none;">${cta.label}</a>` : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1efe8;font-family:'Montserrat',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 14px;">
    <div style="background:linear-gradient(135deg,#086c64,#063f3a);border-radius:16px 16px 0 0;padding:24px 28px;">
      <img src="https://lms.vantagecareer.co/email-logo-white.png" alt="Vantage Career" style="display:block;height:26px;width:auto;margin-bottom:14px;"/>
      <h1 style="margin:0;color:#fff;font-size:21px;font-weight:800;line-height:1.35;">${title}</h1>
    </div>
    <div style="background:#fff;border:1px solid #e4e0d6;border-top:none;border-radius:0 0 16px 16px;padding:26px 28px;">${body}${button}</div>
    <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#949598;">Vantage Career Accelerator · Launch your career the way a founder launches a company</p>
  </div></body></html>`;
}

const CTA_BY_KEY: Record<string, string> = {
  "student-invite": "Set up my account →",
  "prework-reminder": "Go to Pre-work →",
  "session-reminder": "Open Dashboard →",
  "re-engagement": "Open Dashboard →",
  "assignment-reminder": "Open the Assignment →",
};

const EMAILS: PlaybookEmail[] = [
  {
    id: "intake", name: "Application / Waitlist Confirmation",
    subject: "We got your application ✓",
    audience: "Applicant", when: "Instantly", trigger: "Application or waitlist form submitted",
    source: "CRM", templateKey: "intake-confirmation",
    sampleVars: { firstName: "Jordan" },
  },
  {
    id: "app-alert", name: "New Application Alert",
    subject: "New application: Jordan Miles",
    audience: "Dan + Caleb", when: "Instantly", trigger: "New application or waitlist signup (also posts to Slack).",
    source: "CRM",
    preview: wrap("New application", `<p style="color:#334155;font-size:15px;"><strong>Jordan Miles</strong> (jordan@school.edu) just applied via the 3i landing page. Source: 3I_NEXTGEN.</p>`),
  },
  {
    id: "invite", name: "Student Invite — Set Up Your Account",
    subject: "Welcome to Vantage Career Accelerator — Set up your account",
    audience: "Enrolled student", when: "The moment we choose",
    trigger: "Lead convert (toggle ON) or Cohort → Publish. Publish emails each un-onboarded student exactly once — the official “LMS access” moment.",
    source: "CRM", templateKey: "student-invite",
    sampleVars: { firstName: "Jordan", cohortLine: "You're in **Career Accelerator — Cohort 2** — orientation is Tuesday, September 1." },
  },
  {
    id: "prework-reminder", name: "Pre-work Due Tomorrow",
    subject: "⏰ Pre-work due tomorrow — Module 1",
    audience: "Students who haven't submitted", when: "Daily 10:00 AM ET (only when pre-work is due tomorrow)",
    trigger: "Cohort schedule: preworkDue = tomorrow. One reminder per student per module.",
    source: "LMS", guard: "Onboarded students only", templateKey: "prework-reminder",
    sampleVars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", dueDate: "Sunday, September 6" },
  },
  {
    id: "session-tomorrow", name: "Live Session Tomorrow",
    subject: "📅 Live session tomorrow — Module 1",
    audience: "All cohort students", when: "Daily 10:00 AM ET (only when a live session is tomorrow)",
    trigger: "Cohort schedule: sessionDate = tomorrow. Date/Zoom box appended automatically.",
    source: "LMS", guard: "Onboarded students only", templateKey: "session-reminder",
    sampleVars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", sessionDate: "Tuesday, Sep 8 · 6:30 PM ET" },
  },
  {
    id: "session-day", name: "Session-Day Brief — What to Bring",
    subject: "Tonight 6:30 PM ET — Module 1: Self · what to bring",
    audience: "All cohort students", when: "9:00 AM ET on session day",
    trigger: "Per-module “what we're covering / what to bring” content + Zoom button + personal pre-work status. Content edited per module (ask Caleb).",
    source: "LMS", guard: "Onboarded students only", templateKey: "session-day",
    preview: wrap("Tonight · 6:30 PM ET — Module 1: Self", `<p style="color:#334155;font-size:14px;">Hi Jordan,</p><p><span style="background:#fffbeb;color:#92400e;font-weight:700;padding:3px 9px;border-radius:999px;font-size:12px;">⚠️ Your pre-work isn't in yet</span></p><p style="margin:14px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#949598;">Have ready when you join</p><ul style="margin:0;padding-left:18px;color:#334155;font-size:14px;"><li>Your submitted pre-work open in the LMS</li><li>One story you're ready to tell out loud</li></ul>`, { label: "Join tonight's session →" }),
  },
  {
    id: "assignment-reminder", name: "Assignment Due Reminder",
    subject: "Jordan, your Module 1 assignment is due tomorrow night",
    audience: "Students who haven't submitted", when: "9:00 AM ET the day before the Friday deadline (Thursday, for Tuesday sessions)",
    trigger: "Assignment due Friday night of the session week. One reminder per student per module; submitters never emailed.",
    source: "LMS", guard: "Onboarded students only", templateKey: "assignment-reminder",
    sampleVars: { firstName: "Jordan", moduleNumber: "1", moduleTitle: "Self", dueDate: "tomorrow night — Friday, September 11" },
  },
  {
    id: "booking", name: "1-on-1 Booking Confirmation",
    subject: "📅 Your weekly 1-on-1 time is locked in (8 sessions)",
    audience: "Student + coach (both)", when: "Instantly on booking",
    trigger: "Slot booking or standing weekly reservation. Includes calendar invite (.ics). Calendly bookings get Calendly's own confirmation.",
    source: "LMS",
    preview: wrap("📅 Your weekly 1-on-1 time is locked in", `<p style="color:#334155;font-size:15px;">You reserved a standing weekly 1-on-1 with Dan. Add the attached invite to your calendar.</p><ul style="padding-left:18px;color:#334155;font-size:14px;"><li>Module 1: Self — Wed, Sep 9, 2:00 PM ET</li><li style="color:#949598;">… 7 more</li></ul>`),
  },
  {
    id: "weekly-digest", name: "Weekly Progress Digest",
    subject: "Your week at Vantage Career Accelerator",
    audience: "All cohort students", when: "Mondays, early morning",
    trigger: "Data-driven weekly summary: sections completed, progress %, what's ahead.",
    source: "LMS", guard: "Onboarded students only", templateKey: "weekly-digest",
    preview: wrap("Your week in the program", `<p style="color:#334155;font-size:15px;">Hi Jordan,</p><p style="color:#334155;font-size:15px;">Last week you completed <strong>5 sections</strong> — you're <strong>38%</strong> through the program. This week: Module 4 (Experiment).</p>`),
  },
  {
    id: "nudge", name: "Re-engagement Nudge",
    subject: "We miss you at Vantage Career Accelerator",
    audience: "Students inactive 7+ days", when: "Daily 6:00 AM ET; max one per student per 7 days",
    trigger: "No completed sections in 7 days.",
    source: "LMS", guard: "Onboarded students only", templateKey: "re-engagement",
    sampleVars: { firstName: "Jordan" },
  },
  {
    id: "coach-digest", name: "Morning Coach Digest",
    subject: "📋 Today's Calls (3) — Tuesday, September 9",
    audience: "Each coach with calls today", when: "8:00 AM ET daily (only on days with 1-on-1s)",
    trigger: "One email per coach: each student's pre-work answers, questions, private notes, assignment status, call-sheet link.",
    source: "LMS", templateKey: "coach-digest",
    preview: wrap("📋 Today's 1-on-1 Calls", `<p style="font-size:13px;color:#5a6663;">3 sessions today</p><div style="border:1px solid #e4e0d6;border-radius:10px;padding:12px 14px;margin-top:8px;color:#334155;font-size:14px;"><strong>Jordan Miles</strong> · 2:00 PM ET · Module 1<br/><span style="font-size:12px;"><span style="color:${GREEN};font-weight:700;">✓ Prework</span> · <span style="color:#949598;">Assignment not in yet</span></span></div>`),
  },
  {
    id: "graduation", name: "Graduation / Completion",
    subject: "🎓 Congratulations — you've completed the Vantage Career Accelerator!",
    audience: "Graduating student", when: "On completion",
    trigger: "Program completion (certificate link included).",
    source: "LMS",
    preview: wrap("🎓 You did it!", `<p style="color:#334155;font-size:15px;">Congratulations — you've officially completed the Vantage Career Accelerator!</p>`, { label: "View my certificate →" }),
  },
];

const PHASES: { label: string; ids: string[] }[] = [
  { label: "Before enrollment", ids: ["intake", "app-alert"] },
  { label: "Enrollment (nothing sends until you choose)", ids: ["invite"] },
  { label: "Weekly rhythm during the program", ids: ["prework-reminder", "session-tomorrow", "session-day", "assignment-reminder", "booking", "weekly-digest", "nudge", "coach-digest"] },
  { label: "Close", ids: ["graduation"] },
];

export function EmailPlaybook() {
  const [templates, setTemplates] = useState<Record<string, DbTemplate>>({});
  const [open, setOpen] = useState<PlaybookEmail | null>(null);
  const byId = Object.fromEntries(EMAILS.map(e => [e.id, e]));

  useEffect(() => {
    fetch("/api/crm/email-templates").then(r => r.ok ? r.json() : []).then((rows: DbTemplate[]) => {
      if (Array.isArray(rows)) setTemplates(Object.fromEntries(rows.map(t => [t.key, t])));
    }).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-4 text-sm leading-relaxed" style={{ borderColor: "#d0e8e6", background: "#edf5f4", color: "#084f4a" }}>
        <strong>How the system stays quiet until we&rsquo;re ready:</strong> no student receives any automated email
        until their cohort is <strong>published</strong> (Cohorts → Publish). Publishing sends the account-setup invite
        once, and switches on the weekly rhythm below. Emails marked <Pencil size={11} className="inline" style={{ color: GREEN }} /> <strong>Editable</strong> save
        your changes automatically — the very next send uses your copy. <span style={{ color: "#5a6663" }}>Sequences (Outreach)
        are separate: manual drip campaigns for <em>leads</em>, auto-stopped at enrollment.</span>
      </div>

      {PHASES.map(phase => (
        <div key={phase.label}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "#949598" }}>{phase.label}</p>
          <div className="space-y-2.5">
            {phase.ids.map(id => {
              const e = byId[id];
              const dbT = e.templateKey ? templates[e.templateKey] : undefined;
              return (
                <div key={e.id} className={`card p-4 flex items-start gap-3.5 ${dbT && !dbT.enabled ? "opacity-60" : ""}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                    <Mail size={15} style={{ color: GREEN }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "#14211f" }}>{e.name}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: e.source === "LMS" ? "#edf5f4" : "#fef7e8", color: e.source === "LMS" ? GREEN : "#b45309" }}>{e.source}</span>
                      {dbT?.editable && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" style={{ background: "#edf5f4", color: GREEN }}><Pencil size={9} /> Editable</span>}
                      {e.guard && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#f1efe8", color: "#5a6663" }}>🔒 {e.guard}</span>}
                      {dbT && !dbT.enabled && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#fee2e2", color: "#b91c1c" }}>OFF — not sending</span>}
                    </div>
                    <p className="text-xs mt-1 italic" style={{ color: "#5a6663" }}>&ldquo;{dbT?.editable ? dbT.subject : e.subject}&rdquo;</p>
                    <div className="flex items-start gap-4 mt-1.5 flex-wrap text-[11px]" style={{ color: "#949598" }}>
                      <span className="flex items-center gap-1"><Users size={11} /> {e.audience}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {e.when}</span>
                    </div>
                    <p className="text-[11px] mt-1 flex items-start gap-1" style={{ color: "#949598" }}><Zap size={11} className="mt-0.5 flex-shrink-0" /> {e.trigger}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {dbT && (
                      <button
                        title={dbT.enabled ? "Sending is ON — click to switch off" : "Sending is OFF — click to switch on"}
                        onClick={async () => {
                          const next = !dbT.enabled;
                          setTemplates(prev => ({ ...prev, [dbT.key]: { ...dbT, enabled: next } }));
                          const res = await fetch("/api/crm/email-templates", {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key: dbT.key, enabled: next }),
                          });
                          if (!res.ok) setTemplates(prev => ({ ...prev, [dbT.key]: dbT }));
                        }}
                        className="relative w-10 h-6 rounded-full transition-colors"
                        style={{ background: dbT.enabled ? GREEN : "#e4e0d6" }}>
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${dbT.enabled ? "translate-x-5" : "translate-x-1"}`} />
                      </button>
                    )}
                    <button onClick={() => setOpen(e)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border hover:shadow-sm transition"
                      style={{ borderColor: "#e4e0d6", color: GREEN }}>
                      {dbT?.editable ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {open && (
        open.templateKey && templates[open.templateKey]?.editable
          ? <TemplateEditor email={open} template={templates[open.templateKey]}
              onClose={() => setOpen(null)}
              onSaved={t => setTemplates(prev => ({ ...prev, [t.key]: t }))} />
          : <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,33,31,0.5)" }} onClick={() => setOpen(null)}>
              <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "#e4e0d6" }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#14211f" }}>{open.name}</p>
                    <p className="text-xs" style={{ color: "#949598" }}>Subject: {open.subject} · dynamic template — copy changes go through Caleb</p>
                  </div>
                  <button onClick={() => setOpen(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} style={{ color: "#949598" }} /></button>
                </div>
                <iframe title="Email preview" sandbox="" srcDoc={open.preview} className="flex-1 w-full" style={{ minHeight: 480, border: "none", background: "#f1efe8" }} />
              </div>
            </div>
      )}
    </div>
  );
}

function TemplateEditor({ email, template, onClose, onSaved }: {
  email: PlaybookEmail; template: DbTemplate;
  onClose: () => void; onSaved: (t: DbTemplate) => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [testState, setTestState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(nextSubject: string, nextBody: string) {
    if (timer.current) clearTimeout(timer.current);
    setState("saving");
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/crm/email-templates", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: template.key, subject: nextSubject, body: nextBody }),
      });
      if (res.ok) { onSaved(await res.json()); setState("saved"); setTimeout(() => setState("idle"), 2000); }
      else setState("error");
    }, 900);
  }

  const vars = email.sampleVars ?? {};
  const previewHtml = wrap(
    subVars(subject, vars),
    textToHtml(subVars(body, vars)),
    CTA_BY_KEY[template.key] ? { label: CTA_BY_KEY[template.key] } : undefined
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,33,31,0.5)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0" style={{ borderColor: "#e4e0d6" }}>
          <div className="flex items-center gap-3">
            <p className="text-sm font-bold" style={{ color: "#14211f" }}>{email.name}</p>
            <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: state === "error" ? "#b91c1c" : state === "saving" ? "#b45309" : GREEN }}>
              {state === "saving" && <><Loader2 size={11} className="animate-spin" /> Saving…</>}
              {state === "saved" && <><CheckCircle2 size={11} /> Saved</>}
              {state === "error" && "Save failed — check your changes"}
              {state === "idle" && "Changes save automatically"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={testState === "sending"}
              onClick={async () => {
                setTestState("sending");
                const res = await fetch("/api/crm/email-templates/test", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ key: template.key }),
                });
                setTestState(res.ok ? "sent" : "failed");
                setTimeout(() => setTestState("idle"), 4000);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border hover:shadow-sm transition disabled:opacity-50"
              style={{ borderColor: "#e4e0d6", color: GREEN }}>
              {testState === "sending" ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                : testState === "sent" ? <><CheckCircle2 size={12} /> Sent to your inbox</>
                : testState === "failed" ? "Failed — try again"
                : <><Mail size={12} /> Email me a test</>}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} style={{ color: "#949598" }} /></button>
          </div>
        </div>
        <div className="flex-1 grid md:grid-cols-2 min-h-0">
          {/* Editor */}
          <div className="p-5 overflow-y-auto border-r" style={{ borderColor: "#e4e0d6" }}>
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Subject</label>
            <input value={subject}
              onChange={ev => { setSubject(ev.target.value); scheduleSave(ev.target.value, body); }}
              className="w-full px-3 py-2.5 rounded-xl border text-sm mb-4" style={{ borderColor: "#e4e0d6" }} />
            <label className="block text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Body</label>
            <textarea value={body} rows={14}
              onChange={ev => { setBody(ev.target.value); scheduleSave(subject, ev.target.value); }}
              className="w-full px-3 py-2.5 rounded-xl border text-sm font-mono leading-relaxed" style={{ borderColor: "#e4e0d6" }} />
            <div className="mt-3 text-[11px] leading-relaxed rounded-xl p-3" style={{ background: "#f8f6f1", color: "#5a6663" }}>
              <strong>Formatting:</strong> blank line = new paragraph · <code>**bold**</code> ·
              placeholders fill in automatically: {template.placeholders.split(",").map(p => (
                <code key={p} className="mx-0.5 px-1 rounded" style={{ background: "#e4e0d6" }}>{`{{${p.trim()}}}`}</code>
              ))}
              {CTA_BY_KEY[template.key] && <> · the &ldquo;{CTA_BY_KEY[template.key]}&rdquo; button is added automatically below your text.</>}
            </div>
          </div>
          {/* Live preview */}
          <div className="min-h-[420px] flex flex-col">
            <p className="text-[10px] font-bold uppercase tracking-wide px-4 pt-3 pb-1 flex-shrink-0" style={{ color: "#949598" }}>Live preview (sample data)</p>
            <iframe title="Live preview" sandbox="" srcDoc={previewHtml} className="flex-1 w-full" style={{ border: "none", background: "#f1efe8" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
