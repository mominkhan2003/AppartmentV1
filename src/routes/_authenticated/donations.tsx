import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Stat } from "@/components/flat/Page";
import { Editor, TextField, Choice, Notes, Status, DataState, text } from "@/components/flat/Forms";
import { eurCms } from "@/components/flat/CmsBits";
import { useMe } from "@/lib/flat";
import {
  listDonationRequests, updateDonationRequest, listDonationTransactions, createDonationTransaction,
  deleteDonationTransaction, donationCategories, saveDonationCategory, deleteDonationCategory,
  siteSettings, saveSiteSettings, pageHead,
} from "@/lib/flat-actions";
import type { DonationCategory } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/donations")({
  head: () => pageHead("Donations", "Incoming donation requests, confirmed transactions and finance categories."),
  component: Donations,
});

const toCents = (v: string) => Math.round(parseFloat(v.replace(",", ".")) * 100);

function Donations() {
  const me = useMe();
  const [tab, setTab] = useState<"requests" | "transactions" | "categories" | "settings">("requests");
  if (!me.data?.isAdmin) {
    return <p role="alert" className="text-destructive">Only administrators manage the donation finance records.</p>;
  }
  const tabs = [
    { id: "requests", label: "Requests" },
    { id: "transactions", label: "Finance" },
    { id: "categories", label: "Categories" },
    { id: "settings", label: "Settings" },
  ] as const;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Donations" sub="Everything handled here is private; the homepage only ever shows totals." />
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? "default" : "outline"} onClick={() => setTab(t.id)}>
            {t.label}
          </Button>
        ))}
      </div>
      {tab === "requests" && <RequestsTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

function RequestsTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const requests = useQuery({ queryKey: ["donation-requests", status], queryFn: () => listDonationRequests({ status: status || undefined }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["donation-requests"] });
  return (
    <div>
      <div className="mb-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40 rounded-md border bg-background px-3 text-sm">
          <option value="">All requests</option>
          <option value="new">New</option>
          <option value="credited">Credited</option>
          <option value="declined">Declined</option>
          <option value="spam">Spam</option>
        </select>
      </div>
      <DataState query={requests} />
      <div className="divide-y border-y">
        {(requests.data?.items ?? []).map((r) => (
          <article key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{r.contact_name}</h3>
                <Status value={r.status} />
                {r.category_name && <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{r.category_name}</span>}
              </div>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {r.contact_email}{r.contact_phone ? ` · ${r.contact_phone}` : ""}
                {r.amount_cents !== null ? ` · offers ${eurCms(r.amount_cents)}` : " · no amount given"} · {r.created_at.slice(0, 10)}
              </p>
              {r.message && <p className="mt-2 max-w-3xl break-words text-sm">{r.message}</p>}
              {r.internal_notes && <p className="mt-1 text-xs text-muted-foreground">Internal: {r.internal_notes}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {r.status !== "credited" && (
                <Editor title="Credit donation" trigger={<Button size="sm" variant="outline">Record arrival</Button>}
                  onSave={async (d) => {
                    await createDonationTransaction({
                      amount_cents: toCents(text(d, "amount")),
                      transaction_date: text(d, "transaction_date"),
                      method: text(d, "method") || "bank_transfer",
                      category_id: text(d, "category_id") || null,
                      donor_name: r.contact_name,
                      request_id: r.id,
                      reference: text(d, "reference") || null,
                      note: text(d, "note") || null,
                    });
                    await refresh();
                    await qc.invalidateQueries({ queryKey: ["donation-transactions"] });
                  }}>
                  <p className="text-sm">Recording marks the request as credited.</p>
                  <TextField label="Amount received (EUR)" name="amount" type="number" required />
                  <TextField label="Date" name="transaction_date" type="date" value={new Date().toISOString().slice(0, 10)} required />
                  <Choice label="Method" name="method" value="bank_transfer" options={[
                    { id: "bank_transfer", name: "Bank transfer" },
                    { id: "cash", name: "Cash" },
                    { id: "other", name: "Other" },
                  ]} />
                  <CategorySelect name="category_id" />
                  <TextField label="Reference" name="reference" />
                  <Notes label="Internal note" name="note" />
                </Editor>
              )}
              <Editor title="Update request" trigger={<Button size="sm" variant="ghost">Manage</Button>}
                onSave={async (d) => {
                  await updateDonationRequest(r.id, {
                    status: text(d, "status") || undefined,
                    internal_notes: text(d, "internal_notes") || null,
                  });
                  await refresh();
                }}>
                <Choice label="Status" name="status" value={r.status} options={[
                  { id: "new", name: "New" },
                  { id: "credited", name: "Credited" },
                  { id: "declined", name: "Declined" },
                  { id: "spam", name: "Spam" },
                ]} />
                <Notes label="Internal notes" name="internal_notes" value={r.internal_notes ?? ""} />
              </Editor>
            </div>
          </article>
        ))}
        {requests.data && requests.data.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No requests in this view.</p>}
      </div>
    </div>
  );
}

function CategorySelect({ name, value, required = false }: { name: string; value?: string | null; required?: boolean }) {
  const cats = useQuery({ queryKey: ["donation-categories"], queryFn: donationCategories });
  return (
    <label className="grid gap-2 text-sm font-medium">
      Purpose
      <select name={name} defaultValue={value ?? ""} required={required} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">—</option>
        {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <DataState query={cats} />
    </label>
  );
}

function TransactionsTab() {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const transactions = useQuery({
    queryKey: ["donation-transactions", from, to, category],
    queryFn: () => listDonationTransactions({ from: from || undefined, to: to || undefined, category_id: category || undefined }),
  });
  const cats = useQuery({ queryKey: ["donation-categories"], queryFn: donationCategories });
  const refresh = () => qc.invalidateQueries({ queryKey: ["donation-transactions"] });
  return (
    <div>
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Total in view" value={eurCms(transactions.data?.sum_amount_cents ?? 0)} tone="good" />
        <Stat label="Entries" value={String(transactions.data?.total ?? 0)} />
        <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs text-muted-foreground">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-36 rounded-md border bg-background px-3 text-sm">
            <option value="">All categories</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <DataState query={transactions} />
      <div className="divide-y border-y">
        {(transactions.data?.items ?? []).map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{eurCms(t.amount_cents)} · {t.method.replaceAll("_", " ")}</p>
              <p className="text-sm text-muted-foreground">
                {t.transaction_date}{t.category_name ? ` · ${t.category_name}` : ""}{t.donor_name ? ` · ${t.donor_name}` : ""}{t.reference ? ` · ref ${t.reference}` : ""}
              </p>
              {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
            </div>
            <Editor title="Delete transaction" destructive trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label="Delete transaction"><Trash2 className="h-4 w-4" /></Button>}
              onSave={async () => { await deleteDonationTransaction(t.id); await refresh(); }}>
              <p className="text-sm">Remove this {eurCms(t.amount_cents)} entry from the finance log?</p>
            </Editor>
          </div>
        ))}
        {transactions.data && transactions.data.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No transactions match.</p>}
      </div>
      <div className="mt-5">
        <Editor title="Record donation" trigger={<Button><Plus className="h-4 w-4" />Record donation</Button>}
          onSave={async (d) => {
            await createDonationTransaction({
              amount_cents: toCents(text(d, "amount")),
              transaction_date: text(d, "transaction_date"),
              method: text(d, "method") || "bank_transfer",
              category_id: text(d, "category_id") || null,
              donor_name: text(d, "donor_name") || null,
              reference: text(d, "reference") || null,
              note: text(d, "note") || null,
            });
            await refresh();
          }}>
          <TextField label="Amount (EUR)" name="amount" type="number" required />
          <TextField label="Date" name="transaction_date" type="date" value={new Date().toISOString().slice(0, 10)} required />
          <Choice label="Method" name="method" value="bank_transfer" options={[
            { id: "bank_transfer", name: "Bank transfer" },
            { id: "cash", name: "Cash" },
            { id: "other", name: "Other" },
          ]} />
          <CategorySelect name="category_id" />
          <TextField label="Donor name (optional)" name="donor_name" />
          <TextField label="Reference (e.g. bank memo)" name="reference" />
          <Notes label="Internal note" name="note" />
        </Editor>
      </div>
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["donation-categories"], queryFn: donationCategories });
  const refresh = () => qc.invalidateQueries({ queryKey: ["donation-categories"] });
  return (
    <div className="max-w-3xl">
      <DataState query={cats} />
      <div className="divide-y border-y">
        {(cats.data ?? []).map((c: DonationCategory) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium">{c.name}</p>
              {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              <p className="text-xs text-muted-foreground">Sort order {c.sort}</p>
            </div>
            <div className="flex gap-2">
              <Editor title="Edit category" trigger={<Button size="sm" variant="ghost">Edit</Button>}
                onSave={async (d) => {
                  await saveDonationCategory(c.id, { name: text(d, "name"), description: text(d, "description") || null, sort: parseInt(text(d, "sort") || "0", 10) || 0 });
                  await refresh();
                }}>
                <TextField label="Name" name="name" value={c.name} required />
                <Notes label="Description" name="description" value={c.description ?? ""} />
                <TextField label="Sort order" name="sort" type="number" value={String(c.sort)} />
              </Editor>
              <Editor title={"Delete " + c.name} destructive trigger={<Button size="sm" variant="ghost" className="text-destructive"><Trash2 className="h-4 w-4" />Delete</Button>}
                onSave={async () => { await deleteDonationCategory(c.id); await refresh(); }}>
                <p className="text-sm">Remove “{c.name}”? Existing transactions keep their history.</p>
              </Editor>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Editor title="Add category" trigger={<Button variant="outline"><Plus className="h-4 w-4" />Add category</Button>}
          onSave={async (d) => {
            await saveDonationCategory(null, { name: text(d, "name"), description: text(d, "description") || null, sort: parseInt(text(d, "sort") || "0", 10) || 0 });
            await refresh();
          }}>
          <TextField label="Name" name="name" required />
          <Notes label="Description" name="description" />
          <TextField label="Sort order" name="sort" type="number" value="0" />
        </Editor>
      </div>
    </div>
  );
}

function SettingsTab() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["site-settings"], queryFn: siteSettings });
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["site-settings"] }), qc.invalidateQueries({ queryKey: ["public-homepage"] })]);
  };
  const values = Object.fromEntries((settings.data ?? []).map((r) => [r.setting_key, r.setting_value]));
  return (
    <div className="max-w-2xl rounded-xl border bg-card p-5">
      <DataState query={settings} />
      <form
        className="grid gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          await saveSiteSettings({
            donations_public: d.get("donations_public") === "on" ? "1" : "0",
            donations_goal: text(d, "donations_goal"),
            donations_account: text(d, "donations_account"),
            donations_instructions: text(d, "donations_instructions"),
          });
          await refresh();
        }}
      >
        <label className="grid gap-2 text-sm font-medium">
          <span className="flex items-center gap-2"><input type="checkbox" name="donations_public" defaultChecked={values.donations_public === "1"} /> Show the donation area on the public homepage</span>
        </label>
        <TextField label="Goal (EUR)" name="donations_goal" type="number" value={values.donations_goal ?? ""} />
        <TextField label="Account details ('Flat IBAN AT…')" name="donations_account" value={values.donations_account ?? ""} />
        <Notes label="Public instructions" name="donations_instructions" value={values.donations_instructions ?? ""} />
        <div><Button>Save donation settings</Button></div>
      </form>
    </div>
  );
}
