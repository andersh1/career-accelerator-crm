"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Building2, Mail, Phone, UserRound } from "lucide-react";
import ContactForm from "@/components/crm/ContactForm";

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  source: string | null;
  assignedTo: string | null;
  createdAt: string;
  _count: { activities: number };
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ leadType: "CONTACT", all: "true" });
    if (search.trim()) qs.set("q", search.trim());
    const res = await fetch(`/api/crm/leads?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setContacts(Array.isArray(data) ? data : (data.leads ?? []));
    }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Background refresh every 30s
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    function start() { if (!timer) timer = setInterval(load, 30_000); }
    function stop()  { if (timer) { clearInterval(timer); timer = null; } }
    function onVisibility() { document.hidden ? stop() : start(); }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load]);

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Partnerships</p>
          <h1 className="text-xl sm:text-2xl font-display font-semibold flex items-center gap-2" style={{ color: "#14211f" }}>
            <UserRound size={22} style={{ color: "#086c64" }} /> Contacts
          </h1>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "#949598" }}>
            University reps, firm partners, and relationship contacts — not in the lead pipeline
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm flex-shrink-0"
          style={{ background: "#086c64" }}
        >
          <Plus size={15} /> Add Contact
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#c9c4b8" }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or organization…"
          className="w-full pl-9 pr-4 py-2.5 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#086c64]/40"
          style={{ color: "#14211f" }}
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin" style={{ color: "#c9c4b8" }} />
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-24">
          <UserRound size={40} className="mx-auto mb-3" style={{ color: "#e4e0d6" }} />
          <p className="text-sm font-semibold mb-1" style={{ color: "#949598" }}>
            {search ? "No contacts match your search" : "No contacts yet"}
          </p>
          <p className="text-xs" style={{ color: "#c9c4b8" }}>
            {search ? "Try a different name or email" : "Add a university rep, firm partner, or other relationship contact"}
          </p>
          {!search && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-sm font-semibold px-4 py-2 rounded-xl text-white transition"
              style={{ background: "#086c64" }}
            >
              Add your first contact
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-[#e4e0d6] rounded-3xl overflow-hidden">
          {contacts.map((c, i) => (
            <button
              key={c.id}
              onClick={() => router.push(`/leads/${c.id}`)}
              className={`w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-[#f8f6f1] transition ${
                i < contacts.length - 1 ? "border-b border-[#e4e0d6]" : ""
              }`}
            >
              {/* Avatar */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
                style={{ background: "#edf5f4", color: "#086c64" }}
              >
                {c.firstName[0]}{c.lastName[0]}
              </div>

              {/* Name + org */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "#14211f" }}>
                  {c.firstName} {c.lastName}
                </p>
                {(c.jobTitle || c.company) && (
                  <p className="text-xs truncate flex items-center gap-1 mt-0.5" style={{ color: "#949598" }}>
                    {c.jobTitle && <span>{c.jobTitle}</span>}
                    {c.jobTitle && c.company && <span>·</span>}
                    {c.company && (
                      <span className="flex items-center gap-0.5">
                        <Building2 size={10} /> {c.company}
                      </span>
                    )}
                  </p>
                )}
              </div>

              {/* Contact info */}
              <div className="hidden sm:flex flex-col items-end gap-1 flex-shrink-0">
                <p className="text-xs flex items-center gap-1" style={{ color: "#5a6663" }}>
                  <Mail size={11} /> {c.email}
                </p>
                {c.phone && (
                  <p className="text-xs flex items-center gap-1" style={{ color: "#949598" }}>
                    <Phone size={11} /> {c.phone}
                  </p>
                )}
              </div>

              {/* Activity count */}
              {c._count.activities > 0 && (
                <div className="hidden md:flex flex-col items-end flex-shrink-0 ml-4">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#f8f6f1", color: "#949598" }}>
                    {c._count.activities} activit{c._count.activities !== 1 ? "ies" : "y"}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <ContactForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}
