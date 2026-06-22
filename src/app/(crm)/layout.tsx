import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/layout/AppShell";

export default async function CRMLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const crmRole = session?.user?.crmRole;
  if (!session || (crmRole !== "ADMIN" && crmRole !== "MEMBER")) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
