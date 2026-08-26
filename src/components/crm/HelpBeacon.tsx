"use client";

import { useState, useMemo } from "react";
import {
  HelpCircle, X, Search, ChevronDown, ChevronRight,
  LayoutDashboard, Kanban, GraduationCap, BookOpen,
  UserRound, MessageSquare, Calendar, Mail, CheckSquare,
  Zap, BarChart2, LifeBuoy, ExternalLink, Users,
  TrendingUp, Share2, Tag, Bug, Sparkles,
} from "lucide-react";

interface Article {
  title: string;
  body:  string;
}

interface Section {
  label:    string;
  icon:     React.ReactNode;
  articles: Article[];
}

const SECTIONS: Section[] = [
  {
    label: "Ask Claude",
    icon: <Sparkles size={14} />,
    articles: [
      {
        title: "What is Ask Claude?",
        body:  "An AI assistant wired directly into the CRM database — find it in the sidebar under CRM (admins only). Ask in plain English: \"Who hasn't submitted Module 1 pre-work?\", \"Summarize Rodrigo's application\", \"Which students look at risk?\" It reads real student records, applications, pre-work, and assignments before answering.",
      },
      {
        title: "Can it write notes for me?",
        body:  "Yes — say \"Add a note to Julia's record that…\" and choose where it goes: a lead activity (visible on the contact timeline) or a private coach note (only coaches see it in the LMS).",
      },
    ],
  },
  {
    label: "Email Playbook",
    icon: <Mail size={14} />,
    articles: [
      {
        title: "Where do I see and edit automated emails?",
        body:  "Automation → Email Playbook (admins only). Every automated student email lives there: application confirmation, LMS invite, pre-work reminder (Saturdays — pre-work is due Sunday night), session reminder, assignment reminder (Thursdays — assignments are due Friday night), re-engagement, plus the morning-of session brief, weekly digest, and coach digest.\n\nClick a card to edit subject and body — changes autosave and the live preview shows exactly what students receive. Use 'Email me a test' to check it in your own inbox first.",
      },
      {
        title: "How do I stop an email from sending?",
        body:  "Each template has its own ON/OFF toggle — OFF means it silently skips. Bigger picture: no student emails send at all until the cohort is Published. Publish is the master switch; the toggles are fine-grained control. One rule to remember: turn Student Invite ON before publishing a cohort, or login invites won't go out.",
      },
    ],
  },
  {
    label: "Home Dashboard",
    icon: <LayoutDashboard size={14} />,
    articles: [
      {
        title: "What does the Home dashboard show?",
        body:  "Home is your daily command center. At a glance you see four KPI cards (Active Leads, Overdue Tasks, Stale 14d+, Pipeline $), then Today's Focus tasks, Hot Leads in the pipeline, Needs Attention contacts (not touched in 14+ days), a Pipeline snapshot, Cohort Fill bars, and a Recent Activity feed.\n\nEvery widget is clickable — tap any card or section header to jump straight to that part of the CRM.",
      },
      {
        title: "What are the four KPI cards?",
        body:  "Active Leads — contacts currently in the pipeline (Lead, Contacted, Qualified, or Proposal stage). Click to go to Contacts.\n\nOverdue Tasks — tasks whose due date has passed. Highlighted red when > 0. Click to go to Tasks.\n\nStale (14d+) — contacts you haven't touched in 14 or more days. Click to go to Contacts.\n\nPipeline $ — total estimated deal value across all active pipeline stages. Click to go to Pipeline.",
      },
      {
        title: "What is Today's Focus?",
        body:  "A prioritized list of tasks that are overdue or due today, sorted so overdue items appear first with a red badge. Click the circle on the left to mark a task complete — it disappears instantly. Click the contact name to open their record.",
      },
      {
        title: "What is the Needs Attention section?",
        body:  "Contacts who have been in the pipeline but haven't had any activity logged in 14 or more days. The amber card is a prompt to reach back out. Click any row to open that contact's record and log a note or send an email.",
      },
      {
        title: "What is the LMS Activity section?",
        body:  "Three cards that pull live data from the Learning Management System:\n\n• Recent Activity — sections students have completed in the last 7 days.\n• At-Risk Students — enrolled students with no LMS activity in 7+ days. Click a row to find their CRM contact record.\n• Recent Surveys — module survey submissions with overall ratings.\n\nThis section only appears once students are enrolled in the LMS.",
      },
    ],
  },
  {
    label: "Pipeline",
    icon: <Kanban size={14} />,
    articles: [
      {
        title: "What is the Pipeline?",
        body:  "The Pipeline is your pre-enrollment sales board. Every new lead starts here and moves through stages: Lead → Waiting to Meet → Contacted → Qualified → Proposal. Once someone enrolls in the program they exit the pipeline and appear in the Students view instead.",
      },
      {
        title: "How do I move a lead?",
        body:  "Two ways: drag the card to a new column, or click the 'Move →' button on the card and pick a stage from the dropdown. Moves are saved instantly.",
      },
      {
        title: "What do the stages mean?",
        body:  "Lead — new contact, not yet reached out to.\nWaiting to Meet — requested a free consultation (usually from the website or a direct-mail postcard) and needs a call scheduled. These arrive automatically from the /postcard consultation form.\nContacted — you've sent a message or had a first call.\nQualified — confirmed interest and they meet the program criteria.\nProposal — offer or acceptance discussion is in progress.\n\nLost contacts can be shown by toggling 'Show Lost' at the top of the board.",
      },
      {
        title: "What is the score badge?",
        body:  "Each card shows a score (shown with a sparkle icon). It's automatically calculated from deal value, activity recency, profile completeness, and priority — gives you a quick sense of how engaged or high-value a lead is without opening the record.",
      },
    ],
  },
  {
    label: "Students",
    icon: <GraduationCap size={14} />,
    articles: [
      {
        title: "What is the Students view?",
        body:  "Students are active program participants — they've already enrolled. They live here instead of the Pipeline so the board stays clean and focused on prospects. You can view their full contact record, log activities, write coaching notes, and see their LMS survey responses from this view.",
      },
      {
        title: "How does the LMS sync work for students?",
        body:  "When a student completes a section, submits prework, attends a live session, submits an assignment, or fills out a survey in the LMS, it automatically appears in their CRM Activity Timeline. You don't need to log anything manually — the two systems talk to each other in real time.",
      },
      {
        title: "How do I open a student's LMS record?",
        body:  "Open the student's contact record in the CRM. If they're linked to an LMS account, you'll see a 'View in LMS' button near the top. Clicking it logs you into the LMS automatically — no separate login required.",
      },
      {
        title: "Why is a student not showing here?",
        body:  "A student will be missing if their Contact Type is not set to 'Student', or if their stage is set to 'Lost' (dropped from program). Check their contact record and update the Contact Type field.",
      },
    ],
  },
  {
    label: "Cohorts",
    icon: <BookOpen size={14} />,
    articles: [
      {
        title: "What is the Cohorts view?",
        body:  "Cohorts are your program intake groups — each cohort has a name, a capacity, a start date, and a list of enrolled students. The Cohorts page shows all active cohorts and their fill rate (how many seats are taken vs. total capacity).",
      },
      {
        title: "What does the Cohort Fill widget on Home show?",
        body:  "The Cohort Fill widget on the Home dashboard shows a progress bar for each active cohort. Green = below 70% full, amber = 70–89%, red = 90%+ (nearly full). It's a quick way to see which cohorts need more enrollment outreach. Click the widget or any bar to go to the Cohorts page.",
      },
      {
        title: "How do I close out a cohort?",
        body:  "When a cohort finishes the program, go to the Cohorts page and click 'Graduate / Archive' on that cohort. This marks the cohort inactive and removes it from the active fill view. No emails or certificates are sent automatically — graduation communications are handled separately.",
      },
    ],
  },
  {
    label: "Contacts",
    icon: <UserRound size={14} />,
    articles: [
      {
        title: "What is a Contact?",
        body:  "Every person in the CRM is a Contact — whether they're a new lead, an applicant, an active student, or a partner. The Contacts list shows everyone. Use the Pipeline and Students views for focused work.",
      },
      {
        title: "What is Contact Type?",
        body:  "Contact Type separates your contacts into groups:\n• Waitlist — expressed interest, not yet applied\n• Application — submitted an application\n• Consultation — requested a free consultation call (often a parent, via the website or direct mail)\n• Student — currently enrolled in the program\n• Partner — company, university, or referral partner\n\nThis field drives what view a contact appears in.\n\nWebsite forms also record who filled out the form — a Parent or the Student (shown as a chip on the lead record; parents get a 'Their Student' section with the student's contact info) — plus their home ZIP code with city/state appended automatically.",
      },
      {
        title: "How do I add a new contact?",
        body:  "Click '+ Add Lead' on the Pipeline page, or use the Contacts page and click 'New Contact'. Fill in name, email, and Contact Type at minimum — everything else can be added later.",
      },
      {
        title: "What is the Activity Timeline?",
        body:  "Every contact has a timeline of activities — calls, notes, emails, assignments, and survey responses. Activities from the LMS (section completions, prework, attendance, feedback) appear here automatically. You can also log notes and calls manually from the contact record.",
      },
      {
        title: "What are Surveys on a contact record?",
        body:  "If a contact is a student who completed module surveys in the LMS, those responses appear on their Surveys tab. You can see their overall rating, content rating, facilitator rating, biggest takeaways, and any suggestions they left — all without leaving the CRM.",
      },
    ],
  },
  {
    label: "Support",
    icon: <LifeBuoy size={14} />,
    articles: [
      {
        title: "What is the Support section?",
        body:  "Support shows inbound tickets submitted from the LMS student dashboard. When a student hits a problem and submits a support request, it appears here as a ticket with their name, subject, and message. You can reply directly from the CRM — the student receives your reply by email.",
      },
      {
        title: "How do I reply to a ticket?",
        body:  "Open the ticket, type your reply in the message box at the bottom, and click Send. The student gets an email notification. All messages are threaded so you can see the full conversation history in one place.",
      },
      {
        title: "Can students see internal notes?",
        body:  "No. Only CRM admin and coach users can see the support thread. Students only receive what you send as a reply — they cannot see internal messages or ticket metadata.",
      },
    ],
  },
  {
    label: "Coaching Sessions",
    icon: <MessageSquare size={14} />,
    articles: [
      {
        title: "How does the coaching workflow work?",
        body:  "After a 1-on-1 call: open the student's call sheet in the LMS admin (Prework → the module → the student), paste the Fathom transcript into the Session Transcript box, and click 'Draft write-up & private notes'. Claude reads the transcript plus their pre-work and drafts a student-facing write-up (which you review and Send to Student) and candid private notes only coaches see.\n\nCoaching notes added in the LMS admin panel also sync here automatically.",
      },
      {
        title: "Where do students book me?",
        body:  "Two lanes: coaching 1-on-1s (your main Calendly) and Office Hours (quick unsticks). Both URLs are set per coach in Settings → Profile → Booking Links. If a URL is empty, the LMS hides that booking lane. Your upcoming sessions show in the My 1-on-1s card on Home.",
      },
      {
        title: "Where do coaching notes appear?",
        body:  "They appear in the Activity Timeline on the student's contact record as a NOTE or MEETING activity. Notes written in the LMS sync here with a '[LMS coaching note]' prefix.",
      },
    ],
  },
  {
    label: "Morning Digest",
    icon: <Calendar size={14} />,
    articles: [
      {
        title: "What is the Morning Digest?",
        body:  "An automated email sent every morning before 1-on-1 sessions. It lists every student with a call scheduled that day, their complete prework answers, and any recent coaching notes — everything needed to prep without opening multiple tabs.",
      },
      {
        title: "How do I make sure I receive it?",
        body:  "The digest goes to the email set in the ADMIN_NOTIFICATION_EMAIL environment variable (currently dan@10ximpact.co). It only fires on days when 1-on-1 sessions are booked in the LMS.",
      },
    ],
  },
  {
    label: "Tasks",
    icon: <CheckSquare size={14} />,
    articles: [
      {
        title: "What are Tasks?",
        body:  "Tasks are personal to-dos tied to the CRM. Create a task with a due date, link it to a contact, and it shows up in Today's Focus on the Home dashboard when it's coming due. Overdue tasks are highlighted in red so nothing slips.",
      },
      {
        title: "How do I complete a task from Home?",
        body:  "In the Today's Focus card on the Home dashboard, click the circle on the left side of any task. It marks it complete and removes it from the list instantly — no page reload needed.",
      },
    ],
  },
  {
    label: "Sequences",
    icon: <Mail size={14} />,
    articles: [
      {
        title: "What are Sequences?",
        body:  "Sequences are automated multi-step email campaigns. Build a sequence of emails with delays between them (e.g., Day 1 → Day 3 → Day 7), enroll contacts into the sequence, and the emails go out automatically on schedule.",
      },
      {
        title: "How do I enroll a contact?",
        body:  "Open the contact record, find the Sequences section, and click 'Enroll'. Pick the sequence and the start date. The contact will receive each email in order unless they reply (which pauses the sequence).",
      },
    ],
  },
  {
    label: "Email Blast",
    icon: <Zap size={14} />,
    articles: [
      {
        title: "What is Email Blast?",
        body:  "Email Blast lets you send a one-time email to a filtered group of contacts — for example, all waitlist contacts, or everyone tagged with a specific cohort. Unlike Sequences, blasts go out immediately to everyone in the selected group.",
      },
      {
        title: "How is a Blast different from a Sequence?",
        body:  "A Blast is a one-time send to many people at once — like a cohort announcement or an event invite. A Sequence is an automated drip to individual contacts over time. Use Blast for broadcasts, Sequence for nurture campaigns.",
      },
    ],
  },
  {
    label: "Growth — Events",
    icon: <Calendar size={14} />,
    articles: [
      {
        title: "What is the Events dashboard?",
        body:  "Growth → Events is your event command center. It shows four KPI cards at the top (Total Registered, Attendance Rate, Applied, Enrolled), a Next Up hero card for your nearest upcoming event with a countdown, a registration funnel showing conversion rates across all events, and a past-events log below.\n\nUse the event filter dropdown to narrow every KPI and the funnel down to just one event — great for post-event analysis.",
      },
      {
        title: "How do I create a new event?",
        body:  "Click 'New event' at the top of the Events dashboard. Choose In-Person or Zoom, fill in the title, slug (used in the public URL), date/time, and optionally add speaker info. Admin-only action.\n\nThe public registration page lives at: crm.vantagecareer.co/public/events/your-slug",
      },
      {
        title: "What's the difference between In-Person and Zoom events?",
        body:  "In-Person — shows the venue name and address on the public registration page.\n\nZoom — shows 'Join link sent in confirmation email' publicly. The actual meeting URL is only revealed in the confirmation email after someone registers — keeps the link private until sign-up.",
      },
      {
        title: "What happens when someone registers?",
        body:  "Three things happen automatically:\n1. They receive a confirmation email with event details and a .ics calendar file (works with Google Calendar, Apple Calendar, Outlook).\n2. A CRM lead is created (source: EVENT). If their email already exists, a note is added to the existing lead instead — no duplicates.\n3. UTM parameters from the registration URL (utm_source, utm_medium, utm_campaign) are captured on both the registration and the lead record.",
      },
      {
        title: "How do I track who attended?",
        body:  "Open the event detail page. In the registrants table, toggle the checkbox on each row to mark attendance. Or click 'Mark all attended' to check in everyone at once — perfect right after a dinner ends. You can still toggle individuals on/off row by row afterward.",
      },
      {
        title: "How do reminders work?",
        body:  "Three reminder types are available from the event detail page:\n• 7-Day Reminder — sent automatically by the daily cron 7 days before the event, or manually via the Send button.\n• 24-Hour Reminder — same, fires 24 hours out.\n• Post-Event Follow-Up — sent to attendees only (not no-shows) after the event.\n\nEach reminder is flagged once sent so the cron won't duplicate it.",
      },
      {
        title: "What is Auto-Enroll in Sequence?",
        body:  "On the event detail page, the 'Auto-Enroll in Sequence' panel lets you pick any email sequence and enroll all attendees (or all registrants) in one click. Leads already in that sequence are skipped automatically. This closes the loop from event → follow-up drip without any manual work.",
      },
      {
        title: "How do I share the event registration link?",
        body:  "Two ways:\n1. After creating an event you land on a 'Your event is live!' success screen — the link is front and center. Click 'Show QR code for printing' to get a scannable QR — great for placing at a dinner table.\n2. From the Events dashboard, click the copy icon next to any event card to copy the link directly to clipboard.",
      },
      {
        title: "What does the event detail analytics tab show?",
        body:  "Four KPI cards at the top show: Attendance Rate, Apply Rate, Enroll Rate, and Overall Conversion — each with a comparison arrow vs. your average across all other events.\n\nBelow that: a visual funnel with step conversion rates, a day-by-day registration timeline chart, traffic source breakdown (by UTM source), audience split (Students vs. Parents), and a benchmark table comparing this event to your historical average.",
      },
    ],
  },
  {
    label: "Growth — Referrals",
    icon: <Share2 size={14} />,
    articles: [
      {
        title: "How does the referral system work?",
        body:  "Every enrolled student gets a unique referral code (e.g. ?ref=ABCD1234). When someone applies using that link, the lead is tagged with the student's code and tracked in the Referrals section. Students copy their link from LMS → Settings → Refer a Classmate.\n\nReferrals are one of the highest-converting lead sources — the system tracks them end-to-end from application through enrollment.",
      },
      {
        title: "Where do I see referral performance?",
        body:  "Growth → Referrals shows a leaderboard of all students who have referred applicants, ranked by referral count with their enrollment conversion rate. Admin-only view.\n\nThe Analytics → Growth tab compares referral conversion rate vs. events, promo codes, and direct traffic side-by-side.",
      },
      {
        title: "How do I see which lead came from a referral?",
        body:  "Open any lead record. If the lead was referred, you'll see a 'Referred By' badge above the UTM section showing the student's referral code. Leads without a referral won't show this section.",
      },
      {
        title: "What if a code doesn't match any student?",
        body:  "If a code appears on a lead but no student is attached, it usually means the code was shared before the student's account was fully created, or the account was later deleted. The referral is still recorded — you'll see the code but no linked student name.",
      },
    ],
  },
  {
    label: "Growth — Promo Codes",
    icon: <Tag size={14} />,
    articles: [
      {
        title: "What are Promo Codes?",
        body:  "Promo codes let you track applicants from specific campaigns, partners, or events — and optionally attach a discount percentage. When a code is applied during intake, it appears on the lead record in the CRM. Admin-only feature.",
      },
      {
        title: "How do I create a code?",
        body:  "Go to Growth → Promo Codes → New Code. Enter the code (auto-uppercased), an optional internal label, discount %, max uses, and expiry date. Most fields are optional — a code with no discount is useful purely for tracking campaign attribution.",
      },
      {
        title: "How do I share a promo code?",
        body:  "On the Promo Codes list, click 'Copy link' next to any code. This copies the landing page URL with the code pre-applied (e.g. ?promo=EARLYBIRD). Share that link in an email, social post, or partner page — the code is captured automatically when someone submits the intake form.",
      },
      {
        title: "How do I turn a code on or off?",
        body:  "Click the 'Active / Inactive' toggle button on any code row. Deactivated codes still show on leads that already used them, but new intake submissions won't increment the usage count or apply the discount.",
      },
      {
        title: "How do I see how many times a code was used?",
        body:  "The Uses column shows current uses vs. max uses (if set). When the max is hit, the code is automatically treated as inactive — no new submissions will count. You can raise the max or remove the cap by editing the code.",
      },
      {
        title: "Where does the code appear on a lead?",
        body:  "Open any lead record and look for the Promo Code badge above the UTM section. Leads without a code won't show this section at all.",
      },
    ],
  },
  {
    label: "Growth — Analytics",
    icon: <TrendingUp size={14} />,
    articles: [
      {
        title: "What is the Growth analytics tab?",
        body:  "Analytics → Growth (or click 'Analytics' from the Events dashboard) compares all acquisition channels side by side: Events, Referrals, Promo Codes, and Website/Direct.\n\nEach channel card shows total leads generated, apply rate, and enroll rate. Sub-tabs break down individual event performance, referral leaderboard, and promo code conversion — the same view you'd find in a VP-level marketing dashboard.",
      },
      {
        title: "How do I get to the Growth tab quickly?",
        body:  "Click 'Analytics' on the Events dashboard — it deep-links directly to the Growth tab, not the generic pipeline view. Or go to Analytics in the sidebar and click the 'Growth' tab yourself.",
      },
    ],
  },
  {
    label: "CRM Issues",
    icon: <Bug size={14} />,
    articles: [
      {
        title: "What is CRM Issues?",
        body:  "CRM Issues is the internal issue tracker for the 10x team (Caleb, Dan, and David). It's completely separate from student support tickets — this is where you log bugs, data problems, ops tasks, and feature ideas about the CRM itself.\n\nAccess it from 'Issues' in the left sidebar.",
      },
      {
        title: "What are the issue types?",
        body:  "• 🐛 Bug — something in the CRM is broken or behaving unexpectedly.\n• 🗄️ Data Issue — wrong, missing, or corrupted data in the database.\n• ⚙️ Ops — an operational task (import, export, cleanup, setup work).\n• ✨ Feature — a new capability you want to add to the CRM.\n• ❓ Other — anything that doesn't fit the above categories.",
      },
      {
        title: "What are priority levels?",
        body:  "• Low — nice to have, no urgency.\n• Normal — should get done this sprint.\n• High — blocking someone or creating extra work.\n• Urgent — broken in production and needs fixing today.\n\nUrgent issues appear as a red badge on the Issues page header so the team sees them immediately.",
      },
      {
        title: "How do I create an issue?",
        body:  "Click 'New issue' in the top right of the Issues page (or the '+' button at the bottom of the Backlog column). Fill in a title and optionally a description, type, priority, assignee, and tags. You can also paste a lead's ID to link the issue to their CRM record.\n\nNew issues always land in Backlog first.",
      },
      {
        title: "How do I move an issue through the board?",
        body:  "Click the 'Move →' button on any issue card and select the new status from the dropdown: Backlog → To Do → In Progress → Done.\n\nMoves are saved instantly — no save button needed.",
      },
      {
        title: "How do I filter issues?",
        body:  "Use the three filter dropdowns at the top of the board: Type, Priority, and Assignee. Filters can be combined — for example, show only High-priority Bugs assigned to you. Click 'Clear filters' to reset.",
      },
      {
        title: "Can I link an issue to a student or lead?",
        body:  "Yes. In the 'New Issue' or 'Edit Issue' form, paste the lead's CRM ID in the 'Linked Lead ID' field (grab it from the URL when you have the lead's record open — it looks like 'clm...'). A link icon will appear on the card and clicking it jumps directly to that lead.",
      },
    ],
  },
  {
    label: "LMS Integration",
    icon: <ExternalLink size={14} />,
    articles: [
      {
        title: "How do the CRM and LMS talk to each other?",
        body:  "The CRM and LMS share the same database. When students do things in the LMS — complete a section, submit prework, attend a live session, submit an assignment, or fill out a survey — those events are written to their CRM contact timeline automatically. No manual entry needed.",
      },
      {
        title: "How do I open the LMS from here?",
        body:  "Click 'Open LMS' at the bottom of the left sidebar. This logs you into the LMS automatically with your CRM credentials — no separate login required. The link opens in a new tab so you keep your CRM session open.",
      },
      {
        title: "How do I jump from a contact to their LMS record?",
        body:  "Open the contact's record in the CRM. If they have an LMS account linked, you'll see a 'View in LMS' button near the top of their profile. Clicking it opens their LMS student record in a new tab — again, no separate login needed.",
      },
      {
        title: "What LMS events appear in the CRM timeline?",
        body:  "• ✅ Section completions (module and section name)\n• 📋 Prework submissions\n• 🎯 Live session attendance\n• 📝 Assignment submissions\n• 💬 Coach feedback received on assignments\n• 📊 Survey submissions (with overall rating)\n\nAll of these appear as NOTE activities on the contact's timeline, timestamped when they happened.",
      },
    ],
  },
  {
    label: "Analytics",
    icon: <BarChart2 size={14} />,
    articles: [
      {
        title: "What does Analytics show?",
        body:  "Analytics gives you a summary of pipeline activity — new leads added, stage conversions, emails sent, and activity volume. Use it to spot where leads are getting stuck and which outreach efforts are working. Admin-only view.",
      },
    ],
  },
  {
    label: "Team",
    icon: <Users size={14} />,
    articles: [
      {
        title: "What is the Team view?",
        body:  "Team shows all CRM users (admins and coaches) and their access level. From here you can invite new team members, update roles, or remove access. Admin-only view — team members with a Coach role cannot see or change this page.",
      },
      {
        title: "What's the difference between Admin and Coach?",
        body:  "Admin — full access to everything: contacts, pipeline, sequences, email blast, analytics, team management, issues, and automation.\n\nCoach — can view contacts, log coaching notes, work tasks, reply to support tickets, and access the LMS. Cannot manage team members, send blasts, or view admin-only sections.",
      },
    ],
  },
];

