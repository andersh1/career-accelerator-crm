"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Kanban, TrendingUp, Settings, LogOut, Menu, X,
  CheckSquare, Search, Mail, LifeBuoy, LayoutDashboard, Zap,
  UserRound, UsersRound, GraduationCap, AlertCircle, BookOpen,
  ExternalLink, Handshake, Trophy, Tag, Share2, Calendar,
} from "lucide-react";
import GlobalSearch from "@/components/crm/GlobalSearch";
import NotificationBell from "@/components/crm/NotificationBell";
import HelpBeacon from "@/components/crm/HelpBeacon";

const baseNav = [
  { href: "/home",       label: "Home",        icon: LayoutDashboard, adminOnly: false },
  { href: "/pipeline",   label: "Pipeline",    icon: Kanban,          adminOnly: false },
  { href: "/students",   label: "Students",    icon: GraduationCap,   adminOnly: false },
  { href: "/cohorts",   label: "Cohorts",     icon: BookOpen,        adminOnly: false },
  { href: "/leads",      label: "Leads",       icon: UserRound,       adminOnly: false },
  { href: "/tickets",    label: "Support",     icon: LifeBuoy,        adminOnly: false },
  { href: "/tasks",      label: "Tasks",       icon: CheckSquare,     adminOnly: false },
  { href: "/sequences",  label: "Sequences",   icon: Mail,            adminOnly: false },
  { href: "/blast",      label: "Email Blast", icon: Zap,             adminOnly: false },
  { href: "/events",            label: "Events",       icon: Calendar,    adminOnly: false },
  { href: "/outcomes",          label: "Outcomes",     icon: Trophy,      adminOnly: true  },
  { href: "/analytics",         label: "Analytics",    icon: TrendingUp,  adminOnly: true  },
  { href: "/promo-codes",       label: "Promo Codes",  icon: Tag,         adminOnly: true  },
  { href: "/referrals",         label: "Referrals",    icon: Share2,      adminOnly: true  },
  { href: "/issues",            label: "Issues",       icon: AlertCircle, adminOnly: true  },
  { href: "/team",              label: "Team",         icon: UsersRound,  adminOnly: true  },
  { href: "/automation",        label: "Automation",   icon: Zap,         adminOnly: true  },
  { href: "/partnerships/deals",    label: "Deals",    icon: Handshake,   adminOnly: false },
  { href: "/partnerships/contacts", label: "Contacts", icon: UserRound,   adminOnly: false },
];

