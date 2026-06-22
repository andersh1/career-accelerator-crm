import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_ONLY_PATHS = ["/analytics", "/team"];

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  const { pathname } = req.nextUrl;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const crmRole = (token as { crmRole?: string }).crmRole;

  if (!crmRole || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (crmRole === "MEMBER") {
    const isAdminOnly = ADMIN_ONLY_PATHS.some(
      p => pathname === p || pathname.startsWith(p + "/")
    );
    if (isAdminOnly) {
      const dest = new URL("/home", req.url);
      dest.searchParams.set("denied", "1");
      return NextResponse.redirect(dest);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/pipeline/:path*",
    "/leads/:path*",
    "/tickets/:path*",
    "/tasks/:path*",
    "/sequences/:path*",
    "/blast/:path*",
    "/analytics/:path*",
    "/team/:path*",
    "/settings/:path*",
    "/help/:path*",
  ],
};
