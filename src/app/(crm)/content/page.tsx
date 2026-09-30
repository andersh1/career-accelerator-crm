"use client";

/**
 * Content versions — the packages a cohort enrols into.
 *
 * The model this page exists to make usable: a version is a named package of
 * module content, MANY cohorts share one, and launching a cohort means picking
 * one. A cohort already running keeps the version it started on however much
 * the next one is rewritten. That is the whole point — content stops being
 * "whatever was last deployed".
 *
 * Paths (private, university, an age-specific variant) are CHILD versions
 * rather than parallel copies. A child stores only the modules that genuinely
 * differ and inherits the rest, so a new path is a handful of rows and not
 * eight modules restated.
 *
 * Three states per module piece, shown differently on purpose:
 *   This version   — stored here, edit it here
 *   Inherited      — a parent defines it; editing here forks it
 *   From code      — nothing in the chain defines it, so the TypeScript in the
 *                    LMS is still authoritative and editing that file works
 *
 * Collapsing those last two would be the expensive mistake: someone edits a
 * .ts file that nothing reads and has no way to find out.
 */

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Layers, Plus, Loader2, Trash2, ChevronDown, ChevronUp, Save, X,
  GitBranch, AlertTriangle, Users,
} from "lucide-react";

interface Version {
  id: string; name: string; track: string; status: string; notes: string | null;
  parentId: string | null; parentName: string | null;
  cohorts: { id: string; name: string }[];
  modulesDefined: number[];
  pieceCount: number;
  updatedAt: string;
}
interface PieceState { kind: string; from: "own" | "inherited" | "code"; versionName?: string; updatedAt?: string }
interface GridRow { moduleNumber: number; moduleTitle: string; kinds: PieceState[] }

const KIND_LABELS: Record<string, string> = {
  worksheets: "Pre-work worksheets",
  overview:   "Module overview",
  assignment: "Assignment",
  survey:     "Survey",
  slides:     "Workshop slides",
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  DRAFT:     { bg: "#fdf0e3", fg: "#b45309" },
  PUBLISHED: { bg: "#e6f4f1", fg: "#086c64" },
  ARCHIVED:  { bg: "#f1efe8", fg: "#949598" },
};

