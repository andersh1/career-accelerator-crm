"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Users, Loader2 } from "lucide-react";

interface RevenueData {
  pipelineValue:  number;
  pipelineCount:  number;
  enrolledValue:  number;
  enrolledCount:  number;
  totalCollected: number;
}

export default function RevenueSummary() {
  const [data,    setData]    = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/crm/revenue")
      .then(r => r.json())
      .then((d: RevenueData) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center gap-2 mt-3 text-xs text-slate-400">
      <Loader2 size={12} className="animate-spin" /> Loading revenue data…
    </div>
  );

  if (!data) return null;

  const collectionRate = data.enrolledValue > 0
    ? Math.round((data.totalCollected / data.enrolledValue) * 100)
    : 0;

  return (
    <div className="flex gap-3 mt-4 flex-wrap">
      <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-0">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <TrendingUp size={14} className="text-blue-600" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-medium leading-none">Pipeline Value</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">${data.pipelineValue.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400">{data.pipelineCount} leads</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
          <Users size={14} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-medium leading-none">Enrolled Value</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">${data.enrolledValue.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400">{data.enrolledCount} students</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-0">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
          <DollarSign size={14} className="text-violet-600" />
        </div>
        <div>
          <p className="text-[11px] text-slate-400 font-medium leading-none">Collected</p>
          <p className="text-sm font-bold text-slate-900 mt-0.5">${data.totalCollected.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400">{collectionRate}% collection rate</p>
        </div>
      </div>

      {data.enrolledValue > 0 && (
        <div className="flex-1 min-w-[160px] bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm flex flex-col justify-center">
          <div className="flex justify-between text-[11px] mb-1">
            <span className="text-slate-400">Collection rate</span>
            <span className={`font-bold ${collectionRate >= 80 ? "text-emerald-600" : collectionRate >= 50 ? "text-amber-600" : "text-red-500"}`}>
              {collectionRate}%
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                collectionRate >= 80 ? "bg-emerald-500" : collectionRate >= 50 ? "bg-amber-500" : "bg-red-400"
              }`}
              style={{ width: `${collectionRate}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            ${(data.enrolledValue - data.totalCollected).toLocaleString()} outstanding
          </p>
        </div>
      )}
    </div>
  );
}
