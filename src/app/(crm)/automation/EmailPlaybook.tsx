"use client";

import { useState } from "react";
import { Mail, Eye, X, Clock, Users, Zap } from "lucide-react";

/**
 * The Email Playbook — the single reference for every automated email the
 * program sends. Previews are representative snapshots of the real templates
 * (source of truth is the LMS/CRM code); descriptions and timing are exact.
 */

interface PlaybookEmail {
  id: string;
  name: string;
  subject: string;
  audience: string;
  when: string;
  trigger: string;
  source: "LMS" | "CRM";
  guard?: string;
  preview: string; // HTML body preview (rendered in a sandboxed iframe)
}

const GREEN = "#086c64";

function wrap(title: string, body: string) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1efe8;font-family:'Montserrat',Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 14px;">
    <div style="background:linear-gradient(135deg,#086c64,#063f3a);border-radius:16px;padding:20px 24px;margin-bottom:18px;">
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.12em;">Vantage Career Accelerator</p>
      <h1 style="margin:0;font-size:19px;font-weight:800;color:#fff;">${title}</h1>
    </div>
    <div style="background:#fff;border:1px solid #e4e0d6;border-radius:14px;padding:20px 22px;font-size:14px;color:#14211f;line-height:1.65;">${body}</div>
    <p style="margin:14px 0 0;text-align:center;font-size:11px;color:#949598;">Vantage Career Accelerator · lms.vantagecareer.co</p>
  </div></body></html>`;
}

const EMAILS: PlaybookEmail[] = [
  // ── Pre-enrollment (CRM) ──
  {
    id: "intake", name: "Application / Waitlist Confirmation",
    subject: "We got your application ✓",
    audience: "Applicant", when: "Instantly", trigger: "Application or waitlist form submitted",
    source: "CRM",
    preview: wrap("We got your application", `<p>Hi Jordan,</p><p>We received your application to <strong>Vantage Career Accelerator</strong> and we're excited to learn more about you. Dan reviews every application personally — you'll hear from us within a few days.</p>`),
  },
  {
    id: "invite", name: "Student Invite — Set Up Your Account",
    subject: "Welcome to Vantage Career Accelerator — Set up your account",
    audience: "Enrolled student", when: "The moment we choose", trigger: "Lead convert (toggle ON) or Cohort → Publish. Publish emails each un-onboarded student exactly once — this is the official “LMS access” moment (~48h before orientation).",
    source: "CRM",
    preview: wrap("Welcome — set up your account", `<p>Hi Jordan,</p><p>You've been enrolled in the <strong>Vantage Career Accelerator</strong> program. Click below to set your password and access your student portal.</p><p style="text-align:center;margin:18px 0;"><a href="#" style="background:${GREEN};color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700;">Set up my account →</a></p><p style="font-size:12px;color:#949598;">Cohort: Career Accelerator — Cohort 2</p>`),
  },
  // ── Program lifecycle (LMS) — all silent until cohort is published ──
  {
    id: "prework-reminder", name: "Pre-work Due Tomorrow",
    subject: "⏰ Pre-work due tomorrow — Module 1",
    audience: "Students who haven't submitted", when: "Daily 10:00 AM ET (fires only when a module's pre-work is due tomorrow)",
    trigger: "Cohort schedule: preworkDue = tomorrow. One reminder per student per module (logged).",
    source: "LMS", guard: "Onboarded students only",
    preview: wrap("⏰ Pre-work due tomorrow", `<p>Hi Jordan,</p><p>Your <strong>Module 1: Self</strong> pre-work is due <strong>tomorrow (Sunday, September 6)</strong>. Your 360 tracker, energy audit, and story bank feed directly into Tuesday's live session.</p><p style="text-align:center;margin:18px 0;"><a href="#" style="background:${GREEN};color:#fff;padding:11px 24px;border-radius:10px;text-decoration:none;font-weight:700;">Open my pre-work →</a></p>`),
  },
  {
    id: "session-tomorrow", name: "Live Session Tomorrow",
    subject: "📅 Live session tomorrow — Module 1",
    audience: "All cohort students", when: "Daily 10:00 AM ET (fires only when a live session is tomorrow)",
    trigger: "Cohort schedule: sessionDate = tomorrow.",
    source: "LMS", guard: "Onboarded students only",
    preview: wrap("📅 Live session tomorrow", `<p>Hi Jordan,</p><p>Your <strong>Module 1: Self</strong> live session is <strong>tomorrow at 6:30 PM ET</strong>. Come with your pre-work submitted and ready to participate — cameras on, off mute.</p>`),
  },
  {
    id: "session-day", name: "Session-Day Brief — What to Bring",
    subject: "Tonight 6:30 PM ET — Module 1: Self · what to bring",
    audience: "All cohort students", when: "9:00 AM ET on session day",
    trigger: "Cohort schedule: sessionDate = today. Per-module content (what we're covering / what to bring) + Zoom button + personal pre-work status chip.",
    source: "LMS", guard: "Onboarded students only",
    preview: wrap("Tonight · 6:30 PM ET — Module 1: Self", `<p>Hi Jordan,</p><p><span style="background:#fffbeb;color:#92400e;font-weight:700;padding:3px 9px;border-radius:999px;font-size:12px;">⚠️ Your pre-work isn't in yet</span> — tonight's breakouts work directly from it.</p><p style="margin:14px 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;color:#949598;">Have ready when you join</p><ul style="margin:0;padding-left:18px;"><li>Your submitted pre-work open in the LMS</li><li>One story you're ready to tell out loud</li><li>The biggest surprise from your 360</li></ul><p style="margin:14px 0 0;border-left:3px solid ${GREEN};padding-left:10px;font-size:13px;color:#5a6663;">This is a workshop, not a webinar. Camera on, ready to come off mute.</p><p style="text-align:center;margin:16px 0 0;"><a href="#" style="background:${GREEN};color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700;">Join tonight's session →</a></p>`),
  },
  {
    id: "booking", name: "1-on-1 Booking Confirmation",
    subject: "📅 Your weekly 1-on-1 time is locked in (8 sessions)",
    audience: "Student + coach (both get it)", when: "Instantly on booking",
    trigger: "Student books a slot or reserves a standing weekly time. Includes a calendar invite (.ics) — for standing reservations one invite covers all 8 sessions. Calendly bookings get Calendly's own confirmation instead.",
    source: "LMS",
    preview: wrap("📅 Your weekly 1-on-1 time is locked in", `<p>You reserved a standing weekly 1-on-1 with Dan. Add the attached invite to your calendar.</p><ul style="padding-left:18px;"><li>Module 1: Self — Wed, Sep 9, 2:00 PM ET</li><li>Module 2: Market Discovery — Wed, Sep 16, 2:00 PM ET</li><li style="color:#949598;">… 6 more</li></ul>`),
  },
  {
    id: "weekly-digest", name: "Weekly Progress Digest",
    subject: "Your week at Vantage Career Accelerator",
    audience: "All cohort students", when: "Mondays, early morning",
    trigger: "Weekly summary: sections completed last week, overall progress, what's ahead.",
    source: "LMS", guard: "Onboarded students only",
    preview: wrap("Your week in the program", `<p>Hi Jordan,</p><p>Last week you completed <strong>5 sections</strong> — you're <strong>38%</strong> through the program. This week: Module 4 (Experiment) — pre-work due Sunday, live session Tuesday 6:30 PM ET.</p>`),
  },
  {
    id: "nudge", name: "Re-engagement Nudge",
    subject: "We miss you at Vantage Career Accelerator",
    audience: "Students inactive 7+ days", when: "Daily 6:00 AM ET check; max one nudge per student per 7 days",
    trigger: "No completed sections in 7 days.",
    source: "LMS", guard: "Onboarded students only",
    preview: wrap("We miss you", `<p>Hi Jordan, we noticed you haven't logged in recently — no worries, life gets busy!</p><p>Whenever you're ready to jump back in, your modules are waiting. Even 15 minutes of progress makes a difference. You've got this! 🚀</p>`),
  },
  {
    id: "graduation", name: "Graduation / Completion",
    subject: "🎓 Congratulations — you've completed the Vantage Career Accelerator!",
    audience: "Graduating student", when: "On completion / manual send at close",
    trigger: "Program completion (certificate link included).",
    source: "LMS",
    preview: wrap("🎓 You did it!", `<p>Congratulations — you've officially completed the Vantage Career Accelerator!</p><p style="text-align:center;margin:18px 0;"><a href="#" style="background:${GREEN};color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700;">View my certificate →</a></p>`),
  },
  // ── Coach / team facing ──
  {
    id: "coach-digest", name: "Morning Coach Digest",
    subject: "📋 Today's Calls (3) — Tuesday, September 9",
    audience: "Each coach with calls today", when: "8:00 AM ET daily (only on days with 1-on-1s)",
    trigger: "Coach has confirmed 1-on-1s today. One email per coach: each student's pre-work answers, their questions, the coach's private notes, assignment status, call-sheet link.",
    source: "LMS",
    preview: wrap("📋 Today's 1-on-1 Calls", `<p style="font-size:13px;color:#5a6663;">3 sessions today</p><div style="border:1px solid #e4e0d6;border-radius:10px;padding:12px 14px;margin-top:8px;"><strong>Jordan Miles</strong> · 2:00 PM ET · Module 1<br/><span style="font-size:12px;"><span style="color:${GREEN};font-weight:700;">✓ Prework</span> · <span style="color:#949598;">Assignment not in yet</span> · <a href="#" style="color:${GREEN};font-weight:600;">Open call sheet →</a></span></div>`),
  },
  {
    id: "app-alert", name: "New Application Alert",
    subject: "New application: Jordan Miles",
    audience: "Dan + Caleb", when: "Instantly", trigger: "New application or waitlist signup (also posts to Slack).",
    source: "CRM",
    preview: wrap("New application", `<p><strong>Jordan Miles</strong> (jordan@school.edu) just applied via the 3i landing page. Source: 3I_NEXTGEN.</p>`),
  },
];

