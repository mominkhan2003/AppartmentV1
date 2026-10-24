/**
 * Row/DTO types for the MySQL + PHP backend. Shapes mirror what the original
 * Supabase client returned (snake_case columns, ISO timestamps) so the existing
 * pages keep working unchanged apart from the data layer swap.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type SpaceKind = "bedroom" | "kitchen" | "hall" | "balcony" | "washroom" | "storage" | "other";
export type ChoreKind = "washroom" | "hall" | "kitchen" | "garbage" | "other";
export type ChoreEventType = "complete" | "skip" | "reassign" | "reset" | "report_needed";
export type ExpenseKind = "shared" | "claim";
export type ExpenseStatus = "pending" | "approved" | "rejected" | "voided";
export type IssueStatus = "open" | "acknowledged" | "in_progress" | "resolved";
export type LedgerKind = "share" | "claim_credit" | "payment" | "adjustment";

export type Space = {
  id: string;
  code: string;
  name: string;
  kind: SpaceKind;
  shape: Json;
  capacity: number;
  notes: string | null;
  sort: number;
  created_at: string;
};

export type Resident = {
  id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  room_id: string | null;
  active: boolean;
  /** false hides the budget, expenses and audit report from this resident */
  can_view_finance?: boolean;
  is_sample: boolean;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  /** hydrated by the API */
  members: string[];
};

export type WashroomAccess = { washroom_id: string; bedroom_id: string };

export type Expense = {
  id: number;
  kind: ExpenseKind;
  group_id: string | null;
  title: string;
  description: string | null;
  category: string;
  amount_cents: number;
  expense_date: string;
  payer_resident_id: string | null;
  items: Json | null;
  notes: string | null;
  receipt_media_id: string | null;
  receipt_hash: string | null;
  status: ExpenseStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
};

export type ExpenseShare = {
  id: string;
  expense_id: number;
  /** null when the bill is split with a non-resident guest */
  resident_id: string | null;
  external_name?: string | null;
  amount_cents: number;
};

