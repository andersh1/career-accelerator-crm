"use client";

import { useEffect, useState } from "react";
import { Plus, Tag, Trash2, ToggleLeft, ToggleRight, Loader2, Copy, CheckCheck, Percent, Users, Calendar } from "lucide-react";
import { useToast } from "@/lib/toast";

interface PromoCode {
  id: string;
  code: string;
  label: string | null;
  discountPct: number | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function PromoCodesPage() {
  const { success, error: toastError } = useToast();
  const [codes, setCodes]         = useState<PromoCode[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const [form, setForm] = useState({
    code: "", label: "", discountPct: "", maxUses: "", expiresAt: "",
  });

  async function load() {
    const res = await fetch("/api/crm/promo-codes");
    if (res.ok) setCodes(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/crm/promo-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code:        form.code,
        label:       form.label || null,
        discountPct: form.discountPct ? Number(form.discountPct) : null,
        maxUses:     form.maxUses ? Number(form.maxUses) : null,
        expiresAt:   form.expiresAt || null,
      }),
    });
    if (res.ok) {
      success("Promo code created");
      setForm({ code: "", label: "", discountPct: "", maxUses: "", expiresAt: "" });
      setShowForm(false);
      await load();
    } else {
      const { error } = await res.json();
      toastError(error ?? "Failed to create code");
    }
    setSaving(false);
  }

  async function toggle(id: string, active: boolean) {
    const res = await fetch(`/api/crm/promo-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) {
      setCodes(c => c.map(p => p.id === id ? { ...p, active: !active } : p));
    }
  }

  async function del(id: string, code: string) {
    if (!confirm(`Delete code "${code}"? This cannot be undone.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/crm/promo-codes/${id}`, { method: "DELETE" });
    if (res.ok) {
      setCodes(c => c.filter(p => p.id !== id));
      success("Code deleted");
    } else {
      toastError("Failed to delete");
    }
    setDeleting(null);
  }

  function copyLink(code: string) {
    const url = `https://lms.vantagecareer.co/?promo=${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#14211f" }}>Promo Codes</h1>
          <p className="text-sm mt-0.5" style={{ color: "#8a938f" }}>
            Create codes for discounts, partner access, or campaign tracking.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#0a6b64" }}
        >
          <Plus size={15} />
          New code
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={create} className="mb-6 rounded-2xl border p-5 space-y-4" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-sm font-semibold" style={{ color: "#14211f" }}>New Promo Code</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Code *</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, "") }))}
                placeholder="EARLYBIRD"
                className="w-full px-3 py-2 rounded-xl border text-sm font-mono"
                style={{ borderColor: "#e4e0d6" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Label (internal)</label>
              <input
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="25% off for NextGen members"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ borderColor: "#e4e0d6" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Discount % (optional)</label>
              <input
                type="number" min="0" max="100"
                value={form.discountPct}
                onChange={e => setForm(f => ({ ...f, discountPct: e.target.value }))}
                placeholder="25"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ borderColor: "#e4e0d6" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Max uses (blank = unlimited)</label>
              <input
                type="number" min="1"
                value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                placeholder="50"
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ borderColor: "#e4e0d6" }}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Expires (optional)</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border text-sm"
                style={{ borderColor: "#e4e0d6" }}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "#0a6b64", opacity: saving ? 0.6 : 1 }}
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Create code
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border"
              style={{ borderColor: "#e4e0d6", color: "#5a6663" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: "#0a6b64" }} />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ borderColor: "#e4e0d6", color: "#8a938f" }}>
          <Tag size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No promo codes yet</p>
          <p className="text-sm mt-1">Create your first code above.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8f6f1", borderBottom: "1px solid #e4e0d6" }}>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#8a938f" }}>Code</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#8a938f" }}>Label</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#8a938f" }}>Discount</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#8a938f" }}>Uses</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#8a938f" }}>Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => {
                const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
                const maxed   = c.maxUses != null && c.usedCount >= c.maxUses;
                return (
                  <tr key={c.id} style={{ background: i % 2 === 0 ? "#fff" : "#faf9f6", borderBottom: i < codes.length - 1 ? "1px solid #f0ede7" : "none" }}>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-[13px]" style={{ color: "#0a6b64" }}>{c.code}</span>
                    </td>
                    <td className="px-4 py-3 text-xs hidden sm:table-cell" style={{ color: "#5a6663" }}>{c.label ?? "—"}</td>
                    <td className="px-4 py-3">
                      {c.discountPct != null
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Percent size={10} />{c.discountPct}% off</span>
                        : <span className="text-xs" style={{ color: "#8a938f" }}>Tracking only</span>}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs" style={{ color: maxed ? "#dc2626" : "#5a6663" }}>
                        {c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}
                        {maxed && <span className="ml-1 text-red-600 font-semibold">(maxed)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Badge active={c.active && !expired && !maxed} />
                        {expired && <span className="text-[10px] text-red-500 font-medium">Expired</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          title="Copy landing page link"
                          onClick={() => copyLink(c.code)}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium"
                          style={{ color: copied === c.code ? "#0a6b64" : "#8a938f" }}
                        >
                          {copied === c.code ? <CheckCheck size={13} /> : <Copy size={13} />}
                          <span>{copied === c.code ? "Copied" : "Copy link"}</span>
                        </button>
                        <button
                          title={c.active ? "Deactivate" : "Activate"}
                          onClick={() => toggle(c.id, c.active)}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-xs font-medium"
                          style={{ color: c.active ? "#0a6b64" : "#8a938f" }}
                        >
                          {c.active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                          <span>{c.active ? "Active" : "Inactive"}</span>
                        </button>
                        <button
                          title="Delete"
                          onClick={() => del(c.id, c.code)}
                          disabled={deleting === c.id}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors text-xs font-medium"
                          style={{ color: "#dc2626" }}
                        >
                          {deleting === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "#8a938f" }}>
        Copy link button copies the landing page URL with the code pre-applied (e.g. <code className="font-mono bg-slate-100 px-1 rounded">?promo=CODE</code>).
      </p>
    </div>
  );
}
