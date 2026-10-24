/**
 * Financial visibility is a per-resident switch, not a portal permission.
 * Limited residents keep access to cleaning, issues and household extras, while
 * the budget, expenses, balances and audit report are hidden from them.
 */
export const financePaths = [
  "/dashboard",
  "/residents",
  "/expenses",
  "/balance",
  "/report",
] as const;

export type FinanceAccess = { isAdmin?: boolean; can_view_finance?: boolean } | null | undefined;

export function canViewFinance(me: FinanceAccess): boolean {
  // Before /auth/me resolves, keep the navigation intact; the route guard and
  // the API still enforce the restriction once the payload arrives.
  return me?.isAdmin === true || me?.can_view_finance !== false;
}

export function isFinancePath(pathname: string): boolean {
  return financePaths.some((path) => pathname === path || pathname.startsWith(path + "/"));
}
