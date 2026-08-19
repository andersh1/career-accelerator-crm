"use client";

import { useState } from "react";
import {
  Search, Users, Kanban, TrendingUp, Mail, Zap, CheckSquare, LifeBuoy,
  Settings, Download, Upload, Merge, Trash2, Bookmark, Filter, Sparkles,
  ChevronDown, ChevronUp, Keyboard, Globe, Clock, Shield, Tag, Share2, Calendar,
  Trophy, AlertCircle, Briefcase, Building2, Bot,
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
      { title: "Source filter", desc: "Use the Source dropdown in the Pipeline toolbar to view only Event leads, Referral leads, LinkedIn leads, etc. — perfect for comparing which channel is moving fastest." },
      { title: "Color-coded source badges", desc: "Each lead card shows a colored badge for its acquisition channel: amber = Event, blue = Referral, indigo = LinkedIn. Spot the source at a glance without opening the lead." },
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
      { title: "Growth tab", desc: "The 📈 Growth tab compares all acquisition channels side-by-side: Events, Referrals, Promo Codes, and Website/Direct. Each channel card shows total leads, apply rate, and enroll rate. Sub-tabs break down individual event performance, referral leaderboard, and promo code conversion — the same view you'd find in Salesforce or HubSpot.", tip: "Admin only" },
      { title: "Events sub-tab", desc: "See every event ranked by enrollment efficiency: Registered → Attended → Applied → Enrolled with conversion percentages. Identify which dinners and webinars are your best pipeline sources." },
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
    id: "events",
    icon: Calendar,
    title: "Events",
    color: "text-indigo-600 bg-indigo-50",
    items: [
      { title: "Events dashboard", desc: "Growth → Events is your Events home page — shows KPI cards (Total Registered, Attendance Rate, Applied, Enrolled), upcoming events list with inline copy-link and manage buttons, an aggregate registration pipeline funnel with conversion rates, and a past-events log. It's your single glance to see everything in motion." },
      { title: "Create an event", desc: "Go to Growth → Events → New event. Choose In-Person or Zoom, fill in the title, slug, date/time, and optional speaker info. The public registration page lives at crm.vantagecareer.co/public/events/your-slug.", tip: "Admin only: create/edit/delete" },
      { title: "In-Person vs. Zoom", desc: "In-Person events show venue name + address. Zoom events show 'Join link sent in confirmation email' on the public page — the actual link is only revealed after registration." },
      { title: "Speaker card", desc: "Add a speaker name, title, bio, and headshot URL to display a speaker card on the public event page. Great for Dan speaking at dinners or webinars." },
      { title: "Parent / Student toggle", desc: "The registration form has a Student / Parent toggle. Parents are tracked separately in the registrant list — open any event to see the Parents and Students tabs and a breakdown count." },
      { title: "Lead capture", desc: "Every new registrant is automatically added to the CRM as a lead (source: EVENT). If the email already exists, a note is logged on the existing lead instead. leadId links the registration to the lead for funnel tracking." },
      { title: "UTM capture", desc: "UTM parameters (utm_source, utm_medium, utm_campaign) are captured from the registration page URL and stored on both the EventRegistration and the Lead. Use tagged links to track which ad or email drove attendance." },
      { title: "Funnel analytics", desc: "Each event card shows a live funnel: Registered → Attended → Applied → Enrolled with conversion percentages. Open the event detail page for a full funnel panel with attendance %, apply rate, and enroll rate." },
      { title: "Post-create success screen", desc: "After saving a new event, you land on a 'Your event is live!' screen with the shareable registration link front and center. Click 'Show QR code for printing' to get a scannable QR code — perfect for placing at a dinner table so guests can register on the spot.", tip: "Print the QR at the event" },
      { title: "Bulk attendance marking", desc: "On the event detail page, the registrant table has a 'Mark all attended' button. Use it after the dinner is over to check everyone in at once. You can still toggle individuals on or off row-by-row." },
      { title: "Auto-enroll in sequence", desc: "The 'Auto-Enroll in Sequence' panel on the event detail page lets you pick any email sequence and enroll all attendees (or all registrants) in one click. Leads already in the sequence are skipped. This closes the loop from event → follow-up without manual work." },
      { title: "Reminder emails", desc: "From the event detail page, click Send on any of the three reminder cards: 7-Day Reminder, 24-Hour Reminder, or Post-Event Follow-Up. Reminders are also sent automatically by the daily cron (7d and 24h). Post-event emails go only to attendees." },
      { title: "Confirmation email + calendar", desc: "Every registrant gets an automatic confirmation email with event details and a .ics calendar file attached — works with Google Calendar, Apple Calendar, and Outlook." },
      { title: "Capacity", desc: "Set a max capacity to cap registrations. The form blocks new sign-ups when full." },
      { title: "View page / share", desc: "Click the external link icon on any event card to open the public registration page. Click the copy icon to copy the link directly to clipboard." },
      { title: "Activate / deactivate", desc: "Toggle an event inactive to hide it from the public page without deleting. Registrations already collected are preserved." },
    ],
  },
  {
    id: "referrals",
    icon: Share2,
    title: "Student Referrals",
    color: "text-orange-600 bg-orange-50",
    items: [
      { title: "How it works", desc: "Each student has a unique referral link (e.g. ?ref=ABCD1234). When someone applies using that link, the lead is tagged with the student's referral code and the referral is tracked here.", tip: "Admin only: view leaderboard" },
      { title: "Where students find their link", desc: "Students copy their link from LMS → Settings → Refer a Classmate. The code is generated automatically the first time they visit that page." },
      { title: "Referrals leaderboard", desc: "Go to Growth → Referrals to see a ranked table of all students who have referred applicants — plus how many have converted to enrolled. The Analytics → Growth tab shows referral conversion rate vs. other channels.", tip: "Admin only" },
      { title: "Seeing it on a lead", desc: "Open any lead and look for the 'Referred By' badge above the UTM section. The badge shows the student's referral code. Leads without a referral won't show the section." },
      { title: "Unknown student codes", desc: "If a code appears on a lead but has no student attached, it means the code was shared before that student's account was fully created, or the account was deleted. The referral is still recorded." },
    ],
  },
  {
    id: "promo-codes",
    icon: Tag,
    title: "Promo Codes",
    color: "text-teal-600 bg-teal-50",
    items: [
      { title: "What promo codes do", desc: "Codes let you track applicants from specific campaigns, partners, or events — and optionally attach a discount percentage. When a code is applied, it shows on the lead detail page in the CRM.", tip: "Admin only" },
      { title: "Create a code", desc: "Go to Admin → Promo Codes → New Code. Enter the code (auto-uppercased), an optional internal label, discount %, max uses, and expiry date. Most fields are optional — a code with no discount is useful for tracking only.", tip: "Admin only" },
      { title: "Share a code", desc: "Click the copy icon next to any code to get the pre-filled landing page URL (e.g. ?promo=EARLYBIRD). Share that link in an email, social post, or partner page — the code is captured automatically when someone applies.", tip: "Admin only" },
      { title: "Activate / deactivate", desc: "Toggle a code on or off at any time. Deactivated codes still show on leads that used them, but new intake submissions won't increment the usage count.", tip: "Admin only" },
      { title: "Usage tracking", desc: "The Uses column shows how many times a code has been used vs. its max (if set). When max is hit, the code is automatically treated as inactive — no further increments.", tip: "Admin only" },
      { title: "Seeing it on a lead", desc: "Open any lead and look for the Promo Code badge above the UTM section. Leads without a code won't show the section at all." },
    ],
  },
  {
    id: "outcomes",
    icon: Trophy,
    title: "Outcomes",
    color: "text-yellow-600 bg-yellow-50",
    items: [
      { title: "What it tracks", desc: "Outcomes captures post-enrollment results — where students landed their jobs, their salary, and which cohort they came from. It's your proof-of-concept dashboard and what feeds public success stats." },
      { title: "Viewing outcomes", desc: "Go to Admin → Outcomes to see a list of all enrolled students with their outcome status. Filter by cohort to compare results across program generations.", tip: "Admin only" },
      { title: "Outcome statuses", desc: "Students move through statuses: Enrolled → Job Searching → Employed. An Employed outcome records company, role, salary, and start date." },
      { title: "Editing an outcome", desc: "Click any row to open the outcome form. Update job info, salary, and company as students report back. Notes field is for anything that doesn't fit a structured field." },
    ],
  },
  {
    id: "issues",
    icon: AlertCircle,
    title: "Issues",
    color: "text-red-600 bg-red-50",
    items: [
      { title: "What issues are", desc: "Issues are internal flags or bugs raised by the CRM team — not student support tickets (those are in Support Tickets). Use Issues to track CRM data problems, process gaps, or integration failures.", tip: "Admin only" },
      { title: "Creating an issue", desc: "Go to Admin → Issues → New Issue. Set a title, priority, and optional assignee. Describe the problem and attach any relevant lead IDs or notes." },
      { title: "Issue lifecycle", desc: "Issues move from Open → In Progress → Resolved. Resolved issues are hidden from the default view but can be shown by toggling 'Show resolved'." },
      { title: "Assigning issues", desc: "Assign an issue to any Admin team member. Assigned issues show on the assignee's Home dashboard in the 'Your open issues' card." },
    ],
  },
  {
    id: "automation",
    icon: Bot,
    title: "Automation Rules",
    color: "text-purple-600 bg-purple-50",
    items: [
      { title: "What automation rules do", desc: "Automation rules are background jobs that trigger on CRM events (like a lead moving to Applied) or run on a daily cron. They remove the most repetitive manual tasks.", tip: "Admin only" },
      { title: "Accessing rules", desc: "Go to Admin → Automation. Rules are pre-built and listed with an on/off toggle — flip the toggle to pause any rule without losing its config. Changes take effect immediately." },
      { title: "Rule triggers", desc: "Stage-change rules fire the moment a lead is updated (e.g. 'Move to Enrolled → send welcome email'). Cron rules fire once daily at 8 AM UTC (e.g. 'Cold lead nudge → ping in Slack')." },
      { title: "Outbound webhooks", desc: "The Webhooks section lets you register any HTTPS endpoint to receive a POST payload when CRM events happen — new lead, stage change, enrollment. Use this to connect the CRM to Zapier, Make, or your own backend." },
      { title: "Webhook payload", desc: "Each webhook POST sends { event, timestamp, data } with the full lead or enrollment object in data. Verify the X-CRM-Secret header against your secret to confirm the source." },
    ],
  },
  {
    id: "partnerships-deals",
    icon: Briefcase,
    title: "Partnerships — Deals",
    color: "text-teal-700 bg-teal-50",
    items: [
      { title: "What Deals tracks", desc: "Deals are partnership opportunities — university relationships, corporate sponsors, co-marketing agreements. Each deal has a stage, value, and contact. It's a lightweight CRM within the CRM for B2B.", tip: "Admin only" },
      { title: "Deal stages", desc: "Stages mirror the lead pipeline: Prospect → Outreach → Proposal → Negotiation → Closed Won / Closed Lost. Move a deal by editing it and changing the stage." },
      { title: "Creating a deal", desc: "Go to Partnerships → Deals → New Deal. Set a title, partner company, deal value, expected close date, and link to a partnership contact." },
      { title: "Deal notes & activity", desc: "Add notes to a deal after every touchpoint — a call, email, or meeting. Notes timestamp automatically and form a running log." },
    ],
  },
  {
    id: "partnerships-contacts",
    icon: Building2,
    title: "Partnerships — Contacts",
    color: "text-teal-700 bg-teal-50",
    items: [
      { title: "What Partnership Contacts are", desc: "Partnership contacts are external people at universities, companies, or organizations — not students or leads. They're linked to Deals to track who you're working with at each partner org.", tip: "Admin only" },
      { title: "Creating a contact", desc: "Go to Partnerships → Contacts → New Contact. Add their name, title, org, email, phone, and LinkedIn URL. You can link them to any Deal from the contact detail page." },
      { title: "Linked deals", desc: "Each contact shows which deals they're tied to. Open a contact to see the full list and navigate directly to any linked deal." },
      { title: "Notes", desc: "Add contact-level notes for relationship context that doesn't belong on a specific deal — like their communication style or org role." },
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
      { title: "Event reminders", desc: "Runs at 2 PM UTC daily — finds events 7 days out (sends 7-day reminder) and events 24 hours out (sends 24-hour reminder). Each reminder is sent once and flagged so it doesn't duplicate. Requires CRON_SECRET env var on Vercel.", tip: "Vercel cron" },
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
        <p className="text-sm text-slate-500 mt-1">Everything you can do in the Vantage Career Accelerator CRM.</p>
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

      <p className="text-center text-xs text-slate-300 mt-10">Vantage Career Accelerator CRM · Built for your team</p>
    </div>
  );
}
