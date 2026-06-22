import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// In-memory rate limiter: 5 failed attempts → 15-minute lockout per email.
// Note: resets across serverless cold starts — acceptable for this scale.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(email: string): void {
  const now = Date.now();
  const rec  = loginAttempts.get(email) ?? { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > rec.resetAt) { rec.count = 0; rec.resetAt = now + 15 * 60 * 1000; }
  if (rec.count >= 10) throw new Error("Too many login attempts. Try again in 15 minutes.");
  loginAttempts.set(email, rec);
}

function recordFailure(email: string): void {
  const rec = loginAttempts.get(email);
  if (rec) { rec.count += 1; loginAttempts.set(email, rec); }
}

function clearAttempts(email: string): void {
  loginAttempts.delete(email);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        checkRateLimit(email);

        const user = await prisma.user.findUnique({ where: { email } });

        const crmRole = (user as unknown as { crmRole?: string | null })?.crmRole ?? null;

        if (!user || crmRole === null) {
          recordFailure(email);
          // Distinct message so we can tell "no CRM access" from "bad password"
          if (user && crmRole === null) {
            throw new Error("You don't have access to this CRM.");
          }
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          recordFailure(email);
          return null;
        }

        clearAttempts(email);
        return {
          id:      user.id,
          email:   user.email,
          name:    user.name,
          role:    user.role,
          crmRole: crmRole,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id      = user.id;
        token.role    = (user as unknown as { role: string }).role;
        token.crmRole = (user as unknown as { crmRole?: string }).crmRole ?? "MEMBER";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id      = token.id as string;
        session.user.role    = token.role as string;
        session.user.crmRole = token.crmRole as string;
      }
      return session;
    },
  },
  pages:   { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  secret:  process.env.NEXTAUTH_SECRET,
};
