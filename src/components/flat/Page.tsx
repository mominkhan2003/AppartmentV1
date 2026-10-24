import type { ReactNode } from "react";

export function PageHeader({ title, sub, action }: { title: string; sub?: string | undefined; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={"rounded-2xl border bg-card p-4 sm:p-5 " + className}>
      {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="text-xs text-muted-foreground sm:text-sm">{label}</div>
      <div className={"mt-1 font-display text-xl font-bold sm:text-2xl " + (tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "")}>{value}</div>
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
