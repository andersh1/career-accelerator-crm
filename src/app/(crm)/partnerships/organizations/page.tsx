"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Building2, Users, Handshake, CalendarDays, X } from "lucide-react";

interface Org {
  id: string; name: string; type: string; website: string | null;
  _count: { contacts: number; deals: number; events: number };
}

const TYPES = [
  { key: "UNIVERSITY", label: "University" },
  { key: "EMPLOYER",   label: "Employer" },
  { key: "RIA",        label: "RIA / wealth" },
  { key: "MEMBERSHIP", label: "Membership org" },
  { key: "AGENCY",     label: "Agency" },
  { key: "OTHER",      label: "Other" },
];
const typeLabel = (k: string) => TYPES.find(t => t.key === k)?.label ?? k;

export default function OrganizationsPage() {
  const router = useRouter();
  const [orgs, setOrgs]       = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [adding, setAdding]   = useState(false);
  const [name, setName]       = useState("");
  const [type, setType]       = useState("OTHER");
  const [err, setErr]         = useState("");
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
    const r = await fetch(`/api/crm/organizations${qs}`);
    setOrgs(r.ok ? await r.json() : []);
    setLoading(false);
  }, [search]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  async function create() {
    setErr(""); setSaving(true);
    try {
      const r = await fetch("/api/crm/organizations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not create");
      setAdding(false); setName(""); setType("OTHER");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not create"); }
    finally { setSaving(false); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Partnerships</p>
          <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>Organizations</h1>
          <p className="text-sm mt-0.5" style={{ color: "#949598" }}>
            One row per institution. Contacts, deals and events all hang off it.
          </p>
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#086c64" }}>
          <Plus size={15} /> New organization
        </button>
      </div>

      {adding && (
        <div className="card shadow-sm p-5 mb-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold" style={{ color: "#14211f" }}>New organization</p>
            <button onClick={() => { setAdding(false); setErr(""); }}><X size={15} style={{ color: "#949598" }} /></button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="3i, PwC, Wake Forest University…"
              className="flex-1 min-w-[220px] px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]" />
            <select value={type} onChange={e => setType(e.target.value)}
              className="px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none">
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button onClick={create} disabled={!name.trim() || saving}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#086c64" }}>
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
          {err && <p className="text-xs font-semibold" style={{ color: "#b45309" }}>{err}</p>}
        </div>
      )}

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search organizations…"
          className="w-full pl-9 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]" />
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Loader2 size={20} className="animate-spin" style={{ color: "#c9c4b8" }} /></div>
      ) : orgs.length === 0 ? (
        <div className="card shadow-sm p-10 text-center">
          <Building2 size={22} className="mx-auto mb-2" style={{ color: "#c9c4b8" }} />
          <p className="text-sm" style={{ color: "#949598" }}>
            {search ? "No organizations match that." : "No organizations yet — add the first one."}
          </p>
        </div>
      ) : (
        <div className="card shadow-sm overflow-hidden">
          {orgs.map((o, i) => (
            <button key={o.id} onClick={() => router.push(`/partnerships/organizations/${o.id}`)}
              className={`w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-[#f8f6f1] transition ${
                i < orgs.length - 1 ? "border-b border-[#e4e0d6]" : ""}`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "#edf5f4", color: "#086c64" }}>
                <Building2 size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{o.name}</p>
                <p className="text-xs" style={{ color: "#949598" }}>{typeLabel(o.type)}</p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 text-xs" style={{ color: "#949598" }}>
                <span className="flex items-center gap-1"><Users size={12} /> {o._count.contacts}</span>
                <span className="flex items-center gap-1"><Handshake size={12} /> {o._count.deals}</span>
                <span className="flex items-center gap-1"><CalendarDays size={12} /> {o._count.events}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
