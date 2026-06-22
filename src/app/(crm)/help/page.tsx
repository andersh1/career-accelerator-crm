"use client";

import { useState } from "react";
import {
  Search, Users, Kanban, TrendingUp, Mail, Zap, CheckSquare, LifeBuoy,
  Settings, Download, Upload, Merge, Trash2, Bookmark, Filter, Sparkles,
  ChevronDown, ChevronUp, Keyboard, Globe, Clock, Shield,
} from "lucide-react";

interface Section {
  id: string;
  icon: React.ElementType;
  title: string;
  color: string;
  items: { title: string; desc: string; tip?: string }[];
}

const sections: Section[] = [
  {
    id: "leads",
    icon: Users,
    title: "Contacts & Leads",
    color: "text-blue-600 bg-blue-50",
    items: [
      { title: "Add a lead", desc: "Click \"Add Lead\" in the header, or press N anywhere on the Contacts page to open the form instantly.", tip: "Shortcut: N" },
      { title: "Inline stage change", desc: "Click any stage badge in the table (or on a mobile card) to change the stage without opening the lead. Changes save immediately." },
      { title: "Lead scoring", desc: "Every lead gets an automatic score (0–100) based on stage, priority, deal value, and recent activity. Higher score = closer to enrolled." },
      { title: "Cold lead warning", desc: "A ⚠️ icon appears on any active lead not touched in 14+ days, so nothing slips through the cracks." },
      { title: "Bulk actions", desc: "Check multiple leads then use the action bar to move stage, set priority, add a tag, or delete — all at once." },
      { title: "Saved views", desc: "Apply filters, then click \"Save view\" to pin that combo as a one-click chip above the table. Great for \"Hot Leads\" or \"This Week's Calls\"." },
      { title: "Duplicate detection", desc: "The system scans for leads with matching names or emails and shows an alert. Use the Merge button to combine duplicate records without losing history." },
      { title: "Recycle bin", desc: "Deleted leads go to the Recycle Bin (not permanent). Restore or permanently purge from the bin — only Admins can purge.", tip: "Admin only: purge" },
    ],
  },
  {
    id: "pipeline",
    icon: Kanban,
    title: "Pipeline",
    color: "text-indigo-600 bg-indigo-50",
    items: [
      { title: "Kanban board", desc: "Drag-and-drop leads across stages: Lead → Contacted → Qualified → Proposal → Enrolled (or Lost). Each column shows count and total deal value." },
      { title: "Stage order", desc: "Stages represent your enrollment funnel. Moving a lead right means progress; moving left means re-engagement." },
    ],
  },
  {
    id: "search",
    icon: Search,
    title: "Global Search",
    color: "text-slate-600 bg-slate-100",
    items: [
      { title: "⌘K search", desc: "Press ⌘K (Mac) or Ctrl+K (Windows) from anywhere in the CRM to open a spotlight-style search across all leads by name, email, or company." },
      { title: "Inline filter search", desc: "Use the search bar on the Contacts page to filter the current list in real time." },
    ],
  },
  {
    id: "import",
    icon: Upload,
    title: "Import & Export",
    color: "text-emerald-600 bg-emerald-50",
    items: [
      { title: "CSV Import", desc: "Click \"Import CSV\" to bulk-upload leads. Map your columns (firstName, lastName, email, company, stage, etc.) in the preview step before committing." },
      { title: "CSV Export", desc: "Click \"Export CSV\" to download all visible leads (respects active filters). Use this for reporting or hand-offs.", tip: "Admin only" },
      { title: "Public intake API", desc: "POST to /api/intake to create leads from your website form automatically. Set INTAKE_API_KEY in Vercel env vars to secure it. New submissions trigger a Slack ping and a confirmation email to the prospect." },
    ],
  },
  {
    id: "email",
    icon: Zap,
    title: "Email Blast",
    color: "text-orange-600 bg-orange-50",
    items: [
      { title: "Send to a segment", desc: "Go to Email Blast, filter by stage/source/tags, write your subject and HTML body, then send to everyone matching. Requires Resend API key.", tip: "Admin only" },
      { title: "Open tracking", desc: "Every blast email includes an invisible tracking pixel. Open rates, per-email stats, and a 6-month trend chart are in Analytics → Email tab." },
    ],
  },
  {
    id: "sequences",
    icon: Mail,
    title: "Sequences",
    color: "text-violet-600 bg-violet-50",
    items: [
      { title: "Automated follow-ups", desc: "Build multi-step email sequences with day delays (e.g. Day 1, Day 3, Day 7). Enroll leads individually or in bulk." },
      { title: "Step types", desc: "Each step is an email with a subject, body, and delay. Steps send automatically via the daily cron at 8 AM UTC." },
      { title: "Unsubscribe handling", desc: "Leads marked Lost are automatically skipped by sequences." },
    ],
  },
  {
    id: "tasks",
    icon: CheckSquare,
    title: "Tasks",
    color: "text-teal-600 bg-teal-50",
    items: [
      { title: "Personal task list", desc: "Create tasks for yourself or assign to team members. Each task can link to a specific lead for context." },
      { title: "Due dates", desc: "Overdue tasks show a red indicator. The Home dashboard surfaces your most urgent open tasks." },
    ],
  },
  {
    id: "analytics",
    icon: TrendingUp,
    title: "Analytics",
    color: "text-pink-600 bg-pink-50",
    items: [
      { title: "Funnel report", desc: "See how many leads are at each stage and how they convert. Spot where leads are stalling." },
      { title: "Source breakdown", desc: "Which channels (Website, Referral, LinkedIn, etc.) produce the most leads and the most enrollments." },
      { title: "Email open rates", desc: "Open rate, unique opens, 30-day snapshot, and 6-month bar chart — all in the Email tab." },
      { title: "Weekly leadership report", desc: "Every Monday at 8 AM UTC an automated digest email goes to all Admins. It covers new leads, enrollments, funnel health, and the top 5 leads to focus on that week." },
    ],
  },
  {
    id: "support",
    icon: LifeBuoy,
    title: "Support Tickets",
    color: "text-amber-600 bg-amber-50",
    items: [
      { title: "Student-submitted tickets", desc: "Students submit support requests from the LMS portal. They appear here in real time." },
      { title: "Reply & resolve", desc: "Reply directly from the ticket thread. Mark tickets resolved or reopen them. Replies send an email to the student." },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings & Team",
    color: "text-slate-600 bg-slate-100",
    items: [
      { title: "Invite team members", desc: "Go to Settings → Team to invite someone by email. Choose their CRM role: Admin (full access) or Member (read + create, no bulk delete or export).", tip: "Admin only" },
      { title: "Slack integration", desc: "Paste your Slack incoming webhook URL in Settings → Integrations. New leads, enrollments, and cold-lead alerts will ping your channel." },
      { title: "Email from address", desc: "Set RESEND_FROM_EMAIL in Vercel env vars to use your own verified domain (e.g. team@yourcompany.com) instead of the default sender." },
    ],
  },
  {
    id: "access",
    icon: Shield,
    title: "Roles & Permissions",
    color: "text-red-600 bg-red-50",
    items: [
      { title: "Admin", desc: "Full access: invite users, delete leads, export CSV, send blasts, purge recycle bin, and manage all settings." },
      { title: "Member", desc: "Can view, create, and update leads. Cannot delete, export, blast email, or manage team members." },
      { title: "Existing users", desc: "All users created before roles were added default to Admin so nothing breaks. Only newly invited Members are restricted." },
    ],
  },
  {
    id: "intake",
    icon: Globe,
    title: "Public Intake Form",
    color: "text-cyan-600 bg-cyan-50",
    items: [
      { title: "Endpoint", desc: "POST /api/intake — accepts firstName, lastName, email, phone, company, jobTitle, linkedinUrl, source, notes, tags." },
      { title: "Auto-enrichment", desc: "If no company is provided, the system attempts to infer it from the email domain." },
      { title: "Deduplication", desc: "Submitting the same email twice won't create a duplicate — it logs a note on the existing lead instead." },
      { title: "Side effects", desc: "On a new lead: sends a confirmation email to the prospect and a Slack ping to your team (if configured). Both are non-fatal — a failure won't break the submission." },
    ],
  },
  {
    id: "shortcuts",
    icon: Keyboard,
    title: "Keyboard Shortcuts",
    color: "text-slate-600 bg-slate-100",
    items: [
      { title: "N", desc: "Open the Add Lead form (from the Contacts page, when not focused on an input)." },
      { title: "⌘K / Ctrl+K", desc: "Open global search from anywhere in the CRM." },
      { title: "Esc", desc: "Close any open modal or dialog." },
    ],
  },
  {
    id: "cron",
    icon: Clock,
    title: "Automated Jobs",
    color: "text-slate-600 bg-slate-100",
    items: [
      { title: "Daily sequences", desc: "Runs at 1 PM UTC — sends the next pending email in each active sequence enrollment." },
      { title: "Daily notifications", desc: "Runs at 12 PM UTC — checks for cold leads (14+ days inactive) and queues CRM notifications." },
      { title: "Weekly report", desc: "Runs Monday at 8 AM UTC — sends the leadership digest to all Admins via email." },
    ],
  },
];

export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(sections.map(s => s.id)));

  const q = search.toLowerCase().trim();
  const filtered = sections
    .map(s => ({
      ...s,
      items: q
        ? s.items.filter(i => i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q))
        : s.items,
    }))
    .filter(s => !q || s.items.length > 0 || s.title.toLowerCase().includes(q));

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Help & Features</h1>
        <p className="text-sm text-slate-500 mt-1">Everything you can do in the 10x Career Accelerator CRM.</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search features…"
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filtered.map(section => {
          const Icon = section.icon;
          const open = expanded.has(section.id);
          return (
            <div key={section.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition text-left"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${section.color}`}>
                  <Icon size={15} />
                </div>
                <span className="font-semibold text-slate-900 flex-1">{section.title}</span>
                <span className="text-xs text-slate-400 mr-2">{section.items.length} feature{section.items.length !== 1 ? "s" : ""}</span>
                {open ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
              </button>

              {open && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {section.items.map((item, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                      {item.tip && (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 mt-0.5">
                          {item.tip}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-slate-400 text-sm">
            No features match &ldquo;{search}&rdquo;
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-300 mt-10">10x Career Accelerator CRM · Built for your team</p>
    </div>
  );
}
