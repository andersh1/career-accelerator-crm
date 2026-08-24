"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Share2, Loader2, Trophy, Users, GraduationCap } from "lucide-react";

interface ReferralRow {
  code: string;
  total: number;
  enrolled: number;
  student: { id: string; name: string; email: string; cohort: string | null; referralCode: string | null } | null;
}

export default function ReferralsPage() {
  const [rows, setRows]       = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/referrals")
      .then(r => r.json())
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const totalLeads    = rows.reduce((s, r) => s + r.total, 0);
  const totalEnrolled = rows.reduce((s, r) => s + r.enrolled, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#14211f" }}>Student Referrals</h1>
        <p className="text-sm mt-0.5" style={{ color: "#949598" }}>
          Track which students are referring applicants and how many are converting.
        </p>
      </div>

      {/* Summary chips */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Active referrers", value: rows.length,    icon: Users },
            { label: "Total referrals",  value: totalLeads,     icon: Share2 },
            { label: "Enrolled via ref", value: totalEnrolled,  icon: GraduationCap },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border p-4 text-center" style={{ borderColor: "#e4e0d6", background: "#fff" }}>
              <Icon size={18} className="mx-auto mb-1" style={{ color: "#086c64" }} />
              <p className="text-2xl font-bold" style={{ color: "#14211f" }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#949598" }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin" style={{ color: "#086c64" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border" style={{ borderColor: "#e4e0d6", color: "#949598" }}>
          <Share2 size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No referrals yet</p>
          <p className="text-sm mt-1">Students share their link from Settings. Applicants who use it appear here.</p>
        </div>
      ) : (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "#e4e0d6" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#f8f6f1", borderBottom: "1px solid #e4e0d6" }}>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Rank</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Student</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide hidden sm:table-cell" style={{ color: "#949598" }}>Code</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Referrals</th>
                <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wide" style={{ color: "#949598" }}>Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.code} style={{ background: i % 2 === 0 ? "#fff" : "#faf9f6", borderBottom: i < rows.length - 1 ? "1px solid #f0ede7" : "none" }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{
                      background: i === 0 ? "#fef3c7" : i === 1 ? "#f1f5f9" : i === 2 ? "#fde8d0" : "#f8f6f1",
                      color: i === 0 ? "#92400e" : i === 1 ? "#475569" : i === 2 ? "#9a3412" : "#949598",
                    }}>
                      {i === 0 ? <Trophy size={12} /> : i + 1}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.student ? (
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#14211f" }}>{row.student.name}</p>
                        <p className="text-xs" style={{ color: "#949598" }}>{row.student.email}</p>
                        {row.student.cohort && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "#edf5f4", color: "#086c64" }}>{row.student.cohort}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs" style={{ color: "#949598" }}>Unknown student</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="font-mono text-xs font-bold" style={{ color: "#086c64" }}>{row.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-sm" style={{ color: "#14211f" }}>{row.total}</span>
                  </td>
                  <td className="px-4 py-3">
                    {row.enrolled > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        {row.enrolled}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: "#949598" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs mt-4" style={{ color: "#949598" }}>
        Students find their referral link in <strong>LMS → Settings → Refer a Classmate</strong>.
      </p>
    </div>
  );
}
