"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Building2, Users, Handshake, CalendarDays, Tag, ExternalLink } from "lucide-react";
import { contactLabel } from "@/components/crm/constants";

interface Org {
  id: string; name: string; type: string; website: string | null; notes: string | null;
  contacts: { id: string; firstName: string; lastName: string; email: string; jobTitle: string | null; tags: string[] }[];
  deals: { id: string; title: string; status: string; dealType: string; seats: number | null; totalValue: number | null; startDate: string | null }[];
  events: { id: string; title: string; slug: string; startsAt: string; location: string | null }[];
  promoCodes: { id: string; code: string; discountPct: number | null; usedCount: number; active: boolean }[];
}

const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: "#e4e0d6" }}>
        <span style={{ color: "#086c64" }}>{icon}</span>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#5a6663" }}>{title}</p>
        <span className="text-[11px] font-semibold px-1.5 rounded-full" style={{ background: "#f1efe8", color: "#949598" }}>{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function OrganizationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/crm/organizations/${id}`).then(r => r.ok ? r.json() : null).then(d => { setOrg(d); setLoading(false); });
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={22} className="animate-spin" style={{ color: "#c9c4b8" }} /></div>;
  if (!org) return <div className="p-6 max-w-3xl mx-auto"><p className="text-sm" style={{ color: "#949598" }}>Organization not found.</p></div>;

  return (
    <div className="p-6 max-w-4xl mx-auto animate-fade-up space-y-5">
      <button onClick={() => router.push("/partnerships/organizations")}
        className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "#086c64" }}>
        <ArrowLeft size={15} /> Organizations
      </button>

      <div className="card shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "#edf5f4", color: "#086c64" }}>
            <Building2 size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>{org.name}</h1>
            <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{org.type.toLowerCase()}</p>
            {org.website && (
              <a href={org.website} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-xs mt-1.5" style={{ color: "#086c64" }}>
                {org.website} <ExternalLink size={10} />
              </a>
            )}
            {org.notes && <p className="text-sm mt-3 leading-relaxed" style={{ color: "#5a6663" }}>{org.notes}</p>}
          </div>
        </div>
      </div>

      <Section icon={<Users size={14} />} title="Contacts" count={org.contacts.length}>
        {org.contacts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "#c9c4b8" }}>
            Nobody filed here yet. On a contact, set their organization to {org.name}.
          </p>
        ) : org.contacts.map((c, i) => (
          <Link key={c.id} href={`/leads/${c.id}`}
            className={`flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6f1] transition ${i < org.contacts.length - 1 ? "border-b border-[#e4e0d6]" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{c.firstName} {c.lastName}</p>
              <p className="text-xs truncate" style={{ color: "#949598" }}>{c.jobTitle ? `${c.jobTitle} · ` : ""}{c.email}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {(c.tags ?? []).map(t => {
                const l = contactLabel(t);
                return <span key={t} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${l.color}`}>{l.label}</span>;
              })}
            </div>
          </Link>
        ))}
      </Section>

      <Section icon={<Handshake size={14} />} title="Deals" count={org.deals.length}>
        {org.deals.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "#c9c4b8" }}>
            No deals yet. A deal can be seats, a partnership, or simply an event.
          </p>
        ) : org.deals.map((d, i) => (
          <Link key={d.id} href={`/partnerships/deals`}
            className={`flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6f1] transition ${i < org.deals.length - 1 ? "border-b border-[#e4e0d6]" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{d.title}</p>
              <p className="text-xs" style={{ color: "#949598" }}>
                {d.status.replace(/_/g, " ").toLowerCase()}
                {d.seats ? ` · ${d.seats} seats` : ""}
                {d.totalValue ? ` · $${d.totalValue.toLocaleString()}` : ""}
              </p>
            </div>
          </Link>
        ))}
      </Section>

      <Section icon={<CalendarDays size={14} />} title="Events" count={org.events.length}>
        {org.events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-center" style={{ color: "#c9c4b8" }}>No events with {org.name} yet.</p>
        ) : org.events.map((e, i) => (
          <Link key={e.id} href={`/events`}
            className={`flex items-center gap-3 px-5 py-3 hover:bg-[#f8f6f1] transition ${i < org.events.length - 1 ? "border-b border-[#e4e0d6]" : ""}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "#14211f" }}>{e.title}</p>
              <p className="text-xs" style={{ color: "#949598" }}>{fmt(e.startsAt)}{e.location ? ` · ${e.location}` : ""}</p>
            </div>
          </Link>
        ))}
      </Section>

      {org.promoCodes.length > 0 && (
        <Section icon={<Tag size={14} />} title="Promo codes" count={org.promoCodes.length}>
          {org.promoCodes.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 px-5 py-3 ${i < org.promoCodes.length - 1 ? "border-b border-[#e4e0d6]" : ""}`}>
              <code className="text-sm font-semibold" style={{ color: "#14211f" }}>{c.code}</code>
              <span className="text-xs" style={{ color: "#949598" }}>
                {c.discountPct ? `${c.discountPct}% off` : "tracking only"} · used {c.usedCount}
              </span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
