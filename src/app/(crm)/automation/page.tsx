import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { WebhooksSection } from "./WebhooksSection";
import { AutomationRules } from "./AutomationRules";
import { EmailPlaybook } from "./EmailPlaybook";

export default async function AutomationPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  if (!session || role !== "ADMIN") redirect("/home");

  return (
    <div className="p-7 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-display font-semibold" style={{ color: "#14211f" }}>Automation Rules</h1>
        </div>
        <p className="text-sm" style={{ color: "#949598" }}>
          Smart rules that run in the background. Toggle any rule on or off — changes take effect immediately.
        </p>
      </div>

      {/* The Email Playbook — every automated email, when it fires, what it looks like */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-1" style={{ color: "#14211f" }}>📬 Email Playbook</h2>
        <p className="text-sm mb-4" style={{ color: "#949598" }}>
          Every automated email students and coaches receive — who gets it, when it sends, and a preview of each template.
        </p>
        <EmailPlaybook />
      </div>

      {/* Rules list — client component with toggles + dynamic banner */}
      <AutomationRules />

      {/* Outbound Webhooks */}
      <WebhooksSection />
    </div>
  );
}
