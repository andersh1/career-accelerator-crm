"use client";
import { useState } from "react";
import { ChevronDown, Mail } from "lucide-react";

export const TEMPLATES = [
  {
    key: "intro",
    label: "First Touch",
    subject: "Interested in the 10x Career Accelerator?",
    body: (name: string) =>
      `Hi ${name},\n\nI came across your profile and wanted to reach out — we're running the 10x Career Accelerator program and I thought it might be a great fit for where you are in your career.\n\nThe program is an intensive 8-module coaching experience designed to help professionals land their next big role or make a meaningful career pivot.\n\nWould love to set up a quick 20-minute call to see if it's a good fit. Are you open to connecting this week?\n\nLooking forward to hearing from you!`,
  },
  {
    key: "followup",
    label: "Follow-up",
    subject: "Following up — 10x Career Accelerator",
    body: (name: string) =>
      `Hi ${name},\n\nJust wanted to follow up on my previous message about the 10x Career Accelerator program.\n\nI know things get busy — I wanted to make sure this didn't get lost. If now isn't the right time, no worries at all. But if you're open to a quick conversation, I'd love to connect.\n\nHappy to work around your schedule — just let me know what works best.`,
  },
  {
    key: "proposal",
    label: "Program Overview",
    subject: "10x Career Accelerator — Program Details",
    body: (name: string) =>
      `Hi ${name},\n\nGreat connecting with you! As promised, here's a quick overview of the 10x Career Accelerator:\n\n📌 8 modules of 1:1 coaching and structured curriculum\n📌 Live sessions + pre-work to build real momentum\n📌 Focus on positioning, networking, interviews, and offers\n📌 Cohort-based so you're learning alongside peers\n\nInvestment and next cohort dates are included in the attached overview.\n\nWould love to hear your thoughts — feel free to reply with any questions or we can jump on a call if easier.`,
  },
  {
    key: "acceptance",
    label: "Welcome / Accepted",
    subject: "Welcome to the 10x Career Accelerator 🎉",
    body: (name: string) =>
      `Hi ${name},\n\nWelcome to the 10x Career Accelerator! We're so excited to have you.\n\nYou'll be receiving a separate email shortly with your login credentials to access the student portal, where you'll find your pre-work and cohort schedule.\n\nIf you have any questions before your first session, don't hesitate to reach out. We're here to make sure you get the most out of this experience.\n\nSee you soon!`,
  },
  {
    key: "checkin",
    label: "Check-in",
    subject: "Checking in — how are things going?",
    body: (name: string) =>
      `Hi ${name},\n\nJust wanted to check in and see how things are going since we last connected.\n\nAre you still thinking about making a move in your career? We have a new cohort starting soon and I wanted to make sure you had all the information before spots fill up.\n\nHappy to answer any questions — just reply here or grab a time on my calendar.\n\nHope all is well!`,
  },
];

interface Props {
  leadName: string;
  onSelect: (body: string, subject: string) => void;
}

export default function EmailTemplateMenu({ leadName, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const firstName = leadName.split(" ")[0] || leadName;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-blue-200 hover:bg-blue-50 transition"
      >
        <Mail size={12} /> Templates <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 w-52">
            <p className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Quick templates</p>
            {TEMPLATES.map(t => (
              <button
                key={t.key}
                onClick={() => { onSelect(t.body(firstName), t.subject); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition flex items-center gap-2"
              >
                <Mail size={12} className="text-slate-400 flex-shrink-0" />
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
