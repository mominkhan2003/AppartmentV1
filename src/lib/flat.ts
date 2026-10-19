import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type T = Database["public"]["Tables"];
export type Space = T["spaces"]["Row"];
export type Resident = T["residents"]["Row"];
export type Expense = T["expenses"]["Row"];
export type Chore = T["chores"]["Row"];
export type Issue = T["issues"]["Row"];
export type Group = T["household_groups"]["Row"];

export const eur = (cents: number | null | undefined) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);

export const toCents = (v: string) => Math.round(parseFloat(v.replace(",", ".")) * 100);

async function must<D>(p: PromiseLike<{ data: D | null; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as D;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const [isAdmin, resident, permissions] = await Promise.all([
        must(supabase.rpc("is_admin")),
        must(supabase.from("residents").select("*").eq("user_id", user.id).maybeSingle()),
        must(supabase.rpc("portal_permissions")),
      ]);
      return { user, isAdmin: !!isAdmin, permissions: permissions ?? [], resident: resident as Resident | null };
    },
  });
}

export const useSpaces = () =>
  useQuery({ queryKey: ["spaces"], queryFn: () => must<Space[]>(supabase.from("spaces").select("*").order("sort")) });
export const useResidents = () =>
  useQuery({
    queryKey: ["residents"],
    queryFn: () => must<Resident[]>(supabase.from("residents").select("*").order("display_name")),
  });
export const useGroups = () =>
  useQuery({
    queryKey: ["groups"],
    queryFn: async () => {
      const [g, m] = await Promise.all([
        must<Group[]>(supabase.from("household_groups").select("*").order("name")),
        must<{ group_id: string; resident_id: string }[]>(supabase.from("group_members").select("*")),
      ]);
      return g.map((x) => ({ ...x, members: m.filter((mm) => mm.group_id === x.id).map((mm) => mm.resident_id) }));
    },
  });
export const useWashroomAccess = () =>
  useQuery({
    queryKey: ["washroom_access"],
    queryFn: () => must<{ bedroom_id: string; washroom_id: string }[]>(supabase.from("washroom_access").select("*")),
  });
export const useBalances = () =>
  useQuery({
    queryKey: ["balances"],
    queryFn: () => must<Database["public"]["Views"]["resident_balances"]["Row"][]>(supabase.from("resident_balances").select("*")),
  });
export const useExpenses = () =>
  useQuery({
    queryKey: ["expenses"],
    queryFn: () => must<Expense[]>(supabase.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false })),
  });
export const useChores = () =>
  useQuery({
    queryKey: ["chores"],
    queryFn: async () => {
      const [c, m] = await Promise.all([
        must<Chore[]>(supabase.from("chores").select("*").order("name")),
        must<{ chore_id: string; resident_id: string; position: number }[]>(supabase.from("chore_members").select("*").order("position")),
      ]);
      return c.map((x) => ({ ...x, members: m.filter((mm) => mm.chore_id === x.id).map((mm) => mm.resident_id) }));
    },
  });
export const useChoreEvents = () =>
  useQuery({
    queryKey: ["chore_events"],
    queryFn: () =>
      must<T["chore_events"]["Row"][]>(supabase.from("chore_events").select("*").order("created_at", { ascending: false }).limit(50)),
  });
export const useIssues = () =>
  useQuery({
    queryKey: ["issues"],
    queryFn: () => must<Issue[]>(supabase.from("issues").select("*").order("created_at", { ascending: false })),
  });
export const useLedger = (residentId?: string | null) =>
  useQuery({
    queryKey: ["ledger", residentId],
    enabled: !!residentId,
    queryFn: () => {
      if (!residentId) return [];
      return must<T["ledger_entries"]["Row"][]>(supabase.from("ledger_entries").select("*").eq("resident_id", residentId).order("created_at", { ascending: false }));
    },
  });
export const useAudit = () =>
  useQuery({
    queryKey: ["audit"],
    queryFn: () => must<T["audit_log"]["Row"][]>(supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100)),
  });

export function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

export async function uploadFile(bucket: "receipts" | "photos", file: File) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in before uploading a file");
  if (file.size > 10 * 1024 * 1024) throw new Error("Please choose a file smaller than 10 MB");
  const path = `${data.user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw new Error(error.message);
  return path;
}

export async function fileHash(file: File) {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function openFile(bucket: "receipts" | "photos", path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, "_blank");
}

export function nameOf(residents: Resident[] | undefined, id: string | null | undefined) {
  if (!id) return "—";
  return residents?.find((r) => r.id === id)?.display_name ?? "Unknown";
}
