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

export type ExpenseShare = {
  id: string;
  expense_id: number;
  resident_id: string;
  amount_cents: number;
};

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
