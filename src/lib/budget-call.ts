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
  const active = report.member_status.filter((member) => member.active);
  const settled = active.filter((member) => member.status === "settled");
  const pending = active.filter((member) => member.status === "pending");
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

/**
 * Human-readable version of the next-step call. Before a round starts, settled
 * members pay the next target while pending members clear their outstanding.
 * Once a round is running and nobody is settled, the call is simply the total
 * outstanding amount.
 */
export function budgetCallMessage(
  report: Pick<FinancialReport, "member_status" | "next_budget_cents" | "pool">,
  money: (cents: number) => string,
): string {
  const call = budgetCall(report);
  if (call.settledCount > 0) {
    return (
      `Collect ${money(report.next_budget_cents)} from each of the ${call.settledCount} settled members and ` +
      `${money(call.pendingCents)} from ${call.pendingCount === 1 ? "the pending member" : "the pending members"}. ` +
      `This yields ${money(call.collectionCents)}, leaving a clean positive balance of ` +
      `${money(call.projectedBalanceCents)} for upcoming expenses.`
    );
  }
  return (
    `Collect ${money(call.collectionCents)} in outstanding round dues from the ` +
    `${call.pendingCount === 1 ? "pending member" : `${call.pendingCount} pending members`}. ` +
    `This yields ${money(call.collectionCents)}, leaving a clean positive balance of ` +
    `${money(call.projectedBalanceCents)} for upcoming expenses.`
  );
}
