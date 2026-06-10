"use client";
import { useState, FormEvent } from "react";
import { CheckCircle2, Loader2, ArrowRight, Linkedin, Phone, Mail, User } from "lucide-react";

type Step = "form" | "success";

export default function ApplyPage() {
  const [step,      setStep]      = useState<Step>("form");
  const [submitting, setSubmitting] = useState(false);
  const [error,     setError]     = useState("");

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [email,       setEmail]       = useState("");
  const [phone,       setPhone]       = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [interest,    setInterest]    = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email:       email.trim().toLowerCase(),
          phone:       phone     || undefined,
          linkedinUrl: linkedinUrl || undefined,
          notes:       interest  || undefined,
          source:      "WEBSITE",
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Something went wrong. Please try again.");
      }
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4 py-16">
      {/* Brand header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 shadow-lg mb-5">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-[11px] text-blue-400 font-bold tracking-widest uppercase mb-2">Career Accelerator</p>
        <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
          Take the next step<br className="hidden sm:block" /> in your career.
        </h1>
        <p className="text-blue-200/70 text-base mt-3 max-w-md mx-auto">
          Tell us a bit about yourself and we'll be in touch about the next cohort.
        </p>
      </div>

      {step === "success" ? (
        <SuccessState />
      ) : (
        <form onSubmit={handleSubmit}
          className="w-full max-w-lg bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-8 space-y-5">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">First Name *</label>
              <div className="relative">
                <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="input-dark pl-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">Last Name *</label>
              <input
                required value={lastName} onChange={e => setLastName(e.target.value)}
                placeholder="Smith"
                className="input-dark"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">Email Address *</label>
            <div className="relative">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="input-dark pl-9"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">Phone Number</label>
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="input-dark pl-9"
              />
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">LinkedIn Profile</label>
            <div className="relative">
              <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/janesmith"
                className="input-dark pl-9"
              />
            </div>
          </div>

          {/* Interest */}
          <div>
            <label className="block text-xs font-semibold text-blue-200/80 mb-1.5">
              Why are you interested in the program? *
            </label>
            <textarea
              required value={interest} onChange={e => setInterest(e.target.value)}
              rows={4}
              placeholder="Tell us where you are in your career and what you're hoping to achieve…"
              className="input-dark resize-none leading-relaxed"
            />
          </div>

          <button
            type="submit" disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors text-sm"
          >
            {submitting
              ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
              : <><ArrowRight size={16} /> Submit Application</>
            }
          </button>

          <p className="text-center text-[11px] text-slate-500 leading-relaxed">
            By submitting you agree to be contacted about the Career Accelerator program.
            We&apos;ll never share your information.
          </p>
        </form>
      )}

      <style>{`
        .input-dark {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255,255,255,0.07);
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color .15s, background .15s;
        }
        .input-dark::placeholder { color: rgba(148,163,184,0.5); }
        .input-dark:focus {
          border-color: #3b82f6;
          background: rgba(255,255,255,0.1);
          box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
        }
      `}</style>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="w-full max-w-lg bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-10 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 mb-5">
        <CheckCircle2 size={30} className="text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold text-white mb-3">You&apos;re on our radar! 🎉</h2>
      <p className="text-blue-200/70 text-sm leading-relaxed mb-6">
        Thanks for reaching out. A member of our team will be in touch within 1–2 business days
        to discuss your goals and next steps.
      </p>
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 text-left space-y-2">
        <p className="text-xs font-bold text-blue-300 uppercase tracking-wide mb-3">What happens next</p>
        {[
          "We review your application",
          "A coach reaches out to schedule a call",
          "You get matched to the right cohort",
        ].map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-blue-600/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-blue-300">{i + 1}</span>
            </div>
            <span className="text-sm text-slate-300">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
