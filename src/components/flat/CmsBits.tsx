import { useQuery } from "@tanstack/react-query";
import { listMedia } from "@/lib/flat-actions";
import { useResidents } from "@/lib/flat";
import { DataState } from "@/components/flat/Forms";

/**
 * UTC 'YYYY-MM-DD HH:MM:SS' (backend DATETIME) → value for <input type="datetime-local">
 * in the browser's timezone (reversed by toUtc on submit).
 */
export function utcToLocal(value: string | null | undefined) {
  if (!value) return "";
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** datetime-local value → ISO offset string the PHP layer normalises to UTC DATETIME. */
export function toUtc(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Please use the date/time picker");
  return date.toISOString().slice(0, 19) + "+00:00";
}

/** Formats a stored UTC datetime for on-page display. */
export function formatUtc(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value.replace(" ", "T") + "Z" : value.replace(" ", "T") + "Z");
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Select of media-library assets (used for covers/section graphics). */
export function MediaSelect({ label, name, value, required = false }: { label: string; name: string; value: string | null | undefined; required?: boolean }) {
  const media = useQuery({ queryKey: ["media-all"], queryFn: () => listMedia({ per_page: 200 }) });
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      {media.isPending ? (
        <span className="text-sm text-muted-foreground">Loading media library…</span>
      ) : media.error ? (
        <DataState query={media} />
      ) : (
        <select name={name} defaultValue={value ?? ""} required={required} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">—</option>
          {(media.data?.items ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {(m.alt_text ?? m.original_name ?? m.file_path).slice(0, 60)} ({m.bucket})
            </option>
          ))}
        </select>
      )}
    </label>
  );
}

/** Resident picker for shift planning. */
export function ResidentSelect({ label, name, value, required = false }: { label: string; name: string; value: string | null | undefined; required?: boolean }) {
  const { data: residents = [] } = useResidents();
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <select name={name} defaultValue={value ?? ""} required={required} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">—</option>
        {residents.map((r) => (
          <option key={r.id} value={r.id}>{r.display_name}</option>
        ))}
      </select>
    </label>
  );
}

export const eurCms = (cents: number | null | undefined) =>
  new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
