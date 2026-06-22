"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Kanban, TrendingUp, Settings, LogOut, Menu, X,
  Users, ChevronRight, CheckSquare, Search, Mail, LifeBuoy, LayoutDashboard, Zap, UserRound, HelpCircle, UsersRound,
} from "lucide-react";
import GlobalSearch from "@/components/crm/GlobalSearch";
import NotificationBell from "@/components/crm/NotificationBell";

const baseNav = [
  { href: "/home",      label: "Home",        icon: LayoutDashboard, adminOnly: false },
  { href: "/pipeline",  label: "Pipeline",    icon: Kanban,          adminOnly: false },
  { href: "/leads",     label: "Contacts",    icon: UserRound,       adminOnly: false },
  { href: "/tickets",   label: "Support",     icon: LifeBuoy,        adminOnly: false },
  { href: "/tasks",     label: "Tasks",       icon: CheckSquare,     adminOnly: false },
  { href: "/sequences", label: "Sequences",   icon: Mail,            adminOnly: false },
  { href: "/blast",     label: "Email Blast", icon: Zap,             adminOnly: false },
  { href: "/analytics",  label: "Analytics",   icon: TrendingUp,      adminOnly: true  },
  { href: "/team",       label: "Team",        icon: UsersRound,      adminOnly: true  },
  { href: "/automation", label: "Automation",  icon: Zap,             adminOnly: true  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname          = usePathname();
  const { data: session } = useSession();
  const [open, setOpen]   = useState(false);
  const isAdmin = (session?.user as { crmRole?: string } | undefined)?.crmRole === "ADMIN";
  const nav = baseNav.filter(item => !item.adminOnly || isAdmin);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] text-blue-400 font-bold tracking-widest uppercase leading-none">10x Career Accelerator</p>
            <p className="text-sm font-bold text-white leading-tight mt-0.5">CRM</p>
          </div>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-3 pb-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition text-xs"
        >
          <Search size={12} />
          <span className="flex-1 text-left">Search leads…</span>
          <kbd className="font-mono text-[10px] bg-slate-700 px-1.5 py-0.5 rounded opacity-70">⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 space-y-0.5 overflow-y-auto scrollbar-thin">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = (href === "/pipeline" || href === "/home" || href === "/team")
            ? pathname === href
            : pathname.startsWith(href);
          return (
            <Link
              key={href} href={href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
                ${active
                  ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-slate-800/60 space-y-0.5">
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
            ${pathname === "/settings"
              ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          Settings
        </Link>
        <Link
          href="/help"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors
            ${pathname === "/help"
              ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          Help
        </Link>

        <div className="flex items-center justify-between px-1 pt-1">
          <NotificationBell />
        </div>

        {/* Signed-in user card */}
        {session?.user && (
          <div className="mt-1 mx-0 p-3 rounded-xl bg-slate-800/60 border border-slate-700/40 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {((session.user as { name?: string }).name ?? session.user.email ?? "A")[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {(session.user as { name?: string }).name && (
                <p className="text-xs font-semibold text-white truncate leading-tight">
                  {(session.user as { name?: string }).name}
                </p>
              )}
              <p className="text-[11px] text-slate-400 truncate leading-tight">
                {session.user.email}
              </p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <GlobalSearch />
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[240px] shrink-0 bg-slate-900 border-r border-slate-800/60">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[240px] bg-slate-900 z-50">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <span className="font-bold text-slate-900">10x Career Accelerator CRM</span>
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