const PHASES: { label: string; ids: string[] }[] = [
  { label: "Before enrollment", ids: ["intake", "app-alert"] },
  { label: "Enrollment (nothing sends until you choose)", ids: ["invite"] },
  { label: "Weekly rhythm during the program", ids: ["prework-reminder", "session-tomorrow", "session-day", "booking", "weekly-digest", "nudge", "coach-digest"] },
  { label: "Close", ids: ["graduation"] },
];

export function EmailPlaybook() {
  const [preview, setPreview] = useState<PlaybookEmail | null>(null);
  const byId = Object.fromEntries(EMAILS.map(e => [e.id, e]));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border p-4 text-sm leading-relaxed" style={{ borderColor: "#d0e8e6", background: "#edf5f4", color: "#084f4a" }}>
        <strong>How the system stays quiet until we&rsquo;re ready:</strong> no student receives any automated email
        until their cohort is <strong>published</strong> (Cohorts → Publish). Publishing sends the account-setup invite
        once, and switches on the weekly rhythm below. <span style={{ color: "#5a6663" }}>Sequences (in Outreach) are
        separate — they&rsquo;re manual drip campaigns for <em>leads</em> before enrollment, and they auto-stop the moment
        a lead enrolls.</span>
      </div>

      {PHASES.map(phase => (
        <div key={phase.label}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "#949598" }}>{phase.label}</p>
          <div className="space-y-2.5">
            {phase.ids.map(id => {
              const e = byId[id];
              return (
                <div key={e.id} className="card p-4 flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4" }}>
                    <Mail size={15} style={{ color: GREEN }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold" style={{ color: "#14211f" }}>{e.name}</p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: e.source === "LMS" ? "#edf5f4" : "#fef7e8", color: e.source === "LMS" ? GREEN : "#b45309" }}>{e.source}</span>
                      {e.guard && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#f1efe8", color: "#5a6663" }}>🔒 {e.guard}</span>}
                    </div>
                    <p className="text-xs mt-1 italic" style={{ color: "#5a6663" }}>&ldquo;{e.subject}&rdquo;</p>
                    <div className="flex items-start gap-4 mt-1.5 flex-wrap text-[11px]" style={{ color: "#949598" }}>
                      <span className="flex items-center gap-1"><Users size={11} /> {e.audience}</span>
                      <span className="flex items-center gap-1"><Clock size={11} /> {e.when}</span>
                    </div>
                    <p className="text-[11px] mt-1 flex items-start gap-1" style={{ color: "#949598" }}><Zap size={11} className="mt-0.5 flex-shrink-0" /> {e.trigger}</p>
                  </div>
                  <button onClick={() => setPreview(e)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border flex-shrink-0 hover:shadow-sm transition"
                    style={{ borderColor: "#e4e0d6", color: GREEN }}>
                    <Eye size={12} /> Preview
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[11px]" style={{ color: "#949598" }}>
        Previews are representative snapshots — the live templates ship with the LMS/CRM code, so exact copy may evolve.
        To change what an email says or when it sends, ask Caleb (or Claude) — timing lives in the cron schedule, copy in the email templates.
      </p>

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,33,31,0.5)" }} onClick={() => setPreview(null)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "#e4e0d6" }}>
              <div>
                <p className="text-sm font-bold" style={{ color: "#14211f" }}>{preview.name}</p>
                <p className="text-xs" style={{ color: "#949598" }}>Subject: {preview.subject}</p>
              </div>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X size={16} style={{ color: "#949598" }} /></button>
            </div>
            <iframe title="Email preview" sandbox="" srcDoc={preview.preview} className="flex-1 w-full" style={{ minHeight: 480, border: "none", background: "#f1efe8" }} />
          </div>
        </div>
      )}
    </div>
  );
}
