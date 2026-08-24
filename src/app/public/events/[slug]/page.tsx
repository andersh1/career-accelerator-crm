"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, MapPin, Video, Calendar, Clock, Users, CheckCircle2, ChevronRight } from "lucide-react";

interface EventData {
  id: string; slug: string; title: string; description: string | null;
  eventType: string;
  speakerName: string | null; speakerBio: string | null;
  speakerTitle: string | null; speakerImageUrl: string | null;
  location: string | null; venueAddress: string | null;
  startsAt: string; endsAt: string | null; timezone: string;
  maxCapacity: number | null; visibility: string;
  confirmationMessage: string | null;
  _count: { registrations: number };
}

function fmtDate(iso: string, tz: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz,
  });
}
function fmtTime(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz,
  });
}

function EventPageInner() {
  const { slug }        = useParams<{ slug: string }>();
  const searchParams    = useSearchParams();
  const [event, setEvent]         = useState<EventData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [alreadyReg, setAlreadyReg] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");

  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", contactType: "STUDENT",
  });

  const utmRef = useRef({
    source:   searchParams.get("utm_source")   || "",
    medium:   searchParams.get("utm_medium")   || "",
    campaign: searchParams.get("utm_campaign") || "",
    ref:      searchParams.get("ref")          || "",
  });

  useEffect(() => {
    fetch(`/api/public/events/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setEvent)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/events/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          utmSource:   utmRef.current.source,
          utmMedium:   utmRef.current.medium,
          utmCampaign: utmRef.current.campaign,
          referralCode: utmRef.current.ref,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong. Please try again."); return; }
      if (data.alreadyRegistered) setAlreadyReg(true);
      setSubmitted(true);
    } catch { setError("Something went wrong. Please try again."); }
    finally { setSubmitting(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f6f1" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#086c64" }} />
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f6f1" }}>
        <div className="text-center px-6">
          <p className="text-4xl mb-3">🔍</p>
          <h1 className="text-xl font-bold mb-2" style={{ color: "#14211f" }}>Event not found</h1>
          <p style={{ color: "#949598" }}>This event may have ended or the link may be incorrect.</p>
          <a href="https://lms.vantagecareer.co" className="inline-block mt-4 text-sm font-semibold" style={{ color: "#086c64" }}>← Learn more about the program</a>
        </div>
      </div>
    );
  }

  const isZoom    = event.eventType === "ZOOM";
  const isFull    = event.maxCapacity ? event._count.registrations >= event.maxCapacity : false;
  const spotsLeft = event.maxCapacity ? Math.max(0, event.maxCapacity - event._count.registrations) : null;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "linear-gradient(135deg, #086c64 0%, #063b37 100%)" }}>
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#f0fdf4" }}>
              <CheckCircle2 size={32} style={{ color: "#086c64" }} />
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "#14211f" }}>
              {alreadyReg ? "Already registered!" : "You're in!"}
            </h1>
            <p className="mb-5" style={{ color: "#5a6663" }}>
              {alreadyReg
                ? `You already registered for ${event.title}.`
                : `Confirmation sent to ${form.email}. We've also attached a calendar invite.`}
            </p>
            <div className="rounded-2xl p-4 mb-5 text-left space-y-2.5" style={{ background: "#f8f6f1" }}>
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={14} style={{ color: "#086c64", flexShrink: 0 }} />
                <span style={{ color: "#14211f" }}>{fmtDate(event.startsAt, event.timezone)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={14} style={{ color: "#086c64", flexShrink: 0 }} />
                <span style={{ color: "#14211f" }}>{fmtTime(event.startsAt, event.timezone)}</span>
              </div>
              {isZoom ? (
                <div className="flex items-center gap-2 text-sm">
                  <Video size={14} style={{ color: "#2563eb", flexShrink: 0 }} />
                  <span style={{ color: "#14211f" }}>Zoom link sent in your confirmation email</span>
                </div>
              ) : event.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={14} style={{ color: "#d97706", flexShrink: 0 }} />
                  <span style={{ color: "#14211f" }}>{event.location}</span>
                </div>
              )}
            </div>
            {event.confirmationMessage && (
              <p className="text-sm mb-4 p-3 rounded-xl text-left" style={{ background: "#f0fdf4", color: "#14211f", border: "1px solid #bbf7d0" }}>{event.confirmationMessage}</p>
            )}
            <p className="text-xs" style={{ color: "#949598" }}>We'll send a reminder before the event. Reply to your confirmation email with any questions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#f8f6f1" }}>
      {/* Hero */}
      <div style={{ background: "linear-gradient(135deg, #086c64 0%, #063b37 100%)" }}>
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-16">
          <a href="https://lms.vantagecareer.co" className="inline-flex items-center gap-1 text-xs font-semibold mb-6 hover:opacity-90 transition-opacity" style={{ color: "rgba(255,255,255,0.55)" }}>
            Vantage Career Accelerator <ChevronRight size={12} /> Events
          </a>

          <div className="flex items-start gap-3 mb-3">
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full ${isZoom ? "bg-blue-500/20 text-blue-200" : "bg-amber-500/20 text-amber-200"}`}>
              {isZoom ? <Video size={10} /> : <MapPin size={10} />}
              {isZoom ? "Online Event" : "In-Person Event"}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight" style={{ maxWidth: "640px" }}>
            {event.title}
          </h1>

          {event.description && (
            <p className="text-base md:text-lg mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.75)", maxWidth: "540px" }}>
              {event.description}
            </p>
          )}

          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
              <Calendar size={14} />
              <span>{fmtDate(event.startsAt, event.timezone)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
              <Clock size={14} />
              <span>{fmtTime(event.startsAt, event.timezone)}</span>
            </div>
            {isZoom ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                <Video size={14} /><span>Online via Zoom</span>
              </div>
            ) : event.location && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                <MapPin size={14} /><span>{event.location}</span>
              </div>
            )}
            {spotsLeft !== null && spotsLeft > 0 && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                <Users size={14} /><span>{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} remaining</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid md:grid-cols-5 gap-8">

          {/* Left — details */}
          <div className="md:col-span-3 space-y-6">

            {event.speakerName && (
              <div className="rounded-2xl p-6 border" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
                <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "#949598" }}>Featured Speaker</p>
                <div className="flex items-start gap-4">
                  {event.speakerImageUrl ? (
                    <img src={event.speakerImageUrl} alt={event.speakerName} className="w-16 h-16 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 text-2xl font-bold" style={{ background: "linear-gradient(135deg, #086c64, #063b37)", color: "white" }}>
                      {event.speakerName[0]}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-base" style={{ color: "#14211f" }}>{event.speakerName}</p>
                    {event.speakerTitle && <p className="text-sm" style={{ color: "#5a6663" }}>{event.speakerTitle}</p>}
                    {event.speakerBio && <p className="text-sm mt-2 leading-relaxed" style={{ color: "#5a6663" }}>{event.speakerBio}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-2xl p-6 border" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-4" style={{ color: "#949598" }}>Event Details</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#edf5f4" }}>
                    <Calendar size={14} style={{ color: "#086c64" }} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{fmtDate(event.startsAt, event.timezone)}</p>
                    <p className="text-sm" style={{ color: "#5a6663" }}>{fmtTime(event.startsAt, event.timezone)}</p>
                  </div>
                </div>

                {isZoom ? (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#eff6ff" }}>
                      <Video size={14} style={{ color: "#2563eb" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#14211f" }}>Online via Zoom</p>
                      <p className="text-sm" style={{ color: "#5a6663" }}>Join link included in your confirmation email</p>
                    </div>
                  </div>
                ) : (
                  (event.location || event.venueAddress) && (
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fef9f0" }}>
                        <MapPin size={14} style={{ color: "#d97706" }} />
                      </div>
                      <div>
                        {event.location && <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{event.location}</p>}
                        {event.venueAddress && <p className="text-sm" style={{ color: "#5a6663" }}>{event.venueAddress}</p>}
                      </div>
                    </div>
                  )
                )}

                {spotsLeft !== null && (
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fdf4ff" }}>
                      <Users size={14} style={{ color: "#7c3aed" }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#14211f" }}>
                        {isFull ? "This event is full" : `${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} remaining`}
                      </p>
                      <p className="text-sm" style={{ color: "#5a6663" }}>Space is limited</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl p-6 border" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>About Vantage Career Accelerator</p>
              <p className="text-sm leading-relaxed" style={{ color: "#5a6663" }}>
                The Vantage Career Accelerator is an intensive career development program that helps ambitious students and recent grads land roles at top companies. Our cohort-based model combines live coaching, real-world projects, and a powerful alumni network.
              </p>
              <a href="https://lms.vantagecareer.co" className="inline-block mt-3 text-sm font-semibold" style={{ color: "#086c64" }}>
                Learn more →
              </a>
            </div>
          </div>

          {/* Right — registration form */}
          <div className="md:col-span-2">
            <div className="rounded-2xl border shadow-sm overflow-hidden sticky top-6" style={{ borderColor: "#e4e0d6" }}>
              <div className="px-6 py-5" style={{ background: "#086c64" }}>
                <h2 className="font-bold text-base text-white">
                  {isFull ? "This event is full" : "Reserve your spot"}
                </h2>
                {!isFull && <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>Free · Confirmation sent immediately</p>}
              </div>

              {isFull ? (
                <div className="px-6 py-8 text-center" style={{ background: "#fff" }}>
                  <p className="text-sm" style={{ color: "#5a6663" }}>Registrations for this event are closed. Check back for future events.</p>
                  <a href="https://lms.vantagecareer.co" className="inline-block mt-3 text-sm font-semibold" style={{ color: "#086c64" }}>Learn about the program →</a>
                </div>
              ) : (
                <form onSubmit={submit} className="px-6 py-5 space-y-4" style={{ background: "#fff" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>First name *</label>
                      <input required value={form.firstName} onChange={e => set("firstName", e.target.value)} placeholder="Jane" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-500 transition-colors" style={{ borderColor: "#e4e0d6" }} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Last name *</label>
                      <input required value={form.lastName} onChange={e => set("lastName", e.target.value)} placeholder="Smith" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-500 transition-colors" style={{ borderColor: "#e4e0d6" }} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Email *</label>
                    <input required type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jane@example.com" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-500 transition-colors" style={{ borderColor: "#e4e0d6" }} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1" style={{ color: "#5a6663" }}>Phone (optional)</label>
                    <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1 (555) 000-0000" className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-teal-500 transition-colors" style={{ borderColor: "#e4e0d6" }} />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: "#5a6663" }}>I am a *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { val: "STUDENT", label: "Student / Grad" },
                        { val: "PARENT",  label: "Parent / Guardian" },
                      ].map(({ val, label }) => (
                        <button
                          key={val} type="button"
                          onClick={() => set("contactType", val)}
                          className="flex items-center justify-center px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition-all"
                          style={{
                            borderColor: form.contactType === val ? "#086c64" : "#e4e0d6",
                            background:  form.contactType === val ? "#f0fdf4" : "#faf9f6",
                            color:       form.contactType === val ? "#086c64" : "#5a6663",
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#fef2f2", color: "#dc2626" }}>{error}</div>
                  )}

                  <button
                    type="submit" disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition-opacity"
                    style={{ background: "#086c64", opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting && <Loader2 size={15} className="animate-spin" />}
                    {submitting ? "Registering…" : "Register for free →"}
                  </button>

                  <p className="text-[11px] text-center" style={{ color: "#949598" }}>
                    Confirmation + calendar invite sent to your email.
                  </p>
                </form>
              )}
            </div>
          </div>

        </div>
      </div>

      <div className="border-t mt-8 py-6 px-6 text-center" style={{ borderColor: "#e4e0d6" }}>
        <p className="text-xs" style={{ color: "#949598" }}>
          © Vantage Career Accelerator · <a href="https://lms.vantagecareer.co" style={{ color: "#086c64" }}>lms.vantagecareer.co</a>
        </p>
      </div>
    </div>
  );
}

export default function EventPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f6f1" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#086c64" }} />
      </div>
    }>
      <EventPageInner />
    </Suspense>
  );
}
