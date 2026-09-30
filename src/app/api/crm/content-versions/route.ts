import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Content versions — the packages a cohort enrols into.
 *
 * GET    list, with how many modules each defines and how many cohorts run it
 * POST   create one, optionally cloning another version's content
 * PATCH  rename, re-parent, or change status
 * DELETE remove one, refused while a cohort is running it
 *
 * Deleting a version cascades to its content rows, so a version with cohorts on
 * it is refused rather than quietly pulling the content out from under a live
 * programme.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  return !!session && role === "ADMIN";
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const versions = await prisma.contentVersion.findMany({
    orderBy: [{ track: "asc" }, { createdAt: "asc" }],
    include: {
      parent:  { select: { id: true, name: true } },
      cohorts: { select: { id: true, name: true } },
      modules: { select: { moduleNumber: true, kind: true } },
    },
  });

  return NextResponse.json(versions.map(v => ({
    id: v.id, name: v.name, track: v.track, status: v.status, notes: v.notes,
    parentId: v.parentId, parentName: v.parent?.name ?? null,
    cohorts: v.cohorts,
    // Which modules this version defines anything for, so the list can show
    // "overrides M1, M4" rather than a bare row count.
    modulesDefined: Array.from(new Set(v.modules.map(m => m.moduleNumber))).sort((a, b) => a - b),
    pieceCount: v.modules.length,
    updatedAt: v.updatedAt,
  })));
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  const clash = await prisma.contentVersion.findFirst({ where: { name }, select: { id: true } });
  if (clash) return NextResponse.json({ error: `There is already a version called "${name}"` }, { status: 400 });

  const version = await prisma.contentVersion.create({
    data: {
      name,
      track:    typeof body.track === "string" && body.track.trim() ? body.track.trim() : "COHORT",
      parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
      status:   "DRAFT",
      notes:    typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    },
  });

  // Cloning copies the source's own rows only, not its inherited ones. An
  // inherited piece keeps resolving through the parent chain, so copying it
  // would freeze a value that should still track its source.
  if (typeof body.cloneFrom === "string" && body.cloneFrom) {
    const rows = await prisma.moduleContent.findMany({ where: { versionId: body.cloneFrom } });
    if (rows.length) {
      await prisma.moduleContent.createMany({
        data: rows.map(r => ({
          versionId: version.id, moduleNumber: r.moduleNumber, kind: r.kind,
          data: r.data as object, note: `Copied from another version on ${new Date().toISOString().slice(0, 10)}`,
        })),
      });
    }
  }

  return NextResponse.json(version);
}

export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.track === "string" && body.track.trim()) patch.track = body.track.trim();
  if (typeof body.notes === "string") patch.notes = body.notes.trim() || null;
  if (body.status === "DRAFT" || body.status === "PUBLISHED" || body.status === "ARCHIVED") patch.status = body.status;

  if ("parentId" in body) {
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    if (parentId === id) return NextResponse.json({ error: "A version cannot inherit from itself" }, { status: 400 });
    // Walk up from the proposed parent: if we meet this version, the chain
    // would loop, and a loop here hangs a module page.
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === id) return NextResponse.json({ error: "That would make the versions inherit in a circle" }, { status: 400 });
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const row: { parentId: string | null } | null =
        await prisma.contentVersion.findUnique({ where: { id: cursor }, select: { parentId: true } });
      cursor = row?.parentId ?? null;
    }
    patch.parentId = parentId;
  }

  const updated = await prisma.contentVersion.update({ where: { id }, data: patch });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const v = await prisma.contentVersion.findUnique({
    where: { id },
    include: { cohorts: { select: { name: true } }, children: { select: { name: true } } },
  });
  if (!v) return NextResponse.json({ error: "No such version" }, { status: 404 });
  if (v.cohorts.length) {
    return NextResponse.json({ error: `${v.cohorts.map(c => c.name).join(", ")} ${v.cohorts.length === 1 ? "is" : "are"} running this version. Move them to another one first.` }, { status: 400 });
  }
  if (v.children.length) {
    return NextResponse.json({ error: `${v.children.map(c => c.name).join(", ")} inherits from this version. Re-point it first.` }, { status: 400 });
  }

  await prisma.contentVersion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