export default function HelpBeacon() {
  const [open,           setOpen]           = useState(false);
  const [search,         setSearch]         = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>("Pipeline");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map(section => ({
        ...section,
        articles: section.articles.filter(
          a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
        ),
      }))
      .filter(s => s.articles.length > 0);
  }, [search]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 w-11 h-11 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105"
        title="Help"
      >
        <HelpCircle size={20} />
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative w-[380px] h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-600 to-teal-700">
              <div className="flex items-center gap-2.5">
                <HelpCircle size={16} className="text-white/80" />
                <h2 className="text-sm font-bold text-white">Help & Navigation</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              >
                <X size={15} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setExpandedSection(null); }}
                  placeholder="Search help articles…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                  <Search size={28} className="mb-2 opacity-30" />
                  <p className="text-sm">No results for "{search}"</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map(section => (
                    <div key={section.label}>
                      {/* Section header */}
                      <button
                        onClick={() => setExpandedSection(
                          expandedSection === section.label ? null : section.label
                        )}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition text-left"
                      >
                        <span className="text-teal-600">{section.icon}</span>
                        <span className="flex-1 text-sm font-semibold text-slate-700">{section.label}</span>
                        <span className="text-xs text-slate-400 mr-1">{section.articles.length}</span>
                        {expandedSection === section.label
                          ? <ChevronDown size={14} className="text-slate-400" />
                          : <ChevronRight size={14} className="text-slate-400" />
                        }
                      </button>

                      {/* Articles */}
                      {(expandedSection === section.label || search.trim()) && (
                        <div className="bg-slate-50 border-t border-slate-100">
                          {section.articles.map(article => (
                            <div key={article.title} className="border-b border-slate-100 last:border-0">
                              <button
                                onClick={() => setExpandedArticle(
                                  expandedArticle === article.title ? null : article.title
                                )}
                                className="w-full flex items-center gap-2.5 px-5 py-2.5 hover:bg-slate-100 transition text-left"
                              >
                                {expandedArticle === article.title
                                  ? <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
                                  : <ChevronRight size={12} className="text-slate-400 flex-shrink-0" />
                                }
                                <span className="text-xs font-medium text-slate-600">{article.title}</span>
                              </button>

                              {expandedArticle === article.title && (
                                <div className="px-5 pb-4 pt-1">
                                  <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                                    {article.body}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-[11px] text-slate-400 text-center">
                Vantage Career Accelerator CRM · Built by Brynvor
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
