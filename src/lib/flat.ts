import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, mediaUrl, ApiError } from "@/lib/api";
import type {
  Space,
  Resident,
  Expense,
  Chore,
  Issue,
  Group,
  WashroomAccess,
  ResidentBalance,
  PoolOverview,
  FinanceOverview,
  FinancialReport,
  ChoreEvent,
  Issue as IssueRow,
  LedgerEntry,
  AuditEntry,
  MePayload,
} from "@/lib/types";

export type { Space, Resident, Expense, Chore, Issue, Group, MePayload };

export const eur = (cents: number | null | undefined) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);

export const toCents = (v: string) => Math.round(parseFloat(v.replace(",", ".")) * 100);

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<MePayload | null> => {
      try {
        return await api.get<MePayload>("/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
  });
}

export const useSpaces = () => useQuery({ queryKey: ["spaces"], queryFn: () => api.get<Space[]>("/spaces") });
export const useResidents = () =>
  useQuery({ queryKey: ["residents"], queryFn: () => api.get<Resident[]>("/residents") });
export const useGroups = () => useQuery({ queryKey: ["groups"], queryFn: () => api.get<Group[]>("/groups") });
export const useWashroomAccess = () =>
  useQuery({ queryKey: ["washroom_access"], queryFn: () => api.get<WashroomAccess[]>("/washroom-access") });
export const useBalances = () =>
  useQuery({ queryKey: ["balances"], queryFn: () => api.get<ResidentBalance[]>("/balances") });
export const usePool = () =>
  useQuery({ queryKey: ["pool"], queryFn: () => api.get<PoolOverview>("/pool") });
export const useFinanceOverview = () =>
  useQuery({
    queryKey: ["finance-overview"],
    queryFn: () => api.get<FinanceOverview>("/finance/overview"),
  });
export const useFinancialReport = () =>
  useQuery({
    queryKey: ["financial-report"],
    queryFn: () => api.get<FinancialReport>("/financial-report"),
  });
export const useExpenses = () => useQuery({ queryKey: ["expenses"], queryFn: () => api.get<Expense[]>("/expenses") });
export const useExpenseShares = () =>
  useQuery({ queryKey: ["expense_shares"], queryFn: () => api.get<ExpenseShare[]>("/expense-shares") });
export const useChores = () => useQuery({ queryKey: ["chores"], queryFn: () => api.get<Chore[]>("/chores") });
export const useChoreEvents = () =>
  useQuery({ queryKey: ["chore_events"], queryFn: () => api.get<ChoreEvent[]>("/chore-events") });
export const useIssues = () => useQuery({ queryKey: ["issues"], queryFn: () => api.get<IssueRow[]>("/issues") });
export const useLedger = (residentId?: string | null) =>
  useQuery({
    queryKey: ["ledger", residentId],
    enabled: !!residentId,
    queryFn: () => api.get<LedgerEntry[]>(`/ledger/${residentId}`),
  });
export const useAudit = () =>
  useQuery({ queryKey: ["audit"], queryFn: () => api.get<AuditEntry[]>("/audit") });
export const useAccounts = () =>
  useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<import("@/lib/types").AccountRow[]>("/users"),
  });

export type ExpenseShare = {
  id: string;
  expense_id: number;
  resident_id: string | null;
  external_name?: string | null;
  amount_cents: number;
};

/* ------------------------------------------------------------- meal plan */

export type MealPlan = {
  week_start: string;
  items: import("@/lib/types").MealPlanEntry[];
};

export const mealOrder = ["dinner", "lunch", "breakfast"] as const;
export type MealKind = (typeof mealOrder)[number];

/** Local-time helpers so "today" is always the user's calendar date, not UTC. */
const isoOfDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function mondayOf(isoDate?: string): string {
  const d = isoDate ? new Date(isoDate + "T12:00:00") : new Date();
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return isoOfDay(d);
}

/** Stops at noon so comparisons stay inside the same calendar day in summer/winter zones. */
export function shiftDays(iso: string, days: number): string {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return isoOfDay(d);
}

export function useMealPlan(week?: string) {
  return useQuery({
    queryKey: ["mealplan", week],
    enabled: !!week,
    queryFn: () => api.get<MealPlan>("/mealplan?week=" + week),
  });
}

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/** Uploads media into the backend media library and returns the new asset id (files live on disk, rows in media_assets). */
export async function uploadFile(bucket: "receipts" | "photos" | "media" | "social", file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("Please choose a file smaller than 10 MB");
  const form = new FormData();
  form.append("file", file);
  let asset: { id: string };
  if (bucket === "receipts" || bucket === "photos") {
    asset = await api.post<{ id: string }>(`/media?bucket=${bucket}`, form);
  } else {
    throw new Error("Use the media library for website graphics");
  }
  return asset.id;
}

export async function fileHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Receipts/photos stream through authenticated API routes (same cookie, no signed URLs needed). */
export function openFile(_bucket: "receipts" | "photos" | "media", mediaId: string) {
  window.open(mediaUrl(mediaId), "_blank", "noopener");
}

export function nameOf(residents: Resident[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return residents?.find((r) => r.id === id)?.display_name ?? "Unknown";
}
