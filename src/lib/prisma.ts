import { PrismaClient } from "@prisma/client";
import { syncNetworkingAllowlist } from "./networking-enroll";

function makePrisma() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  });

  // Mirror every new Fellow into the Networking CRM sign-in allowlist at the
  // client level, so no account-creation path in this app can forget it.
  //
  // The LMS has had this on its own client for a while, with a comment saying
  // every account-creation path is covered. It wasn't: this app is a separate
  // deployment with its own Prisma client against the same database, so
  // converting a lead here created the Fellow without ever touching the LMS
  // middleware. A Fellow enrolled from the CRM, which is how every Fellow is
  // actually enrolled, reached their first Networking CRM sign-in and was
  // rejected by handle_new_user because their address was never on the list.
  //
  // Middleware (not $extends) keeps the exported `prisma` type a plain
  // PrismaClient, so this stays invisible to the rest of the app. Reads from
  // args.data rather than the result, because callers pass different `select`s
  // and some omit email. Awaited (a serverless function can freeze right after
  // the response, dropping an un-awaited fetch) but wrapped so the allowlist
  // mirror can never fail the account creation itself.
  client.$use(async (params, next) => {
    const result = await next(params);
    if (params.model === "User" && params.action === "create") {
      try {
        const data = params.args?.data as
          | { email?: string; name?: string | null; role?: string | null }
          | undefined;
        if (data?.email) {
          await syncNetworkingAllowlist({ email: data.email, name: data.name, role: data.role });
        }
      } catch {
        /* never block account creation on the allowlist mirror */
      }
    }
    return result;
  });

  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
