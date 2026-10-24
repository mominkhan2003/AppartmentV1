import { api } from "@/lib/api";
import type { EventInput, EventCms, Resident } from "@/lib/types";

/**
 * Mutations used by the household pages. Every function calls one checked PHP
 * endpoint (backend/api/routes.php) which enforces the authorization rules the
 * old Postgres RPCs enforced. Errors are thrown as Error and toast via Editors.
 */

type FormDataLike = FormData;

export const pageHead = (title: string, description: string) => ({
  meta: [
    { title: `${title} — FlatMate Hub` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — FlatMate Hub` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});

/* ------------------------------------------------------------------- auth */

export const login = (email: string, password: string) => api.post("/auth/login", { email, password });
export const signup = (email: string, password: string, display_name: string) =>
  api.post("/auth/signup", { email, password, display_name });
export const logout = () => api.post("/auth/logout");
export const changePassword = (current_password: string, new_password: string) =>
  api.post("/auth/change-password", { current_password, new_password });
export const changeEmail = (new_email: string, current_password: string) =>
  api.post("/auth/change-email", { new_email, current_password });
export const requestPasswordReset = (email: string) =>
  api.post<{ message: string | null; mode: string; dev_token: string | null }>("/auth/request-password-reset", { email });
export const resetPassword = (token: string, new_password: string) =>
  api.post("/auth/reset-password", { token, new_password });

/* --------------------------------------------------------------- expenses */

export function recordSharedExpense(
  d: FormDataLike,
  opts: { title: string; amountCents: number; participants: string[]; customShares: Record<string, number> | null; group: string; receiptId: string | null; receiptHash: string | null },
) {
  const form = new FormData();
  form.append("title", opts.title);
  form.append("description", String(d.get("description") ?? ""));
  form.append("category", String(d.get("category") ?? "general"));
  form.append("amount_cents", String(opts.amountCents));
  form.append("expense_date", String(d.get("date") ?? ""));
  form.append("group_id", opts.group);
  if (opts.customShares) {
    for (const [residentId, cents] of Object.entries(opts.customShares)) {
      form.append(`custom[${residentId}]`, String(cents));
    }
  } else {
    for (const id of opts.participants) form.append("participants[]", id);
  }
  if (opts.receiptId) form.append("receipt_media_id", opts.receiptId);
  if (opts.receiptHash) form.append("receipt_hash", opts.receiptHash);
  const notes = String(d.get("notes") ?? "");
  if (notes) form.append("notes", notes);
  return api.post<{ id: string }>("/expenses/shared", form);
}

export function submitClaim(
  d: FormDataLike,
  opts: { title: string; amountCents: number; group: string; payerResidentId: string; receiptId: string | null; receiptHash: string | null },
) {
  const form = new FormData();
  form.append("title", opts.title);
  form.append("description", String(d.get("description") ?? ""));
  form.append("category", String(d.get("category") ?? "general"));
  form.append("amount_cents", String(opts.amountCents));
  form.append("expense_date", String(d.get("date") ?? ""));
  form.append("payer_resident_id", opts.payerResidentId);
  form.append("group_id", opts.group);
  if (opts.receiptId) form.append("receipt_media_id", opts.receiptId);
  if (opts.receiptHash) form.append("receipt_hash", opts.receiptHash);
  const notes = String(d.get("notes") ?? "");
  if (notes) form.append("notes", notes);
  return api.post<{ id: string }>("/expenses/claim", form);
}

export const reviewClaim = (expenseId: number | string, approve: boolean, note: string) =>
  api.post(`/expenses/${expenseId}/review`, { approve, note });
export const voidExpense = (expenseId: number | string, reason: string) =>
  api.post(`/expenses/${expenseId}/void`, { reason });
export const recordPayment = (residentId: string, amountCents: number, note: string | null) =>
  api.post("/payments", { resident_id: residentId, amount_cents: amountCents, note });
export const addAdjustment = (residentId: string, amountCents: number, reason: string) =>
  api.post("/adjustments", { resident_id: residentId, amount_cents: amountCents, reason });
export const startContributionRound = (values: {
  amount_cents: number;
  label?: string;
  collected_on?: string;
  note?: string | null;
}) =>
  api.post<{
    id: string;
    round_no: number;
    label: string;
    amount_cents: number;
    collected_on: string;
    due_count: number;
    notified: number;
  }>("/finance/rounds", values);

/* ----------------------------------------------------------------- chores */

export function saveChore(
  d: FormDataLike,
  opts: { choreId: string | undefined; members: string[] },
) {
  const form = new FormData();
  form.append("name", String(d.get("name") ?? ""));
  form.append("kind", String(d.get("kind") ?? "other"));
  form.append("space_id", String(d.get("space") ?? ""));
  form.append("frequency_days", String(d.get("frequency") ?? ""));
  form.append("next_due", String(d.get("due") ?? ""));
  form.append("rotates", d.get("rotates") === "on" ? "1" : "0");
  form.append("active", d.get("active") === "on" ? "1" : "0");
  form.append("current_resident_id", String(d.get("assigned") ?? ""));
  for (const m of opts.members) form.append("members[]", m);
  return opts.choreId
    ? api.patch<{ id: string }>(`/chores/${opts.choreId}`, form)
    : api.post<{ id: string }>("/chores", form);
}

export const completeChore = (choreId: string, d: FormDataLike, photo: File | null) => {
  const form = new FormData();
  const note = String(d.get("notes") ?? "");
  if (note) form.append("note", note);
  if (photo) form.append("file", photo);
  return api.post(`/chores/${choreId}/complete`, form);
};
export const reportChoreNeeded = (choreId: string, note: string) =>
  api.post(`/chores/${choreId}/report-needed`, { note });
export const choreAdminAction = (choreId: string, action: "skip" | "reassign" | "reset", target: string | null, reason: string) =>
  api.post(`/chores/${choreId}/admin-action`, { action, target: target || null, reason });

/* ----------------------------------------------------------------- issues */

export function createIssue(d: FormDataLike, opts: { reporterResidentId: string | null; photo: File | null }) {
  const form = new FormData();
  form.append("description", String(d.get("description") ?? ""));
  form.append("category", String(d.get("category") || "other"));
  form.append("space_id", String(d.get("space") ?? ""));
  if (opts.reporterResidentId) form.append("reporter_resident_id", opts.reporterResidentId);
  if (opts.photo) form.append("file", opts.photo);
  return api.post<{ id: string }>("/issues", form);
}
export const updateIssue = (
  id: string,
  values: { status: string; assigned_resident_id: string | null; admin_response: string | null; resolution_notes: string | null },
) => api.patch(`/issues/${id}`, values);

/* -------------------------------------------------------------- residents */

export const createResident = (values: Partial<Resident>) => api.post<{ id: string }>("/residents", pick(values));
export const updateResident = (id: string, values: Partial<Resident>) =>
  api.patch<{ id: string }>(`/residents/${id}`, pick(values));

function pick(values: Partial<Resident>) {
  return {
    display_name: values.display_name ?? undefined,
    phone: values.phone ?? undefined,
    email: values.email ?? undefined,
    room_id: values.room_id ?? undefined,
    active: values.active ?? undefined,
    can_view_finance: values.can_view_finance ?? undefined,
  };
}

export const deleteResident = (id: string) => api.del(`/residents/${id}`);

/* ---------------------------------------------------------- user accounts */

export const approveAccount = (id: string, approve: boolean) =>
  api.post(`/users/${id}/approval`, { approve });
export const deleteUserAccount = (id: string) => api.del(`/users/${id}`);

/* ------------------------------------------------------- groups & spaces */

export const saveGroup = (id: string | undefined, values: { name: string; description: string | null; members: string[] }) =>
  (id ? api.patch<{ id: string }>(`/groups/${id}`, values) : api.post<{ id: string }>("/groups", values));
export const deleteGroup = (id: string) => api.del(`/groups/${id}`);

export const saveSpace = (
  id: string,
  values: { name: string; capacity: number; notes: string | null },
) => api.patch<{ id: string }>(`/spaces/${id}`, values);
/** Replaces the whole bedroom→washrooms mapping (mirrors the old upsert+delete pair). */
export const setWashroomAccessBulk = (bedroomId: string, washroomIds: string[]) =>
  api.put("/washroom-access/bulk", { bedroom_id: bedroomId, washroom_ids: washroomIds });

/* ----------------------------------------------------------- portal roles */

export type PortalRoleBundle = {
  roles: { id: string; name: string; description: string | null; created_at: string; permissions: string[] }[];
  members: { role_id: string; user_id: string }[];
  admins: string[];
};
export const portalRoles = () => api.get<PortalRoleBundle>("/portal-roles");
export const savePortalRole = (
  id: string | null,
  values: { name: string; description: string | null; permissions: string[] },
) => (id ? api.patch<{ id: string }>(`/portal-roles/${id}`, values) : api.post<{ id: string }>("/portal-roles", values));
export const deletePortalRole = (id: string) => api.del(`/portal-roles/${id}`);
export const assignPortalRoles = (residentId: string, roles: string[]) =>
  api.post(`/residents/${residentId}/roles`, { roles });
export const setAdmin = (residentId: string, makeAdmin: boolean) =>
  api.post(`/residents/${residentId}/admin`, { make_admin: makeAdmin });

/* ------------------------------------------------------------------- audit */

export const logAudit = (action: string, entity: string, entityId: string, details: unknown) =>
  api.post("/audit", { action, entity, entity_id: entityId, details });

/* -------------------------------------------------------------------- hub */

export type HubItemDto = {
  id: string;
  kind: string;
  title: string;
  details: string;
  payload: unknown;
  status: "open" | "done";
  created_by: string;
  created_at: string;
};
export type HubResponseDto = { item_id: string; user_id: string; value: string; created_at: string };

export const hubItems = (kind: string) => api.get<HubItemDto[]>(`/hub/items?kind=${encodeURIComponent(kind)}`);
export const hubResponses = (kind: string) =>
  api.get<HubResponseDto[]>(`/hub/responses?kind=${encodeURIComponent(kind)}`);
export const hubInsert = (values: { kind: string; title: string; details: string; payload: unknown }) =>
  api.post<{ id: string }>("/hub/items", values);
export const hubEdit = (itemId: string, values: { title: string; details: string; payload: unknown }) =>
  api.patch(`/hub/items/${itemId}`, values);
export const hubDelete = (itemId: string) => api.del(`/hub/items/${itemId}`);
export const hubRespond = (itemId: string, value: string) => api.post("/hub/respond", { item_id: itemId, value });
export const hubSetStatus = (itemId: string, status: "open" | "done") => api.post("/hub/status", { item_id: itemId, status });

/* -------------------------------------------------------------- media */

/** Admin/library upload into any bucket (receipts/photos remain open to residents too). */
export const uploadMedia = (bucket: "media" | "receipts" | "photos" | "social", file: File) => {
  if (file.size > 10 * 1024 * 1024) throw new Error("Please choose a file smaller than 10 MB");
  const form = new FormData();
  form.append("file", file);
  return api.post<{ id: string }>(`/media?bucket=${bucket}`, form);
};

export const updateMediaMeta = (id: string, values: { alt_text?: string | null; caption?: string | null }) =>
  api.patch(`/media/${id}`, values);
export const replaceMedia = (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.put(`/media/${id}/replace`, form);
};
export const deleteMedia = (id: string) => api.del(`/media/${id}`);
export const listMedia = (params: { bucket?: string | undefined; q?: string | undefined; page?: number | undefined; per_page?: number | undefined }) => {
  const search = new URLSearchParams();
  if (params.bucket) search.set("bucket", params.bucket);
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.per_page) search.set("per_page", String(params.per_page));
  const query = search.toString();
  return api.get<{ items: import("@/lib/types").MediaAsset[]; total: number; page: number; per_page: number }>(
    "/media" + (query ? `?${query}` : ""),
  );
};

/* ---------------------------------------------------------- site content */

export type SiteSectionAdmin = import("@/lib/types").SiteSection;
export const siteContent = () =>
  api.get<{ sections: SiteSectionAdmin[]; translations: import("@/lib/types").SiteSectionTranslation[] }>("/site-content");
export const saveSiteSection = (code: string, values: Record<string, unknown>) =>
  api.patch(`/site-content/${code}`, values);
export const reorderSections = (codes: string[], area?: string) =>
  api.post("/site-content/reorder", { codes, area });
export const siteSettings = () => api.get<{ setting_key: string; setting_value: string; updated_at: string }[]>("/site-settings");
export const saveSiteSettings = (values: Record<string, string>) => api.put("/site-settings", values);

/* ---------------------------------------------------------------- events */

export const listEvents = (params: { status?: string | undefined; q?: string | undefined; page?: number | undefined } = {}) => {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  const query = search.toString();
  return api.get<{ items: EventCms[]; total: number; page: number; per_page: number }>("/events" + (query ? `?${query}` : ""));
};
export const getEvent = (id: string) => api.get<EventCms>(`/events/${id}`);
export const createEvent = (values: EventInput) => api.post<EventCms>("/events", values);
export const updateEvent = (id: string, values: EventInput) => api.patch<EventCms>(`/events/${id}`, values);
export const duplicateEvent = (id: string) => api.post<EventCms>(`/events/${id}/duplicate`);
export const setEventStatus = (id: string, status: "draft" | "published" | "archived") =>
  api.post<EventCms>(`/events/${id}/status`, { status });
export const deleteEvent = (id: string) => api.del(`/events/${id}`);
export const saveShift = (eventId: string, values: Record<string, unknown>) =>
  api.post<{ id: string }>(`/events/${eventId}/shifts`, values);
export const updateShift = (shiftId: string, values: Record<string, unknown>) => api.patch(`/shifts/${shiftId}`, values);
export const deleteShift = (shiftId: string) => api.del(`/shifts/${shiftId}`);
export const assignShift = (shiftId: string, values: { resident_id: string; status: string; note?: string | null }) =>
  api.post(`/shifts/${shiftId}/assignments`, values);
export const declineShift = (shiftId: string) => api.post(`/shifts/${shiftId}/decline`);

/* ------------------------------------------------------------- donations */

export const donationCategories = () => api.get<import("@/lib/types").DonationCategory[]>("/donations/categories");
export const publicDonationCategories = () => api.get<import("@/lib/types").DonationCategory[]>("/public/donation-categories");
export const createDonationRequest = (values: Record<string, unknown>) =>
  api.post<{ id: string; status: string }>("/public/donation-requests", values);
export const listDonationRequests = (params: { status?: string | undefined; q?: string | undefined } = {}) => {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return api.get<import("@/lib/types").DonationList>("/donation-requests" + (query ? `?${query}` : ""));
};
export const updateDonationRequest = (id: string, values: { status?: string | undefined; internal_notes?: string | null | undefined }) =>
  api.patch(`/donation-requests/${id}`, values);
export const listDonationTransactions = (params: { from?: string | undefined; to?: string | undefined; category_id?: string | undefined } = {}) => {
  const search = new URLSearchParams();
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  if (params.category_id) search.set("category_id", params.category_id);
  const query = search.toString();
  return api.get<import("@/lib/types").DonationTxList>("/donation-transactions" + (query ? `?${query}` : ""));
};
export const createDonationTransaction = (values: Record<string, unknown>) =>
  api.post("/donation-transactions", values);
export const deleteDonationTransaction = (id: string) => api.del(`/donation-transactions/${id}`);
export const saveDonationCategory = (id: string | null, values: { name: string; description: string | null; sort?: number }) =>
  (id ? api.patch<{ id: string }>(`/donation-categories/${id}`, values) : api.post<{ id: string }>("/donation-categories", values));
export const deleteDonationCategory = (id: string) => api.del(`/donation-categories/${id}`);

/* ----------------------------------------------------------------- social */

export const listSocialPosts = () => api.get<import("@/lib/types").SocialPost[]>("/social-posts");
export const studioMeta = () => api.get<import("@/lib/types").StudioMeta>("/social/studio");
export const createSocialPost = (form: FormData) => api.post<import("@/lib/types").SocialPost>("/social-posts", form);
export const deleteSocialPost = (id: string) => api.del(`/social-posts/${id}`);

/* ---------------------------------------------------------- notifications */

export const saveMealCell = (body: {
  week: string;
  day: number;
  meal: string;
  cook_resident_id?: string | null;
  participants?: string[];
  notes?: string | null;
}) => api.put("/mealplan", body);
export const clearMealCell = (week: string, day: number, meal: string) =>
  api.del(`/mealplan?week=${week}&day=${day}&meal=${meal}`);

export const notifications = () =>
  api.get<{ items: import("@/lib/types").NotificationRow[]; unread: number }>("/notifications");
export const markNotificationsRead = (notificationId?: string | null) =>
  api.post("/notifications/read", notificationId ? { notification_id: notificationId } : {});

/* ---------------------------------------------------------- public pages */

export const publicHomepage = () => api.get<import("@/lib/types").HomepagePayload>("/public/homepage");
