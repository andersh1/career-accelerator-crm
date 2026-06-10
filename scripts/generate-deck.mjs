import PptxGenJS from "pptxgenjs";

const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches (16:9)

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  navy:       "0F172A",
  blue:       "2563EB",
  blueLt:     "60A5FA",
  blueXlt:    "DBEAFE",
  purple:     "7C3AED",
  purpleLt:   "A78BFA",
  purpleXlt:  "EDE9FE",
  green:      "059669",
  greenLt:    "34D399",
  greenXlt:   "D1FAE5",
  amber:      "D97706",
  amberLt:    "FCD34D",
  amberXlt:   "FEF3C7",
  slate:      "64748B",
  slateLt:    "94A3B8",
  white:      "FFFFFF",
  offWhite:   "F8FAFC",
  cardBg:     "1E293B",
  cardBorder: "334155",
};

const FONT = "Calibri";

// ── Shared helpers ─────────────────────────────────────────────────────────
function bg(slide, color = C.navy) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: "100%", h: "100%",
    fill: { color },
    line: { color, width: 0 },
  });
}

function eyebrow(slide, text, y = 0.45) {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y, w: 12, h: 0.3,
    fontFace: FONT, fontSize: 9, bold: true,
    color: C.slateLt, charSpacing: 3,
  });
}

function heading(slide, lines, y = 0.9, size = 36, color = C.white) {
  slide.addText(lines, {
    x: 0.6, y, w: 12, h: 1.6,
    fontFace: FONT, fontSize: size, bold: true,
    color, lineSpacingMultiple: 1.1,
  });
}

function subtext(slide, text, y = 2.0, w = 9) {
  slide.addText(text, {
    x: 0.6, y, w, h: 0.8,
    fontFace: FONT, fontSize: 13,
    color: C.slateLt, lineSpacingMultiple: 1.4,
  });
}

function sectionLabel(slide, text, y = 0.3) {
  slide.addText(`— ${text} —`, {
    x: 0.6, y, w: 12, h: 0.28,
    fontFace: FONT, fontSize: 9, bold: true,
    color: C.slate, charSpacing: 3,
    align: "left",
  });
}

function card(slide, x, y, w, h, fillColor = C.cardBg, borderColor = C.cardBorder) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.12,
    fill: { color: fillColor },
    line: { color: borderColor, width: 1 },
  });
}

function bullet(slide, items, x, y, w, color = C.slateLt, iconColor = C.greenLt) {
  const rows = items.map(item => ([
    { text: "✓  ", options: { color: iconColor, bold: true } },
    { text: item,  options: { color } },
  ]));
  // Flatten to array of paragraph objects
  const paras = items.map(item => ({
    text: `✓  ${item}`,
    options: { bullet: false, color, indentLevel: 0 },
  }));
  slide.addText(paras, {
    x, y, w, h: items.length * 0.33,
    fontFace: FONT, fontSize: 11.5,
    lineSpacingMultiple: 1.5,
    color,
  });
}

function badge(slide, label, x, y, bgColor, textColor) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w: label.length * 0.085 + 0.3, h: 0.28,
    rectRadius: 0.14,
    fill: { color: bgColor },
    line: { color: bgColor, width: 0 },
  });
  slide.addText(label, {
    x, y, w: label.length * 0.085 + 0.3, h: 0.28,
    fontFace: FONT, fontSize: 9, bold: true,
    color: textColor, align: "center",
  });
}

function statBox(slide, num, label, x, y, numColor = C.blueLt) {
  slide.addText(num, {
    x, y, w: 1.8, h: 0.7,
    fontFace: FONT, fontSize: 36, bold: true,
    color: numColor, align: "center",
  });
  slide.addText(label.toUpperCase(), {
    x, y: y + 0.65, w: 1.8, h: 0.25,
    fontFace: FONT, fontSize: 8, bold: true,
    color: C.slate, align: "center", charSpacing: 2,
  });
}

function divider(slide, y) {
  slide.addShape(pptx.ShapeType.line, {
    x: 0.6, y, w: 12.1, h: 0,
    line: { color: C.cardBorder, width: 0.5 },
  });
}

