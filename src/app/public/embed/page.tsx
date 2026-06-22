"use client";

import { useState } from "react";

const DOMAIN =
  typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL ?? "https://your-domain.com";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback — select text
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <button
          onClick={copy}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 transition-colors"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-sm text-gray-800 bg-white overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

export default function EmbedPage() {
  const formUrl     = `${DOMAIN}/public/intake`;
  const iframeCode  = `<iframe\n  src="${formUrl}"\n  width="100%"\n  height="600"\n  frameborder="0"\n  style="border:none;border-radius:16px;"\n></iframe>`;
  const fullPageLink = formUrl;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-blue-700 text-xs font-bold uppercase tracking-widest mb-1">10x Career Accelerator CRM</p>
          <h1 className="text-2xl font-extrabold text-gray-900">Embed Lead Capture Form</h1>
          <p className="text-gray-500 text-sm mt-2">
            Copy one of the snippets below and paste it into any website to start capturing leads.
          </p>
        </div>

        <div className="space-y-6">
          {/* iframe embed */}
          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">Embed on a webpage (iframe)</h2>
            <p className="text-sm text-gray-500 mb-3">
              Paste this anywhere in your HTML to embed the form inline on a page.
            </p>
            <CodeBlock code={iframeCode} label="HTML" />
          </section>

          {/* Full-page link */}
          <section>
            <h2 className="text-base font-bold text-gray-800 mb-2">Full-page link</h2>
            <p className="text-sm text-gray-500 mb-3">
              Link directly to the standalone form page — great for email campaigns or social bios.
            </p>
            <CodeBlock code={fullPageLink} label="URL" />
          </section>

          {/* Source tracking */}
          <section className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <h2 className="text-base font-bold text-blue-900 mb-1">Source tracking</h2>
            <p className="text-sm text-blue-800">
              Append <code className="bg-blue-100 px-1 rounded font-mono text-xs">?source=REFERRAL</code> to
              the URL to tag where leads came from. The value is stored in the CRM.
            </p>
            <p className="text-xs text-blue-700 mt-2 font-mono break-all">{formUrl}?source=LINKEDIN</p>
          </section>

          {/* Preview link */}
          <div className="flex items-center gap-3 pt-2">
            <a
              href="/public/intake"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-2"
            >
              Preview form in new tab
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        <p className="mt-10 text-xs text-gray-400 text-center">10x Career Accelerator CRM — Admin Tool</p>
      </div>
    </div>
  );
}
