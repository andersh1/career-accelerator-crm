"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Video, MapPin, Check, Copy, ExternalLink, PartyPopper, QrCode } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/lib/toast";

const TIMEZONES = [
  { value: "America/New_York",    label: "Eastern (ET)"  },
  { value: "America/Chicago",     label: "Central (CT)"  },
  { value: "America/Denver",      label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)"  },
  { value: "UTC",                 label: "UTC"           },
];

export default function NewEventPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: string; slug: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const [form, setForm] = useState({
    title: "", slug: "", description: "",
    eventType: "IN_PERSON",
    speakerName: "", speakerBio: "", speakerTitle: "", speakerImageUrl: "",
    location: "", venueAddress: "", meetingUrl: "",
    startsAt: "", endsAt: "",
    timezone: "America/New_York",
    maxCapacity: "",
    visibility: "PUBLIC",
    confirmationMessage: "",
  });

  function set(key: string, val: string) {
    setForm(f => {
      const next: Record<string, string> = { ...f, [key]: val };
      if (key === "title" && !f.slug) {
        next.slug = val.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 60);
      }
      return next as typeof form;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/crm/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
      }),
    });
    if (res.ok) {
      const event = await res.json();
      setCreated({ id: event.id, slug: event.slug, title: event.title });
    } else {
      const d = await res.json().catch(() => ({}));
      toastError(d.error ?? "Failed to create event");
    }
    setSaving(false);
  }

  if (created) {
    const publicUrl = `https://crm.vantagecareer.co/public/events/${created.slug}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}&margin=10`;
    const copyUrl = () => {
      navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    };
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#edf5f4" }}>
          <PartyPopper size={28} style={{ color: "#086c64" }} />
        </div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#14211f" }}>Your event page is live!</h1>
        <p className="text-sm mb-6" style={{ color: "#5a6663" }}>{created.title} — share the link below to start collecting registrations.</p>

        {/* URL box */}
        <div className="rounded-2xl border p-4 mb-4 text-left" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#949598" }}>Registration page</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs break-all" style={{ color: "#14211f" }}>{publicUrl}</code>
            <button
              onClick={copyUrl}
              className="shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
              style={{ background: copied ? "#edf5f4" : "#f1efe8", color: copied ? "#086c64" : "#5a6663" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy"}
            </button>
            <a href={publicUrl} target="_blank" rel="noreferrer"
              className="shrink-0 p-2 rounded-xl transition-colors hover:bg-slate-100"
              style={{ color: "#949598" }}>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* QR code toggle */}
        <button
          onClick={() => setShowQr(v => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl border transition-colors hover:bg-slate-50 mb-4"
          style={{ borderColor: "#e4e0d6", color: "#5a6663" }}
        >
          <QrCode size={14} /> {showQr ? "Hide QR code" : "Show QR code for printing"}
        </button>

        {showQr && (
          <div className="rounded-2xl border p-5 mb-4 inline-block" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-3 text-center" style={{ color: "#949598" }}>Scan to register</p>
            <img src={qrUrl} alt="QR code for event registration" width={200} height={200} className="rounded-xl mx-auto" />
            <p className="text-[10px] mt-2 text-center" style={{ color: "#949598" }}>Print this at the dinner table</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push(`/events/${created.id}`)}
            className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#086c64" }}
          >
            Open event dashboard →
          </button>
          <button
            onClick={() => router.push("/events")}
            className="flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors hover:bg-slate-50"
            style={{ borderColor: "#e4e0d6", color: "#5a6663" }}
          >
            Back to all events
          </button>
        </div>
      </div>
    );
  }

  const inp = "w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-500 transition-colors";
  const bdr = { borderColor: "#e4e0d6" };
  const isZoom = form.eventType === "ZOOM";

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/events" className="inline-flex items-center gap-1.5 text-sm mb-6" style={{ color: "#5a6663" }}>
        <ArrowLeft size={14} /> All events
      </Link>
      <h1 className="text-2xl font-bold mb-1" style={{ color: "#14211f" }}>New Event</h1>
      <p className="text-sm mb-6" style={{ color: "#949598" }}>Spin up a registration page in seconds.</p>

      <form onSubmit={submit} className="space-y-5">

        {/* Event Type */}
        <div className="rounded-2xl border p-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Event Type</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: "IN_PERSON", label: "In Person", icon: MapPin, desc: "Dinner, panel, or gathering" },
              { val: "ZOOM",      label: "Online",    icon: Video,  desc: "Webinar or Zoom session"    },
            ].map(({ val, label, icon: Icon, desc }) => (
              <button
                key={val} type="button"
                onClick={() => set("eventType", val)}
                className="flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: form.eventType === val ? "#086c64" : "#e4e0d6",
                  background:  form.eventType === val ? "#f0fdf4" : "#faf9f6",
                }}
              >
                <Icon size={18} style={{ color: form.eventType === val ? "#086c64" : "#949598", marginTop: 1, flexShrink: 0 }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{label}</p>
                  <p className="text-xs" style={{ color: "#949598" }}>{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Event Details */}
        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Event Details</p>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Title *</label>
            <input required value={form.title} onChange={e => set("title", e.target.value)} placeholder="Atherton Family Dinner — Career Accelerator" className={inp} style={bdr} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>URL slug *</label>
            <div className="flex items-center rounded-xl border overflow-hidden" style={bdr}>
              <span className="px-3 py-2.5 text-xs shrink-0 border-r" style={{ color: "#949598", borderColor: "#e4e0d6", background: "#f8f6f1" }}>/events/</span>
              <input required value={form.slug} onChange={e => set("slug", e.target.value)} placeholder="atherton-family-dinner" className="flex-1 px-3 py-2.5 text-sm outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Description</label>
            <textarea rows={4} value={form.description} onChange={e => set("description", e.target.value)} placeholder="What to expect at this event…" className={inp} style={bdr} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Starts at *</label>
              <input required type="datetime-local" value={form.startsAt} onChange={e => set("startsAt", e.target.value)} className={inp} style={bdr} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Ends at (optional)</label>
              <input type="datetime-local" value={form.endsAt} onChange={e => set("endsAt", e.target.value)} className={inp} style={bdr} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Timezone</label>
              <select value={form.timezone} onChange={e => set("timezone", e.target.value)} className={inp} style={bdr}>
                {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Visibility</label>
              <select value={form.visibility} onChange={e => set("visibility", e.target.value)} className={inp} style={bdr}>
                <option value="PUBLIC">Public — anyone with the link</option>
                <option value="STUDENTS_ONLY">Students only</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Max capacity (blank = unlimited)</label>
            <input type="number" min="1" value={form.maxCapacity} onChange={e => set("maxCapacity", e.target.value)} placeholder="e.g. 40" className={inp} style={bdr} />
          </div>
        </div>

        {/* Location — conditional on type */}
        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>
            {isZoom ? "Online Event" : "Venue"}
          </p>
          {isZoom ? (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Zoom link (optional — can add later)</label>
              <input value={form.meetingUrl} onChange={e => set("meetingUrl", e.target.value)} placeholder="https://us02web.zoom.us/j/..." className={inp} style={bdr} />
              <p className="text-xs mt-1" style={{ color: "#949598" }}>If added, included in confirmation and reminder emails.</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Venue name</label>
                <input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Rosewood Sand Hill" className={inp} style={bdr} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Full address</label>
                <input value={form.venueAddress} onChange={e => set("venueAddress", e.target.value)} placeholder="2825 Sand Hill Rd, Menlo Park, CA 94025" className={inp} style={bdr} />
              </div>
            </>
          )}
        </div>

        {/* Speaker */}
        <div className="rounded-2xl border p-5 space-y-4" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Speaker (optional)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Name</label>
              <input value={form.speakerName} onChange={e => set("speakerName", e.target.value)} placeholder="Dan Sullivan" className={inp} style={bdr} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Title</label>
              <input value={form.speakerTitle} onChange={e => set("speakerTitle", e.target.value)} placeholder="Founder, Vantage Career Accelerator" className={inp} style={bdr} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Bio</label>
            <textarea rows={3} value={form.speakerBio} onChange={e => set("speakerBio", e.target.value)} placeholder="Short bio shown on the registration page…" className={inp} style={bdr} />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Headshot URL (optional)</label>
            <input value={form.speakerImageUrl} onChange={e => set("speakerImageUrl", e.target.value)} placeholder="https://…" className={inp} style={bdr} />
          </div>
        </div>

        {/* Confirmation message */}
        <div className="rounded-2xl border p-5" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>Confirmation Note (optional)</p>
          <textarea rows={3} value={form.confirmationMessage} onChange={e => set("confirmationMessage", e.target.value)} placeholder="Any personal note to include in the confirmation email — e.g. parking info, dress code, what to bring…" className={inp} style={bdr} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "#086c64", opacity: saving ? 0.6 : 1 }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            Create event
          </button>
          <Link href="/events" className="px-5 py-2.5 rounded-xl text-sm font-semibold border" style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
