"use client";

import { useState, FormEvent, useRef } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

// ── Data ────────────────────────────────────────────────────────────────────

const PROGRAM_DETAILS = [
  { key: "Dates",  val: "Sept 8 – Nov 3, 2026 · Orientation Sept 1" },
  { key: "When",   val: "Tuesdays, 6:30–8:00 PM ET" },
  { key: "Where",  val: "Hybrid: Zoom + in-person NYC opportunities" },
  { key: "Format", val: "Weekly workshop + 1:1 coaching + AI prework" },
  { key: "Seats",  val: "10 Fellows · application only" },
  { key: "Locks",  val: "August 21, 2026", bold: true },
];

const WHAT_YOU_GET = [
  "8 weeks of live workshops led by an experienced career coach",
  "A dedicated 1-on-1 coaching session every week",
  "AI-powered prework that meets you where you are",
  "A cohort of peers who push you to level up",
  "A repeatable system for job searching — not just tips",
  "Frameworks built for ambitious people who want a real edge",
];

const QUESTIONS: { id: string; label: string; placeholder: string; rows?: number }[] = [
  {
    id: "q_understand",
    label: "In your own words, what do you understand the Vantage Career Accelerator to be?",
    placeholder: "Tell us what you know about the program in your own words.",
    rows: 3,
  },
  {
    id: "q_hope",
    label: "What do you hope to get out of this cohort?",
    placeholder: "What would make this a 10/10 experience for you?",
    rows: 3,
  },
  {
    id: "q_hard",
    label: "Tell me about a time you took on something hard. What happened?",
    placeholder: "Could be academic, professional, personal — anything real.",
    rows: 3,
  },
  {
    id: "q_taught",
    label: "What's a skill you've taught yourself or someone else? How did you do it?",
    placeholder: "Could be anything — a tool, a sport, a craft.",
    rows: 3,
  },
  {
    id: "q_setback",
    label: "When something doesn't go your way, what's your honest reaction?",
    placeholder: "Be real — we're not looking for a polished answer here.",
    rows: 3,
  },
  {
    id: "q_worried",
    label: "What are you genuinely worried about as you think about your career?",
    placeholder: "The thing that actually keeps you up at night.",
    rows: 3,
  },
  {
    id: "q_ai",
    label: "What is your relationship with AI tools right now?",
    placeholder: "Do you use them? Avoid them? Not sure where to start?",
    rows: 2,
  },
  {
    id: "q_else",
    label: "Is there anything else you want us to know?",
    placeholder: "Optional — only if there's something important we'd miss otherwise.",
    rows: 2,
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Apply3iPage() {
  const [done,       setDone]       = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverErr,  setServerErr]  = useState("");
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef  = useRef<HTMLInputElement>(null);
  const emailRef     = useRef<HTMLInputElement>(null);
  const schoolRef    = useRef<HTMLInputElement>(null);
  const yearRef      = useRef<HTMLSelectElement>(null);
  const linkedinRef  = useRef<HTMLInputElement>(null);
  const qRefs        = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const formRef      = useRef<HTMLDivElement>(null);

  function scrollToForm() {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerErr("");

    const firstName = firstNameRef.current?.value.trim() ?? "";
    const lastName  = lastNameRef.current?.value.trim()  ?? "";
    const email     = emailRef.current?.value.trim()     ?? "";
    const school    = schoolRef.current?.value.trim()    ?? "";
    const year      = yearRef.current?.value             ?? "";
    const linkedin  = linkedinRef.current?.value.trim()  ?? "";

    const qVals: Record<string, string> = {};
    for (const q of QUESTIONS) {
      qVals[q.id] = qRefs.current[q.id]?.value.trim() ?? "";
    }

    const errs: Record<string, string> = {};
    if (!firstName)                    errs.firstName = "Required";
    if (!lastName)                     errs.lastName  = "Required";
    if (!email || !email.includes("@")) errs.email    = "Valid email required";
    if (!school)                       errs.school    = "Required";
    if (!year)                         errs.year      = "Please select";

    // First 7 questions required; q_else is optional
    for (const q of QUESTIONS.slice(0, 7)) {
      if (!qVals[q.id]) errs[q.id] = "Required";
    }

    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const firstErr = document.querySelector("[data-err]");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);

    const noteLines = [
      linkedin ? `LinkedIn: ${linkedin}` : "",
      ...QUESTIONS.map(q => {
        const val = qVals[q.id];
        return val ? `${q.label}\n${val}` : "";
      }),
    ].filter(Boolean);

    try {
      const res = await fetch("/api/public/intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          company:  school,
          jobTitle: year,
          notes:    noteLines.join("\n\n"),
          source:   "3I_NEXTGEN",
          leadType: "APPLICATION",
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerErr((data as { error?: string }).error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setServerErr("Network error — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ fontFamily: "var(--font-inter, system-ui, sans-serif)", background: "#f8f6f1", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Header ── */}
      <header style={{ background: "#084f4a", padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* 10X on the left */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>10X</div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "2.5px", textTransform: "uppercase", marginTop: 2 }}>Career Accelerator</div>
        </div>
        {/* 3i on the right */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", lineHeight: 1 }}>3i<span style={{ fontWeight: 400, fontSize: 14, opacity: 0.7 }}>MEMBERS</span></div>
          <div style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "2.5px", textTransform: "uppercase", marginTop: 2 }}>NextGen</div>
        </div>
      </header>

      {/* ── Success State ── */}
      {done ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ maxWidth: 500, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#d0e8e6", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <CheckCircle2 size={30} color="#0a6b64" />
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#14211f", marginBottom: 12 }}>Application received.</h2>
            <p style={{ fontSize: 15, color: "#5a6663", lineHeight: 1.75 }}>
              Dan reviews every application personally.<br />
              You'll hear back within 5 business days.<br /><br />
              Cohort locks <strong style={{ color: "#14211f" }}>August 21, 2026</strong> — reach out if you have questions.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ── Hero ── */}
          <section style={{ background: "linear-gradient(135deg, #0a6b64 0%, #084f4a 100%)", padding: "64px 40px 56px", textAlign: "center", color: "#fff" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", marginBottom: 24 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              Fall 2026 · 10 Seats · Applications close Aug 21
            </div>
            <h1 style={{ fontSize: "clamp(28px, 5vw, 44px)", fontWeight: 800, lineHeight: 1.2, marginBottom: 18, maxWidth: 680, marginLeft: "auto", marginRight: "auto" }}>
              The career program built for 3i NextGen members.
            </h1>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.78)", lineHeight: 1.65, maxWidth: 560, margin: "0 auto 32px" }}>
              8 weeks. Live workshops, weekly 1-on-1 coaching, and a framework that actually works — taught by a coach who's done it.
            </p>
            <button
              onClick={scrollToForm}
              style={{ background: "#fff", color: "#084f4a", fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "14px 32px", border: "none", borderRadius: 12, cursor: "pointer", letterSpacing: "0.01em" }}
            >
              Learn more &amp; Apply →
            </button>
          </section>

          {/* ── What You Get ── */}
          <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 40px 0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#0a6b64", marginBottom: 10 }}>What you get</p>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#14211f", marginBottom: 32, lineHeight: 1.3 }}>A proven system — not another workshop series.</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              {WHAT_YOU_GET.map((item, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e4e0d6", borderRadius: 12, padding: "16px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#edf5f4", border: "1.5px solid #0a6b64", color: "#0a6b64", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <p style={{ fontSize: 13.5, color: "#5a6663", lineHeight: 1.6, margin: 0 }}>{item}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Program Details ── */}
          <section style={{ maxWidth: 900, margin: "0 auto", padding: "52px 40px 0" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#0a6b64", marginBottom: 10 }}>Program details</p>
            <div style={{ background: "#fff", border: "1px solid #e4e0d6", borderRadius: 16, overflow: "hidden" }}>
              {PROGRAM_DETAILS.map(({ key, val, bold }, i) => (
                <div key={key} style={{ display: "flex", gap: 20, padding: "12px 20px", borderBottom: i < PROGRAM_DETAILS.length - 1 ? "1px solid #e4e0d6" : "none", fontSize: 14, alignItems: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#0a6b64", minWidth: 52, flexShrink: 0 }}>{key}</div>
                  <div style={{ color: bold ? "#14211f" : "#5a6663", fontWeight: bold ? 700 : 400 }}>{val}</div>
                </div>
              ))}
            </div>

            {/* Second apply CTA */}
            <div style={{ textAlign: "center", marginTop: 28 }}>
              <button
                onClick={scrollToForm}
                style={{ background: "#0a6b64", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, padding: "12px 28px", border: "none", borderRadius: 10, cursor: "pointer" }}
              >
                Apply for the Fall 2026 Cohort →
              </button>
              <p style={{ fontSize: 12, color: "#8a938f", marginTop: 8 }}>Applications close August 21 · Takes about 5 minutes</p>
            </div>
          </section>

          {/* ── Application Form ── */}
          <section id="apply" ref={formRef} style={{ maxWidth: 720, margin: "0 auto", padding: "60px 40px 80px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "#0a6b64", marginBottom: 10 }}>Apply now</p>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: "#14211f", marginBottom: 6 }}>Your Application</h2>
            <p style={{ fontSize: 14, color: "#5a6663", marginBottom: 32, lineHeight: 1.6 }}>Dan reviews every application personally. Takes about 5 minutes — no resume required.</p>

            {serverErr && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#dc2626", marginBottom: 20 }}>
                {serverErr}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 20 }}>

              {/* ── Basic info ── */}
              <div style={{ background: "#fff", border: "1px solid #e4e0d6", borderRadius: 14, padding: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#5a6663", marginBottom: 18 }}>About you</p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <FieldBox label="First Name" required error={errors.firstName}>
                    <input ref={firstNameRef} type="text" placeholder="First" autoComplete="given-name" style={iStyle(!!errors.firstName)} />
                  </FieldBox>
                  <FieldBox label="Last Name" required error={errors.lastName}>
                    <input ref={lastNameRef} type="text" placeholder="Last" autoComplete="family-name" style={iStyle(!!errors.lastName)} />
                  </FieldBox>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <FieldBox label="Email" required error={errors.email}>
                    <input ref={emailRef} type="email" placeholder="you@school.edu" autoComplete="email" style={iStyle(!!errors.email)} />
                  </FieldBox>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <FieldBox label="School / University" required error={errors.school}>
                    <input ref={schoolRef} type="text" placeholder="University name" style={iStyle(!!errors.school)} />
                  </FieldBox>
                  <FieldBox label="Year" required error={errors.year}>
                    <select ref={yearRef} defaultValue="" style={{ ...iStyle(!!errors.year), backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%235a6663' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32, appearance: "none" as const }}>
                      <option value="" disabled>Select year</option>
                      <option>Freshman</option>
                      <option>Sophomore</option>
                      <option>Junior</option>
                      <option>Senior</option>
                      <option>Graduate Student</option>
                      <option>Recent Graduate</option>
                    </select>
                  </FieldBox>
                </div>

                <FieldBox label="LinkedIn" optional>
                  <input ref={linkedinRef} type="url" placeholder="linkedin.com/in/yourname" style={iStyle(false)} />
                </FieldBox>
              </div>

              {/* ── Questions ── */}
              <div style={{ background: "#fff", border: "1px solid #e4e0d6", borderRadius: 14, padding: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "#5a6663", marginBottom: 18 }}>A few questions</p>
                <p style={{ fontSize: 13, color: "#8a938f", marginBottom: 24, lineHeight: 1.6 }}>No perfect answers — we're looking for honest ones. Take your time.</p>

                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {QUESTIONS.map((q, i) => (
                    <FieldBox
                      key={q.id}
                      label={`${i + 1}. ${q.label}`}
                      required={i < 7}
                      optional={i === 7}
                      error={errors[q.id]}
                    >
                      <textarea
                        ref={el => { qRefs.current[q.id] = el; }}
                        placeholder={q.placeholder}
                        rows={q.rows ?? 3}
                        style={{ ...iStyle(!!errors[q.id]), resize: "vertical", lineHeight: 1.65 }}
                      />
                    </FieldBox>
                  ))}
                </div>
              </div>

              {/* ── Submit ── */}
              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ width: "100%", background: submitting ? "#5a6663" : "#0a6b64", color: "#fff", fontFamily: "inherit", fontSize: 15, fontWeight: 700, padding: "14px 0", border: "none", borderRadius: 12, cursor: submitting ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 0.15s" }}
                >
                  {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : <>Submit Application →</>}
                </button>
                <p style={{ fontSize: 12, color: "#8a938f", textAlign: "center", marginTop: 10, lineHeight: 1.6 }}>
                  By submitting you agree to be contacted about the Vantage Career Accelerator program.<br />
                  We will never share your information. · Cohort locks August 21, 2026.
                </p>
              </div>
            </form>
          </section>
        </>
      )}

      {/* ── Footer ── */}
      <footer style={{ background: "#084f4a", padding: "14px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 8, marginTop: "auto" }}>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          <strong style={{ color: "rgba(255,255,255,0.6)" }}>Vantage Career Accelerator</strong> · 3iMEMBERS NextGen · Fall 2026
        </p>
      </footer>

    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function FieldBox({ label, required, optional, error, children }: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-err={error ? "true" : undefined}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#14211f", marginBottom: 6, lineHeight: 1.4 }}>
        {label}
        {required && <span style={{ color: "#0a6b64", marginLeft: 3 }}>*</span>}
        {optional && <span style={{ fontWeight: 400, fontSize: 12, color: "#8a938f", marginLeft: 5 }}>(optional)</span>}
      </label>
      {children}
      {error && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function iStyle(hasError: boolean): React.CSSProperties {
  return {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#14211f",
    background: "#fafaf8",
    border: `1.5px solid ${hasError ? "#dc2626" : "#e4e0d6"}`,
    borderRadius: 9,
    outline: "none",
  };
}
