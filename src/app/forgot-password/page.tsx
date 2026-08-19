"use client";
import { useState, FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail, ArrowLeft, ArrowRight } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email,     setEmail]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error,     setError]     = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8f6f1" }}>
      <div className="w-full max-w-sm">

        <div className="mb-8">
          <div className="mb-8 inline-flex flex-col items-start gap-1">
            <div style={{ background: "#0a6b64", borderRadius: 8, padding: "7px 12px", display: "inline-flex", alignItems: "center" }}>
              <img src="/10ximpact-logo.webp" alt="Vantage Career" style={{ height: 26, display: "block" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#0a6b64", letterSpacing: "0.8px", paddingLeft: 2, textTransform: "uppercase" }}>
              Career Accelerator
            </span>
          </div>
          {submitted ? (
            <>
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: "rgba(10,107,100,0.1)" }}
              >
                <Mail size={20} style={{ color: "#0a6b64" }} />
              </div>
              <h1 className="text-2xl font-extrabold mb-1" style={{ color: "#14211f" }}>Check your email</h1>
              <p className="text-sm" style={{ color: "#5a6663" }}>
                If that email has an admin account, we sent a reset link. It expires in 1 hour.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium mt-6 transition-colors"
                style={{ color: "#0a6b64" }}
              >
                <ArrowLeft size={14} /> Back to login
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold mb-1" style={{ color: "#14211f" }}>Reset password</h1>
              <p className="text-sm mb-8" style={{ color: "#5a6663" }}>
                Enter your admin email and we'll send you a reset link.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl mb-5">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: "#14211f" }}>
                    Email address
                  </label>
                  <input
                    type="email" required autoFocus
                    value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
                    style={{ background: "#fff", border: "1.5px solid #e4e0d6", color: "#14211f" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#0a6b64"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,107,100,0.12)"; }}
                    onBlur={e  => { e.currentTarget.style.borderColor = "#e4e0d6"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50"
                  style={{ background: "#0a6b64" }}
                  onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#084f4a"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#0a6b64"; }}
                >
                  {loading
                    ? <><Loader2 size={15} className="animate-spin" /> Sending…</>
                    : <>Send reset link <ArrowRight size={15} /></>
                  }
                </button>
              </form>

              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium mt-6 transition-colors"
                style={{ color: "#8a938f" }}
              >
                <ArrowLeft size={14} /> Back to login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
