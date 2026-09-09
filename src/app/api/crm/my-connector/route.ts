/**
 * Your own Claude connector URL.
 *
 * GET  — returns the signed-in admin's connector URL, issuing a token on first
 *        ask so nobody has to be handed one out of band.
 * POST — rotates it. Use when a URL has been pasted somewhere it shouldn't be;
 *        the old one stops working immediately.
 *
 * The token IS the credential — anyone holding the URL can read and write the
 * whole CRM as its owner. So this route never takes a user id, from a query
 * string or a body: it only ever reads the session. There is deliberately no
 * way to ask for somebody else's, which means a bug here cannot leak one.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomBytes } from "crypto";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const BASE = process.env.NEXTAUTH_URL ?? "https://crm.vantagecareer.co";

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  const u = (session as { user?: { role?: string; crmRole?: string } } | null)?.user;
  return !!u && (u.role === "ADMIN" || u.crmRole === "ADMIN");
}

/** The MCP route rejects anything under 24 chars; 48 hex is well clear. */
const newToken = () => randomBytes(24).toString("hex");

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = (session as { user?: { email?: string } }).user?.email;
  if (!email) return NextResponse.json({ error: "No session email" }, { status: 400 });

  const me = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, mcpToken: true },
  });
  if (!me) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let token = me.mcpToken;
  if (!token) {
    token = newToken();
    await prisma.user.update({ where: { id: me.id }, data: { mcpToken: token } });
  }

  return NextResponse.json({ name: me.name, url: `${BASE}/api/mcp/${token}` });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const email = (session as { user?: { email?: string } }).user?.email;
  if (!email) return NextResponse.json({ error: "No session email" }, { status: 400 });

  const token = newToken();
  await prisma.user.update({ where: { email }, data: { mcpToken: token } });

  return NextResponse.json({
    url: `${BASE}/api/mcp/${token}`,
    message: "New URL issued. The old one no longer works — update it in Claude.",
  });
}
