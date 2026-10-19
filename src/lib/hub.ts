import { ShoppingBasket, Megaphone, CalendarDays, CalendarClock, Vote, Package, Files, Phone, BookOpen, Search } from "lucide-react";
import type { HubItemDto, HubResponseDto } from "@/lib/flat-actions";

export type HubItem = HubItemDto;
export type HubResponse = HubResponseDto;

export function payloadOf(item: HubItem): Record<string, unknown> {
  return item.payload !== null && typeof item.payload === "object" && !Array.isArray(item.payload) ? (item.payload as Record<string, unknown>) : {};
}
export function valueOf(item: HubItem, key: string) {
  const value = payloadOf(item)[key];
  return typeof value === "string" ? value : "";
}

export const hubPages = {
  shopping: { title: "Shopping list", description: "Shared groceries and household essentials.", singular: "shopping item", icon: ShoppingBasket, fields: [{ key: "quantity", label: "Quantity", type: "text" }, { key: "category", label: "Category", type: "text" }], adminOnly: false },
  notices: { title: "Noticeboard", description: "Household announcements and acknowledgements.", singular: "notice", icon: Megaphone, fields: [], adminOnly: true },
  events: { title: "Events", description: "Household gatherings and resident RSVPs.", singular: "event", icon: CalendarDays, fields: [{ key: "start", label: "Date & time", type: "datetime-local" }, { key: "location", label: "Location", type: "text" }], adminOnly: false },
  bookings: { title: "Resource bookings", description: "Reserve shared spaces and equipment without overlapping bookings.", singular: "booking", icon: CalendarClock, fields: [{ key: "resource", label: "Resource", type: "text" }, { key: "start", label: "Start", type: "datetime-local" }, { key: "end", label: "End", type: "datetime-local" }], adminOnly: false },
  polls: { title: "Household polls", description: "Vote on household decisions and see live results.", singular: "poll", icon: Vote, fields: [], adminOnly: false },
  inventory: { title: "Shared inventory", description: "Track shared belongings, borrowing and returns.", singular: "inventory item", icon: Package, fields: [{ key: "location", label: "Stored in", type: "text" }, { key: "condition", label: "Condition", type: "text" }], adminOnly: false },
  documents: { title: "Shared documents", description: "Household document links in one place.", singular: "document link", icon: Files, fields: [{ key: "url", label: "Document URL", type: "url" }, { key: "category", label: "Category", type: "text" }], adminOnly: true },
  contacts: { title: "Useful contacts", description: "Landlord, maintenance and local service contacts.", singular: "contact", icon: Phone, fields: [{ key: "phone", label: "Phone", type: "tel" }, { key: "email", label: "Email", type: "email" }, { key: "category", label: "Service", type: "text" }], adminOnly: true },
  rules: { title: "House rules", description: "Household agreements and resident acknowledgements.", singular: "house rule", icon: BookOpen, fields: [], adminOnly: true },
  "lost-found": { title: "Lost & found", description: "Report missing belongings and claim found items.", singular: "lost or found item", icon: Search, fields: [{ key: "location", label: "Last seen / found at", type: "text" }], adminOnly: false },
} as const;
export type HubKind = keyof typeof hubPages;

export function pollOptions(item: HubItem): string[] {
  const options = payloadOf(item)["options"];
  return Array.isArray(options) ? options.filter((v): v is string => typeof v === "string") : [];
}
export function safeDocumentUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
export const hubPaths = ["shopping", "notices", "events", "bookings", "polls", "inventory", "documents", "contacts", "rules", "lost-found"] as const;
export function formPayload(kind: HubKind, data: FormData): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = {};
  for (const field of hubPages[kind].fields) {
    const value = String(data.get(field.key) ?? "").trim();
    payload[field.key] = field.type === "datetime-local" && value ? new Date(value).toISOString() : value;
  }
  if (kind === "polls") {
    const options = [...new Set(String(data.get("options") ?? "").split("\n").map(x => x.trim()).filter(Boolean))];
    if (options.length < 2 || options.length > 6) throw new Error("Enter two to six different options");
    payload["options"] = options;
  }
  if (kind === "documents" && !safeDocumentUrl(String(payload["url"]))) throw new Error("Enter a secure HTTPS document link");
  if (kind === "lost-found") payload["reportType"] = String(data.get("reportType") ?? "found");
  if (kind === "bookings" && !(new Date(String(payload["end"])) > new Date(String(payload["start"])))) throw new Error("End time must be after start time");
  return payload;
}