function featureCard(slide, x, y, w, h, emoji, title, desc, accentColor = C.blueLt) {
  card(slide, x, y, w, h);
  slide.addText(emoji, {
    x: x + 0.2, y: y + 0.18, w: 0.5, h: 0.4,
    fontFace: FONT, fontSize: 20,
  });
  slide.addText(title, {
    x: x + 0.2, y: y + 0.58, w: w - 0.4, h: 0.3,
    fontFace: FONT, fontSize: 12, bold: true, color: accentColor,
  });
  slide.addText(desc, {
    x: x + 0.2, y: y + 0.88, w: w - 0.4, h: h - 1.05,
    fontFace: FONT, fontSize: 10,
    color: C.slateLt, lineSpacingMultiple: 1.35, wrap: true,
  });
}

function progressBar(slide, x, y, w, pct, label, valLabel, fillColor = C.blueLt) {
  slide.addText(label, {
    x, y, w: w - 1, h: 0.22,
    fontFace: FONT, fontSize: 10, color: C.slateLt,
  });
  slide.addText(valLabel, {
    x: x + w - 1, y, w: 0.9, h: 0.22,
    fontFace: FONT, fontSize: 10, bold: true, color: fillColor, align: "right",
  });
  // Track
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y: y + 0.24, w, h: 0.1,
    rectRadius: 0.05,
    fill: { color: "1E293B" },
    line: { color: "334155", width: 0.5 },
  });
  // Fill
  if (pct > 0) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y: y + 0.24, w: w * (pct / 100), h: 0.1,
      rectRadius: 0.05,
      fill: { color: fillColor },
      line: { color: fillColor, width: 0 },
    });
  }
}

