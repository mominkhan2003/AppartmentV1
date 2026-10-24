import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { logout } from "@/lib/flat-actions";
import { useMe } from "@/lib/flat";
import type { MePayload } from "@/lib/types";
import {
  Home,
  LayoutGrid,
  Users,
  Receipt,
  Wallet,
  Sparkles,
  Wrench,
  Shield,
  LogOut,
  UserRound,
  Bell,
  UtensilsCrossed,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hubPages, hubPaths } from "@/lib/hub";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    let me: MePayload | null = null;
    try {
      me = await api.get<MePayload>("/auth/me");
    } catch {
      throw redirect({ to: "/auth" });
    }
    // brand-new accounts wait here until an admin verifies them
    if (me && me.approved === false) {
      throw redirect({ to: "/auth", search: { pending: true } });
    }
    // freshly seeded accounts must set their own password before anything else
    if (me?.force_password_change && !location.pathname.startsWith("/account")) {
      throw redirect({ to: "/account" });
    }
  },
  component: Shell,
});

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid },
  { to: "/residents", label: "Residents", icon: Users },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/balance", label: "My Balance", icon: Wallet },
  { to: "/report", label: "Audit report", icon: FileText },
  { to: "/weekly", label: "Weekly menu", icon: UtensilsCrossed },
  { to: "/cleaning", label: "Cleaning", icon: Sparkles },
  { to: "/issues", label: "Issues", icon: Wrench },
] as const;

const adminNav = [
  { to: "/admin", label: "Admin Portal", icon: Shield },
  { to: "/content", label: "Homepage content", icon: LayoutGrid },
  { to: "/media", label: "Media library", icon: Sparkles },
  { to: "/events-plan", label: "Public events", icon: Receipt },
  { to: "/donations", label: "Donations", icon: Wallet },
  { to: "/studio", label: "Social posts", icon: Wrench },
] as const;

/** The five entries that get a dedicated slot in the mobile bottom bar. */
const mobileNav = [nav[0], nav[1], nav[2], nav[3], nav[5]] as const;

function Shell() {
  const { data: me, error } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    navigate({ to: "/auth", replace: true });
  }
  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground";
  const active = { className: "bg-sidebar-accent text-sidebar-foreground font-medium" };
  const bottomCls =
    "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] leading-tight text-sidebar-foreground/75 hover:text-sidebar-foreground";
  const bottomActive = { className: "bg-sidebar-accent text-sidebar-foreground font-semibold" };
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Home className="h-5 w-5 text-sidebar-primary" />
          <span className="font-display text-base font-bold">FlatMate Hub</span>
        </Link>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-sidebar-foreground/70">
            {me?.resident?.display_name ?? me?.user.email ?? ""}
          </span>
          <Link to="/notifications" aria-label="Notifications" className="rounded-lg p-2 text-sidebar-foreground/80">
            <Bell className="h-5 w-5" />
          </Link>
          <button type="button" onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 text-sidebar-foreground/80">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* desktop sidebar (unchanged on md+) */}
      <aside className="hidden shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:overflow-y-auto">
        <div className="mb-6 flex items-center gap-2 px-2">
          <Home className="h-5 w-5 text-sidebar-primary" />
          <span className="font-display text-lg font-bold">FlatMate Hub</span>
        </div>
        <nav className="flex flex-wrap gap-1 md:flex-col">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={linkCls} activeProps={active}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <details className="my-4" open>
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-sidebar-foreground/60">
            Household extras
          </summary>
          <nav aria-label="Household extras" className="mt-1 grid grid-cols-2 gap-1 md:grid-cols-1">
            {hubPaths.map((key) => {
              const item = hubPages[key];
              return (
                <Link key={key} to={`/${key}`} className={linkCls} activeProps={active}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </details>
        {me?.isAdmin && (
          <details className="my-4" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-sidebar-foreground/60">
              Administration
            </summary>
            <nav aria-label="Administration" className="mt-1 grid grid-cols-2 gap-1 md:grid-cols-1">
              {adminNav.map((n) => (
                <Link key={n.to} to={n.to} className={linkCls} activeProps={active}>
                  <n.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-words">{n.label}</span>
                </Link>
              ))}
            </nav>
          </details>
        )}
        <div className="mt-auto border-t border-sidebar-border pt-4 text-sm">
          <div className="px-2 font-medium">{me?.resident?.display_name ?? me?.user.email ?? ""}</div>
          <div className="px-2 text-xs text-sidebar-foreground/60">{me?.isAdmin ? "Admin" : "Resident"}</div>
          <Link to="/notifications" className={linkCls + " mt-3"} activeProps={active}>
            <Bell className="h-4 w-4" /> Notifications
          </Link>
          <Link to="/account" className={linkCls} activeProps={active}>
            <UserRound className="h-4 w-4" /> My account
          </Link>
          <Button variant="ghost" onClick={signOut} className={linkCls + " mt-2 w-full justify-start"}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-3 pb-24 pt-3 md:p-8 md:pb-8">
        {me?.force_password_change && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
            You are using the starting password. Please set your own password now —{" "}
            <Link to="/account" className="underline underline-offset-2">
              My account
            </Link>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive">
            {error.message}
          </p>
        ) : (
          <Outlet />
        )}
      </main>

      {/* mobile More sheet */}
      {more && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setMore(false)}
          />
          <div className="fixed inset-x-2 bottom-[4.5rem] z-40 max-h-[70dvh] overflow-y-auto rounded-2xl border border-sidebar-border bg-sidebar p-3 text-sidebar-foreground shadow-2xl">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase text-sidebar-foreground/60">More</span>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="rounded-lg p-2">
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav aria-label="Household extras" className="grid grid-cols-2 gap-1">
              {hubPaths.map((key) => {
                const item = hubPages[key];
                return (
                  <Link key={key} to={`/${key}`} className={linkCls} activeProps={active} onClick={() => setMore(false)}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{item.title}</span>
                  </Link>
                );
              })}
            </nav>
            {me?.isAdmin && (
              <>
                <div className="mb-1 mt-3 px-1 text-xs font-semibold uppercase text-sidebar-foreground/60">
                  Administration
                </div>
                <nav aria-label="Administration" className="grid grid-cols-2 gap-1">
                  {adminNav.map((n) => (
                    <Link key={n.to} to={n.to} className={linkCls} activeProps={active} onClick={() => setMore(false)}>
                      <n.icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 break-words">{n.label}</span>
                    </Link>
                  ))}
                </nav>
              </>
            )}
            <div className="mt-3 border-t border-sidebar-border pt-2">
              <Link to="/cleaning" className={linkCls} activeProps={active} onClick={() => setMore(false)}>
                <Sparkles className="h-4 w-4" /> Cleaning
              </Link>
              <Link to="/issues" className={linkCls} activeProps={active} onClick={() => setMore(false)}>
                <Wrench className="h-4 w-4" /> Issues
              </Link>
              <Link to="/account" className={linkCls} activeProps={active} onClick={() => setMore(false)}>
                <UserRound className="h-4 w-4" /> My account
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
      >
        {mobileNav.map((n) => (
          <Link key={n.to} to={n.to} className={bottomCls} activeProps={bottomActive}>
            <n.icon className="h-5 w-5" />
            <span className="truncate">{n.label === "Weekly menu" ? "Menu" : n.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setMore((v) => !v)} className={bottomCls}>
          {more ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
