"use client";

import { useState, useEffect } from "react";
import { X, Loader2, User, Mail, Phone, Building2, Briefcase, Linkedin, UserCircle2 } from "lucide-react";
import { SOURCES } from "./constants";
import { useToast } from "@/lib/toast";

interface ContactFormData {
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string;
  company:     string;
  jobTitle:    string;
  linkedinUrl: string;
  source:      string;
  notes:       string;
  assignedTo:  string;
}

const EMPTY: ContactFormData = {
  firstName: "", lastName: "", email: "", phone: "",
  company: "", jobTitle: "", linkedinUrl: "", source: "",
  notes: "", assignedTo: "",
};

interface AdminUser { id: string; name: string | null; email: string; }

interface Props {
  onClose: () => void;
  onSaved: (lead: unknown) => void;
}

export default function ContactForm({ onClose, onSaved }: Props) {
  const { success, error: toastError } = useToast();
  const [form, setForm] = useState<ContactFormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    fetch("/api/crm/users").then(r => r.json()).then((d) => {
      if (Array.isArray(d)) setUsers(d);
    }).catch(() => {});
  }, []);

  function set(field: keyof ContactFormData, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/crm/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leadType: "CONTACT",
          stage: "LEAD",
          priority: "NORMAL",
          paymentStatus: "UNPAID",
          dealValue: 0,
          tags: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      success("Contact added!");
      onSaved(data);
      onClose();
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e4e0d6] sticky top-0 bg-white rounded-t-3xl z-10">
          <div>
            <h2 className="text-base font-bold" style={{ color: "#14211f" }}>Add Contact</h2>
            <p className="text-xs mt-0.5" style={{ color: "#949598" }}>
              University reps, firm partners, and other relationship contacts
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#f8f6f1] transition"
            style={{ color: "#949598" }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>First Name *</label>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
                <input
                  required
                  value={form.firstName}
                  onChange={e => set("firstName", e.target.value)}
                  placeholder="Sarah"
                  className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Last Name *</label>
              <input
                required
                value={form.lastName}
                onChange={e => set("lastName", e.target.value)}
                placeholder="Johnson"
                className="w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                style={{ color: "#14211f" }}
              />
            </div>
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Email *</label>
              <div className="relative">
                <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => set("email", e.target.value)}
                  placeholder="sarah@university.edu"
                  className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Phone</label>
              <div className="relative">
                <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => set("phone", e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>
            </div>
          </div>

          {/* Company + Job Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Organization</label>
              <div className="relative">
                <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
                <input
                  value={form.company}
                  onChange={e => set("company", e.target.value)}
                  placeholder="Northwestern University"
                  className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Job Title</label>
              <div className="relative">
                <Briefcase size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
                <input
                  value={form.jobTitle}
                  onChange={e => set("jobTitle", e.target.value)}
                  placeholder="Dir. of Student Programs"
                  className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                />
              </div>
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>LinkedIn URL</label>
            <div className="relative">
              <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
              <input
                value={form.linkedinUrl}
                onChange={e => set("linkedinUrl", e.target.value)}
                placeholder="https://linkedin.com/in/sarahjohnson"
                className="w-full pl-8 pr-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                style={{ color: "#14211f" }}
              />
            </div>
          </div>

          {/* Source + Assigned To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>How you met</label>
              <select
                value={form.source}
                onChange={e => set("source", e.target.value)}
                className="w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                style={{ color: form.source ? "#14211f" : "#c9c4b8" }}
              >
                <option value="">— Select —</option>
                {SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {users.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>
                  <span className="inline-flex items-center gap-1"><UserCircle2 size={11} /> Owner</span>
                </label>
                <select
                  value={form.assignedTo}
                  onChange={e => set("assignedTo", e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
                  style={{ color: "#14211f" }}
                >
                  <option value="">— Unassigned —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.email}>{u.name ?? u.email}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#949598" }}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              rows={3}
              placeholder="How you know them, context for the relationship…"
              className="w-full px-3 py-2.5 border border-[#e4e0d6] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#086c64]/40 resize-none"
              style={{ color: "#14211f" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition disabled:opacity-50"
              style={{ background: "#086c64" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? "Saving…" : "Add Contact"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold border border-[#e4e0d6] rounded-xl hover:bg-[#f8f6f1] transition"
              style={{ color: "#5a6663" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
