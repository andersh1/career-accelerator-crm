/**
 * Cron: Weekly leadership report — every Monday at 8 AM UTC
 * Schedule: "0 8 * * 1"
 * Sends a digest email to all CRM admins with pipeline KPIs, enrollments, and focus leads.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";
import { mailFrom } from "@/lib/mail-from";

const resend  = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM    = mailFrom();
const CRM_URL = process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app";

function authOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function fmt$(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

const STAGE_PROB: Record<string, number> = {
  LEAD: 0.05, CONTACTED: 0.15, STRATEGY_CALL: 0.35, OFFER_SENT: 0.65, ENROLLED: 1, LOST: 0,
};

const STAGE_LABEL: Record<string, string> = {
  LEAD: "New Lead", CONTACTED: "Contacted", STRATEGY_CALL: "Interviewed",
  OFFER_SENT: "Offer Sent", ENROLLED: "Enrolled", LOST: "Lost",
};

const STAGE_COLOR: Record<string, string> = {
  LEAD: "#94a3b8", CONTACTED: "#3b82f6", STRATEGY_CALL: "#8b5cf6",
  OFFER_SENT: "#f59e0b", ENROLLED: "#10b981", LOST: "#ef4444",
};

export async function GET(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!resend)       return NextResponse.json({ error: "No RESEND_API_KEY" }, { status: 503 });

  const now        = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // ── Pull data ───────────────────────────────────────────────────────────────
  const [leads, admins, enrolledActivities] = await Promise.all([
    prisma.lead.findMany({
      where: { deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        stage: true, dealValue: true, priority: true,
        createdAt: true, updatedAt: true,
      },
    }),
    prisma.user.findMany({
      where: { crmRole: "ADMIN" },
      select: { id: true, name: true, email: true },
    }),
    prisma.leadActivity.findMany({
      where: { type: "STAGE_CHANGE" },
      select: { leadId: true, metadata: true, createdAt: true },
    }),
  ]);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const total       = leads.length;
  const enrolled    = leads.filter(l => l.stage === "ENROLLED").length;
  const lost        = leads.filter(l => l.stage === "LOST").length;
  const active      = total - enrolled - lost;
  const winRate     = pct(enrolled, total);
  const pipeline    = leads.filter(l => l.stage !== "LOST").reduce((s, l) => s + (l.dealValue ?? 0), 0);
  const weighted    = leads.filter(l => l.stage !== "LOST").reduce((s, l) => s + (l.dealValue ?? 0) * (STAGE_PROB[l.stage] ?? 0.05), 0);
  const newThisWeek = leads.filter(l => l.createdAt >= weekAgo).length;

  // Enrollments this week
  const enrolledThisWeek = enrolledActivities.filter(a => {
    if (a.createdAt < weekAgo) return false;
    try { return (JSON.parse(a.metadata ?? "{}") as { to?: string }).to === "ENROLLED"; }
    catch { return false; }
  }).length;

  // ── Funnel snapshot ────────────────────────────────────────────────────────
  const FUNNEL = ["LEAD", "CONTACTED", "STRATEGY_CALL", "OFFER_SENT", "ENROLLED"];
  const funnel = FUNNEL.map(s => ({
    stage: s,
    count: leads.filter(l => l.stage === s).length,
  }));
  const maxFunnel = Math.max(...funnel.map(f => f.count), 1);

  // ── Top leads to focus on (high score, not enrolled/lost) ─────────────────
  // Sort by stage proximity to enrolled (OFFER_SENT > STRATEGY_CALL > CONTACTED > LEAD), then recency
  const STAGE_ORDER: Record<string, number> = { OFFER_SENT: 0, STRATEGY_CALL: 1, CONTACTED: 2, LEAD: 3 };
  const focusLeads = [...leads]
    .filter(l => !["ENROLLED", "LOST"].includes(l.stage))
    .sort((a, b) => {
      const stageDiff = (STAGE_ORDER[a.stage] ?? 9) - (STAGE_ORDER[b.stage] ?? 9);
      if (stageDiff !== 0) return stageDiff;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    })
    .slice(0, 5);

  // ── Cold high-priority leads ───────────────────────────────────────────────
  const coldLeads = leads.filter(
    l => !["ENROLLED", "LOST"].includes(l.stage) &&
         l.updatedAt < weekAgo &&
         ["HIGH", "URGENT"].includes(l.priority)
  ).slice(0, 5);

  // ── Date range label ───────────────────────────────────────────────────────
  const dateRange = `${weekAgo.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  // ── Build HTML ──────────────────────────────────────────────────────────────
  const funnelBars = funnel.map(f => {
    const barPct = Math.round((f.count / maxFunnel) * 100);
    const color  = STAGE_COLOR[f.stage] ?? "#94a3b8";
    return `
      <tr>
        <td style="padding:4px 0;font-size:12px;color:#475569;white-space:nowrap;width:90px;">${STAGE_LABEL[f.stage]}</td>
        <td style="padding:4px 8px;width:100%;">
          <div style="background:#f1f5f9;border-radius:6px;height:14px;width:100%;overflow:hidden;">
            <div style="background:${color};height:14px;border-radius:6px;width:${Math.max(barPct, f.count > 0 ? 3 : 0)}%;"></div>
          </div>
        </td>
        <td style="padding:4px 0;font-size:12px;font-weight:700;color:#0f172a;text-align:right;white-space:nowrap;width:32px;">${f.count}</td>
      </tr>`;
  }).join("");

  const focusRows = focusLeads.length === 0
    ? `<tr><td colspan="3" style="padding:12px;text-align:center;color:#94a3b8;font-size:13px;">No active leads</td></tr>`
    : focusLeads.map(l => `
      <tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:10px 8px;">
          <a href="${CRM_URL}/leads/${l.id}" style="color:#1e293b;font-weight:600;font-size:13px;text-decoration:none;">${l.firstName} ${l.lastName}</a>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px;">${l.email}</div>
        </td>
        <td style="padding:10px 8px;text-align:center;">
          <span style="background:${STAGE_COLOR[l.stage] ?? "#94a3b8"}20;color:${STAGE_COLOR[l.stage] ?? "#94a3b8"};font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;">${STAGE_LABEL[l.stage] ?? l.stage}</span>
        </td>
        <td style="padding:10px 8px;text-align:right;font-size:13px;font-weight:700;color:#7c3aed;">${l.dealValue ? fmt$(l.dealValue) : "—"}</td>
      </tr>`).join("");

  const coldRows = coldLeads.length === 0
    ? `<p style="color:#10b981;font-size:13px;margin:0;">✅ No cold high-priority leads — great job staying on top of follow-ups!</p>`
    : `<table style="width:100%;border-collapse:collapse;">${coldLeads.map(l => {
        const days = Math.floor((now.getTime() - l.updatedAt.getTime()) / 86400000);
        return `
          <tr style="border-bottom:1px solid #fef2f2;">
            <td style="padding:8px 0;">
              <a href="${CRM_URL}/leads/${l.id}" style="color:#1e293b;font-weight:600;font-size:13px;text-decoration:none;">${l.firstName} ${l.lastName}</a>
            </td>
            <td style="padding:8px 0;text-align:center;">
              <span style="background:#fef2f2;color:#ef4444;font-size:11px;font-weight:700;padding:2px 7px;border-radius:20px;">${l.priority}</span>
            </td>
            <td style="padding:8px 0;text-align:right;font-size:12px;color:#ef4444;font-weight:600;">${days}d no touch</td>
          </tr>`;
      }).join("")}</table>`;

  const kpiBlock = (label: string, value: string, sub: string, bg: string, color: string) => `
    <td style="width:25%;padding:0 6px;">
      <div style="background:${bg};border-radius:14px;padding:16px;text-align:center;">
        <p style="margin:0 0 4px;font-size:22px;font-weight:900;color:${color};">${value}</p>
        <p style="margin:0;font-size:11px;font-weight:700;color:${color};">${label}</p>
        <p style="margin:4px 0 0;font-size:10px;color:${color}88;">${sub}</p>
      </div>
    </td>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#f0f4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4ff;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0a1628,#1e3a8a);padding:28px 32px;">
    <p style="margin:0 0 4px;color:#93c5fd;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;">Vantage Career Accelerator · Weekly Digest</p>
    <h1 style="margin:0 0 4px;color:#ffffff;font-size:22px;font-weight:900;">Pipeline Report</h1>
    <p style="margin:0;color:#93c5fd;font-size:12px;">${dateRange}</p>
  </td></tr>

  <!-- KPI row -->
  <tr><td style="padding:24px 26px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      ${kpiBlock("New Leads",  String(newThisWeek),    "this week",       "#eff6ff", "#1d4ed8")}
      ${kpiBlock("Enrolled",   String(enrolledThisWeek), "this week",     "#f0fdf4", "#15803d")}
      ${kpiBlock("Win Rate",   `${winRate}%`,           `${enrolled} total`, "#faf5ff", "#7c3aed")}
      ${kpiBlock("Active",     String(active),          "in pipeline",     "#f8fafc", "#334155")}
    </tr></table>
  </td></tr>

  <!-- Revenue row -->
  <tr><td style="padding:0 26px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 6px 0 0;width:50%;">
        <div style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);border-radius:14px;padding:16px;">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#c7d2fe;text-transform:uppercase;letter-spacing:1.5px;">Gross Pipeline</p>
          <p style="margin:0;font-size:26px;font-weight:900;color:#ffffff;">${fmt$(pipeline)}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#93c5fd;">all non-lost deal values</p>
        </div>
      </td>
      <td style="padding:0 0 0 6px;width:50%;">
        <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:14px;padding:16px;">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;color:#e9d5ff;text-transform:uppercase;letter-spacing:1.5px;">Weighted Forecast</p>
          <p style="margin:0;font-size:26px;font-weight:900;color:#ffffff;">${fmt$(Math.round(weighted))}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#d8b4fe;">× close probability</p>
        </div>
      </td>
    </tr></table>
  </td></tr>

  <!-- Funnel -->
  <tr><td style="padding:0 26px 20px;">
    <div style="background:#f8fafc;border-radius:14px;padding:20px;">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#0f172a;">Pipeline Funnel</p>
      <table width="100%" cellpadding="0" cellspacing="0">${funnelBars}</table>
    </div>
  </td></tr>

  <!-- Top leads -->
  <tr><td style="padding:0 26px 20px;">
    <div style="background:#f8fafc;border-radius:14px;padding:20px;">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#0f172a;">Top Leads to Focus On</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:0 8px 8px;font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Lead</th>
            <th style="text-align:center;padding:0 8px 8px;font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Stage</th>
            <th style="text-align:right;padding:0 8px 8px;font-size:10px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Deal</th>
          </tr>
        </thead>
        <tbody>${focusRows}</tbody>
      </table>
    </div>
  </td></tr>

  <!-- Cold leads -->
  <tr><td style="padding:0 26px 24px;">
    <div style="background:#fff5f5;border:1px solid #fee2e2;border-radius:14px;padding:20px;">
      <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#0f172a;">⚠️ Cold High-Priority Leads</p>
      ${coldRows}
    </div>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 26px 28px;text-align:center;">
    <a href="${CRM_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 32px;border-radius:12px;">
      Open CRM Dashboard →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px;border-top:1px solid #f1f5f9;background:#f8fafc;">
    <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
      Vantage Career Accelerator Weekly Report · Sent every Monday at 8 AM ·
      <a href="${CRM_URL}/settings" style="color:#3b82f6;">Manage</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  // ── Send to all admins ─────────────────────────────────────────────────────
  const subject = `📊 Weekly Report — ${newThisWeek} new lead${newThisWeek !== 1 ? "s" : ""}, ${enrolledThisWeek} enrolled this week`;
  const results = await Promise.allSettled(
    admins.map(admin =>
      resend!.emails.send({ from: FROM, to: admin.email, subject, html })
    )
  );

  const sent   = results.filter(r => r.status === "fulfilled").length;
  const failed = results.filter(r => r.status === "rejected").length;

  return NextResponse.json({ sent, failed, recipients: admins.map(a => a.email) });
}
