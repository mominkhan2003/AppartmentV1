import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { FloorPlan } from "@/components/flat/FloorPlan";
import { PageHeader, Panel } from "@/components/flat/Page";
import { Button } from "@/components/ui/button";
import { pageHead } from "@/lib/flat-actions";
import { downloadFinancialReport } from "@/lib/pdf-report";
import {
  eur,
  nameOf,
  useBalances,
  useChores,
  useFinanceOverview,
  useFinancialReport,
  useIssues,
  useMe,
  useResidents,
  useSpaces,
  type Space,
} from "@/lib/flat";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    pageHead(
      "Overview",
      "Live pool balance, member contribution status and the downloadable financial audit report.",
    ),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const { data: spaces = [] } = useSpaces();
  const { data: residents = [] } = useResidents();
  const { data: balances = [] } = useBalances();
  const { data: finance } = useFinanceOverview();
  const reportQuery = useFinancialReport();
  const { data: chores = [] } = useChores();
  const { data: issues = [] } = useIssues();
  const [sel, setSel] = useState<Space | null>(null);
  const [downloading, setDownloading] = useState(false);

  const myBal = balances.find((b) => b.resident_id === me?.resident?.id)?.balance_cents ?? 0;
  const myChores = chores.filter((c) => c.current_resident_id === me?.resident?.id && c.active);
  const open = issues.filter((i) => i.status !== "resolved");
  const pool = finance?.pool;
  const members = finance?.members ?? [];
  const pending = members.filter((m) => m.status === "pending");
  const settled = members.filter((m) => m.status === "settled");
  const pendingMember = pending[0];

  async function downloadReport() {
    setDownloading(true);
    try {
      const data = reportQuery.data ?? (await reportQuery.refetch()).data;
      if (!data) throw new Error("The audit report is not ready yet. Please try again.");
      downloadFinancialReport(data);
      toast.success("Financial audit report downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-[#1e293b] text-white shadow-xl shadow-slate-900/10">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-300">
              FlatMate Hub · Financial overview
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              {me?.resident?.display_name ? `Hi ${me.resident.display_name}` : "Household overview"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Oct 2 – Oct 24, 2026 · Overall group balance = total group contributions − total group
              purchases. Direct store payments are tracked as member credit and never change pool cash
              unless explicitly settled.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={downloadReport}
              disabled={downloading || reportQuery.isFetching}
              className="bg-[#2563eb] text-white hover:bg-blue-500"
            >
              <Download className="h-4 w-4" />
              {downloading ? "Preparing PDF…" : "Download Financial Audit Report"}
            </Button>
            <Button asChild variant="outline" className="border-slate-600 bg-transparent text-white hover:bg-slate-800 hover:text-white">
              <Link to="/report">
                <FileText className="h-4 w-4" />
                View report
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-px border-t border-slate-700 bg-slate-700 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Live pool balance"
            value={pool ? eur(pool.pool_balance_cents) : "…"}
            note="Contributions − purchases"
            tone={pool && pool.pool_balance_cents < 0 ? "alert" : "good"}
            icon={<TriangleAlert className="h-4 w-4" />}
          />
          <MetricCard
            label="Active members"
            value={finance ? String(finance.active_members) : "…"}
            note="Five flatmates"
            tone="blue"
            icon={<Users className="h-4 w-4" />}
          />
          <MetricCard
            label="Total contributions"
            value={pool ? eur(pool.contributions_cents) : "…"}
            note={pool ? `Cash ${eur(pool.cash_contributions_cents)} · Direct ${eur(pool.direct_contributions_cents)}` : ""}
            tone="neutral"
          />
          <MetricCard
            label="Total purchases"
            value={pool ? eur(pool.purchases_cents) : "…"}
            note={pool ? `Pool ${eur(pool.pool_purchases_cents)} · Direct ${eur(pool.direct_purchases_cents)}` : ""}
            tone="neutral"
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Member contribution status</h2>
            <p className="text-sm text-muted-foreground">
              Round 5 · €10.00 per member · Asif Bhai pending €11.00
            </p>
          </div>
          <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#2563eb]">
            {settled.length} settled · {pending.length} action required
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
          {!members.length && (
            <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
              Loading member statuses…
            </p>
          )}
        </div>
      </section>

      {pendingMember && (
        <section className="rounded-2xl border border-[#f59e0b]/50 bg-[#fffbeb] p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fee2e2] text-[#b91c1c]">
              <TriangleAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold uppercase tracking-wide text-[#92400e]">Action required</p>
              <p className="mt-1 text-sm text-[#78350f]">
                {pendingMember.display_name}:{" "}
                {pendingMember.status_note ??
                  `Pending ${eur(pendingMember.outstanding_cents)} contribution for Round 5.`}
              </p>
              <p className="mt-1 text-xs text-[#92400e]">
                The amount can be offset directly via upcoming grocery purchases. No cash hand-over is
                required.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Your balance" value={eur(myBal)} tone={myBal < 0 ? "bad" : "good"} />
        <MiniStat label="Your duties now" value={String(myChores.length)} />
        <MiniStat label="Open issues" value={String(open.length)} />
        <MiniStat
          label="Next budget call"
          value={`${eur(finance?.next_budget_cents ?? 1000)} / member`}
          note="Plus Asif's pending €11.00"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <FloorPlan spaces={spaces} residents={residents} highlight={sel?.id} onSelect={setSel} />
        <div className="space-y-6">
          {sel && (
            <Panel title={sel.name}>
              <p className="text-sm capitalize text-muted-foreground">
                {sel.kind}
                {sel.notes ? ` · ${sel.notes}` : ""}
              </p>
              <ul className="mt-2 text-sm">
                {residents
                  .filter((r) => r.room_id === sel.id)
                  .map((r) => (
                    <li key={r.id}>{r.display_name}</li>
                  ))}
              </ul>
              {chores
                .filter((c) => c.space_id === sel.id)
                .map((c) => (
                  <p key={c.id} className="mt-2 text-sm">
                    {c.name}: <b>{nameOf(residents, c.current_resident_id)}</b>, due {c.next_due}
                  </p>
                ))}
            </Panel>
          )}
          <Panel title="Cleaning this week">
            <ul className="space-y-2 text-sm">
              {chores
                .filter((c) => c.active)
                .map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{c.name}</span>
                    <span className="text-muted-foreground">
                      {nameOf(residents, c.current_resident_id)} · {c.next_due}
                    </span>
                  </li>
                ))}
              {!chores.filter((c) => c.active).length && (
                <li className="text-muted-foreground">No active duties yet.</li>
              )}
            </ul>
            <Link to="/cleaning" className="mt-3 inline-block text-sm text-primary underline">
              Open cleaning
            </Link>
          </Panel>
          <Panel title="Latest issues">
            <ul className="space-y-2 text-sm">
              {open.slice(0, 4).map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span className="truncate">{i.description}</span>
                  <span className="capitalize text-muted-foreground">
                    {i.status.replace("_", " ")}
                  </span>
                </li>
              ))}
              {!open.length && <li className="text-muted-foreground">Nothing open 🎉</li>}
            </ul>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  tone: "alert" | "good" | "blue" | "neutral";
  icon?: ReactNode;
}) {
  const toneClass =
    tone === "alert"
      ? "text-[#fca5a5]"
      : tone === "good"
        ? "text-emerald-300"
        : tone === "blue"
          ? "text-blue-300"
          : "text-white";
  return (
    <div className="bg-[#1e293b] p-5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {icon}
        {label}
      </div>
      <p className={`mt-2 font-display text-2xl font-bold ${toneClass}`}>{value}</p>
      {note && <p className="mt-1 text-[11px] leading-snug text-slate-400">{note}</p>}
    </div>
  );
}

function MemberCard({
  member,
}: {
  member: {
    id: string;
    display_name: string;
    is_admin: boolean;
    status: "pending" | "settled";
    outstanding_cents: number;
    status_note: string | null;
  };
}) {
  const pending = member.status === "pending";
  return (
    <article
      className={
        "rounded-2xl border p-4 transition-shadow hover:shadow-sm " +
        (pending ? "border-[#f59e0b]/60 bg-[#fffbeb]" : "border-slate-200 bg-white")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#1e293b] font-display text-sm font-bold text-white">
          {member.display_name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
            (pending ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-emerald-100 text-emerald-700")
          }
        >
          {pending ? "Action required" : "Settled"}
        </span>
      </div>
      <p className="mt-3 truncate text-sm font-semibold text-[#1e293b]">{member.display_name}</p>
      <p className="text-[11px] text-slate-500">{member.is_admin ? "Admin / Member" : "Member"}</p>
      {pending ? (
        <p className="mt-2 text-xs leading-snug text-[#92400e]">
          Pending {eur(member.outstanding_cents)} for Round 5. Offset via upcoming groceries.
        </p>
      ) : (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Contribution settled
        </p>
      )}
    </article>
  );
}

function MiniStat({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p
        className={
          "mt-1 font-display text-xl font-bold " +
          (tone === "bad" ? "text-[#b91c1c]" : tone === "good" ? "text-emerald-700" : "text-[#1e293b]")
        }
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
