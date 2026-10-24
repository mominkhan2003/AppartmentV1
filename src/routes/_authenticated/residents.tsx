import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Users, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, Choice, Status, DataState, text } from "@/components/flat/Forms";
import {
  useResidents,
  useSpaces,
  useMe,
  useRefresh,
  useGroups,
  useWashroomAccess,
  useFinanceOverview,
  eur,
  toCents,
  type Resident,
} from "@/lib/flat";
import {
  createResident,
  updateResident,
  deleteResident,
  recordPayment,
  addAdjustment,
  pageHead,
} from "@/lib/flat-actions";
export const Route = createFileRoute("/_authenticated/residents")({
  head: () =>
    pageHead("Residents", "Residents, room assignments, contact details and household groups."),
  component: Residents,
});
function Residents() {
  const query = useResidents();
  const residents = query.data ?? [];
  const { data: spaces = [] } = useSpaces();
  const { data: groups = [] } = useGroups();
  const { data: access = [] } = useWashroomAccess();
  const { data: finance } = useFinanceOverview();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const rooms = spaces.filter((s) => s.kind === "bedroom").map((s) => ({ id: s.id, name: s.name }));
  const edit = (r?: Resident) => (
    <Editor
      title={r ? "Edit resident" : "Add resident"}
      trigger={
        <Button
          variant={r ? "outline" : "default"}
          size={r ? "icon" : "default"}
          aria-label={r ? "Edit " + r.display_name : undefined}
        >
          {r ? (
            <Pencil />
          ) : (
            <>
              <Plus />
              Add resident
            </>
          )}
        </Button>
      }
      onSave={async (d) => {
        const values = {
          display_name: text(d, "name"),
          phone: text(d, "phone") || null,
          ...(me?.isAdmin
            ? {
                email: text(d, "email") || null,
                room_id: text(d, "room") || null,
                active: d.get("active") === "on",
                can_view_finance: d.get("can_view_finance") === "on",
              }
            : {}),
        };
        if (r) await updateResident(r.id, values);
        else await createResident(values);
        await refresh();
      }}
    >
      <TextField label="Name" name="name" value={r?.display_name} required />
      <TextField label="Phone" name="phone" value={r?.phone ?? ""} />
      {me?.isAdmin && (
        <>
          <TextField label="Email" name="email" type="email" value={r?.email ?? ""} />
          <Choice label="Room" name="room" value={r?.room_id ?? ""} options={rooms} />
          <label className="flex items-center gap-2 text-sm">
            <input name="active" type="checkbox" defaultChecked={r?.active ?? true} />
            Active resident
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="can_view_finance"
              type="checkbox"
              defaultChecked={r?.can_view_finance ?? true}
            />
            Can view budget &amp; financial plan
          </label>
          <p className="-mt-1 text-xs text-muted-foreground">
            Unchecked residents only see cleaning, issues and household extras. The budget,
            expenses and audit report stay hidden.
          </p>
        </>
      )}
    </Editor>
  );
  const balanceEditor = (r: Resident) => (
    <Editor
      title={"Record balance · " + r.display_name}
      trigger={
        <Button variant="outline" size="icon" aria-label={"Record balance for " + r.display_name}>
          <Wallet />
        </Button>
      }
      onSave={async (d) => {
        const amount = toCents(text(d, "amount"));
        if (!Number.isFinite(amount) || amount === 0) throw new Error("Enter a non-zero amount");
        const kind = text(d, "kind") || "payment";
        if (kind === "payment") await recordPayment(r.id, amount, text(d, "reason"));
        else await addAdjustment(r.id, amount, text(d, "reason"));
        await refresh();
      }}
    >
      <Choice
        label="Entry kind"
        name="kind"
        value="payment"
        options={[
          { id: "payment", name: "Payment received (adds to balance)" },
          { id: "adjustment", name: "Adjustment (signed, e.g. -1500 to charge)" },
        ]}
      />
      <TextField label="Amount (EUR, signed)" name="amount" type="number" required />
      <TextField label="Reason" name="reason" required />
    </Editor>
  );
  const delEditor = (r: Resident) => (
    <Editor
      title={"Delete resident · " + r.display_name}
      destructive
      trigger={
        <Button variant="outline" size="icon" aria-label={"Delete " + r.display_name}>
          <Trash2 />
        </Button>
      }
      onSave={async () => {
        await deleteResident(r.id);
        await refresh();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Removes {r.display_name} & the room assignment. Their ledger and expense shares stay for the
        books; a linked login account remains but loses its residency.
      </p>
    </Editor>
  );
  return (
    <div>
      <PageHeader
        title="Residents"
        sub={`${residents.filter((r) => r.active).length} people at home`}
        action={me?.isAdmin ? edit() : undefined}
      />
      <DataState query={query} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {residents.map((r) => (
          <article key={r.id} className="rounded-lg border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary font-display text-lg font-bold">
                  {r.display_name.slice(0, 1)}
                </span>
                <h2 className="font-semibold break-words">{r.display_name}</h2>
              </div>
              <div className="flex shrink-0 gap-1">
                {(me?.isAdmin || r.user_id === me?.user.id) && edit(r)}
                {me?.isAdmin && balanceEditor(r)}
                {me?.isAdmin && delEditor(r)}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Status value={r.active ? "active" : "inactive"} />
              {r.is_sample && <Status value="sample" />}
              {r.can_view_finance === false && (
                <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                  Limited access
                </span>
              )}
              <span className="text-sm text-muted-foreground">
                {spaces.find((s) => s.id === r.room_id)?.name ?? "Room not assigned"}
              </span>
              <span className="text-sm text-muted-foreground">
                · Joined{" "}
                {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "—"}
              </span>
              {(() => {
                const due = finance?.members.find((m) => m.id === r.id);
                if (!due) return null;
                return due.status === "pending" ? (
                  <span className="text-sm font-medium text-[#92400e]">
                    · {eur(due.outstanding_cents)} pending
                  </span>
                ) : (
                  <span className="text-sm font-medium text-emerald-700">· Dues settled</span>
                );
              })()}
            </div>
            <div className="mt-3 space-y-1 text-sm">
              <p className="break-all">{r.email ?? "No email"}</p>
              <p>{r.phone ?? "No phone"}</p>
              <p className="text-muted-foreground">
                {access
                  .filter((a) => a.bedroom_id === r.room_id)
                  .map((a) => spaces.find((s) => s.id === a.washroom_id)?.name)
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-muted-foreground">
                {groups
                  .filter((g) => g.members.includes(r.id))
                  .map((g) => g.name)
                  .join(" · ")}
              </p>
            </div>
          </article>
        ))}
      </div>
      {!query.isPending && !residents.length && <Empty>No residents yet.</Empty>}
      <section className="mt-8">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <Users className="h-5 w-5" />
          Household groups
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <article key={g.id} className="rounded-lg border bg-card p-5">
              <h3 className="font-semibold">{g.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
              <p className="mt-3 text-sm">
                {residents
                  .filter((r) => g.members.includes(r.id))
                  .map((r) => r.display_name)
                  .join(", ") || "No members"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
