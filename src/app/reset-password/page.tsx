"use client";
import { useState, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";

function ResetForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords don't match"); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push("/login?reset=1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="text-sm" style={{ color: "#5a6663" }}>Invalid or expired reset link.</p>
        <Link href="/forgot-password" className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "#086c64" }}>
          Request a new one <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "#14211f" }}>New password</label>
        <input
          type="password" required autoFocus
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
          style={{ background: "#fff", border: "1.5px solid #e4e0d6", color: "#14211f" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#086c64"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(10,107,100,0.12)"; }}
          onBlur={e  => { e.currentTarget.style.borderColor = "#e4e0d6"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1.5" style={{ color: "#14211f" }}>Confirm password</label>
        <input
          type="password" required
          value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          className="w-full px-4 py-3 rounded-xl border text-sm outline-none transition-all"
          style={{ background: "#fff", border: "1.5px solid #e4e0d6", color: "#14211f" }}
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
          ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
          : <>Set new password <ArrowRight size={15} /></>
        }
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#f8f6f1" }}>
      <div className="w-full max-w-sm">
        <img src="/vantage-logo-color.svg" alt="Vantage Career" className="h-7 w-auto object-contain mb-8" />
        <h1 className="text-2xl font-extrabold mb-1" style={{ color: "#14211f" }}>Set new password</h1>
        <p className="text-sm mb-8" style={{ color: "#5a6663" }}>Choose a new password for your CRM account.</p>
        <Suspense fallback={<p className="text-sm" style={{ color: "#5a6663" }}>Loading…</p>}>
          <ResetForm />
        </Suspense>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm font-medium mt-6 transition-colors"
          style={{ color: "#949598" }}
        >
          <ArrowLeft size={14} /> Back to login
        </Link>
      </div>
    </div>
  );
}
