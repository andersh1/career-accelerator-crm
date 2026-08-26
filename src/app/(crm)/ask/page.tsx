"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, User, KeyRound } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

const SUGGESTIONS = [
  "Summarize Mia Ronen's application",
  "Who hasn't submitted Module 1 pre-work?",
  "Give me a one-line brief on every Cohort 2 student",
  "Save a note on Miles: follow up about his real estate interest",
];

export default function AskClaudePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/crm/ask-claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const d = await res.json();
      if (res.status === 503 && d.notConfigured) { setNotConfigured(true); setBusy(false); return; }
      setMessages(m => [...m, { role: "assistant", content: d.reply ?? d.error ?? "Something went wrong — try again." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Network hiccup — try again." }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col animate-fade-up" style={{ height: "calc(100vh - 20px)" }}>
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
        <div className="flex items-center gap-2">
          <Sparkles size={20} style={{ color: "#086c64" }} />
          <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>Ask Claude</h1>
        </div>
        <p className="text-sm mt-1" style={{ color: "#949598" }}>
          Ask anything about your students — applications, pre-work, progress — or tell it to save a note. It reads the live database.
        </p>
      </div>

      {notConfigured && (
        <div className="rounded-2xl border p-4 mb-4 flex items-start gap-3" style={{ borderColor: "#fde68a", background: "#fffbeb" }}>
          <KeyRound size={16} className="mt-0.5 flex-shrink-0" style={{ color: "#b45309" }} />
          <p className="text-sm leading-relaxed" style={{ color: "#92400e" }}>
            <strong>Almost there — needs the Anthropic API key.</strong> Add <code>ANTHROPIC_API_KEY</code> to the CRM&rsquo;s
            Vercel environment variables (Production) and redeploy. Get a key at console.anthropic.com → API Keys.
          </p>
        </div>
      )}

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && !notConfigured && (
          <div className="pt-10 text-center">
            <Sparkles size={28} className="mx-auto mb-3" style={{ color: "#d0e8e6" }} />
            <p className="text-sm font-semibold mb-1" style={{ color: "#5a6663" }}>What do you want to know?</p>
            <p className="text-xs mb-6" style={{ color: "#949598" }}>Try one of these:</p>
            <div className="flex flex-col items-center gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs px-4 py-2 rounded-xl border hover:shadow-sm transition"
                  style={{ borderColor: "#e4e0d6", color: "#086c64", background: "white" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#edf5f4" }}>
                <Sparkles size={13} style={{ color: "#086c64" }} />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "text-white" : ""}`}
              style={m.role === "user" ? { background: "#086c64" } : { background: "white", border: "1px solid #e4e0d6", color: "#14211f" }}>
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "#f1efe8" }}>
                <User size={13} style={{ color: "#5a6663" }} />
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm" style={{ color: "#949598" }}>
            <Loader2 size={14} className="animate-spin" /> Reading the database…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "#e4e0d6" }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask about a student, a module, the cohort… or say 'save a note on…'"
          rows={2}
          className="flex-1 px-4 py-3 rounded-2xl border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ borderColor: "#e4e0d6" }}
        />
        <button onClick={() => send()} disabled={busy || !input.trim()}
          className="self-end px-4 py-3 rounded-2xl text-white disabled:opacity-40 transition"
          style={{ background: "#086c64" }}>
          <Send size={16} />
        </button>
      </div>
      <p className="text-[10px] mt-2 text-center" style={{ color: "#949598" }}>
        Claude reads live LMS/CRM data and can save notes when you ask. Double-check anything before acting on it.
      </p>
    </div>
  );
}
