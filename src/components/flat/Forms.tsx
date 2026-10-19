import { useState, type ReactNode, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-2 text-sm font-medium">
      {label}
      {children}
    </Label>
  );
}
export function TextField({
  label,
  name,
  value = "",
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value?: string | number | undefined;
  type?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <Input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        step={type === "number" ? "0.01" : undefined}
      />
    </Field>
  );
}
export function Choice({
  label,
  name,
  value = "",
  options,
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  options: { id: string; name: string }[];
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        name={name}
        defaultValue={value}
        required={required}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Notes({
  label = "Notes",
  name = "notes",
  value = "",
  required = false,
}: {
  label?: string;
  name?: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <textarea
        name={name}
        defaultValue={value}
        required={required}
        maxLength={2000}
        rows={3}
        className="w-full rounded-md border bg-background p-3 text-sm"
      />
    </Field>
  );
}
export function FileField({ label = "Photo", name = "file" }: { label?: string; name?: string }) {
  return (
    <Field label={label}>
      <Input type="file" name={name} accept="image/*,application/pdf" />
    </Field>
  );
}
export function Editor({
  title,
  trigger,
  children,
  onSave,
  destructive = false,
}: {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
  onSave: (data: FormData) => Promise<unknown>;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await onSave(data);
      toast.success("Saved successfully");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {children}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} variant={destructive ? "destructive" : "default"}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
export const upload = (data: FormData, key = "file") => {
  const file = data.get(key);
  return file instanceof File && file.size ? file : null;
};
export function Status({ value }: { value: string }) {
  return (
    <span
      className={
        "inline-flex rounded-md px-2 py-1 text-xs font-medium capitalize " +
        (value === "approved" || value === "resolved" || value === "active"
          ? "bg-success/10 text-success"
          : value === "rejected" || value === "voided"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-secondary-foreground")
      }
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function DataState({ query }: { query: { isPending: boolean; error: Error | null } }) {
  return query.isPending ? (
    <p className="py-4 text-muted-foreground">Loading…</p>
  ) : query.error ? (
    <p role="alert" className="py-4 text-destructive">
      {query.error.message}
    </p>
  ) : null;
}
