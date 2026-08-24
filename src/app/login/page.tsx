"use client";
import { useState, FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid credentials or insufficient permissions.");
      } else {
        router.push("/pipeline");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" style={{ background: "#f8f6f1" }}>
      {/* Left brand panel — official logo on cream */}
      <div
        className="hidden lg:flex flex-col justify-between w-[440px] flex-shrink-0 p-10"
        style={{ background: "#f8f6f1", borderRight: "1px solid #e4e0d6" }}
      >
        <div />
        <div className="flex flex-col items-center text-center px-4">
          <img src="/vantage-logo-stacked.svg" alt="Vantage Career" className="w-56 h-auto mb-10" />
          <p className="text-xl font-semibold leading-snug mb-3" style={{ color: "#14211f" }}>
            Build experiences that give people skills, confidence, and agency.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#949598" }}>
            CRM · Admin access only
          </p>
        </div>
        <p className="text-xs text-center" style={{ color: "#949598" }}>
          © {new Date().getFullYear()} Vantage Career Accelerator
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: "#ffffff" }}>
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex flex-col items-center gap-1">
            <div style={{ display: "inline-flex", alignItems: "center" }}>
              <img src="/vantage-logo-color.svg" alt="Vantage Career" style={{ height: 30, display: "block" }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#086c64", letterSpacing: "0.8px", textTransform: "uppercase" }}>
              Career Accelerator
            </span>
          </div>

          <h1 className="text-2xl font-extrabold mb-1" style={{ color: "#14211f" }}>
            Welcome back
          </h1>
          <p className="text-sm mb-8" style={{ color: "#5a6663" }}>
            Sign in to your admin account
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
                type="email" required autoComplete="email" autoFocus
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
                style={{
                  background: "#fff",
                  border: "1.5px solid #e4e0d6",
                  color: "#14211f",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#086c64"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,107,100,0.12)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "#e4e0d6"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold" style={{ color: "#14211f" }}>Password</label>
                <Link href="/forgot-password" className="text-xs font-medium transition-colors" style={{ color: "#086c64" }}>
                  Forgot password?
                </Link>
              </div>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
                style={{
                  background: "#fff",
                  border: "1.5px solid #e4e0d6",
                  color: "#14211f",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#086c64"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,107,100,0.12)"; }}
                onBlur={e  => { e.currentTarget.style.borderColor = "#e4e0d6"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-50"
              style={{ background: "#086c64" }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#084f4a"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#086c64"; }}
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Signing in…</>
                : <>Sign in <ArrowRight size={15} /></>
              }
            </button>
          </form>

          <p className="text-xs text-center mt-8" style={{ color: "#949598" }}>
            Access is managed by your program administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
