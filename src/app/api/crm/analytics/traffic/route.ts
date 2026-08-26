import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const TOKEN       = process.env.VERCEL_API_TOKEN;
const PROJECT_ID  = "prj_JJ5Ra3tbS94oTmBPapHHCRIGc1q4"; // career-accelerator-lms
const TEAM_ID     = "team_Nvu1yh8J9J7fl7hAoTRdV1i4";
const BASE        = "https://api.vercel.com/v1/query/web-analytics";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { crmRole?: string } }).user?.crmRole !== "ADMIN";
}

async function vFetch(path: string, params: Record<string, string>) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<{ data: unknown }>;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!TOKEN) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since")
    ?? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const until = searchParams.get("until")
    ?? new Date().toISOString().split("T")[0];

  const base = { projectId: PROJECT_ID, teamId: TEAM_ID };

  try {
    const [total, daily, pages, referrers, devices] = await Promise.all([
      vFetch("visits/count",     { ...base }),
      vFetch("visits/aggregate", { ...base, since, until, by: "day" }),
      vFetch("visits/aggregate", { ...base, since, until, by: "requestPath",      limit: "10" }),
      vFetch("visits/aggregate", { ...base, since, until, by: "referrerHostname", limit: "8"  }),
      vFetch("visits/aggregate", { ...base, since, until, by: "deviceType",       limit: "5"  }),
    ]);

    return NextResponse.json({
      total:     total.data,
      daily:     daily.data,
      pages:     pages.data,
      referrers: referrers.data,
      devices:   devices.data,
      since,
      until,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    // Surface "not found" as a distinct code so the UI can show a setup prompt
    const code = msg.includes("404") ? "not_enabled" : "api_error";
    return NextResponse.json({ error: code, detail: msg }, { status: 502 });
  }
}
