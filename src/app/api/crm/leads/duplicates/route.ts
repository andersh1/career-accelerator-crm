import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || (session as { user?: { role?: string } }).user?.role !== "ADMIN")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      company: true, stage: true, createdAt: true,
    },
  });

  // Find duplicate pairs
  const seen = new Map<string, typeof leads[number][]>();

  for (const lead of leads) {
    // Key by normalized email (strongest signal)
    const emailKey = `email:${lead.email.toLowerCase().trim()}`;
    if (!seen.has(emailKey)) seen.set(emailKey, []);
    seen.get(emailKey)!.push(lead);

    // Key by normalized name (secondary signal)
    const nameKey = `name:${lead.firstName.toLowerCase().trim()}|${lead.lastName.toLowerCase().trim()}`;
    if (!seen.has(nameKey)) seen.set(nameKey, []);
    seen.get(nameKey)!.push(lead);
  }

  const groups: { reason: string; leads: typeof leads }[] = [];
  const addedPairs = new Set<string>();

  for (const [key, group] of Array.from(seen.entries())) {
    if (group.length < 2) continue;

    // Sort so we get deterministic pairs
    const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id));
    const pairKey = sorted.map(l => l.id).join("|");
    if (addedPairs.has(pairKey)) continue;
    addedPairs.add(pairKey);

    const reason = key.startsWith("email:") ? "Same email address" : "Same name";
    groups.push({ reason, leads: sorted });
  }

  return NextResponse.json({ count: groups.length, groups });
}
