import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, Undo2, Trash2, ExternalLink, Search, ArrowRight, Phone, Mail, Clock, MapPin, CheckCheck, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Editor, TextField, Notes, Choice, DataState, Status, text } from "@/components/flat/Forms";
import { PageHeader, run } from "@/components/flat/Page";
import { useMe, useResidents } from "@/lib/flat";
import { hubItems, hubResponses, hubInsert, hubEdit, hubDelete, hubRespond, hubSetStatus } from "@/lib/flat-actions";
import { hubPages, valueOf, pollOptions, safeDocumentUrl, formPayload, type HubKind, type HubItem, type HubResponse } from "@/lib/hub";

export function HubPage({ kind }: { kind: HubKind }) {
  const config = hubPages[kind];
  const { data: me } = useMe();
  const { data: residents = [] } = useResidents();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["hub", kind], queryFn: () => hubItems(kind) });
  const responses = useQuery({ queryKey: ["hub-responses", kind], queryFn: () => hubResponses(kind) });
  async function refresh() { await Promise.all([qc.invalidateQueries({ queryKey: ["hub", kind] }), qc.invalidateQueries({ queryKey: ["hub-responses", kind] })]); }
  async function action(id: string, fn: () => Promise<unknown>, message: string) {
    setBusy(id);
    await run(async () => { await fn(); await refresh(); }, message);
    setBusy(null);
  }
  const items = query.data ?? [];
  const visible = items.filter(item => (filter === "all" || item.status === filter) && `${item.title} ${item.details} ${JSON.stringify(item.payload)}`.toLowerCase().includes(search.toLowerCase()));
  if (kind === "events" || kind === "bookings") visible.sort((a, b) => valueOf(a, "start").localeCompare(valueOf(b, "start")));
  const canCreate = !!me && (!config.adminOnly || me.isAdmin);
  const name = (uid: string) => residents.find(r => r.user_id === uid)?.display_name ?? "Household member";
  const respond = (item: HubItem, value: string) => action(item.id, () => hubRespond(item.id, value), value === "release" ? "Returned" : "Response saved");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={config.title} action={canCreate && <Editor title={`Add ${config.singular}`} trigger={<Button><Plus className="h-4 w-4" />Add {config.singular}</Button>} onSave={async data => {
        const title = text(data, "title");
        if (!title || title.length > 160) throw new Error("Title must be between 1 and 160 characters");
        await hubInsert({ kind, title, details: text(data, "details"), payload: formPayload(kind, data) });
        await refresh();
      }}>
        <TextField label={kind === "polls" ? "Question" : "Title"} name="title" required />
        <Notes label="Details" name="details" />
        {config.fields.map(field => <TextField key={field.key} label={field.label} name={field.key} type={field.type} required={field.type === "datetime-local" || field.key === "resource" || field.key === "url"} />)}
        {kind === "polls" && <Notes label="Options (one per line)" name="options" required />}
        {kind === "lost-found" && <Choice label="Report type" name="reportType" value="found" options={[{ id: "lost", name: "Lost" }, { id: "found", name: "Found" }]} />}
      </Editor>} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-y py-3">
        <div className="flex items-center gap-3 text-sm"><config.icon className="h-5 w-5 text-primary" /><span><strong>{items.filter(i => i.status === "open").length}</strong> active</span><span className="text-muted-foreground">{items.filter(i => i.status === "done").length} closed</span></div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={`Search ${config.title}`} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-9" /></div>
          <div className="flex items-center gap-1" aria-label="Filter items">{["open", "done", "all"].map(value => <Button key={value} variant={filter === value ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(value)}>{value === "open" ? "Active" : value === "done" ? "Closed" : "All"}</Button>)}</div>
        </div>
      </div>
      <DataState query={query} /><DataState query={responses} />
      {!query.isPending && !query.error && !visible.length && <div className="py-16 text-center"><config.icon className="mx-auto mb-4 h-10 w-10 text-muted-foreground" /><h2 className="text-lg font-semibold">{search ? "No matches" : filter === "done" ? "Nothing closed yet" : `No ${config.title.toLowerCase()} yet`}</h2></div>}
      <div className={kind === "shopping" ? "grid gap-3" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
        {visible.map(item => {
          const itemResponses: HubResponse[] = (responses.data ?? []).filter(r => r.item_id === item.id);
          const mine = itemResponses.find(r => r.user_id === me?.user.id);
          const owner = me?.isAdmin || item.created_by === me?.user.id;
          const url = safeDocumentUrl(valueOf(item, "url"));
          return <article key={item.id} className="flex min-w-0 flex-col rounded-lg border bg-card p-5">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{item.title}</h2><p className="mt-1 text-xs text-muted-foreground">{name(item.created_by)} · {new Date(item.created_at).toLocaleDateString()}</p></div><Status value={item.status === "done" ? "closed" : "active"} /></div>
            {item.details && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.details}</p>}
            <dl className="mt-3 space-y-2 text-sm">{config.fields.filter(f => f.key !== "url" && f.key !== "phone" && f.key !== "email").map(f => valueOf(item, f.key) && <div key={f.key} className="flex gap-2"><dt className="shrink-0 text-muted-foreground">{f.type === "datetime-local" ? <Clock className="h-4 w-4" /> : f.key === "location" ? <MapPin className="h-4 w-4" /> : `${f.label}:`}</dt><dd className="min-w-0 break-words">{f.type === "datetime-local" ? new Date(valueOf(item, f.key)).toLocaleString() : valueOf(item, f.key)}</dd></div>)}</dl>
            {kind === "lost-found" && <p className="mt-2 text-sm font-medium capitalize">{valueOf(item, "reportType") || "found"}</p>}
            {kind === "documents" && url && <Button variant="outline" asChild className="mt-4"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Open document</a></Button>}
            {kind === "contacts" && <div className="mt-4 flex flex-wrap gap-2">{valueOf(item, "phone") && <Button variant="outline" asChild><a href={`tel:${valueOf(item, "phone").replace(/[^+\d]/g, "")}`}><Phone className="h-4 w-4" />Call</a></Button>}{valueOf(item, "email") && <Button variant="outline" asChild><a href={`mailto:${valueOf(item, "email")}`}><Mail className="h-4 w-4" />Email</a></Button>}<p className="w-full break-words text-sm text-muted-foreground">{valueOf(item, "phone")} {valueOf(item, "email")}</p></div>}
            {kind === "polls" && <div className="mt-4 space-y-3">{pollOptions(item).map(option => { const count = itemResponses.filter(r => r.value === option).length; const percent = itemResponses.length ? Math.round(count / itemResponses.length * 100) : 0; return <div key={option}><Button variant={mine?.value === option ? "secondary" : "outline"} className="h-auto min-h-9 w-full justify-between whitespace-normal text-left" disabled={busy === item.id || item.status === "done"} onClick={() => respond(item, option)}><span className="min-w-0 break-words">{mine?.value === option && <Check className="mr-1 inline h-4 w-4" />}{option}</span><span className="ml-2 shrink-0 text-xs">{count} · {percent}%</span></Button><progress value={count} max={Math.max(itemResponses.length, 1)} className="mt-1 h-1 w-full accent-primary" /></div>; })}<p className="text-xs text-muted-foreground">{itemResponses.length} votes</p></div>}
            {kind === "events" && <div className="mt-4"><div className="flex flex-wrap gap-1">{["going", "maybe", "not-going"].map(value => <Button size="sm" key={value} variant={mine?.value === value ? "secondary" : "outline"} disabled={busy === item.id || item.status === "done"} onClick={() => respond(item, value)}>{value === "not-going" ? "Can't go" : value === "going" ? "Going" : "Maybe"}</Button>)}</div><p className="mt-2 text-xs text-muted-foreground">{itemResponses.filter(r => r.value === "going").length} going · {itemResponses.filter(r => r.value === "maybe").length} maybe</p>{itemResponses.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{itemResponses.filter(r => r.value === "going").map(r => name(r.user_id)).join(", ")}</p>}</div>}
            {(kind === "notices" || kind === "rules") && <div className="mt-4"><Button size="sm" variant={mine ? "secondary" : "outline"} disabled={!!mine || busy === item.id || item.status === "done"} onClick={() => respond(item, "acknowledged")}><CheckCheck className="h-4 w-4" />{mine ? "Acknowledged" : "Acknowledge"}</Button><p className="mt-2 text-xs text-muted-foreground">{itemResponses.length} acknowledged</p></div>}
            {(kind === "inventory" || kind === "lost-found") && <div className="mt-4">{itemResponses[0] ? <><p className="mb-2 text-sm">{kind === "inventory" ? "Borrowed" : "Claimed"} by {name(itemResponses[0].user_id)}</p>{(mine || me?.isAdmin) && <Button variant="outline" size="sm" disabled={busy === item.id} onClick={() => respond(item, "release")}><Undo2 className="h-4 w-4" />{kind === "inventory" ? "Return item" : "Release claim"}</Button>}</> : <Button variant="outline" size="sm" disabled={busy === item.id || item.status === "done"} onClick={() => respond(item, "claimed")}><ArrowRight className="h-4 w-4" />{kind === "inventory" ? "Borrow item" : "Claim item"}</Button>}</div>}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-3">
              {owner && <Editor title={`Edit ${config.singular}`} trigger={<Button size="icon" variant="ghost" aria-label={`Edit ${item.title}`}><Pencil className="h-4 w-4" /></Button>} onSave={async data => {
                await hubEdit(item.id, { title: text(data, "title"), details: text(data, "details"), payload: formPayload(kind, data) });
                await refresh();
              }}>
                <TextField label={kind === "polls" ? "Question" : "Title"} name="title" value={item.title} required />
                <Notes label="Details" name="details" value={item.details} />
                {config.fields.map(field => <TextField key={field.key} label={field.label} name={field.key} type={field.type} value={field.type === "datetime-local" && valueOf(item, field.key) ? localDate(valueOf(item, field.key)) : valueOf(item, field.key)} required={field.type === "datetime-local" || field.key === "resource" || field.key === "url"} />)}
                {kind === "polls" && <Notes label="Options (one per line)" name="options" value={pollOptions(item).join("\n")} required />}
                {kind === "lost-found" && <Choice label="Report type" name="reportType" value={valueOf(item, "reportType") || "found"} options={[{ id: "lost", name: "Lost" }, { id: "found", name: "Found" }]} />}
              </Editor>}
              {(owner || kind === "shopping") && <Button size="sm" variant="ghost" disabled={busy === item.id} onClick={() => action(item.id, () => hubSetStatus(item.id, item.status === "open" ? "done" : "open"), "Updated")} >{item.status === "done" ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}{item.status === "done" ? "Reopen" : kind === "shopping" ? "Purchased" : "Close"}</Button>}
              {owner && <Editor title={`Delete ${config.singular}`} destructive trigger={<Button size="icon" variant="ghost" aria-label={`Delete ${item.title}`} className="ml-auto text-destructive"><Trash2 className="h-4 w-4" /></Button>} onSave={async () => { await hubDelete(item.id); await refresh(); }}><p className="break-words text-sm">Delete “{item.title}” and all its responses?</p></Editor>}
            </div>
          </article>;
        })}
      </div>
    </div>
  );
}

function localDate(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
