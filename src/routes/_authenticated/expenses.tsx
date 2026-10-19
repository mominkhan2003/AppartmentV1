import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileText, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import {
  Editor,
  TextField,
  Choice,
  Notes,
  FileField,
  Status,
  DataState,
  text,
  upload,
  Field,
} from "@/components/flat/Forms";
import {
  eur,
  toCents,
  useExpenses,
  useResidents,
  useGroups,
  useMe,
  useRefresh,
  uploadFile,
  fileHash,
  openFile,
} from "@/lib/flat";
import { rpc, checked, pageHead } from "@/lib/flat-actions";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/_authenticated/expenses")({
  head: () =>
    pageHead("Expenses", "Shared costs, receipts, reimbursement claims and approval history."),
  component: Expenses,
});
function Expenses() {
  const query = useExpenses();
  const { data: residents = [] } = useResidents();
  const { data: groups = [] } = useGroups();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const [filter, setFilter] = useState("all");
  const [group, setGroup] = useState("");
  const [custom, setCustom] = useState(false);
  const shares = useQuery({
    queryKey: ["expense_shares"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_shares").select("*");
      if (error) throw error;
      return data;
    },
  });
  const participants = residents.filter(
    (r) => r.active && (!group || groups.find((g) => g.id === group)?.members.includes(r.id)),
  );
  const expenses = (query.data ?? []).filter((e) => filter === "all" || e.status === filter);
  const editor = (shared: boolean) => (
    <Editor
      title={shared ? "Record shared expense" : "Submit reimbursement claim"}
      trigger={
        <Button variant={shared ? "default" : "outline"}>
          <Plus />
          {shared ? "Shared expense" : "Submit claim"}
        </Button>
      }
      onSave={async (d) => {
        const amount = toCents(text(d, "amount"));
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a positive amount");
        const file = upload(d);
        const receipt_path = file ? await uploadFile("receipts", file) : null;
        const receipt_hash = file ? await fileHash(file) : null;
        const title = text(d, "title");
        if (title.length > 120) throw new Error("Keep the title within 120 characters");
        if (shared) {
          const selected = d.getAll("participants").map(String);
          const customShares = custom
            ? Object.fromEntries(selected.map((id) => [id, toCents(text(d, "share_" + id))]))
            : null;
          if (customShares && Object.values(customShares).reduce((a, b) => a + b, 0) !== amount)
            throw new Error("Custom shares must add up to the expense total");
          await rpc("record_shared_expense", {
            _title: title,
            _description: text(d, "description"),
            _category: text(d, "category"),
            _amount_cents: amount,
            _expense_date: text(d, "date"),
            _group_id: group || null,
            _participants: selected,
            _custom: customShares,
            _receipt_path: receipt_path,
            _receipt_hash: receipt_hash,
            _notes: text(d, "notes"),
            _items: null,
          });
        } else {
          if (!me?.resident) throw new Error("Your resident account is not linked");
          await checked(
            supabase
              .from("expenses")
              .insert({
                kind: "claim",
                status: "pending",
                title,
                amount_cents: amount,
                expense_date: text(d, "date"),
                category: text(d, "category"),
                description: text(d, "description"),
                notes: text(d, "notes"),
                receipt_path,
                receipt_hash,
                payer_resident_id: me.resident.id,
                group_id: text(d, "group") || null,
              }),
          );
        }
        await refresh();
      }}
    >
      <TextField label="Title" name="title" required />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Amount (EUR)" name="amount" type="number" required />
        <TextField
          label="Date"
          name="date"
          type="date"
          value={new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <Choice
        label="Category"
        name="category"
        value="general"
        options={["general", "groceries", "utilities", "supplies", "repairs", "other"].map((s) => ({
          id: s,
          name: s,
        }))}
      />
      <Notes label="Description" name="description" />
      {shared ? (
        <>
          <Field label="Group">
            <select
              className="h-9 rounded-md border bg-background px-3"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Whole flat</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} />
            Custom shares
          </label>
          <fieldset key={group} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Participants</legend>
            {participants.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="participants" value={r.id} defaultChecked />
                  {r.display_name}
                </label>
                {custom && (
                  <input
                    aria-label={r.display_name + " share"}
                    name={"share_" + r.id}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue="0"
                    className="h-9 w-24 rounded-md border bg-background px-2"
                  />
                )}
              </div>
            ))}
          </fieldset>
        </>
      ) : (
        <Choice
          label="Group"
          name="group"
          options={groups
            .filter((g) => g.members.includes(me?.resident?.id ?? ""))
            .map((g) => ({ id: g.id, name: g.name }))}
        />
      )}
      <FileField label="Receipt" />
      <Notes />
    </Editor>
  );
  return (
    <div>
      <PageHeader
        title="Expenses"
        sub="Shared costs and reimbursements"
        action={
          <div className="flex flex-wrap gap-2">
            {me?.isAdmin && editor(true)}
            {editor(false)}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {["all", "pending", "approved", "rejected", "voided"].map((s) => (
          <Button
            key={s}
            variant={filter === s ? "default" : "outline"}
            onClick={() => setFilter(s)}
            className="capitalize"
          >
            {s}
          </Button>
        ))}
      </div>
      <DataState query={query} />
      <div className="divide-y border-y">
        {expenses.map((e) => (
          <article key={e.id} className="py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-semibold break-words">{e.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {e.expense_date} · {e.category} ·{" "}
                  {e.kind === "claim"
                    ? "Claim by " +
                      (residents.find((r) => r.id === e.payer_resident_id)?.display_name ??
                        "Resident")
                    : (groups.find((g) => g.id === e.group_id)?.name ?? "Whole flat")}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-bold">{eur(e.amount_cents)}</p>
                <Status value={e.status} />
              </div>
            </div>
            {e.description && (
              <p className="mt-3 text-sm whitespace-pre-wrap break-words">{e.description}</p>
            )}
            {e.notes && <p className="mt-2 text-sm text-muted-foreground break-words">{e.notes}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {shares.data
                ?.filter((s) => s.expense_id === e.id)
                .map((s) => (
                  <span key={s.id}>
                    {residents.find((r) => r.id === s.resident_id)?.display_name}:{" "}
                    {eur(s.amount_cents)}
                  </span>
                ))}
            </div>
            {e.review_note && <p className="mt-2 text-sm break-words">Review: {e.review_note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {e.receipt_path && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFile("receipts", e.receipt_path ?? "")}
                >
                  <FileText />
                  Receipt
                </Button>
              )}
              {me?.isAdmin &&
                e.status === "pending" &&
                e.created_by !== me.user.id &&
                [true, false].map((approve) => (
                  <Editor
                    key={String(approve)}
                    title={approve ? "Approve claim" : "Reject claim"}
                    trigger={
                      <Button variant={approve ? "default" : "outline"} size="sm">
                        {approve ? <Check /> : <X />}
                        {approve ? "Approve" : "Reject"}
                      </Button>
                    }
                    onSave={async (d) => {
                      await rpc("review_claim", {
                        _expense_id: e.id,
                        _approve: approve,
                        _note: text(d, "notes"),
                      });
                      await refresh();
                    }}
                  >
                    <Notes label="Review note" required={!approve} />
                  </Editor>
                ))}
              {me?.isAdmin && e.status === "approved" && (
                <Editor
                  title="Void expense"
                  destructive
                  trigger={
                    <Button variant="outline" size="sm">
                      Void
                    </Button>
                  }
                  onSave={async (d) => {
                    await rpc("void_expense", { _expense_id: e.id, _reason: text(d, "notes") });
                    await refresh();
                  }}
                >
                  <Notes label="Reason" required />
                </Editor>
              )}
            </div>
          </article>
        ))}
      </div>
      {!query.isPending && !expenses.length && <Empty>No expenses in this view.</Empty>}
    </div>
  );
}
