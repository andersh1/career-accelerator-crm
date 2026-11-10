"use client";

/**
 * The proof library: every quotable line a Fellow has given, with the two
 * gates that decide whether it can run.
 *
 * Built so David can find a usable quote without reading anybody's survey, and
 * so nobody has to re-chase a testimonial that was already collected. The
 * quotes are not new. They come from the finale survey questions that have
 * been asking for them since Module 8 shipped.
 *
 * Two independent gates, shown on every card:
 *   APPROVAL — Dan cleared this wording.
 *   CONSENT  — the Fellow said this may be used, and in what form.
 * Both have to be true. Either one alone reads as "ready" if you only look at
 * one, which is why the clearance line names the open gate rather than showing
 * a single badge.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Quote, Loader2, Check, Copy, Archive, Undo2, Pencil, Download,
  ShieldCheck, ShieldAlert, ShieldX, ExternalLink, Megaphone, ChevronDown, X,
} from "lucide-react";
import {
  testimonialStatusInfo, kindInfo,
  CONSENT_SCOPES, CONSENT_STATES, consentInfo, clearance, usableText,
} from "@/lib/testimonials";
import { useToast } from "@/lib/toast";

interface LeadRef {
  id: string;
  firstName: string;
  lastName: string;
  marketingConsent: string | null;
  marketingConsentScopes: string[];
  marketingConsentAt: string | null;
  marketingConsentNote: string | null;
  outcomeStatus: string | null;
  outcomeCompany: string | null;
  outcomeRole: string | null;
}

interface Testimonial {
  id: string;
  studentName: string;
  cohort: string | null;
  kind: string;
  source: string;
  quote: string;
  editedQuote: string | null;
  nps: number | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  usedIn: string | null;
  createdAt: string;
  leadId: string | null;
  lead: LeadRef | null;
}

interface Stats {
  total: number; draft: number; approved: number; published: number;
  awaitingConsent: number; fellows: number;
}

const STATUS_FILTERS = [
  { key: "",          label: "All quotes" },
  { key: "DRAFT",     label: "Needs review" },
  { key: "APPROVED",  label: "Approved" },
  { key: "PUBLISHED", label: "In use" },
  { key: "ARCHIVED",  label: "Archived" },
];

export default function ProofLibrary() {
  const { success, error: toastError } = useToast();
  const [rows,    setRows]    = useState<Testimonial[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [cohorts, setCohorts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [status,  setStatus]  = useState("DRAFT");
  const [cohort,  setCohort]  = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [newCount,  setNewCount]  = useState<number | null>(null);
  const [editing,   setEditing]   = useState<string | null>(null);
  const [editText,  setEditText]  = useState("");
  const [consentFor, setConsentFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (cohort) p.set("cohort", cohort);
    const res  = await fetch(`/api/crm/testimonials?${p}`);
    const data = await res.json();
    setRows(data.testimonials ?? []);
    setStats(data.stats ?? null);
    if (data.cohorts?.length) setCohorts(data.cohorts);
    setLoading(false);
  }, [status, cohort]);

  useEffect(() => { load(); }, [load]);

  // How many finale answers are not in the library yet, so the button can say so.
  useEffect(() => {
    fetch("/api/crm/testimonials/import")
      .then(r => r.json())
      .then(d => setNewCount(typeof d.newQuotes === "number" ? d.newQuotes : null))
      .catch(() => {});
  }, []);

  async function runImport() {
    setImporting(true);
    try {
      const res  = await fetch("/api/crm/testimonials/import", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const bits = [
        data.created   ? `${data.created} new quote${data.created === 1 ? "" : "s"}` : null,
        data.refreshed ? `${data.refreshed} refreshed` : null,
      ].filter(Boolean);
      success(bits.length
        ? `Gathered ${bits.join(", ")} from ${data.finaleRows} finale surveys`
        : `Nothing new. All ${data.available} quotes are already here.`);
      setNewCount(0);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>, done?: string) {
    setPending(id);
    try {
      const res  = await fetch(`/api/crm/testimonials/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      if (done) success(done);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setPending(null);
    }
  }

  async function patchConsent(leadId: string, body: Record<string, unknown>, done: string) {
    setPending(leadId);
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save");
      success(done);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setPending(null);
    }
  }

  function copyQuote(t: Testimonial) {
    const c = clearance(t);
    const attribution = t.lead?.marketingConsentScopes.includes("NAME")
      ? `${t.studentName}${t.cohort ? `, ${t.cohort}` : ""}`
      : "a Vantage Career Fellow";
    navigator.clipboard.writeText(`"${usableText(t)}"\n— ${attribution}`);
    success(c.ok ? "Copied with attribution" : `Copied, but: ${c.reason}`);
  }

  /** Everything cleared, as plain text, for handing to marketing in one go. */
  function exportCleared() {
    const cleared = rows.filter(t => clearance(t).ok);
    if (!cleared.length) { toastError("Nothing in this view is cleared to use yet"); return; }
    const text = cleared.map(t => {
      const named = t.lead?.marketingConsentScopes.includes("NAME");
      const who = named ? `${t.studentName}${t.cohort ? `, ${t.cohort}` : ""}` : "a Vantage Career Fellow";
      const landed = named && t.lead?.marketingConsentScopes.includes("EMPLOYER") && t.lead?.outcomeCompany
        ? ` (now ${t.lead.outcomeRole ? `${t.lead.outcomeRole} at ` : ""}${t.lead.outcomeCompany})`
        : "";
      return `"${usableText(t)}"\n— ${who}${landed}\n[${kindInfo(t.kind).label}]`;
    }).join("\n\n");
    navigator.clipboard.writeText(text);
    success(`Copied ${cleared.length} cleared quote${cleared.length === 1 ? "" : "s"}`);
  }

  return (
    <div>
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Quotes",          value: stats.total,           color: "#14211f" },
            { label: "Needs review",    value: stats.draft,           color: "#d97706" },
            { label: "Approved",        value: stats.approved,        color: "#059669" },
            { label: "In use",          value: stats.published,       color: "#086c64" },
            { label: "Blocked on consent", value: stats.awaitingConsent, color: stats.awaitingConsent ? "#e11d48" : "#949598" },
          ].map(s => (
            <div key={s.label} className="card shadow-sm p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "#949598" }}>{s.label}</p>
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <button
          onClick={runImport}
          disabled={importing}
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl text-white disabled:opacity-50"
          style={{ background: "#086c64" }}>
          {importing ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          Gather from finale surveys
          {newCount ? <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.25)" }}>{newCount} new</span> : null}
        </button>
        <button
          onClick={exportCleared}
          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border"
          style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
          <Megaphone size={13} /> Copy all cleared
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setStatus(f.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                status === f.key ? "border-transparent text-white" : "border-[#e4e0d6] hover:border-[#086c64]"
              }`}
              style={status === f.key ? { background: "#086c64", color: "white" } : { color: "#5a6663" }}>
              {f.label}
            </button>
          ))}
        </div>
        {cohorts.length > 0 && (
          <div className="relative">
            <select value={cohort} onChange={e => setCohort(e.target.value)}
              className="text-sm border border-[#e4e0d6] rounded-lg pl-3 pr-7 py-1.5 bg-white focus:outline-none appearance-none"
              style={{ color: "#14211f" }}>
              <option value="">All cohorts</option>
              {cohorts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#949598" }} />
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: "#086c64" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card shadow-sm p-16 text-center">
          <Quote size={32} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm font-semibold mb-1" style={{ color: "#949598" }}>No quotes in this view</p>
          <p className="text-xs" style={{ color: "#c9c4b8" }}>
            Press Gather from finale surveys to pull in what Fellows have already written.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(t => {
            const info  = testimonialStatusInfo(t.status);
            const kind  = kindInfo(t.kind);
            const clear = clearance(t);
            const cons  = consentInfo(t.lead?.marketingConsent);
            const busy  = pending === t.id || pending === t.leadId;
            const isEditing = editing === t.id;
            const showConsent = consentFor === t.id;

            return (
              <div key={t.id} className="card shadow-sm p-5">

                {/* Head */}
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${info.color}`}>{info.label}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#f8f6f1", color: "#5a6663" }}>
                      {kind.label}
                    </span>
                    {t.nps != null && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: t.nps >= 9 ? "#d1fae5" : t.nps >= 7 ? "#fef3c7" : "#ffe4e6",
                                 color:      t.nps >= 9 ? "#047857" : t.nps >= 7 ? "#92400e" : "#9f1239" }}>
                        NPS {t.nps}
                      </span>
                    )}
                    {t.source === "MANUAL" && (
                      <span className="text-[10px] font-semibold" style={{ color: "#c9c4b8" }}>added by hand</span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold" style={{ color: "#14211f" }}>{t.studentName}</p>
                    <p className="text-xs" style={{ color: "#949598" }}>
                      {t.cohort ?? "no cohort"}
                      {t.lead?.outcomeCompany ? ` · ${t.lead.outcomeCompany}` : ""}
                    </p>
                  </div>
                </div>

                {/* The question they were answering: most of the context. */}
                {kind.question && (
                  <p className="text-[11px] italic mb-2" style={{ color: "#c9c4b8" }}>{kind.question}</p>
                )}

                {/* The quote */}
                {isEditing ? (
                  <div className="mb-3">
                    <textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      rows={4}
                      className="w-full text-sm border rounded-lg p-3 focus:outline-none"
                      style={{ borderColor: "#e4e0d6", color: "#14211f" }}
                      placeholder="Trimmed version for marketing. Leave empty to use their words as written." />
                    <p className="text-[11px] mt-1 mb-2" style={{ color: "#949598" }}>
                      Their original is kept either way, so a trim can always be checked against what they wrote.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => { await patch(t.id, { editedQuote: editText }, "Saved"); setEditing(null); }}
                        disabled={busy}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                        style={{ background: "#086c64" }}>Save</button>
                      <button onClick={() => setEditing(null)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border"
                        style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <blockquote className="text-sm leading-relaxed mb-2 pl-3 border-l-2" style={{ color: "#14211f", borderColor: "#086c64" }}>
                    {usableText(t)}
                  </blockquote>
                )}

                {/* Show the original when a trimmed version is in use. */}
                {!isEditing && t.editedQuote && (
                  <details className="mb-2">
                    <summary className="text-[11px] font-semibold cursor-pointer" style={{ color: "#949598" }}>
                      Their words as submitted
                    </summary>
                    <p className="text-xs mt-1 pl-3" style={{ color: "#5a6663" }}>{t.quote}</p>
                  </details>
                )}

                {/* Clearance: the two gates, with the open one named. */}
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={clear.ok
                    ? { background: "#ecfdf5", color: "#047857" }
                    : t.lead?.marketingConsent === "DECLINED"
                      ? { background: "#fff1f2", color: "#9f1239" }
                      : { background: "#fffbeb", color: "#92400e" }}>
                  {clear.ok ? <ShieldCheck size={13} />
                    : t.lead?.marketingConsent === "DECLINED" ? <ShieldX size={13} />
                    : <ShieldAlert size={13} />}
                  {clear.reason}
                </div>

                {/* Consent, per Fellow */}
                <div className="mb-3">
                  <button
                    onClick={() => setConsentFor(showConsent ? null : t.id)}
                    disabled={!t.leadId}
                    className="inline-flex items-center gap-2 text-xs font-semibold disabled:opacity-40"
                    style={{ color: "#086c64" }}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cons.color}`}>{cons.label}</span>
                    {t.leadId ? (showConsent ? "Hide release" : "Record release") : "No CRM lead linked"}
                  </button>

                  {showConsent && t.lead && (
                    <div className="mt-3 p-3 rounded-lg border" style={{ borderColor: "#e4e0d6", background: "#f8f6f1" }}>
                      <p className="text-[11px] mb-2" style={{ color: "#5a6663" }}>
                        What {t.lead.firstName} agreed to. These answers were given to a coaching survey, not to
                        marketing, so permission has to be asked for separately and recorded here.
                      </p>

                      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                        {CONSENT_STATES.map(s => (
                          <button key={s.key}
                            onClick={() => patchConsent(t.lead!.id, { marketingConsent: s.key }, `Release marked ${s.label.toLowerCase()}`)}
                            disabled={busy}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition disabled:opacity-50 ${
                              t.lead!.marketingConsent === s.key ? "border-transparent text-white" : "border-[#e4e0d6]"
                            }`}
                            style={t.lead!.marketingConsent === s.key
                              ? { background: "#086c64", color: "white" }
                              : { color: "#5a6663", background: "white" }}>
                            {s.label}
                          </button>
                        ))}
                        {t.lead.marketingConsent && (
                          <button
                            onClick={() => patchConsent(t.lead!.id, { marketingConsent: null, marketingConsentScopes: [] }, "Release cleared")}
                            disabled={busy}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1.5 disabled:opacity-50"
                            style={{ color: "#949598" }}>
                            <X size={11} /> clear
                          </button>
                        )}
                      </div>

                      {t.lead.marketingConsent === "GRANTED" && (
                        <div className="space-y-1.5 mb-2">
                          {CONSENT_SCOPES.map(sc => {
                            const on = t.lead!.marketingConsentScopes.includes(sc.key);
                            return (
                              <label key={sc.key} className="flex items-start gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  disabled={busy}
                                  onChange={() => {
                                    const next = on
                                      ? t.lead!.marketingConsentScopes.filter(s => s !== sc.key)
                                      : [...t.lead!.marketingConsentScopes, sc.key];
                                    patchConsent(t.lead!.id, { marketingConsentScopes: next }, "Saved");
                                  }}
                                  className="mt-0.5" />
                                <span>
                                  <span className="text-xs font-semibold" style={{ color: "#14211f" }}>{sc.label}</span>
                                  <span className="text-[11px] block" style={{ color: "#949598" }}>{sc.help}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {t.lead.marketingConsentAt && (
                        <p className="text-[11px]" style={{ color: "#949598" }}>
                          Recorded {new Date(t.lead.marketingConsentAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {t.lead.marketingConsentNote ? ` · ${t.lead.marketingConsentNote}` : ""}
                        </p>
                      )}

                      <Link href={`/leads/${t.lead.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2"
                        style={{ color: "#086c64" }}>
                        <ExternalLink size={11} /> Open their lead
                      </Link>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap pt-3 border-t" style={{ borderColor: "#e4e0d6" }}>
                  {t.status !== "APPROVED" && t.status !== "PUBLISHED" && (
                    <button onClick={() => patch(t.id, { status: "APPROVED" }, "Approved")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: "#059669" }}>
                      <Check size={12} /> Approve wording
                    </button>
                  )}
                  {t.status === "APPROVED" && (
                    <button onClick={() => patch(t.id, { status: "PUBLISHED" }, "Marked in use")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                      style={{ background: "#086c64" }}>
                      <Megaphone size={12} /> Mark in use
                    </button>
                  )}
                  {(t.status === "APPROVED" || t.status === "PUBLISHED") && (
                    <button onClick={() => patch(t.id, { status: "DRAFT" }, "Back to review")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-50"
                      style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
                      <Undo2 size={12} /> Back to review
                    </button>
                  )}
                  <button onClick={() => { setEditing(t.id); setEditText(t.editedQuote ?? ""); }}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-50"
                    style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
                    <Pencil size={12} /> {t.editedQuote ? "Edit trim" : "Trim for use"}
                  </button>
                  <button onClick={() => copyQuote(t)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: "#e4e0d6", color: "#5a6663" }}>
                    <Copy size={12} /> Copy
                  </button>
                  {t.status !== "ARCHIVED" && (
                    <button onClick={() => patch(t.id, { status: "ARCHIVED" }, "Archived")}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg ml-auto disabled:opacity-50"
                      style={{ color: "#949598" }}>
                      <Archive size={12} /> Archive
                    </button>
                  )}
                  {t.approvedBy && (
                    <span className="text-[11px] ml-auto" style={{ color: "#949598" }}>
                      Approved by {t.approvedBy}
                      {t.approvedAt ? ` on ${new Date(t.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                    </span>
                  )}
                  {t.usedIn && (
                    <span className="text-[11px]" style={{ color: "#086c64" }}>Used in {t.usedIn}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