function credBox(slide, x, y, rows) {
  const h = rows.length * 0.42 + 0.2;
  card(slide, x, y, 5.8, h, "1A2744", "334155");
  rows.forEach((row, i) => {
    slide.addText(row.label.toUpperCase(), {
      x: x + 0.25, y: y + 0.12 + i * 0.42, w: 1.4, h: 0.3,
      fontFace: FONT, fontSize: 9, bold: true,
      color: C.slate, charSpacing: 1,
    });
    slide.addText(row.value, {
      x: x + 1.75, y: y + 0.12 + i * 0.42, w: 3.8, h: 0.3,
      fontFace: FONT, fontSize: 11, bold: true, color: C.blueLt,
      fontFamily: "Courier New",
    });
    if (i < rows.length - 1) {
      slide.addShape(pptx.ShapeType.line, {
        x: x + 0.2, y: y + 0.46 + i * 0.42, w: 5.4, h: 0,
        line: { color: "334155", width: 0.5 },
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 1 — COVER
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, C.navy);
  // Accent glow circle (simulated with a transparent blue ellipse)
  s.addShape(pptx.ShapeType.ellipse, {
    x: 9.5, y: -1.5, w: 5, h: 5,
    fill: { color: "1D4ED8", transparency: 80 },
    line: { color: "1D4ED8", transparency: 80, width: 0 },
  });

  eyebrow(s, "Executive Presentation  ·  Confidential", 0.35);

  s.addText("Career Accelerator", {
    x: 0.6, y: 0.7, w: 12, h: 0.85,
    fontFace: FONT, fontSize: 44, bold: true, color: C.white,
  });
  s.addText("Platform Overview", {
    x: 0.6, y: 1.5, w: 12, h: 0.85,
    fontFace: FONT, fontSize: 44, bold: true, color: C.blueLt,
  });

  subtext(s,
    "A fully integrated Learning Management System and Customer Relationship Manager\nbuilt in-house — purpose-built for coaching programs scaling to enterprise.",
    2.5, 10);

  // Stat boxes
  const stats = [
    { num: "3",   label: "Portals",     color: C.blueLt   },
    { num: "6",   label: "Dev Phases",  color: C.greenLt  },
    { num: "40+", label: "Features",    color: C.purpleLt },
    { num: "∞",   label: "Scalability", color: C.amberLt  },
  ];
  stats.forEach((st, i) => statBox(s, st.num, st.label, 0.6 + i * 2, 3.55, st.color));

  // Badges
  const badges = [
    { label: "LMS · Students",       bg: "1E3A5F", fg: C.blueLt   },
    { label: "LMS · Admins",         bg: "14352A", fg: C.greenLt  },
    { label: "CRM · Pipeline",       bg: "2D1B69", fg: C.purpleLt },
    { label: "Analytics · Forecast", bg: "3B2800", fg: C.amberLt  },
  ];
  let bx = 0.6;
  badges.forEach(b => {
    const w = b.label.length * 0.085 + 0.35;
    badge(s, b.label, bx, 5.0, b.bg, b.fg);
    bx += w + 0.18;
  });

  // Footer line
  divider(s, 6.8);
  s.addText("career-accelerator-crm.vercel.app", {
    x: 0.6, y: 6.9, w: 12, h: 0.28,
    fontFace: FONT, fontSize: 9, color: C.slate, align: "right",
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 2 — PLATFORM OVERVIEW
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "0F1729");
  sectionLabel(s, "Platform Overview");
  s.addText("One platform.", {
    x: 0.6, y: 0.5, w: 12, h: 0.7,
    fontFace: FONT, fontSize: 36, bold: true, color: C.white,
  });
  s.addText("Three powerful portals.", {
    x: 0.6, y: 1.15, w: 12, h: 0.7,
    fontFace: FONT, fontSize: 36, bold: true, color: C.blueLt,
  });
  subtext(s,
    "Every part of the student lifecycle — from first inquiry to program completion — lives in one system.",
    2.0, 11);

  // 3 portal cards
  const portals = [
    { emoji: "🎓", title: "Student LMS",  color: C.blueLt,   bg: "0E1E3A",
      desc: "Personalized curriculum portal. Students access modules, submit pre-work, track progress, and earn completion certificates.",
      tags: ["Module Progress", "Submissions", "Certificates"] },
    { emoji: "🛠️", title: "Admin LMS",    color: C.greenLt,  bg: "0A2010",
      desc: "Coaches manage cohorts, review submissions, post attendance, grant certificates, and monitor every student's progress in real time.",
      tags: ["Cohort Mgmt", "Grading", "Attendance"] },
    { emoji: "📊", title: "CRM",          color: C.purpleLt, bg: "1A0E2E",
      desc: "Full sales pipeline — lead intake to enrollment. Kanban board, lead scoring, email sequences, Slack alerts, and revenue forecasting.",
      tags: ["Pipeline", "Sequences", "Analytics"] },
  ];
  portals.forEach((p, i) => {
    const x = 0.5 + i * 4.3;
    featureCard(s, x, 2.8, 4.0, 2.9, p.emoji, p.title, p.desc, p.color);
  });

  // Flow row
  card(s, 0.5, 5.85, 12.3, 0.95, "1A2744", "2D4A7A");
  const flow = ["Interest Form →", "CRM Pipeline →", "Proposal Sent →", "Enrolled → LMS"];
  const flowColors = [C.blueLt, C.purpleLt, C.amberLt, C.greenLt];
  flow.forEach((f, i) => {
    s.addText(f, {
      x: 0.9 + i * 3.05, y: 6.05, w: 2.8, h: 0.5,
      fontFace: FONT, fontSize: 12, bold: true,
      color: flowColors[i], align: "center",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 3 — ACCESS & LOGIN
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "0F1729");
  sectionLabel(s, "Access & Security");
  s.addText("Secure, role-based authentication.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 34, bold: true, color: C.white,
  });
  subtext(s,
    "All portals protected by NextAuth.js with bcrypt-hashed credentials and role-gated routes.",
    1.5, 8);

  // URL box
  card(s, 0.5, 2.1, 7.5, 0.5, "1A2744", "2D4A7A");
  s.addText("🌐  Login URL:", {
    x: 0.75, y: 2.2, w: 2, h: 0.3,
    fontFace: FONT, fontSize: 10, bold: true, color: C.slate,
  });
  s.addText("career-accelerator-crm.vercel.app/login", {
    x: 2.9, y: 2.2, w: 5, h: 0.3,
    fontFace: FONT, fontSize: 11, bold: true, color: C.blueLt,
    fontFamily: "Courier New",
  });

  // Admin creds
  s.addText("ADMIN / CRM ACCESS", {
    x: 0.6, y: 2.85, w: 6, h: 0.28,
    fontFace: FONT, fontSize: 9, bold: true, color: C.slate, charSpacing: 2,
  });
  credBox(s, 0.5, 3.15, [
    { label: "Email",    value: "admin@careeraccelerator.com" },
    { label: "Password", value: "Admin1234!" },
    { label: "Role",     value: "ADMIN — Full access (CRM + LMS)" },
  ]);

  // Student creds
  s.addText("STUDENT PORTAL ACCESS", {
    x: 0.6, y: 4.65, w: 6, h: 0.28,
    fontFace: FONT, fontSize: 9, bold: true, color: C.slate, charSpacing: 2,
  });
  credBox(s, 0.5, 4.95, [
    { label: "Email",    value: "student@careeraccelerator.com" },
    { label: "Password", value: "Student1234!" },
    { label: "Role",     value: "STUDENT — LMS portal only" },
  ]);

  // Security list (right column)
  s.addText("SECURITY ARCHITECTURE", {
    x: 8.0, y: 2.1, w: 5, h: 0.28,
    fontFace: FONT, fontSize: 9, bold: true, color: C.slate, charSpacing: 2,
  });
  const secItems = [
    "🔐  bcrypt password hashing (cost factor 12)",
    "👤  Role-gated routes — ADMIN vs STUDENT isolation",
    "🔑  JWT sessions via NextAuth.js (server-validated)",
    "🛡️  API-level auth checks on every CRM endpoint",
    "🔒  Optional TOTP two-factor authentication per account",
    "🚫  No plain-text credentials stored anywhere",
  ];
  secItems.forEach((item, i) => {
    card(s, 7.9, 2.5 + i * 0.68, 5.0, 0.58, "1A2744", "2D4A7A");
    s.addText(item, {
      x: 8.1, y: 2.6 + i * 0.68, w: 4.7, h: 0.38,
      fontFace: FONT, fontSize: 10.5, color: C.slateLt,
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 4 — STUDENT LMS
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "0C1A2E");
  sectionLabel(s, "Student Experience");
  s.addText("A student portal that drives completion.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });
  subtext(s,
    "Students get a focused environment to move through the curriculum, submit work, and track their own momentum.",
    1.5, 11);

  // Feature grid (2 rows × 4 cols)
  const features = [
    { emoji: "📚", title: "Structured Curriculum",  desc: "8-module program with sections, pre-work, and live session components. Sequential unlock." },
    { emoji: "✅", title: "Progress Tracking",       desc: "Real-time completion % per module and overall. Visual progress rings and section checkmarks." },
    { emoji: "📝", title: "Pre-Work Submissions",    desc: "Submit assignments per module. Status: Pending → Reviewed → Approved / Needs Revision." },
    { emoji: "🎯", title: "Attendance Tracking",     desc: "Live session attendance recorded per module — visible to student and coach." },
    { emoji: "🏆", title: "Completion Certificate",  desc: "Auto-generated certificate issued by admin on completion. Shareable credential." },
    { emoji: "🔗", title: "Notion Integration",      desc: "Connect Notion workspace for note-taking and pre-work directly from the portal." },
    { emoji: "📩", title: "Public Apply Form",        desc: "/apply page — instant lead capture from your website. Auto-creates CRM lead + enriches company." },
    { emoji: "🔐", title: "Secure Onboarding",       desc: "CRM lead enrolled → student account auto-provisioned with login access immediately." },
  ];
  features.forEach((f, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    featureCard(s, 0.5 + col * 3.27, 2.2 + row * 2.3, 3.1, 2.12, f.emoji, f.title, f.desc, C.blueLt);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 5 — ADMIN LMS
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "0A1A0A");
  sectionLabel(s, "Admin LMS");
  s.addText("Full coach control, zero blind spots.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });
  subtext(s,
    "Admins have a complete operational view — every student, every cohort, every submission — from a single dashboard.",
    1.5, 11);

  // Left column
  s.addText("Cohort Management", { x: 0.6, y: 2.35, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.greenLt });
  const cohortItems = [
    "Create and manage multiple cohorts with capacity limits",
    "Activate / deactivate cohorts as programs open and close",
    "Real-time fill-rate tracking — know how close you are to capacity",
    "Cohort-level analytics: enrollment counts and completion rates",
  ];
  bullet(s, cohortItems, 0.6, 2.75, 6.0, C.slateLt, C.greenLt);

  s.addText("Submission Review", { x: 0.6, y: 4.25, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.greenLt });
  const subItems = [
    "View all student pre-work submissions per module",
    "Status workflow: Pending → Reviewed → Approved / Needs Revision",
    "Inline coaching notes per submission",
  ];
  bullet(s, subItems, 0.6, 4.65, 6.0, C.slateLt, C.greenLt);

  // Right column
  s.addText("Student Progress Panel", { x: 7.0, y: 2.35, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.greenLt });
  const progItems = [
    "Per-student view linked from the CRM lead profile",
    "Overall completion % with visual progress ring",
    "Module-by-module breakdown with attended / submitted status",
    "Last active timestamp — identify at-risk students instantly",
  ];
  bullet(s, progItems, 7.0, 2.75, 5.8, C.slateLt, C.greenLt);

  s.addText("Certification & Access", { x: 7.0, y: 4.25, w: 6, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: C.greenLt });
  const certItems = [
    "Issue completion certificates with one click",
    "Certificate date recorded on student record",
    "CRM → LMS enrollment bridge: convert lead to active student",
  ];
  bullet(s, certItems, 7.0, 4.65, 5.8, C.slateLt, C.greenLt);

  // Cohort fill bars
  card(s, 0.5, 5.9, 12.3, 1.35, "0D2010", "1A4020");
  s.addText("COHORT FILL RATES", {
    x: 0.75, y: 6.0, w: 4, h: 0.25,
    fontFace: FONT, fontSize: 8, bold: true, color: C.slate, charSpacing: 2,
  });
  progressBar(s, 0.7, 6.3, 3.5, 82, "Cohort 7 (Active)",  "82%", C.amberLt);
  progressBar(s, 4.6, 6.3, 3.5, 35, "Cohort 8 (Open)",    "35%", C.greenLt);
  progressBar(s, 8.5, 6.3, 3.8, 100,"Cohort 6 (Closed)",  "100%", C.greenLt);
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 6 — CRM PIPELINE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "100A1E");
  sectionLabel(s, "CRM — Sales Pipeline");
  s.addText("From first inquiry to enrolled student.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });
  subtext(s,
    "A purpose-built CRM for coaching programs. Every feature maps to how your team actually sells.",
    1.5, 11);

  // Feature cards 3×3
  const features = [
    { emoji: "📌", title: "Kanban Pipeline",       desc: "Visual drag-and-drop board with 5 stages. Drag cards to advance stage instantly." },
    { emoji: "⚡", title: "Lead Scoring (0–100)",  desc: "Auto-computed from stage, recency, activity count, deal value, and profile completeness." },
    { emoji: "🔍", title: "⌘K Global Search",      desc: "Instant fuzzy search across all leads by name, email, or company. Keyboard-navigable." },
    { emoji: "👤", title: "Lead Assignment",        desc: "Assign leads to reps. Filter list by rep. Per-rep analytics show pipeline and win rates." },
    { emoji: "📋", title: "Task Management",        desc: "Tasks linked to leads with due dates. Overdue tasks surface automatically in notifications." },
    { emoji: "📎", title: "Activity Timeline",      desc: "Full audit log: stage changes, tasks, notes, emails, enrichments — timestamped and immutable." },
    { emoji: "🔖", title: "Saved Filter Views",     desc: "Save stage + source + priority + rep combinations as named views. One-click recall." },
    { emoji: "🧬", title: "Duplicate Detection",    desc: "Auto-detects same email or name. Warning banner surfaces duplicates for review." },
    { emoji: "📤", title: "CSV Import",             desc: "Bulk import leads from any spreadsheet. Smart field mapping with preview and deduplication." },
  ];
  features.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    featureCard(s, 0.5 + col * 4.3, 2.2 + row * 1.72, 4.1, 1.58, f.emoji, f.title, f.desc, C.purpleLt);
  });

  // Pipeline stages row
  card(s, 0.5, 7.05, 12.3, 0.5, "1A0E2E", "3D1F6A");
  const stages = [
    { label: "📥 Lead",      color: C.slateLt  },
    { label: "→",            color: "334155"    },
    { label: "📞 Contacted", color: C.blueLt    },
    { label: "→",            color: "334155"    },
    { label: "✅ Qualified", color: C.purpleLt  },
    { label: "→",            color: "334155"    },
    { label: "📄 Proposal",  color: C.amberLt   },
    { label: "→",            color: "334155"    },
    { label: "🎉 Enrolled",  color: C.greenLt   },
  ];
  stages.forEach((st, i) => {
    s.addText(st.label, {
      x: 0.7 + i * 1.35, y: 7.1, w: 1.25, h: 0.35,
      fontFace: FONT, fontSize: 11, bold: true, color: st.color, align: "center",
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 7 — CRM AUTOMATION
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "100A1E");
  sectionLabel(s, "CRM — Automation & Enrichment");
  s.addText("The CRM that works while you sleep.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });
  subtext(s,
    "Email sequences, Slack alerts, company enrichment, and proposal generation — reducing manual work to near zero.",
    1.5, 11);

  // 2×2 automation cards
  const automations = [
    {
      emoji: "📧", title: "Email Drip Sequences", color: C.purpleLt,
      items: [
        "Multi-step sequences with custom delay (Day 0, +3, +7...)",
        "Personalization: {{firstName}} auto-replaced per recipient",
        "Enroll any lead in any sequence with one click",
        "Pause, resume, or cancel enrollments individually",
        "Vercel Cron fires at 1 PM UTC daily — auto-sends & advances",
      ],
    },
    {
      emoji: "✨", title: "Lead Enrichment", color: C.amberLt,
      items: [
        "One-click Enrich button on every lead profile",
        "Clearbit API fetches company name from email domain",
        "Skips personal domains (Gmail, Yahoo) automatically",
        "Auto-enriches on every new intake form submission",
        "Results cached 24 hours — no redundant API calls",
      ],
    },
    {
      emoji: "📄", title: "Proposal Generator", color: C.greenLt,
      items: [
        "One-click proposal at /leads/{id}/proposal",
        "Branded: program name, tagline, deal value, offer expiry",
        "Sections: What's Included, How It Works, Outcomes, Notes",
        "\"Save as PDF\" via browser print with clean @media print CSS",
        "Defaults (name, tagline, footer) editable in Settings UI",
      ],
    },
    {
      emoji: "💬", title: "Slack Alerts", color: C.blueLt,
      items: [
        "Fires when any lead is marked Enrolled — includes deal value",
        "Daily cold-lead alert: high-priority leads stale 7+ days",
        "Webhook URL set from Settings UI — no redeploy needed",
        "Rich Block Kit message format with action buttons",
      ],
    },
  ];

  automations.forEach((a, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 2.2 + row * 2.5;
    card(s, x, y, 6.1, 2.35, "1A0E2E", "3D1F6A");
    s.addText(`${a.emoji}  ${a.title}`, {
      x: x + 0.2, y: y + 0.15, w: 5.7, h: 0.38,
      fontFace: FONT, fontSize: 13, bold: true, color: a.color,
    });
    a.items.forEach((item, j) => {
      s.addText(`✓  ${item}`, {
        x: x + 0.25, y: y + 0.58 + j * 0.33, w: 5.6, h: 0.3,
        fontFace: FONT, fontSize: 9.5, color: C.slateLt,
      });
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 8 — CRM ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "100A1E");
  sectionLabel(s, "CRM — Analytics & Revenue");
  s.addText("Data-driven decisions, not gut feelings.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });
  subtext(s,
    "Four analytics tabs: pipeline health, revenue forecasting, time-in-stage velocity, cohort fill rates, and per-rep performance.",
    1.5, 11);

  // 3 KPI cards
  const kpis = [
    { label: "Gross Pipeline",     value: "$148k", sub: "All active deal values",    color: C.blueLt,   bg: "0E1E3A" },
    { label: "Weighted Forecast",  value: "$62k",  sub: "× close probability/stage", color: C.purpleLt, bg: "1A0E2E" },
    { label: "Avg Deal (Enrolled)", value: "$3,500", sub: "Per enrolled student",    color: C.greenLt,  bg: "0A1E0A" },
  ];
  kpis.forEach((k, i) => {
    card(s, 0.5 + i * 4.3, 2.2, 4.0, 1.3, k.bg, k.color.replace("FF", "60"));
    s.addText(k.label.toUpperCase(), {
      x: 0.75 + i * 4.3, y: 2.35, w: 3.5, h: 0.25,
      fontFace: FONT, fontSize: 8, bold: true, color: C.slate, charSpacing: 2,
    });
    s.addText(k.value, {
      x: 0.75 + i * 4.3, y: 2.65, w: 3.5, h: 0.6,
      fontFace: FONT, fontSize: 28, bold: true, color: k.color,
    });
    s.addText(k.sub, {
      x: 0.75 + i * 4.3, y: 3.2, w: 3.5, h: 0.25,
      fontFace: FONT, fontSize: 9, color: C.slate,
    });
  });

  // Analytics tabs feature cards
  const tabs = [
    { emoji: "📊", title: "Pipeline Tab",       desc: "Conversion funnel with rates at each stage. Lead source breakdown. 6-month volume chart." },
    { emoji: "⏱️", title: "Time-in-Stage Tab",  desc: "Avg days per stage before moving forward. Identifies bottlenecks. Sample size shown." },
    { emoji: "🎓", title: "Cohort Fill Tab",    desc: "Visual fill bar per cohort (green→amber→red). Spots remaining and active/inactive status." },
    { emoji: "👥", title: "By Rep Tab",         desc: "Per-rep: total, active, enrolled, win rate, pipeline. Bar chart. Unassigned tracked separately." },
    { emoji: "📅", title: "Month-over-Month",   desc: "New leads + enrolled this vs last month with MoM % change badges." },
    { emoji: "🔮", title: "Weighted Forecast",  desc: "5% (Lead) → 15% → 35% → 65% → 100% (Enrolled). Probability-adjusted revenue projection." },
  ];
  tabs.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    featureCard(s, 0.5 + col * 4.3, 3.7 + row * 1.7, 4.1, 1.55, t.emoji, t.title, t.desc, C.purpleLt);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 9 — TECH STACK
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, "0F1729");
  sectionLabel(s, "Technology");
  s.addText("Enterprise-grade stack, zero licensing costs.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 30, bold: true, color: C.white,
  });
  subtext(s,
    "Open-source technologies on globally-distributed serverless infrastructure. Scales to thousands of users at a fraction of SaaS pricing.",
    1.5, 11);

  const tech = [
    { emoji: "▲",  title: "Next.js 14 + Vercel",  desc: "App Router, RSC, Edge-ready. Global CDN. Zero-downtime deploys. Auto-scaling.",          badge: "Frontend + API",  bc: C.blueLt   },
    { emoji: "🗄️", title: "Neon PostgreSQL",       desc: "Serverless Postgres. Prisma ORM v5 — type-safe queries, migrations, schema management.",  badge: "Database",        bc: C.greenLt  },
    { emoji: "🔐", title: "NextAuth.js",            desc: "JWT sessions, credential provider, bcrypt hashing. Role-based access at route and API.",   badge: "Auth",            bc: C.blueLt   },
    { emoji: "📧", title: "Resend",                 desc: "Transactional email for drip sequences and onboarding. React Email templates.",            badge: "Email",           bc: C.amberLt  },
    { emoji: "⏰", title: "Vercel Cron Jobs",       desc: "Daily scheduled jobs — drip emails, Slack alerts, overdue notifications. No scheduler.",   badge: "Automation",      bc: C.greenLt  },
    { emoji: "💬", title: "Slack Webhooks",         desc: "Incoming webhook for enrollment + cold-lead alerts. Configurable from Settings UI.",       badge: "Notifications",   bc: C.purpleLt },
    { emoji: "🔷", title: "TypeScript (strict)",    desc: "Entire codebase strict TypeScript — zero runtime surprises, compile-time error catching.", badge: "Language",        bc: C.purpleLt },
    { emoji: "🎨", title: "Tailwind CSS",           desc: "Utility-first styling. Fully responsive (mobile + desktop). Print CSS for PDF proposals.", badge: "Styling",         bc: C.blueLt   },
    { emoji: "✨", title: "Clearbit Enrichment",    desc: "Free company autocomplete by email domain. Auto-runs on intake. 24-hour response cache.", badge: "Enrichment",      bc: C.greenLt  },
  ];
  tech.forEach((t, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    featureCard(s, 0.5 + col * 4.3, 2.2 + row * 1.72, 4.1, 1.58, t.emoji, t.title, t.desc, t.bc);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// SLIDE 10 — SUMMARY / CLOSE
// ══════════════════════════════════════════════════════════════════════════════
{
  const s = pptx.addSlide();
  bg(s, C.navy);
  s.addShape(pptx.ShapeType.ellipse, {
    x: -2, y: -2, w: 6, h: 6,
    fill: { color: "4C1D95", transparency: 75 },
    line: { color: "4C1D95", transparency: 75, width: 0 },
  });

  sectionLabel(s, "Summary");
  s.addText("What we've built — end to end.", {
    x: 0.6, y: 0.5, w: 12, h: 0.9,
    fontFace: FONT, fontSize: 32, bold: true, color: C.white,
  });

  // 4 summary columns
  const sections = [
    {
      title: "🎓 Student LMS", color: C.blueLt,
      items: ["Structured 8-module curriculum", "Section + module progress tracking", "Pre-work submissions workflow", "Live session attendance", "Completion certificates", "Notion integration", "Public /apply form + auto-enrichment"],
    },
    {
      title: "🛠️ Admin LMS", color: C.greenLt,
      items: ["Cohort creation + capacity mgmt", "Real-time cohort fill rate dashboard", "Student progress panel per user", "Submission review queue + notes", "Attendance posting per module", "Certificate issuance", "CRM-to-LMS account provisioning"],
    },
    {
      title: "📊 CRM Pipeline", color: C.purpleLt,
      items: ["Kanban board, 5 stages", "Lead scoring 0–100 auto-computed", "⌘K global search", "Saved views, bulk actions, CSV import", "Lead assignment to reps", "Task management + overdue alerts", "Duplicate detection"],
    },
    {
      title: "⚡ Automation & Analytics", color: C.amberLt,
      items: ["Email drip sequences + cron", "Notification bell (5 types)", "Slack alerts on enroll + cold leads", "1-click lead enrichment", "PDF proposal generator", "Gross pipeline + weighted forecast", "Time-in-stage + per-rep analytics"],
    },
  ];

  sections.forEach((sec, i) => {
    const x = 0.5 + i * 3.25;
    card(s, x, 1.6, 3.1, 5.1, "1E293B", "334155");
    s.addText(sec.title, {
      x: x + 0.15, y: 1.72, w: 2.8, h: 0.38,
      fontFace: FONT, fontSize: 11, bold: true, color: sec.color,
    });
    sec.items.forEach((item, j) => {
      s.addText(`✓  ${item}`, {
        x: x + 0.15, y: 2.18 + j * 0.6, w: 2.85, h: 0.55,
        fontFace: FONT, fontSize: 9, color: C.slateLt, lineSpacingMultiple: 1.2,
      });
    });
  });

  // Footer strip
  card(s, 0.5, 6.9, 12.3, 0.5, "1A2744", "2D4A7A");
  s.addText("🌐  career-accelerator-crm.vercel.app", {
    x: 0.75, y: 7.0, w: 6, h: 0.3,
    fontFace: FONT, fontSize: 11, bold: true, color: C.blueLt,
  });
  const stackItems = ["Next.js 14", "Neon PostgreSQL", "Prisma ORM", "Vercel Cron", "Resend", "Slack"];
  let bx = 7.1;
  stackItems.forEach(t => {
    s.addText(t, {
      x: bx, y: 7.0, w: 0.9, h: 0.3,
      fontFace: FONT, fontSize: 8, bold: true, color: C.slate, align: "center",
    });
    bx += 0.88;
  });
}

// ── Write file ───────────────────────────────────────────────────────────────
await pptx.writeFile({ fileName: "Career-Accelerator-Platform-Deck.pptx" });
console.log("✅  Career-Accelerator-Platform-Deck.pptx written to project root.");
