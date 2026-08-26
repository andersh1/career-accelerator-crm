"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  GraduationCap, Mail, Phone, Search, MessageSquare,
  ExternalLink, Loader2, BookOpen, Activity,
} from "lucide-react";

interface Student {
  id:          string;
  firstName:   string;
  lastName:    string;
  email:       string;
  phone:       string | null;
  company:     string | null;
  jobTitle:    string | null;
  tags:        string[];
  stage:       string;
  notes:       string | null;
  linkedinUrl: string | null;
  updatedAt:   string;
  _count:      { activities: number };
  // LMS enrichment
  cohort?:             string | null;
  sectionsCompleted?:  number;
  lastActiveAt?:       string | null;
  certificateIssuedAt?: string | null;
}

interface LMSStudent {
  email: string; cohort: string | null; sectionsCompleted: number;
  lastActiveAt: string | null; certificateIssuedAt: string | null;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [cohortFilter, setCohortFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const [leadsRes, lmsRes] = await Promise.all([
      fetch("/api/crm/leads?leadType=STUDENT&excludeStage=LOST&all=true"),
      fetch("/api/crm/students"),
    ]);
    const leadsData = await leadsRes.json();
    const leads: Student[] = Array.isArray(leadsData) ? leadsData : (leadsData.leads ?? []);

    // Merge LMS data by email
    if (lmsRes.ok) {
      const lmsData: LMSStudent[] = await lmsRes.json();
      const lmsMap = new Map(lmsData.map(s => [s.email.toLowerCase(), s]));
      setStudents(leads.map(l => {
        const lms = lmsMap.get(l.email.toLowerCase());
        const fallbackCohort = l.tags.includes("founding-cohort") ? "Founding Cohort (Summer 2026)" : null;
        return lms
          ? { ...l, cohort: lms.cohort ?? fallbackCohort, sectionsCompleted: lms.sectionsCompleted, lastActiveAt: lms.lastActiveAt, certificateIssuedAt: lms.certificateIssuedAt }
          : { ...l, cohort: fallbackCohort };
      }));
    } else {
      setStudents(leads);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const cohortOptions = Array.from(new Set(students.map(s => s.cohort).filter(Boolean))).sort() as string[];
  const activeCount = students.filter(s => s.stage !== "GRADUATED").length;
  const gradCount   = students.filter(s => s.stage === "GRADUATED").length;
  // Active students always sort ahead of graduated ones
  const ranked = [...students].sort((a, b) =>
    (a.stage === "GRADUATED" ? 1 : 0) - (b.stage === "GRADUATED" ? 1 : 0)
  );
  const filtered = ranked.filter(s => {
    if (cohortFilter && s.cohort !== cohortFilter) return false;
    if (statusFilter === "ACTIVE" && s.stage === "GRADUATED") return false;
    if (statusFilter === "GRADUATED" && s.stage !== "GRADUATED") return false;
    if (!search.trim()) return true;
    return `${s.firstName} ${s.lastName} ${s.email} ${s.company ?? ""} ${s.jobTitle ?? ""}`
      .toLowerCase().includes(search.toLowerCase());
  });

  const initials = (s: Student) =>
    `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();

  const daysSince = (date: string) =>
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000);

  const avatarColor = (name: string) => {
    const colors = [
      "from-teal-500 to-emerald-600",
      "from-blue-500 to-indigo-600",
      "from-violet-500 to-purple-600",
      "from-amber-500 to-orange-600",
      "from-rose-500 to-pink-600",
    ];
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
    return colors[h];
  };

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#edf5f4" }}>
            <GraduationCap size={18} style={{ color: "#086c64" }} />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#949598" }}>Vantage Career Accelerator</p>
            <h1 className="text-xl font-display font-semibold" style={{ color: "#14211f" }}>Students</h1>
            <p className="text-sm" style={{ color: "#949598" }}>
              {loading ? "Loading…"
                : (cohortFilter || statusFilter || search.trim())
                  ? `${filtered.length} shown · ${activeCount} active · ${gradCount} graduated`
                  : `${activeCount} active · ${gradCount} graduated`}
            </p>
          </div>
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ color: statusFilter ? "#14211f" : "#949598" }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="GRADUATED">Graduated</option>
        </select>

        {/* Cohort filter */}
        <select
          value={cohortFilter}
          onChange={e => setCohortFilter(e.target.value)}
          className="px-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          style={{ color: cohortFilter ? "#14211f" : "#949598" }}
        >
          <option value="">All cohorts</option>
          {cohortOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Search */}
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#949598" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full pl-9 pr-3 py-2 border border-[#e4e0d6] rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 size={24} className="animate-spin" style={{ color: "#949598" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64" style={{ color: "#949598" }}>
          <GraduationCap size={40} className="mb-3 opacity-30" />
          <p className="text-sm">No students found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <div key={s.id} className="card shadow-sm hover:shadow-md hover:border-[#c9c4b8] transition-all p-5">
              {/* Avatar + name */}
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarColor(s.firstName + s.lastName)} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <span className="text-white text-sm font-bold">{initials(s)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/leads/${s.id}`}
                    className="text-sm font-bold hover:text-teal-600 transition leading-tight block truncate"
                    style={{ color: "#14211f" }}
                  >
                    {s.firstName} {s.lastName}
                  </Link>
                  {s.jobTitle && (
                    <p className="text-xs truncate mt-0.5" style={{ color: "#949598" }}>{s.jobTitle}</p>
                  )}
                  {s.company && (
                    <p className="text-xs truncate" style={{ color: "#949598" }}>{s.company}</p>
                  )}
                </div>
                <Link
                  href={`/leads/${s.id}`}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:text-teal-600 hover:bg-[#edf5f4] transition flex-shrink-0 text-xs font-medium"
                  style={{ color: "#949598" }}
                  title="View contact"
                >
                  <ExternalLink size={12} />
                  <span>View</span>
                </Link>
              </div>

              {/* Contact info */}
              <div className="space-y-1.5 mb-4">
                <a
                  href={`mailto:${s.email}`}
                  className="flex items-center gap-2 text-xs hover:text-teal-600 transition truncate"
                  style={{ color: "#5a6663" }}
                >
                  <Mail size={11} className="flex-shrink-0" style={{ color: "#949598" }} />
                  <span className="truncate">{s.email}</span>
                </a>
                {s.phone && (
                  <a
                    href={`tel:${s.phone}`}
                    className="flex items-center gap-2 text-xs hover:text-teal-600 transition"
                    style={{ color: "#5a6663" }}
                  >
                    <Phone size={11} className="flex-shrink-0" style={{ color: "#949598" }} />
                    {s.phone}
                  </a>
                )}
              </div>

              {/* Notes snippet */}
              {s.notes && (
                <div className="mb-3 flex gap-1.5">
                  <MessageSquare size={11} className="flex-shrink-0 mt-0.5" style={{ color: "#c9c4b8" }} />
                  <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "#949598" }} title={s.notes}>{s.notes}</p>
                </div>
              )}

