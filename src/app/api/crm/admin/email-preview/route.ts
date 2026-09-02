/**
 * GET /api/crm/admin/email-preview?template=application-alert
 *
 * Renders a transactional email with representative sample data and returns it
 * as HTML, so a template can be looked at before it reaches anyone's inbox.
 *
 * This exists because the application alert shipped with a parser that merged
 * every adjacent one-line answer into a single row — "YEAR: Junior MAJOR: Psych
 * EXPECTED GRADUATION: ..." all under one heading — and nothing caught it until
 * a real application arrived. Layout bugs in email are invisible to typecheck
 * and to any status-code check; the only way to catch them is to look.
 *
 * The sample deliberately includes characters people actually type — an
 * ampersand, a greater-than, a quote, an apostrophe — because those are what
 * break an unescaped template.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { renderApplicationAlert, renderModulePreamblePreview } from "@/lib/email";

const SAMPLE_NOTES = [
  "=== FELLOWSHIP APPLICATION ===",
  "START DATE: September 8, 2026",
  "",
  "YEAR: Junior",
  "MAJOR: Psychology",
  "EXPECTED GRADUATION: May 2027",
  "FIRST-GENERATION STUDENT: Yes",
  "HOW THEY HEARD: A professor or advisor",
  "",
  "CAN COMMIT TO SCHEDULE: Yes, I'm in",
  "",
  "WHAT IS THE PROGRAM (their words):",
  "Eight weeks of figuring out what I'm actually good at & how to talk about it, instead of sending 200 applications into a void.",
  "",
  "GOALS FOR 8 WEEKS:",
  "Land 3 real conversations with people doing ops work at startups.\nIdeally a summer internship > $20/hr.",
  "",
  "HARD THING THEY STUCK WITH:",
  "I ran our club's budget for two years after the treasurer quit. Nobody asked me to.",
  "",
  "SELF-TAUGHT SKILL:",
  "SQL — I learned it to stop asking our data person for numbers.",
  "",
  "HOW THEY HANDLE SETBACKS:",
  "Badly at first, then I get practical about it.",
  "",
  "WORRIES ABOUT LIFE AFTER COLLEGE:",
  'That I\'ll take "a job" instead of the right job because I panic in April.',
  "",
  "AI TOOLS RELATIONSHIP:",
  "I use AI for school or work projects; I'd call myself a heavy user",
  "",
  "WRONG FIT SELF-ASSESSMENT:",
  "If someone wants to be told exactly what to do, this probably isn't for them.",
].join("\n");

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || crmRole !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const template = new URL(req.url).searchParams.get("template") ?? "application-alert";

  if (template === "application-alert") {
    const { html } = renderApplicationAlert({
      firstName: "Dana",
      lastName: "Berger-O'Neill",
      email: "dana.berger@example.edu",
      phone: "917-888-4444",
      leadId: "sample",
      notes: SAMPLE_NOTES,
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  const preamble = /^module-preamble-([1-8])$/.exec(template);
  if (preamble) {
    const html = await renderModulePreamblePreview(Number(preamble[1]), "Caleb");
    if (!html) return NextResponse.json({ error: `${template} has no copy yet` }, { status: 404 });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  return NextResponse.json(
    { error: "Unknown template", available: ["application-alert", "module-preamble-1 … -8"] },
    { status: 404 },
  );
}
