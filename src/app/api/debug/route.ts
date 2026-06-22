import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const allCookies = cookieStore.getAll().map(c => c.name);

  const hasSecureCookie = allCookies.includes("__Secure-next-auth.session-token");
  const hasInsecureCookie = allCookies.includes("next-auth.session-token");
  const secretLength = process.env.NEXTAUTH_SECRET?.length ?? 0;
  const nextauthUrl = process.env.NEXTAUTH_URL ?? "NOT SET";

  let sessionResult: string;
  let sessionCrmRole: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    sessionResult = session ? "ok" : "null";
    sessionCrmRole = (session?.user as { crmRole?: string })?.crmRole ?? null;
  } catch (e) {
    sessionResult = `error: ${(e as Error).message}`;
  }

  return NextResponse.json({
    cookies: allCookies,
    hasSecureCookie,
    hasInsecureCookie,
    secretLength,
    nextauthUrl,
    sessionResult,
    sessionCrmRole,
  });
}
