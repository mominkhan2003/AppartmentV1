import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { logout } from "@/lib/flat-actions";
import { useMe } from "@/lib/flat";
import type { MePayload } from "@/lib/types";
import { Home, LayoutGrid, Users, Receipt, Wallet, Sparkles, Wrench, Shield, LogOut, UserRound, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hubPages, hubPaths } from "@/lib/hub";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      await api.get<MePayload>("/auth/me");
    } catch {
      throw redirect({ to: "/auth" });
    }
  },
  component: Shell,
});

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutGrid },
  { to: "/residents", label: "Residents", icon: Users },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/balance", label: "My Balance", icon: Wallet },
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

function Shell() {
  const { data: me, error } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await logout();
    navigate({ to: "/auth", replace: true });
  }
  const linkCls =
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground";
  const active = { className: "bg-sidebar-accent text-sidebar-foreground font-medium" };
  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:overflow-y-auto">
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
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-sidebar-foreground/60">Household extras</summary>
          <nav aria-label="Household extras" className="mt-1 grid grid-cols-2 gap-1 md:grid-cols-1">
            {hubPaths.map(key => { const item = hubPages[key]; return <Link key={key} to={`/${key}`} className={linkCls} activeProps={active}><item.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.title}</span></Link>; })}
          </nav>
        </details>
        {me?.isAdmin && (
          <details className="my-4" open>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-sidebar-foreground/60">Administration</summary>
            <nav aria-label="Administration" className="mt-1 grid grid-cols-2 gap-1 md:grid-cols-1">
              {adminNav.map(n => (
                <Link key={n.to} to={n.to} className={linkCls} activeProps={active}>
                  <n.icon className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{n.label}</span>
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
          <Link to="/account" className={linkCls} activeProps={active}><UserRound className="h-4 w-4" />My account</Link>
          <Button variant="ghost" onClick={signOut} className={linkCls + " mt-2 w-full justify-start"}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {error ? (
          <p role="alert" className="text-destructive">{error.message}</p>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
