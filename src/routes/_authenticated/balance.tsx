import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat, Empty } from "@/components/flat/Page";
import { Editor, TextField, Notes, DataState, text } from "@/components/flat/Forms";
import {
  eur,
  toCents,
  useBalances,
  useFinanceOverview,
  useMe,
  useLedger,
  useResidents,
  useRefresh,
} from "@/lib/flat";
import { recordPayment, addAdjustment, pageHead } from "@/lib/flat-actions";
import { useState } from "react";
import { Download } from "lucide-react";
export const Route = createFileRoute("/_authenticated/balance")({
  head: () =>
    pageHead(
      "My Balance",
      "Your household balance, approved credits, payments and transaction history.",
    ),
  component: Balance,
});
function Balance() {
  const { data: me } = useMe();
  const { data: residents = [] } = useResidents();
  const { data: balances = [] } = useBalances();
  const { data: finance } = useFinanceOverview();
  const [selected, setSelected] = useState("");
  const id = me?.isAdmin && selected ? selected : me?.resident?.id;
  const query = useLedger(id);
  const entries = query.data ?? [];
  const bal = balances.find((b) => b.resident_id === id);
  const due = finance?.members.find((m) => m.id === id);
  const refresh = useRefresh();
  function exportCsv() {
    const csv =
      "Date,Type,Note,EUR\n" +
      entries
        .map((e) =>
          [e.created_at, e.kind, e.note ?? "", (e.amount_cents / 100).toFixed(2)]
            .map((v) => '"' + String(v).replaceAll('"', '""') + '"')
            .join(","),
        )
        .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "flatmate-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <PageHeader
        title="My Balance"
        sub={residents.find((r) => r.id === id)?.display_name}
        action={
          <Button variant="outline" onClick={exportCsv} disabled={!entries.length}>
            <Download />
            Export
          </Button>
        }
      />
      {me?.isAdmin && (
        <label className="mb-5 grid max-w-sm gap-2 text-sm">
          Resident
          <select
            className="h-9 rounded-md border bg-background px-3"
            value={selected || me?.resident?.id || ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Round dues outstanding"
          value={eur(due?.outstanding_cents ?? 0)}
          tone={(due?.outstanding_cents ?? 0) > 0 ? "bad" : "good"}
        />
        <Stat
          label="Fair-share ledger"
          value={eur(bal?.balance_cents)}
          tone={(bal?.balance_cents ?? 0) < 0 ? "bad" : "good"}
        />
        <Stat label="Payments recorded" value={eur(bal?.payments_cents)} />
        <Stat label="Approved reimbursements" value={eur(bal?.credits_cents)} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Round dues track what is still owed for the current budget call. The fair-share ledger is
        informational: payments made minus this member&apos;s equal share of every approved
        purchase. All five fair-share balances add up to the live pool balance.
      </p>
      {me?.isAdmin && id && (
        <div className="mt-5 flex flex-wrap gap-3">
          {(["payment", "adjustment"] as const).map((kind) => (
            <Editor
              key={kind}
              title={kind === "payment" ? "Record payment" : "Adjust balance"}
              trigger={
                <Button variant="outline">
                  {kind === "payment" ? "Record payment" : "Adjust balance"}
                </Button>
              }
              onSave={async (d) => {
                const amount = toCents(text(d, "amount"));
                if (!Number.isFinite(amount) || amount === 0)
                  throw new Error("Enter a non-zero amount");
                if (kind === "payment") {
                  await recordPayment(id, amount, text(d, "reason"));
                } else {
                  await addAdjustment(id, amount, text(d, "reason"));
                }
                await refresh();
              }}
            >
              <TextField label="Amount (EUR, signed)" name="amount" type="number" required />
              <Notes label="Reason" name="reason" required />
            </Editor>
          ))}
        </div>
      )}
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Transaction history</h2>
        {id && <DataState query={query} />}
        <div className="divide-y border-y">
          {entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="font-medium break-words">{e.note ?? e.kind.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()} · {e.kind.replaceAll("_", " ")}
                </p>
              </div>
              <strong
                className={"shrink-0 " + (e.amount_cents < 0 ? "text-destructive" : "text-success")}
              >
                {eur(e.amount_cents)}
              </strong>
            </div>
          ))}
        </div>
        {!entries.length && !query.isPending && <Empty>No transactions yet.</Empty>}
      </section>
    </div>
  );
}
