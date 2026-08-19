"use client";

import { useState, useEffect } from "react";
import { X, Loader2, User, Mail, Phone, Building2, Briefcase, Linkedin, Tag, DollarSign, UserCircle2 } from "lucide-react";
import { STAGES, SOURCES, PRIORITIES, LEAD_TYPES } from "./constants";
import { useToast } from "@/lib/toast";

export interface LeadFormData {
  firstName:     string;
  lastName:      string;
  email:         string;
  phone:         string;
  company:       string;
  jobTitle:      string;
  linkedinUrl:   string;
  stage:         string;
  source:        string;
  leadType:      string;
  priority:      string;
  paymentStatus: string;
  dealValue:     string;
  assignedTo:    string;
  tags:          string;
  notes:         string;
}

const PAYMENT_OPTIONS = [
  { key: "UNPAID",       label: "Unpaid"       },
  { key: "PAID_FULL",    label: "Paid in Full" },
  { key: "PAYMENT_PLAN", label: "Payment Plan" },
  { key: "SCHOLARSHIP",  label: "Scholarship"  },
  { key: "OUTSTANDING",  label: "Outstanding"  },
];

const EMPTY: LeadFormData = {
  firstName: "", lastName: "", email: "", phone: "", company: "",
  jobTitle: "", linkedinUrl: "", stage: "LEAD", source: "", leadType: "WAITLIST",
  priority: "NORMAL", paymentStatus: "UNPAID", dealValue: "", assignedTo: "", tags: "", notes: "",
};

interface Props {
  onClose:  () => void;
  onSaved:  (lead: unknown) => void;
  initial?: Partial<LeadFormData>;
  editId?:  string;
}

interface AdminUser { id: string; name: string | null; email: string; }

export default function LeadForm({ onClose, onSaved, initial, editId }: Props) {
  const { success, error: toastError } = useToast();
  const [form, setForm] = useState<LeadFormData>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    fetch("/api/crm/users").then(r => r.json()).then((d) => {
      if (Array.isArray(d)) setUsers(d);
    }).catch(() => {});
  }, []);

  function set(field: keyof LeadFormData, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        dealValue: form.dealValue ? parseInt(form.dealValue, 10) : 0,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
      };
      const res = await fetch(
        editId ? `/api/crm/leads/${editId}` : "/api/crm/leads",
        {
          method:  editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      success(editId ? "Lead updated." : "Lead added to pipeline!");
      onSaved(data);
      onClose();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "Failed to save lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {editId ? "Edit Lead" : "Add New Lead"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">First Name *</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.firstName} onChange={e => set("firstName", e.target.value)}
                  required placeholder="Jane"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Last Name *</label>
              <input value={form.lastName} onChange={e => set("lastName", e.target.value)}
                required placeholder="Smith"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email *</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                  required placeholder="jane@example.com"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Company</label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.company} onChange={e => set("company", e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Job Title</label>
              <div className="relative">
                <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={form.jobTitle} onChange={e => set("jobTitle", e.target.value)}
                  placeholder="VP of Product"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">LinkedIn URL</label>
            <div className="relative">
              <Linkedin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={form.linkedinUrl} onChange={e => set("linkedinUrl", e.target.value)}
                placeholder="https://linkedin.com/in/janesmith"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Stage</label>
              <select value={form.stage} onChange={e => set("stage", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                {STAGES.filter(s => s.key !== "LOST").map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Contact Type</label>
              <select value={form.leadType} onChange={e => set("leadType", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                {LEAD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                <option value="">— Unknown —</option>
                {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Status</label>
              <select value={form.paymentStatus} onChange={e => set("paymentStatus", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                {PAYMENT_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Deal Value ($)</label>
              <div className="relative">
                <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="number" min="0" value={form.dealValue} onChange={e => set("dealValue", e.target.value)}
                  placeholder="3500"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
              </div>
            </div>
          </div>

          {users.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                <span className="inline-flex items-center gap-1"><UserCircle2 size={12} className="text-slate-400" /> Assigned To</span>
              </label>
              <select value={form.assignedTo} onChange={e => set("assignedTo", e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                <option value="">— Unassigned —</option>
                {users.map(u => (
                  <option key={u.id} value={u.email}>{u.name ?? u.email}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 mb-1">
              <Tag size={12} className="text-slate-400" /> Tags
              <span className="font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input value={form.tags} onChange={e => set("tags", e.target.value)}
              placeholder="cohort-7, vp-level, warm"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
              rows={3} placeholder="Any context about this lead…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none leading-relaxed" />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Saving…" : editId ? "Save Changes" : "Add Lead"}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
