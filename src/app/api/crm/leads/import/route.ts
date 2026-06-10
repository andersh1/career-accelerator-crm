import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return !session || (session as { user?: { role?: string } }).user?.role !== "ADMIN";
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Parse header — strip BOM and quotes
  const headers = lines[0]
    .replace(/^﻿/, "")
    .split(",")
    .map(h => h.trim().replace(/^"|"$/g, "").toLowerCase()
      .replace(/\s+/g, "")
      .replace("firstname", "firstName")
      .replace("lastname",  "lastName")
      .replace("jobtitle",  "jobTitle")
      .replace("linkedin",  "linkedinUrl")
      .replace("linkedinurl", "linkedinUrl")
    );

  return lines.slice(1).map(line => {
    // Handle quoted fields with commas inside
    const values: string[] = [];
    let cur = ""; let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { values.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    values.push(cur.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (requireAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const file     = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length === 0) return NextResponse.json({ error: "No data rows found" }, { status: 400 });

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const email     = (row.email ?? "").toLowerCase().trim();
    const firstName = (row.firstName || row.first || "").trim();
    const lastName  = (row.lastName  || row.last  || "").trim();

    if (!email || !firstName) { skipped++; continue; }

    try {
      const exists = await prisma.lead.findFirst({ where: { email } });
      if (exists) { skipped++; continue; }

      const lead = await prisma.lead.create({
        data: {
          firstName,
          lastName:    lastName  || "-",
          email,
          phone:       row.phone       || null,
          company:     row.company     || null,
          jobTitle:    row.jobTitle    || null,
          linkedinUrl: row.linkedinUrl || null,
          stage:       "LEAD",
          source:      row.source      || null,
          priority:    "NORMAL",
          notes:       row.notes       || null,
          tags:        row.tags ? row.tags.split(";").map((t: string) => t.trim()).filter(Boolean) : [],
        },
      });

      await prisma.leadActivity.create({
        data: { leadId: lead.id, type: "CREATED", content: "Imported via CSV" },
      });

      created++;
    } catch (err) {
      errors.push(`Row ${created + skipped + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      skipped++;
    }
  }

  return NextResponse.json({ created, skipped, errors: errors.slice(0, 10) });
}
