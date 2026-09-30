import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * One version's module content.
 *
 * GET  every module and kind, saying for each whether THIS version defines it,
 *      an ancestor does, or nothing does and the code is still in charge.
 * PUT  store a piece on this version  { moduleNumber, kind, data }
 * DELETE remove a piece, so it goes back to inheriting  ?moduleNumber=&kind=
 *
 * The three states matter more than they look. "Inherited" and "from code" are
 * both "this version does not define it", but the first means a parent does and
 * the second means editing the TypeScript still works. Showing them the same
 * way is how someone ends up editing a .ts file that nothing reads.
 */
const KINDS = ["worksheets", "overview", "assignment", "survey", "slides"] as const;
type Kind = (typeof KINDS)[number];

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { crmRole?: string } | undefined)?.crmRole;
  return !!session && role === "ADMIN";
}

/** A version and every ancestor, nearest first. Guarded against loops. */
async function chain(versionId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  let cursor: string | null = versionId;
  while (cursor && !seen.has(cursor) && out.length < 20) {
    seen.add(cursor); out.push(cursor);
    const row: { parentId: string | null } | null =
      await prisma.contentVersion.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = row?.parentId ?? null;
  }
  return out;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ids = await chain(params.id);
  if (!ids.length) return NextResponse.json({ error: "No such version" }, { status: 404 });

  // One piece, resolved, so the editor can open an INHERITED piece pre-filled
  // with what it currently resolves to. Editing from blank would mean retyping
  // a module to change one sentence.
  const oneModule = req.nextUrl.searchParams.get("moduleNumber");
  const oneKind   = req.nextUrl.searchParams.get("kind");
  if (oneModule && oneKind) {
    const rows = await prisma.moduleContent.findMany({
      where: { versionId: { in: ids }, moduleNumber: Number(oneModule), kind: oneKind },
      select: { versionId: true, data: true },
    });
    for (let i = 0; i < ids.length; i++) {
      const hit = rows.find(r => r.versionId === ids[i]);
      if (hit) return NextResponse.json({ from: i === 0 ? "own" : "inherited", data: hit.data });
    }
    // Nothing in the chain: the code is still in charge, and the CRM cannot
    // read the LMS's TypeScript. Snapshot a base version first.
    return NextResponse.json({ from: "code", data: null });
  }

  const [rows, versions, modules] = await Promise.all([
    prisma.moduleContent.findMany({
      where: { versionId: { in: ids } },
      select: { id: true, versionId: true, moduleNumber: true, kind: true, updatedAt: true, note: true },
    }),
    prisma.contentVersion.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.module.findMany({ orderBy: { number: "asc" }, select: { number: true, title: true } }),
  ]);
  const nameOf = new Map(versions.map(v => [v.id, v.name]));

  const grid = modules.map(m => ({
    moduleNumber: m.number,
    moduleTitle:  m.title,
    kinds: KINDS.map(kind => {
      for (let i = 0; i < ids.length; i++) {
        const hit = rows.find(r => r.versionId === ids[i] && r.moduleNumber === m.number && r.kind === kind);
        if (hit) {
          return {
            kind,
            from: i === 0 ? "own" : "inherited",
            versionName: nameOf.get(ids[i]) ?? "a version",
            updatedAt: hit.updatedAt,
            note: hit.note,
          };
        }
      }
      return { kind, from: "code" as const };
    }),
  }));

  return NextResponse.json({ versionId: params.id, chain: ids.map(id => ({ id, name: nameOf.get(id) })), grid });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const moduleNumber = Number(body.moduleNumber);
  const kind = String(body.kind) as Kind;
  if (!Number.isInteger(moduleNumber) || moduleNumber < 1 || moduleNumber > 8) {
    return NextResponse.json({ error: "moduleNumber must be 1 to 8" }, { status: 400 });
  }
  if (!KINDS.includes(kind)) return NextResponse.json({ error: `kind must be one of ${KINDS.join(", ")}` }, { status: 400 });
  if (body.data === undefined || body.data === null) return NextResponse.json({ error: "data required" }, { status: 400 });

  const version = await prisma.contentVersion.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!version) return NextResponse.json({ error: "No such version" }, { status: 404 });

  const existing = await prisma.moduleContent.findFirst({
    where: { versionId: params.id, moduleNumber, kind }, select: { id: true },
  });
  const row = existing
    ? await prisma.moduleContent.update({ where: { id: existing.id }, data: { data: body.data, note: body.note ?? null } })
    : await prisma.moduleContent.create({
        data: { versionId: params.id, moduleNumber, kind, data: body.data, note: body.note ?? null },
      });

  return NextResponse.json({ id: row.id, moduleNumber, kind, updatedAt: row.updatedAt });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const moduleNumber = Number(req.nextUrl.searchParams.get("moduleNumber"));
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  if (!Number.isInteger(moduleNumber) || !KINDS.includes(kind as Kind)) {
    return NextResponse.json({ error: "moduleNumber and kind required" }, { status: 400 });
  }

  await prisma.moduleContent.deleteMany({ where: { versionId: params.id, moduleNumber, kind } });
  return NextResponse.json({ ok: true });
}
