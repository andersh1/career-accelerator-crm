/**
 * GET /api/crm/inbound-address
 *
 * The CC address, so Settings can show it rather than asking anyone to
 * remember which subdomain it lives on. `configured` reports whether the
 * webhook secret and API key are actually in the environment — without them
 * the address exists but nothing it receives can be read, and a card that
 * showed the address anyway would be inviting people to CC a black hole.
 *
 * Admin-only. The address is not a secret, but it is not public either: it
 * writes to lead timelines, and there is no reason to hand it out.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { inboxAddress } from "@/lib/inbound-email";

export async function GET() {
  const session = await getServerSession(authOptions);
  const crmRole = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    address: inboxAddress(),
    configured: !!process.env.RESEND_INBOUND_WEBHOOK_SECRET && !!process.env.RESEND_API_KEY,
  });
}
