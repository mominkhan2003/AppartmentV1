import type { ReactNode } from "react";

export function PageHeader({ title, sub, action }: { title: string; sub?: string | undefined; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={"rounded-2xl border bg-card p-5 " + className}>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={"mt-1 font-display text-2xl font-bold " + (tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "")}>{value}</div>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;

export const run = async (fn: () => Promise<unknown>, ok: string, done?: () => void) => {
  const { toast } = await import("sonner");
  try {
    await fn();
    toast.success(ok);
    done?.();
  } catch (e) {
    toast.error((e as Error).message);
  }
};
