"use client";
import { useRef, useState } from "react";
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface Result {
  created: number;
  skipped: number;
  errors: string[];
}

interface Props {
  onClose: () => void;
  onImported: () => void;
}

export default function CsvImportModal({ onClose, onImported }: Props) {
  const inputRef          = useRef<HTMLInputElement>(null);
  const [file,   setFile] = useState<File | null>(null);
  const [state,  setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [errMsg, setErrMsg] = useState("");

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setState("uploading");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/crm/leads/import", { method: "POST", body: fd });
      const data = await res.json() as Result & { error?: string };
      if (!res.ok) { setErrMsg(data.error ?? "Upload failed"); setState("error"); return; }
      setResult(data);
      setState("done");
      if (data.created > 0) onImported();
    } catch {
      setErrMsg("Network error — please try again.");
      setState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">Import Leads from CSV</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {state === "done" && result ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 size={40} className="text-emerald-500 mx-auto" />
              <p className="text-lg font-bold text-slate-900">Import complete!</p>
              <div className="flex justify-center gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.created}</p>
                  <p className="text-slate-500">created</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-400">{result.skipped}</p>
                  <p className="text-slate-500">skipped</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-left text-xs text-red-600 space-y-1">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <button onClick={onClose}
                className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-6 py-2 rounded-xl transition">
                Done
              </button>
            </div>
          ) : state === "error" ? (
            <div className="text-center py-4 space-y-3">
              <AlertCircle size={40} className="text-red-500 mx-auto" />
              <p className="font-bold text-slate-900">Import failed</p>
              <p className="text-sm text-slate-500">{errMsg}</p>
              <button onClick={() => setState("idle")}
                className="text-sm text-blue-600 hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition
                  ${file ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`}
              >
                <input ref={inputRef} type="file" accept=".csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
                {file ? (
                  <div className="flex flex-col items-center gap-2">
                    <FileText size={28} className="text-blue-500" />
                    <p className="font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    <button onClick={e => { e.stopPropagation(); setFile(null); }}
                      className="text-xs text-slate-400 hover:text-red-500 transition">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={28} className="text-slate-300" />
                    <p className="font-semibold text-slate-700">Drop your CSV here</p>
                    <p className="text-xs text-slate-400">or click to browse</p>
                  </div>
                )}
              </div>

              {/* Expected columns */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Expected columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {["firstName*", "lastName", "email*", "phone", "company", "jobTitle",
                    "linkedinUrl", "source", "notes", "tags (semicolon-separated)"].map(col => (
                    <span key={col} className={`text-[11px] px-2 py-0.5 rounded-full font-mono
                      ${col.endsWith("*") ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                      {col}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">* Required. Existing emails are skipped (no duplicates).</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button onClick={handleUpload} disabled={!file || state === "uploading"}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition flex items-center justify-center gap-2">
                  {state === "uploading" ? <><Loader2 size={14} className="animate-spin" /> Importing…</> : "Import"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
