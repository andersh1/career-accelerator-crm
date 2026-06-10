"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, AlertCircle, UserCheck, Mail, Flame, Loader2 } from "lucide-react";

interface Notification {
  id: string; type: string; title: string; body: string | null;
  leadId: string | null; href: string | null; read: boolean; createdAt: string;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  TASK_OVERDUE:  <AlertCircle size={14} className="text-red-500 shrink-0" />,
  LEAD_ENROLLED: <UserCheck   size={14} className="text-emerald-500 shrink-0" />,
  NEW_INTAKE:    <Mail        size={14} className="text-blue-500 shrink-0" />,
  LEAD_COLD:     <Flame       size={14} className="text-amber-500 shrink-0" />,
  SEQUENCE_SENT: <Mail        size={14} className="text-violet-500 shrink-0" />,
};

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)     return "just now";
  if (secs < 3600)   return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)  return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function NotificationBell() {
  const router    = useRouter();
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState<Notification[]>([]);
  const [unread,  setUnread]  = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res  = await fetch("/api/crm/notifications");
    const data = await res.json() as { notifications: Notification[]; unread: number };
    setNotifs(data.notifications ?? []);
    setUnread(data.unread ?? 0);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function markAllRead() {
    setLoading(true);
    await fetch("/api/crm/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    setUnread(0);
    setLoading(false);
  }

  async function clickNotif(notif: Notification) {
    if (!notif.read) {
      await fetch("/api/crm/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [notif.id] }) });
      setNotifs(n => n.map(x => x.id === notif.id ? { ...x, read: true } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    if (notif.href) { router.push(notif.href); setOpen(false); }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
        title="Notifications"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-bold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} disabled={loading}
                className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition">
                {loading ? <Loader2 size={10} className="animate-spin" /> : <CheckCheck size={12} />}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">No notifications yet</p>
              </div>
            ) : notifs.map(n => (
              <button key={n.id} onClick={() => clickNotif(n)}
                className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-50 hover:bg-slate-50 transition ${
                  !n.read ? "bg-blue-50/40" : ""
                }`}>
                <div className="mt-0.5">{TYPE_ICON[n.type] ?? <Bell size={14} className="text-slate-400" />}</div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug truncate ${!n.read ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="text-[11px] text-slate-400 truncate mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-slate-300 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