const NAV_SECTIONS = [
  { label: "CRM",          keys: ["/home", "/pipeline", "/students", "/cohorts", "/leads", "/tickets"] },
  { label: "Outreach",    keys: ["/tasks", "/sequences", "/blast"] },
  { label: "Growth",      keys: ["/events", "/referrals", "/promo-codes"] },
  { label: "Partnerships", keys: ["/partnerships/deals", "/partnerships/contacts"] },
  { label: "Admin",       keys: ["/outcomes", "/analytics", "/issues", "/team", "/automation"], adminOnly: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname          = usePathname();
  const { data: session } = useSession();
  const [open, setOpen]   = useState(false);
  const isAdmin = (session?.user as { crmRole?: string } | undefined)?.crmRole === "ADMIN";
  const nav = baseNav.filter(item => !item.adminOnly || isAdmin);

  function isActive(href: string) {
    if (href === "/pipeline" || href === "/home" || href === "/team") return pathname === href;
    return pathname.startsWith(href);
  }

  const userName  = (session?.user as { name?: string } | undefined)?.name ?? "";
  const userEmail = session?.user?.email ?? "";
  const userInitial = (userName[0] ?? userEmail[0] ?? "A").toUpperCase();

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 pt-6 pb-5">
        <img src="/10ximpact-logo.webp" alt="Vantage Career" className="h-7 w-auto object-contain" />
      </div>

      {/* User chip */}
      {session?.user && (
        <div className="mx-3 mb-3 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3 px-3 py-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-display font-bold"
              style={{ background: "rgba(255,255,255,0.15)", color: "white", fontSize: "0.9375rem" }}
            >
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              {userName && (
                <p className="text-[13px] font-semibold truncate leading-tight text-white">{userName}</p>
              )}
              <p className="text-[11px] truncate leading-tight mt-0.5" style={{ color: "rgba(255,255,255,0.42)" }}>
                {userEmail}
              </p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <NotificationBell />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: "rgba(255,255,255,0.35)" }}
                title="Sign out"
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
          <div className="px-3 pb-2.5 -mt-1">
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.38)", letterSpacing: "0.12em" }}
            >
              {isAdmin ? "CRM Admin" : "Member"}
            </span>
          </div>
        </div>
      )}

      {/* Search trigger */}
      <div className="px-3 pb-3">
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.45)" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.45)"; }}
        >
          <Search size={12} />
          <span className="flex-1 text-left">Search contacts…</span>
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", opacity: 0.7 }}>⌘K</kbd>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto scrollbar-thin space-y-4">
        {NAV_SECTIONS.filter(sec => !sec.adminOnly || isAdmin).map(section => {
          const sectionNav = nav.filter(item => section.keys.includes(item.href));
          if (!sectionNav.length) return null;
          return (
            <div key={section.label}>
              <p className="text-[9px] font-bold uppercase px-3 mb-1" style={{ color: "rgba(255,255,255,0.28)", letterSpacing: "0.14em" }}>
                {section.label}
              </p>
              <div className="space-y-0.5">
                {sectionNav.map(({ href, label, icon: Icon }) => {
                  const active = isActive(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`sidebar-link ${active ? "active" : "inactive"}`}
                    >
                      <Icon size={15} className="flex-shrink-0" style={{ opacity: active ? 1 : 0.7 }} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom: LMS + Settings */}
      <div className="px-3 py-3 border-t border-white/10 space-y-0.5">
        <button
          onClick={async () => {
            const win = window.open("", "_blank");
            try {
              const res = await fetch("/api/crm/lms-bridge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetUrl: "/admin" }) });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                win?.close();
                alert(`LMS bridge error (${res.status}): ${data.error ?? "unknown"}`);
                return;
              }
              const { url } = data;
              if (win && url) win.location.href = url;
              else { win?.close(); alert(`No URL returned. Data: ${JSON.stringify(data)}`); }
            } catch (e) { win?.close(); alert(`LMS bridge failed: ${e}`); }
          }}
          className="sidebar-link inactive w-full text-left"
        >
          <ExternalLink size={15} className="flex-shrink-0" style={{ opacity: 0.7 }} />
          Open LMS
        </button>
        <a
          href="https://crm.vantagecareer.co"
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
          className="sidebar-link inactive w-full text-left"
        >
          <ExternalLink size={15} className="flex-shrink-0" style={{ opacity: 0.7 }} />
          Open Networking CRM
        </a>
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={`sidebar-link ${isActive("/settings") ? "active" : "inactive"}`}
        >
          <Settings size={15} className="flex-shrink-0" style={{ opacity: isActive("/settings") ? 1 : 0.7 }} />
          Settings
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8f6f1" }}>
      <GlobalSearch />
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col w-[240px] shrink-0"
        style={{ background: "linear-gradient(180deg, #0a6b64 0%, #063b37 100%)" }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside
            className="absolute left-0 top-0 bottom-0 w-[240px] z-50"
            style={{ background: "linear-gradient(180deg, #0a6b64 0%, #063b37 100%)" }}
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      <HelpBeacon />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b" style={{ borderColor: "#e4e0d6" }}>
          <button onClick={() => setOpen(!open)} className="p-1.5 rounded-lg transition-colors" style={{ color: "#5a6663" }}>
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <img src="/10ximpact-logo.webp" alt="Vantage Career" className="h-6 w-auto object-contain" />
        </header>
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
}
