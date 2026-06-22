import { prisma } from "@/lib/prisma";

async function getWebhookUrl(): Promise<string | null> {
  // Prefer env var, fall back to DB setting
  if (process.env.SLACK_WEBHOOK_URL) return process.env.SLACK_WEBHOOK_URL;
  try {
    const setting = await prisma.appSetting.findUnique({ where: { key: "slack_webhook_url" } });
    return setting?.value ?? null;
  } catch { return null; }
}

export async function sendSlack(text: string, blocks?: object[]) {
  const url = await getWebhookUrl();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    });
  } catch { /* non-fatal */ }
}

export function enrolledBlocks(leadName: string, leadId: string, dealValue: number | null) {
  const val = dealValue ? ` · $${dealValue.toLocaleString()}` : "";
  return {
    text: `🎉 New enrollment: *${leadName}*${val}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `🎉 *New Enrollment*\n*${leadName}* just enrolled${val}` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View Lead" },
          url: `${process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app"}/leads/${leadId}`,
        },
      },
    ],
  };
}

export function newIntakeBlocks(firstName: string, lastName: string, email: string, leadId: string) {
  const BASE = process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app";
  return {
    text: `🚀 New application: *${firstName} ${lastName}* (${email})`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `🚀 *New Application*\n*${firstName} ${lastName}* just submitted an interest form.\n📧 ${email}` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "View Lead" },
          url: `${BASE}/leads/${leadId}`,
          style: "primary",
        },
      },
    ],
  };
}

export function coldLeadBlocks(leadName: string, leadId: string, days: number) {
  return {
    text: `🥶 Cold lead: ${leadName} hasn't been touched in ${days} days`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `🥶 *Cold lead alert*\n*${leadName}* hasn't been touched in *${days} days*` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Follow up" },
          url: `${process.env.NEXTAUTH_URL ?? "https://career-accelerator-crm.vercel.app"}/leads/${leadId}`,
        },
      },
    ],
  };
}
