import { describe, expect, it } from "vitest";
import { budgetCall } from "@/lib/budget-call";
import type { FinancialReport } from "@/lib/types";

type BudgetInput = Pick<FinancialReport, "member_status" | "next_budget_cents" | "pool">;

function makeReport(pendingOutstanding: number): BudgetInput {
  return {
    next_budget_cents: 1000,
    pool: {
      contributions_cents: 31766,
      purchases_cents: 32893,
      cash_contributions_cents: 27400,
      direct_contributions_cents: 4366,
      pool_purchases_cents: 28527,
      direct_purchases_cents: 4366,
      adjustments_cents: 0,
      claim_credits_cents: 0,
      pool_balance_cents: -1127,
      formula: "overall_group_balance = total_group_contributions - total_group_purchases",
    },
    member_status: [
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "pending", outstanding_cents: pendingOutstanding, active: true },
    ] as unknown as FinancialReport["member_status"],
  };
}

describe("next budget call", () => {
  it("collects the round target from settled members and the pending amount from Asif", () => {
    const call = budgetCall(makeReport(1100));
    expect(call.settledCount).toBe(4);
    expect(call.pendingCents).toBe(1100);
    expect(call.collectionCents).toBe(5100);
    expect(call.projectedBalanceCents).toBe(3973);
  });

  it("never collects less than the round target from a pending member", () => {
    const call = budgetCall(makeReport(500));
    expect(call.pendingCents).toBe(1000);
    expect(call.collectionCents).toBe(5000);
    expect(call.projectedBalanceCents).toBe(3873);
  });
});
