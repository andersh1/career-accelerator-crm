"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Field from "@/components/ui/Field";

// Shared so every control on this form keeps exactly the look it had before
// labels were wired up. This is an accessibility change, not a restyle.
const INPUT =
  "w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition";

function IntakeForm() {
  const searchParams = useSearchParams();
  const source = searchParams.get("source") ?? "WEBSITE";

  const [form, setForm] = useState({
    firstName: "",
    lastName:  "",
    email:     "",
    phone:     "",
    company:   "",
    notes:     "",
  });
  const [status, setStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setError]  = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/public/intake", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, source }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 px-4">
        {/* role="status" so the swap from form to confirmation is announced.
            Without it a screen reader user submits and hears nothing. */}
        <div role="status" className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg aria-hidden="true" className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re all set!</h2>
          <p className="text-gray-500 text-base">Thanks! We&apos;ll be in touch soon.</p>
          <p className="mt-8 text-xs text-gray-400">Powered by Vantage Career Accelerator</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 px-4 py-12">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-800 px-8 py-7">
          <p className="text-blue-300 text-xs font-bold uppercase tracking-widest mb-1">Vantage Career Accelerator</p>
          <h1 className="text-white text-2xl font-extrabold leading-snug">Get in Touch</h1>
          <p className="text-blue-200 text-sm mt-1">Fill out the form and we&apos;ll reach out shortly.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  autoComplete="given-name"
                  placeholder="Jane"
                  className={INPUT}
                />
              )}
            </Field>
            <Field label="Last Name" required>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  autoComplete="family-name"
                  placeholder="Smith"
                  className={INPUT}
                />
              )}
            </Field>
          </div>

          <Field label="Email" required>
            {(p) => (
              <input
                {...p}
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
                placeholder="jane@example.com"
                className={INPUT}
              />
            )}
          </Field>

          <Field label="Phone" optional>
            {(p) => (
              <input
                {...p}
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                autoComplete="tel"
                placeholder="+1 (555) 000-0000"
                className={INPUT}
              />
            )}
          </Field>

          <Field label="Company" optional>
            {(p) => (
              <input
                {...p}
                type="text"
                name="company"
                value={form.company}
                onChange={handleChange}
                autoComplete="organization"
                placeholder="Acme Corp"
                className={INPUT}
              />
            )}
          </Field>

          <Field label="Message" optional>
            {(p) => (
              <textarea
                {...p}
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={3}
                placeholder="Tell us a bit about yourself or what you're looking for..."
                className={`${INPUT} resize-none`}
              />
            )}
          </Field>

          {/* Error — announced, not just shown. */}
          {status === "error" && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold py-3 rounded-lg text-sm transition-colors"
          >
            {status === "loading" ? "Submitting..." : "Submit"}
          </button>
        </form>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50 text-center">
          <p className="text-xs text-gray-400">Powered by Vantage Career Accelerator</p>
        </div>
      </div>
    </div>
  );
}

export default function IntakePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900">
        <div className="text-white text-sm">Loading...</div>
      </div>
    }>
      <IntakeForm />
    </Suspense>
  );
}
