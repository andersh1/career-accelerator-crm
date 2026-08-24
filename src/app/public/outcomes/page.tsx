"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

const STATUSES = [
  { key: "PLACED",          label: "I got a job!",        desc: "I've accepted an offer or started a new role" },
  { key: "STILL_SEARCHING", label: "Still searching",     desc: "I'm actively looking for opportunities" },
  { key: "NOT_LOOKING",     label: "Not looking right now", desc: "I've paused my search for now" },
];

function OutcomeForm() {
  const params  = useSearchParams();
  const token   = params.get("token") ?? "";

  const [status,    setStatus]    = useState("");
  const [company,   setCompany]   = useState("");
  const [role,      setRole]      = useState("");
  const [salary,    setSalary]    = useState("");
  const [startDate, setStartDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");
  const [invalid,    setInvalid]    = useState(false);
  const [checking,   setChecking]   = useState(true);
  const [firstName,  setFirstName]  = useState("");

  useEffect(() => {
    if (!token) { setInvalid(true); setChecking(false); return; }
    fetch(`/api/public/outcome-respond?token=${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) setFirstName(d.firstName ?? "");
        else setInvalid(true);
      })
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) { setError("Please select your current status."); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/public/outcome-respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          status,
          company:   company   || null,
          role:      role      || null,
          salary:    salary    ? parseInt(salary, 10) : null,
          startDate: startDate || null,
        }),
      });
      if (!res.ok) { setError("Something went wrong. Please try again."); return; }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1efe8" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#086c64" }} />
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f1efe8" }}>
        <div className="max-w-sm w-full text-center">
          <p className="text-sm font-semibold mb-2" style={{ color: "#14211f" }}>This link is invalid or has expired.</p>
          <p className="text-xs" style={{ color: "#949598" }}>Please reach out to your program coach if you need help.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f1efe8" }}>
        <div className="max-w-sm w-full text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#e6f4f3" }}>
            <CheckCircle size={28} style={{ color: "#086c64" }} />
          </div>
          <h1 className="text-lg font-bold mb-2" style={{ color: "#14211f" }}>Thanks for sharing!</h1>
          <p className="text-sm leading-relaxed" style={{ color: "#5a6663" }}>
            Your outcome has been recorded. We're rooting for you every step of the way.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f1efe8" }}>
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block mb-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: "#e6f4f3", color: "#086c64" }}>
            Vantage Career Accelerator
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#14211f", fontFamily: "var(--font-display), Montserrat, sans-serif" }}>
            {firstName ? `Hey ${firstName} — where did you land?` : "Where did you land?"}
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "#5a6663" }}>
            Takes 2 minutes. Your answer helps us improve the program for future students.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="space-y-5">

          {/* Status */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#949598" }}>
              Where are you right now?
            </p>
            <div className="space-y-2">
              {STATUSES.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className="w-full text-left rounded-xl border-2 px-4 py-3 transition"
                  style={{
                    borderColor: status === s.key ? "#086c64" : "#e4e0d6",
                    background:  status === s.key ? "#e6f4f3" : "white",
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{s.label}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Placed fields */}
          {status === "PLACED" && (
            <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "#e4e0d6", background: "white" }}>
              <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>Tell us more (optional)</p>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#5a6663" }}>Company</label>
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="e.g. Google"
                  className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                  style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "#5a6663" }}>Role / Title</label>
                <input
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Operations Analyst"
                  className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                  style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#5a6663" }}>Salary (annual $)</label>
                  <input
                    value={salary}
                    onChange={e => setSalary(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 70000"
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "#5a6663" }}>Start date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full text-sm border rounded-lg px-3 py-2 focus:outline-none focus:ring-2"
                    style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                  />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-xs font-semibold" style={{ color: "#dc2626" }}>{error}</p>}

          <button
            type="submit"
            disabled={submitting || !status}
            className="w-full text-white font-bold text-sm py-3 rounded-xl transition disabled:opacity-50"
            style={{ background: "#086c64" }}
          >
            {submitting ? "Submitting…" : "Submit my outcome →"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function OutcomesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f1efe8" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "#086c64" }} />
      </div>
    }>
      <OutcomeForm />
    </Suspense>
  );
}
