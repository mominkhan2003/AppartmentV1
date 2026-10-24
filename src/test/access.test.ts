import { describe, expect, it } from "vitest";
import { canViewFinance, isFinancePath } from "@/lib/access";

describe("limited resident access", () => {
  it("keeps finance visible for admins and normal residents", () => {
    expect(canViewFinance({ isAdmin: true, can_view_finance: false })).toBe(true);
    expect(canViewFinance({ isAdmin: false, can_view_finance: true })).toBe(true);
    expect(canViewFinance({ isAdmin: false })).toBe(true);
  });

  it("hides finance for a resident whose budget access is switched off", () => {
    expect(canViewFinance({ isAdmin: false, can_view_finance: false })).toBe(false);
  });

  it("treats every financial page and its children as protected", () => {
    for (const path of ["/dashboard", "/residents", "/expenses", "/balance", "/report"]) {
      expect(isFinancePath(path)).toBe(true);
      expect(isFinancePath(path + "/detail")).toBe(true);
    }
    expect(isFinancePath("/cleaning")).toBe(false);
    expect(isFinancePath("/issues")).toBe(false);
    expect(isFinancePath("/weekly")).toBe(false);
    expect(isFinancePath("/polls")).toBe(false);
    expect(isFinancePath("/reports")).toBe(false);
  });
});
