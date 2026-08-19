import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST /api/crm/admin/webhook-test
// body: { url: string }
// Sends a test payload to the given URL and returns { success: true } or { error: "..." }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const payload = {
      event: "webhook.test",
      data: { message: "Test from Vantage Career Accelerator CRM" },
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Event": "webhook.test" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Target responded with ${res.status} ${res.statusText}` },
        { status: 200 } // return 200 to the client — the error is from the downstream URL
      );
    }

    return NextResponse.json({ success: true, status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 200 });
  }
}