              {/* Tags */}
              {s.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {s.tags.filter(t => t !== "founding-cohort").map(tag => (
                    <span key={tag} className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: "#edf5f4", color: "#086c64" }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* LMS progress row */}
              {(s.sectionsCompleted != null || s.cohort) && (
                <div className="flex items-center gap-3 mb-3 text-[11px]" style={{ color: "#5a6663" }}>
                  {s.cohort && (
                    <span className="flex items-center gap-1">
                      <GraduationCap size={10} style={{ color: "#086c64" }} />
                      <span className="font-medium">{s.cohort}</span>
                    </span>
                  )}
                  {s.sectionsCompleted != null && (
                    <span className="flex items-center gap-1">
                      <BookOpen size={10} style={{ color: "#949598" }} />
                      {s.sectionsCompleted} sections
                    </span>
                  )}
                  {s.lastActiveAt && (
                    <span className="flex items-center gap-1">
                      <Activity size={10} style={{ color: "#949598" }} />
                      {daysSince(s.lastActiveAt) === 0 ? "Active today" : `${daysSince(s.lastActiveAt)}d ago`}
                    </span>
                  )}
                  {s.stage === "GRADUATED" && (
                    <span className="font-semibold px-1.5 py-0.5 rounded" style={{ background: "#f1efe8", color: "#5a6663" }}>🎓 Graduated</span>
                  )}
                  {s.certificateIssuedAt && (
                    <span className="font-semibold" style={{ color: "#059669" }}>🎓 Cert issued</span>
                  )}
                </div>
              )}

              {/* Footer */}
              <div className="pt-3 border-t border-[#e4e0d6] flex items-center justify-between text-[11px]" style={{ color: "#949598" }}>
                <span>{s._count.activities} {s._count.activities === 1 ? "activity" : "activities"}</span>
                <span>{daysSince(s.updatedAt) === 0 ? "Updated today" : `Updated ${daysSince(s.updatedAt)}d ago`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
