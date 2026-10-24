import type { FinancialReport } from "@/lib/types";

/**
 * The next budget call collects one round from every settled member plus
 * whatever the pending member still owes. Pending amounts can be larger than
 * the round target (Asif's €11.00 includes the €1.00 reconciliation), so each
 * pending member contributes the greater of the two.
 */
export function budgetCall(
  report: Pick<FinancialReport, "member_status" | "next_budget_cents" | "pool">,
) {
  const settled = report.member_status.filter((member) => member.status === "settled");
  const pending = report.member_status.filter((member) => member.status === "pending");
  const pendingCents = pending.reduce(
    (sum, member) => sum + Math.max(report.next_budget_cents, member.outstanding_cents),
    0,
  );
  const collectionCents = settled.length * report.next_budget_cents + pendingCents;
  return {
    settledCount: settled.length,
    pendingCount: pending.length,
    pendingCents,
    collectionCents,
    projectedBalanceCents: collectionCents + report.pool.pool_balance_cents,
  };
}
