import { describe, expect, it } from "vitest";
import { budgetCall, budgetCallMessage } from "@/lib/budget-call";
import type { FinancialReport } from "@/lib/types";

type BudgetInput = Pick<FinancialReport, "member_status" | "next_budget_cents" | "pool">;

const pool: FinancialReport["pool"] = {
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
};

function makeReport(pendingOutstanding: number): BudgetInput {
  return {
    next_budget_cents: 1000,
    pool,
    member_status: [
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "settled", outstanding_cents: 0, active: true },
      { status: "pending", outstanding_cents: pendingOutstanding, active: true },
    ] as unknown as FinancialReport["member_status"],
  };
}

/** After Round 6 starts, all five members have a €10 due; Asif also carries €11. */
function makeAllPending(asifOutstanding: number): BudgetInput {
  return {
    next_budget_cents: 1000,
    pool,
    member_status: [
      { status: "pending", outstanding_cents: 1000, active: true },
      { status: "pending", outstanding_cents: 1000, active: true },
      { status: "pending", outstanding_cents: 1000, active: true },
      { status: "pending", outstanding_cents: 1000, active: true },
      { status: "pending", outstanding_cents: asifOutstanding, active: true },
    ] as unknown as FinancialReport["member_status"],
  };
}

const euro = (cents: number) => `€${(cents / 100).toFixed(2)}`;

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

  it("collects every member's outstanding after a new round is started", () => {
    const call = budgetCall(makeAllPending(2100));
    expect(call.settledCount).toBe(0);
    expect(call.pendingCount).toBe(5);
    expect(call.pendingCents).toBe(6100);
    expect(call.collectionCents).toBe(6100);
    expect(call.projectedBalanceCents).toBe(4973);
  });

  it("keeps the current €51.00 / €39.73 wording before the next round", () => {
    expect(budgetCallMessage(makeReport(1100), euro)).toBe(
      "Collect €10.00 from each of the 4 settled members and €11.00 from the pending member. " +
        "This yields €51.00, leaving a clean positive balance of €39.73 for upcoming expenses.",
    );
  });

  it("switches to a full outstanding collection once everyone has a round due", () => {
    expect(budgetCallMessage(makeAllPending(2100), euro)).toBe(
      "Collect €61.00 in outstanding round dues from the 5 pending members. " +
        "This yields €61.00, leaving a clean positive balance of €49.73 for upcoming expenses.",
    );
  });
});