export default function ContentVersionsPage() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [grid, setGrid] = useState<GridRow[] | null>(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newV, setNewV] = useState({ name: "", track: "COHORT", parentId: "", cloneFrom: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // The piece editor. JSON on purpose for now: it is the honest shape of what
  // is stored, and a wrong guess at a structured form would silently drop
  // fields the LMS relies on.
  const [editing, setEditing] = useState<{ moduleNumber: number; kind: string } | null>(null);
  const [editText, setEditText] = useState("");
  const [editFrom, setEditFrom] = useState<string>("");
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/crm/content-versions");
    setVersions(res.ok ? await res.json() : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadGrid = useCallback(async (id: string) => {
    setGridLoading(true);
    try {
      const res = await fetch(`/api/crm/content-versions/${id}/modules`);
      setGrid(res.ok ? (await res.json()).grid : null);
    } finally { setGridLoading(false); }
  }, []);

  useEffect(() => { if (expanded) loadGrid(expanded); else setGrid(null); }, [expanded, loadGrid]);

  async function create() {
    if (!newV.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/crm/content-versions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newV.name, track: newV.track,
          parentId: newV.parentId || null, cloneFrom: newV.cloneFrom || null,
          notes: newV.notes,
        }),
      });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Could not create it."); return; }
      setCreating(false);
      setNewV({ name: "", track: "COHORT", parentId: "", cloneFrom: "", notes: "" });
      await load();
    } finally { setSaving(false); }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/crm/content-versions", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "That did not save."); return; }
    await load();
  }

  async function remove(v: Version) {
    if (!confirm(`Delete "${v.name}"? Its ${v.pieceCount} stored piece(s) go with it.`)) return;
    const res = await fetch(`/api/crm/content-versions?id=${encodeURIComponent(v.id)}`, { method: "DELETE" });
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? "Could not delete it."); return; }
    if (expanded === v.id) setExpanded(null);
    await load();
  }

  async function openPiece(versionId: string, moduleNumber: number, kind: string) {
    setEditing({ moduleNumber, kind });
    setEditError(""); setEditText(""); setEditFrom("");
    const res = await fetch(`/api/crm/content-versions/${versionId}/modules?moduleNumber=${moduleNumber}&kind=${kind}`);
    if (!res.ok) { setEditError("Could not load that piece."); return; }
    const { from, data } = await res.json();
    setEditFrom(from);
    setEditText(data === null ? "" : JSON.stringify(data, null, 2));
  }

  async function savePiece(versionId: string) {
    if (!editing) return;
    let parsed: unknown;
    try { parsed = JSON.parse(editText); }
    catch (e) { setEditError(`That is not valid JSON: ${e instanceof Error ? e.message : "parse error"}`); return; }
    setEditSaving(true); setEditError("");
    try {
      const res = await fetch(`/api/crm/content-versions/${versionId}/modules`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editing, data: parsed }),
      });
      if (!res.ok) { setEditError((await res.json().catch(() => ({}))).error ?? "That did not save."); return; }
      setEditing(null);
      await Promise.all([loadGrid(versionId), load()]);
    } finally { setEditSaving(false); }
  }

  async function revertPiece(versionId: string, moduleNumber: number, kind: string) {
    if (!confirm(`Stop overriding ${KIND_LABELS[kind]} for Module ${moduleNumber} in this version?\n\nIt will go back to whatever it inherits, or to the code.`)) return;
    await fetch(`/api/crm/content-versions/${versionId}/modules?moduleNumber=${moduleNumber}&kind=${kind}`, { method: "DELETE" });
    await Promise.all([loadGrid(versionId), load()]);
  }

  const tracks = Array.from(new Set([...(versions ?? []).map(v => v.track), "COHORT", "PRIVATE", "UNIVERSITY"]));

  return (
    <AppShell>
      <div className="p-5 sm:p-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h1 className="font-display font-semibold flex items-center gap-2" style={{ fontSize: "1.6rem", color: "#14211f" }}>
              <Layers size={20} style={{ color: "#086c64" }} /> Content versions
            </h1>
            <p className="text-sm mt-1" style={{ color: "#5a6663" }}>
              A version is a package of module content. Cohorts enrol into one, and many cohorts can share it.
              A cohort keeps the version it started on, so rewriting the next one never changes what a group
              part-way through is reading.
            </p>
          </div>
          <button onClick={() => setCreating(c => !c)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white flex-shrink-0"
            style={{ background: "#086c64" }}>
            <Plus size={13} /> New version
          </button>
        </div>

        {versions?.length === 0 && !creating && (
          <div className="rounded-2xl border p-4 mt-5 text-sm" style={{ borderColor: "#e4e0d6", background: "#faf9f5", color: "#5a6663" }}>
            <p className="font-semibold mb-1" style={{ color: "#14211f" }}>No versions yet, and nothing is broken.</p>
            <p>
              Every cohort is reading the module content straight from the code, exactly as it always has.
              Make the first version by snapshotting what is shipping today, from the LMS project:
            </p>
            <p className="font-mono text-xs mt-2 p-2 rounded-lg" style={{ background: "#f1efe8" }}>
              npx tsx scripts/snapshot-content-version.ts --name &quot;Core v1&quot; --apply
            </p>
            <p className="mt-2">
              That copies all eight modules in and checks every piece reads back unchanged. Then publish it here
              and pick it when you launch a cohort.
            </p>
          </div>
        )}

        {creating && (
          <div className="rounded-2xl border p-4 mt-5 space-y-3" style={{ borderColor: "#e4e0d6", background: "white" }}>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Name</span>
                <input value={newV.name} onChange={e => setNewV(v => ({ ...v, name: e.target.value }))}
                  placeholder="Core v2, Spring 2027, Private 1:1…"
                  className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Path</span>
                <input list="tracks" value={newV.track} onChange={e => setNewV(v => ({ ...v, track: e.target.value.toUpperCase() }))}
                  className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }} />
                <datalist id="tracks">{tracks.map(t => <option key={t} value={t} />)}</datalist>
                <span className="text-[9px]" style={{ color: "#949598" }}>Free text. Add UNIVERSITY or anything else without a migration.</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Inherits from</span>
                <select value={newV.parentId} onChange={e => setNewV(v => ({ ...v, parentId: e.target.value }))}
                  className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }}>
                  <option value="">Nothing — a root version</option>
                  {versions?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <span className="text-[9px]" style={{ color: "#949598" }}>
                  Store only what differs. Everything else resolves up the chain, so fixing a typo in the parent fixes it here too.
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold" style={{ color: "#949598" }}>Or copy everything from</span>
                <select value={newV.cloneFrom} onChange={e => setNewV(v => ({ ...v, cloneFrom: e.target.value }))}
                  className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }}>
                  <option value="">Nothing</option>
                  {versions?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <span className="text-[9px]" style={{ color: "#949598" }}>
                  A real copy, for a rewrite that should not touch the original. Inheriting is usually what you want.
                </span>
              </label>
            </div>
            <div className="flex gap-2">
              <button onClick={create} disabled={saving || !newV.name.trim()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: "#086c64" }}>
                {saving ? "Creating…" : "Create as draft"}
              </button>
              <button onClick={() => setCreating(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#f1efe8", color: "#5a6663" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3 mt-5">
          {versions?.map(v => {
            const isOpen = expanded === v.id;
            const st = STATUS_STYLE[v.status] ?? STATUS_STYLE.DRAFT;
            return (
              <div key={v.id} className="rounded-2xl border" style={{ borderColor: "#e4e0d6", background: "white" }}>
                <div className="flex items-center justify-between gap-3 p-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: "#14211f" }}>{v.name}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: st.bg, color: st.fg }}>{v.status}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                        style={{ background: "#f1efe8", color: "#5a6663" }}>{v.track}</span>
                      {v.parentName && (
                        <span className="text-[10px] flex items-center gap-1" style={{ color: "#949598" }}>
                          <GitBranch size={10} /> inherits {v.parentName}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#949598" }}>
                      {v.pieceCount === 0
                        ? "Defines nothing of its own yet"
                        : `Defines ${v.pieceCount} piece(s) across module${v.modulesDefined.length === 1 ? "" : "s"} ${v.modulesDefined.join(", ")}`}
                      {v.cohorts.length > 0 && (
                        <>
                          {" · "}
                          <span style={{ color: "#086c64" }}>
                            <Users size={10} className="inline mb-0.5" /> {v.cohorts.map(c => c.name).join(", ")}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select value={v.status} onChange={e => patch(v.id, { status: e.target.value })}
                      className="text-xs border rounded-lg px-2 py-1.5" style={{ borderColor: "#e4e0d6", color: "#14211f" }}>
                      <option value="DRAFT">Draft</option>
                      <option value="PUBLISHED">Published</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                    <button onClick={() => setExpanded(isOpen ? null : v.id)} className="p-1.5 rounded-lg" style={{ color: "#949598" }}>
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button onClick={() => remove(v)} className="p-1.5 rounded-lg" style={{ color: "#c0622f" }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t px-4 py-3" style={{ borderColor: "#e4e0d6", background: "#faf9f5" }}>
                    {v.cohorts.length > 0 && v.status !== "PUBLISHED" && (
                      <p className="text-xs mb-3 flex items-start gap-1.5 rounded-lg p-2"
                        style={{ background: "#fdf0e3", color: "#b45309" }}>
                        <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                        {v.cohorts.map(c => c.name).join(", ")} {v.cohorts.length === 1 ? "is" : "are"} running this version
                        while it is a {v.status.toLowerCase()}. Edits here reach them straight away.
                      </p>
                    )}
                    {gridLoading && <p className="text-xs" style={{ color: "#949598" }}>Loading…</p>}
                    {grid?.map(row => (
                      <div key={row.moduleNumber} className="py-2 border-b last:border-b-0" style={{ borderColor: "#e4e0d6" }}>
                        <p className="text-xs font-semibold mb-1.5" style={{ color: "#14211f" }}>
                          M{row.moduleNumber} — {row.moduleTitle}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {row.kinds.map(k => {
                            const isEditing = editing?.moduleNumber === row.moduleNumber && editing?.kind === k.kind;
                            const style = k.from === "own"
                              ? { background: "#e6f4f1", color: "#086c64", borderColor: "#086c64" }
                              : k.from === "inherited"
                                ? { background: "white", color: "#5a6663", borderColor: "#e4e0d6" }
                                : { background: "#f1efe8", color: "#949598", borderColor: "#e4e0d6" };
                            return (
                              <button key={k.kind}
                                onClick={() => isEditing ? setEditing(null) : openPiece(v.id, row.moduleNumber, k.kind)}
                                className="text-[10px] font-semibold px-2 py-1 rounded-lg border transition text-left"
                                style={style}
                                title={k.from === "own" ? "Stored on this version" : k.from === "inherited" ? `Inherited from ${k.versionName}` : "Nothing in this chain defines it — the LMS code is still in charge"}>
                                {KIND_LABELS[k.kind] ?? k.kind}
                                <span className="block font-normal opacity-70">
                                  {k.from === "own" ? "this version" : k.from === "inherited" ? `from ${k.versionName}` : "from code"}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {editing?.moduleNumber === row.moduleNumber && (
                          <div className="mt-2 rounded-xl border p-3" style={{ borderColor: "#e4e0d6", background: "white" }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold" style={{ color: "#14211f" }}>
                                M{row.moduleNumber} · {KIND_LABELS[editing.kind] ?? editing.kind}
                              </span>
                              <button onClick={() => setEditing(null)} style={{ color: "#949598" }}><X size={14} /></button>
                            </div>

                            {editFrom === "inherited" && (
                              <p className="text-[10px] mb-2 rounded-lg p-2" style={{ background: "#fdf0e3", color: "#b45309" }}>
                                This is inherited. Saving forks it onto <strong>{v.name}</strong>, and it will stop
                                following the version it came from.
                              </p>
                            )}
                            {editFrom === "code" && (
                              <p className="text-[10px] mb-2 rounded-lg p-2" style={{ background: "#fdf0e3", color: "#b45309" }}>
                                Nothing in this chain defines this, so the LMS TypeScript is still in charge and
                                this box is empty. Snapshot a base version first rather than retyping a module here.
                              </p>
                            )}

                            <textarea
                              value={editText} onChange={e => setEditText(e.target.value)}
                              rows={14} spellCheck={false}
                              className="w-full text-[11px] border rounded-lg px-2 py-1.5 font-mono"
                              style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                            />
                            {editError && <p className="text-[10px] mt-1" style={{ color: "#c0622f" }}>{editError}</p>}
                            <div className="flex items-center gap-2 mt-2">
                              <button onClick={() => savePiece(v.id)} disabled={editSaving || !editText.trim()}
                                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                                style={{ background: "#086c64" }}>
                                {editSaving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Save to {v.name}
                              </button>
                              {row.kinds.find(k => k.kind === editing.kind)?.from === "own" && (
                                <button onClick={() => { setEditing(null); revertPiece(v.id, row.moduleNumber, editing.kind); }}
                                  className="text-xs px-3 py-1.5 rounded-lg" style={{ background: "#f1efe8", color: "#5a6663" }}>
                                  Stop overriding
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
