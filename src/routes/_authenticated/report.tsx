import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { DataState } from "@/components/flat/Forms";
import { pageHead } from "@/lib/flat-actions";
import { downloadFinancialReport } from "@/lib/pdf-report";
import { eur, useFinancialReport } from "@/lib/flat";

export const Route = createFileRoute("/_authenticated/report")({
  head: () =>
    pageHead(
      "Financial Audit Report",
      "Official shared expense and contribution tracking document for Oct 2 – Oct 24, 2026.",
    ),
  component: ReportPage,
});

function ReportPage() {
  const query = useFinancialReport();
  const report = query.data;
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!report) return;
    setDownloading(true);
    try {
      downloadFinancialReport(report);
      toast.success("Financial audit report downloaded.");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Financial Audit Report"
        sub="Oct 2 – Oct 24, 2026 · Official shared expense & contribution tracking document"
        action={
          <Button onClick={download} disabled={!report || downloading}>
            <Download />
            {downloading ? "Preparing PDF…" : "Download Financial Audit Report"}
          </Button>
        }
      />

      <DataState query={query} />

      {report && (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Live pool balance"
              value={eur(report.pool.pool_balance_cents)}
              tone={report.pool.pool_balance_cents < 0 ? "bad" : "good"}
              note="Contributions − purchases"
            />
            <SummaryCard
              label="Active members"
              value={String(report.active_members)}
              note="Five flatmates"
            />
            <SummaryCard
              label="Total contributions"
              value={eur(report.pool.contributions_cents)}
              note={`Cash ${eur(report.pool.cash_contributions_cents)} · Direct ${eur(report.pool.direct_contributions_cents)}`}
            />
            <SummaryCard
              label="Total purchases"
              value={eur(report.pool.purchases_cents)}
              note={`Pool ${eur(report.pool.pool_purchases_cents)} · Direct ${eur(report.pool.direct_purchases_cents)}`}
            />
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Member contribution status</h2>
              <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#2563eb]">
                Round 5 · €10.00 / member
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {report.member_status.map((member) => (
                <article
                  key={member.id}
                  className={
                    "rounded-xl border p-3 " +
                    (member.status === "pending"
                      ? "border-[#f59e0b]/60 bg-[#fffbeb]"
                      : "border-slate-200 bg-white")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-[#1e293b]">
                      {member.display_name}
                    </p>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " +
                        (member.status === "pending"
                          ? "bg-[#fee2e2] text-[#b91c1c]"
                          : "bg-emerald-100 text-emerald-700")
                      }
                    >
                      {member.status === "pending" ? "Action" : "Settled"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {member.is_admin ? "Admin / Member" : "Member"}
                  </p>
                  {member.status === "pending" ? (
                    <p className="mt-2 flex items-start gap-1 text-xs text-[#92400e]">
                      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {member.status_note ?? `Pending ${eur(member.outstanding_cents)}.`}
                    </p>
                  ) : (
                    <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Settled
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="text-lg font-semibold">Contribution rounds</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b bg-[#1e293b] text-white">
                    <th className="px-3 py-2 font-semibold">Round</th>
                    <th className="px-3 py-2 font-semibold">Collected</th>
                    <th className="px-3 py-2 font-semibold">Target / member</th>
                    <th className="px-3 py-2 font-semibold">Required</th>
                    <th className="px-3 py-2 font-semibold">Collected</th>
                    <th className="px-3 py-2 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.rounds.map((round) => (
                    <tr key={round.id}>
                      <td className="px-3 py-2 font-medium">{round.label}</td>
                      <td className="px-3 py-2">{round.collected_on}</td>
                      <td className="px-3 py-2">{eur(round.target_per_member_cents)}</td>
                      <td className="px-3 py-2">{eur(round.required_cents)}</td>
                      <td className="px-3 py-2">{eur(round.collected_cents)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{round.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">Audit ledger</h2>
                <p className="text-sm text-muted-foreground">
                  Contributions add to the pool; expenses drain it. Direct store payments are shown in
                  amber and do not change pool cash.
                </p>
              </div>
              <span className="rounded-full bg-[#1e293b] px-3 py-1 text-xs font-semibold text-white">
                Closing balance {eur(report.closing_balance_cents)}
              </span>
            </div>
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="bg-[#1e293b] text-white">
                    <th className="px-3 py-2 font-semibold">Date</th>
                    <th className="px-3 py-2 font-semibold">Description</th>
                    <th className="px-3 py-2 font-semibold">Paid by</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    <th className="px-3 py-2 text-right font-semibold">Pool balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {report.entries.map((entry) => {
                    const signedAmount = entry.type === "expense" ? -entry.amount_cents : entry.amount_cents;
                    return (
                      <tr
                        key={entry.key}
                        className={
                          entry.type === "direct_payment"
                            ? "bg-[#fffbeb] text-[#92400e]"
                            : undefined
                        }
                      >
                        <td className="whitespace-nowrap px-3 py-2">{entry.date}</td>
                        <td className="px-3 py-2">{entry.description}</td>
                        <td className="px-3 py-2">{entry.paid_by}</td>
                        <td className="px-3 py-2 capitalize">
                          {entry.type === "direct_payment"
                            ? "Direct store"
                            : entry.type.replaceAll("_", " ")}
                        </td>
                        <td
                          className={
                            "px-3 py-2 text-right font-semibold " +
                            (entry.type === "direct_payment"
                              ? "text-[#92400e]"
                              : signedAmount >= 0
                                ? "text-emerald-700"
                                : "text-[#b91c1c]")
                          }
                        >
                          {entry.type === "direct_payment"
                            ? eur(entry.amount_cents)
                            : (signedAmount >= 0 ? "+" : "") + eur(signedAmount)}
                        </td>
                        <td
                          className={
                            "px-3 py-2 text-right " +
                            (entry.running_balance_cents < 0 ? "text-[#b91c1c]" : "")
                          }
                        >
                          {entry.type === "direct_payment" ? "—" : eur(entry.running_balance_cents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!report.entries.length && <Empty>No ledger entries yet.</Empty>}
          </section>

          <section className="rounded-2xl border border-[#f59e0b]/50 bg-[#fffbeb] p-5">
            <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-[#92400e]">
              <FileText className="h-4 w-4" />
              Next step budget call
            </p>
            <p className="mt-2 text-sm text-[#78350f]">
              Collect {eur(report.next_budget_cents)} from each member and{" "}
              {eur(report.pending_contribution_cents)} from the pending member. This yields{" "}
              {eur(report.next_budget_cents * 5 + report.pending_contribution_cents)}, leaving a clean
              positive balance of{" "}
              {eur(
                report.next_budget_cents * 5 +
                  report.pending_contribution_cents +
                  report.pool.pool_balance_cents,
              )}{" "}
              for upcoming expenses.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          "mt-1 font-display text-2xl font-bold " +
          (tone === "bad" ? "text-[#b91c1c]" : tone === "good" ? "text-emerald-700" : "")
        }
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