export type MealPlanEntry = {
  id: number;
  week_start: string;
  day_of_week: number; // 1 = Monday .. 7 = Sunday
  meal: "breakfast" | "lunch" | "dinner";
  cook_resident_id: string | null;
  cook_name: string | null;
  participants: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ResidentBalance = {
  resident_id: string | null;
  balance_cents: number | null;
  shares_cents: number | null;
  credits_cents: number | null;
  payments_cents: number | null;
  adjustments_cents: number | null;
};

export type PoolOverview = {
  contributions_cents: number;
  purchases_cents: number;
  cash_contributions_cents: number;
  direct_contributions_cents: number;
  pool_purchases_cents: number;
  direct_purchases_cents: number;
  adjustments_cents: number;
  claim_credits_cents: number;
  pool_balance_cents: number;
  formula: string;
};

export type ContributionDue = {
  round_id: string;
  resident_id: string;
  display_name: string;
  required_cents: number;
  paid_cents: number;
  status: "settled" | "pending" | "partial" | "credit";
  note: string | null;
};

export type ContributionRound = {
  id: string;
  round_no: number;
  label: string;
  target_per_member_cents: number;
  collected_on: string;
  note: string | null;
  dues: ContributionDue[];
  collected_cents: number;
  required_cents: number;
};

export type FinanceMember = {
  id: string;
  display_name: string;
  username: string | null;
  email: string | null;
  active: boolean;
  is_admin: boolean;
  outstanding_cents: number;
  status: "pending" | "settled";
  status_note: string | null;
  pending_round: {
    round_no: number;
    label: string;
    required_cents: number;
    paid_cents: number;
  } | null;
};

export type FinanceOverview = {
  pool: PoolOverview;
  active_members: number;
  members: FinanceMember[];
  rounds: ContributionRound[];
  next_budget_cents: number;
};

export type FinancialReportEntry = {
  key: string;
  date: string;
  type: "contribution" | "expense" | "direct_payment" | "adjustment";
  description: string;
  paid_by: string;
  amount_cents: number;
  pool_delta_cents: number;
  running_balance_cents: number;
  round_label: string | null;
  source: "cash" | "direct" | "pool" | "adjustment";
};

export type FinancialReport = {
  title: string;
  subtitle: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  pool: PoolOverview;
  active_members: number;
  members: FinanceMember[];
  member_status: FinanceMember[];
  rounds: ContributionRound[];
  entries: FinancialReportEntry[];
  closing_balance_cents: number;
  next_budget_cents: number;
  pending_contribution_cents: number;
};

export type Chore = {
  id: string;
  name: string;
  kind: ChoreKind;
  space_id: string | null;
  frequency_days: number;
  rotates: boolean;
  current_resident_id: string | null;
  next_due: string;
  needed_reported_at: string | null;
  active: boolean;
  created_at: string;
  /** hydrated by the API */
  members: string[];
};

export type ChoreEvent = {
  id: string;
  chore_id: string;
  event_type: ChoreEventType;
  resident_id: string | null;
  target_resident_id: string | null;
  actor_id: string | null;
  reason: string | null;
  photo_media_id: string | null;
  due_date: string | null;
  created_at: string;
};

export type Issue = {
  id: string;
  space_id: string | null;
  category: string;
  description: string;
  photo_media_id: string | null;
  reporter_id: string | null;
  reporter_resident_id: string | null;
  status: IssueStatus;
  assigned_resident_id: string | null;
  admin_response: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LedgerEntry = {
  id: string;
  resident_id: string;
  kind: LedgerKind;
  amount_cents: number;
  expense_id: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Json;
  created_at: string;
};

export type PortalRole = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  permissions: string[];
};

export type PortalRoleMember = { role_id: string; user_id: string };

/* ------------------------------------------------------------------ me/auth */

export type MePayload = {
  user: { id: string; email: string; username?: string | null };
  isAdmin: boolean;
  /** false right after signup until an admin verifies the account */
  approved?: boolean;
  /** true when the account still uses its seeded starting password */
  force_password_change?: boolean;
  /** false for limited residents who only see household/task pages */
  can_view_finance?: boolean;
  permissions: string[];
  resident: Resident | null;
};

export type AccountRow = {
  id: string;
  email: string;
  approved: boolean;
  created_at: string;
  resident_id: string | null;
  display_name: string | null;
  admin_roles: number;
  portal_roles: string | null;
};

export type AuthResult = { user: { id: string; email: string }; resident: Resident | null };

/* ------------------------------------------------------------------- media */

export type MediaAsset = {
  id: string;
  bucket: "media" | "receipts" | "photos" | "social";
  owner_user_id: string | null;
  file_path: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  caption: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaList = { items: MediaAsset[]; total: number; page: number; per_page: number };

/* -------------------------------------------------------------- site content */

export type SiteSection = {
  code: string;
  area: "home" | "nav" | "footer" | "donations";
  kind: "hero" | "feature" | "section" | "page" | "link";
  icon: string | null;
  sort: number;
  visible: boolean;
  media_id: string | null;
  media_position: "cover" | "left" | "right" | "center" | "background" | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  updated_at: string;
};

export type SiteSectionTranslation = {
  section_code: string;
  locale: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
};

export type PublicHomepageSection = {
  code: string;
  area: string;
  kind: string;
  icon: string | null;
  sort: number;
  media_id: string | null;
  media_position: string | null;
  cta_label: string | null;
  cta_href: string | null;
  cta2_label: string | null;
  cta2_href: string | null;
  translations: Record<string, { heading: string | null; subheading: string | null; body: string | null }>;
};

export type PublicEvent = {
  id: string;
  slug: string;
  starts_at: string;
  ends_at: string | null;
  meeting_point: string | null;
  address: string | null;
  category: string;
  cover_media_id: string | null;
  additional_info: string | null;
  locale: string | null;
  title: string | null;
  description: string | null;
};

export type PublicImpact = {
  enabled: boolean;
  total_amount_cents?: number;
  total_count?: number;
  this_year_amount_cents?: number;
  goal_cents?: number | null;
  months?: { month: string; amount_cents: number }[];
  by_category?: { name: string; amount_cents: number }[];
};

export type HomepagePayload = {
  sections: PublicHomepageSection[];
  events: PublicEvent[];
  impact: PublicImpact;
  settings: Record<string, string | boolean>;
};

/* ------------------------------------------------------------------- events */

export type EventStatus = "draft" | "published" | "archived";

export type EventCms = {
  id: string;
  slug: string;
  status: EventStatus;
  category: "community" | "cooking" | "organizing" | "cleaning" | "other";
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  meeting_point: string | null;
  address: string | null;
  cover_media_id: string | null;
  additional_info: string | null;
  published_at: string | null;
  created_at: string;
  translations: { locale: "de" | "en"; title: string; description: string | null }[];
  gallery: { media_id: string; sort: number; alt_text: string | null; caption: string | null }[];
  shifts: EventShift[];
};

export type EventList = { items: EventCms[]; total: number; page: number; per_page: number };

export type EventShift = {
  id: string;
  event_id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  slots: number;
  notes: string | null;
  assignments: ShiftAssignment[];
  confirmed_count: number;
  planned_count: number;
};

export type ShiftAssignment = {
  shift_id: string;
  resident_id: string;
  status: "planned" | "confirmed" | "declined";
  note: string | null;
  display_name?: string;
  created_at: string;
};

export type EventInput = {
  status?: EventStatus | undefined;
  category?: EventCms["category"] | undefined;
  starts_at?: string | undefined;
  ends_at?: string | null | undefined;
  meeting_point?: string | null | undefined;
  address?: string | null | undefined;
  cover_media_id?: string | null | undefined;
  additional_info?: string | null | undefined;
  de?: { title?: string; description?: string } | undefined;
  en?: { title?: string; description?: string } | undefined;
  gallery?: string[] | undefined;
};

/* ---------------------------------------------------------------- donations */

export type DonationCategory = {
  id: string;
  name: string;
  description: string | null;
  sort: number;
};

export type DonationRequest = {
  id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  amount_cents: number | null;
  category_id: string | null;
  category_name?: string | null;
  message: string | null;
  status: "new" | "credited" | "declined" | "spam";
  internal_notes: string | null;
  created_at: string;
};

export type DonationList = { items: DonationRequest[]; total: number; page: number; per_page: number };

export type DonationTransaction = {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  amount_cents: number;
  transaction_date: string;
  method: "bank_transfer" | "cash" | "other";
  reference: string | null;
  donor_name: string | null;
  request_id: string | null;
  note: string | null;
  created_at: string;
};

export type DonationTxList = {
  items: DonationTransaction[];
  total: number;
  sum_amount_cents: number;
  filter: { from: string | null; to: string | null; category_id: string | null };
};

/* ------------------------------------------------------------------- social */

export type SocialPost = {
  id: string;
  format: "square" | "portrait" | "story";
  template: string;
  headline: string | null;
  media_id: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  captions: string | null;
  created_at: string;
};

export type StudioMeta = {
  formats: { id: string; name: string; width: number; height: number }[];
  templates: { id: string; name: string }[];
};

/* ------------------------------------------------------------- notifications */

export type NotificationRow = {
  id: string;
  audience: "admin" | "user";
  user_id: string | null;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};
