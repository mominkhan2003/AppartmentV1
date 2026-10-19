import { useState } from "react";
import { RoleManager } from "@/components/flat/RoleManager";
import { canManage } from "@/lib/portal-permissions";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, Notes, DataState, text } from "@/components/flat/Forms";
import {
  useMe,
  useResidents,
  useSpaces,
  useGroups,
  useWashroomAccess,
  useRefresh,
  useAudit,
} from "@/lib/flat";
import { saveGroup, saveSpace, setWashroomAccessBulk, pageHead } from "@/lib/flat-actions";
export const Route = createFileRoute("/_authenticated/admin")({
  head: () =>
    pageHead(
      "Admin Portal",
      "Manage household groups, room access, admin permissions and the audit history.",
    ),
  component: Admin,
});
function Admin() {
  const me = useMe();
  const [tab, setTab] = useState("household");
  const household = !!me.data && canManage(me.data.isAdmin, me.data.permissions, "household.manage");
  const audit = !!me.data && canManage(me.data.isAdmin, me.data.permissions, "audit.read");
  const { data: residents = [] } = useResidents();
  const { data: spaces = [] } = useSpaces();
  const { data: groups = [] } = useGroups();
  const { data: access = [] } = useWashroomAccess();
  const refresh = useRefresh();
  return (
    <div>
      <PageHeader title="Admin Portal" sub={me.data?.isAdmin ? "Administrator · Full household access" : "Delegated household access"} />
      {me.data && <div className="mb-6 flex flex-wrap gap-2">{[{id:"household",name:"Household",allowed:household},{id:"roles",name:"Roles & access",allowed:me.data.isAdmin},{id:"audit",name:"Audit history",allowed:audit}].filter(t=>t.allowed).map(t=><Button key={t.id} variant={tab===t.id?"default":"outline"} onClick={()=>setTab(t.id)}>{t.name}</Button>)}</div>}
      <DataState query={me} />
      {me.data && !household && !audit && !me.data.isAdmin ? (
        <Empty>You do not have access to portal settings.</Empty>
      ) : (
        me.data && (household || audit || me.data.isAdmin) && (
          <>
            {tab === "household" && household && <><section>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">Household groups</h2>
                <Editor
                  title="Add group"
                  trigger={
                    <Button>
                      <Plus />
                      Add group
                    </Button>
                  }
                  onSave={async (d) => {
                    await saveGroup(undefined, {
                      name: text(d, "name"),
                      description: text(d, "description") || null,
                      members: d.getAll("members").map(String),
                    });
                    await refresh();
                  }}
                >
                  <TextField label="Name" name="name" required />
                  <Notes label="Description" name="description" />
                  <fieldset className="grid gap-2">
                    <legend className="mb-2 text-sm">Members</legend>
                    {residents
                      .filter((r) => r.active)
                      .map((r) => (
                        <label key={r.id} className="flex gap-2 text-sm">
                          <input type="checkbox" name="members" value={r.id} />
                          {r.display_name}
                        </label>
                      ))}
                  </fieldset>
                </Editor>
              </div>
              <div className="divide-y border-y">
                {groups.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <h3 className="font-semibold">{g.name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {residents
                          .filter((r) => g.members.includes(r.id))
                          .map((r) => r.display_name)
                          .join(", ") || "No members"}
                      </p>
                    </div>
                    <Editor
                      title="Edit group"
                      trigger={
                        <Button variant="outline" size="icon" aria-label={"Edit " + g.name}>
                          <Pencil />
                        </Button>
                      }
                      onSave={async (d) => {
                        await saveGroup(g.id, {
                          name: text(d, "name"),
                          description: text(d, "description") || null,
                          members: d.getAll("members").map(String),
                        });
                        await refresh();
                      }}
                    >
                      <TextField label="Name" name="name" value={g.name} required />
                      <Notes label="Description" name="description" value={g.description ?? ""} />
                      <fieldset className="grid gap-2">
                        <legend className="mb-2 text-sm">Members</legend>
                        {residents.map((r) => (
                          <label key={r.id} className="flex gap-2 text-sm">
                            <input
                              name="members"
                              type="checkbox"
                              value={r.id}
                              defaultChecked={g.members.includes(r.id)}
                            />
                            {r.display_name}
                          </label>
                        ))}
                      </fieldset>
                    </Editor>
                  </div>
                ))}
              </div>
            </section>
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-semibold">Rooms and washroom access</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {spaces.map((s) => (
                  <article key={s.id} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{s.name}</h3>
                        <p className="text-xs capitalize text-muted-foreground">
                          {s.kind}
                          {s.kind === "bedroom" ? " · Capacity " + s.capacity : ""}
                        </p>
                      </div>
                      <Editor
                        title={"Edit " + s.name}
                        trigger={
                          <Button variant="outline" size="icon" aria-label={"Edit " + s.name}>
                            <Pencil />
                          </Button>
                        }
                        onSave={async (d) => {
                          const capacity = Number(text(d, "capacity"));
                          if (!Number.isInteger(capacity) || capacity < 0)
                            throw new Error("Capacity must be a whole non-negative number");
                          await saveSpace(s.id, { name: text(d, "name"), capacity, notes: text(d, "notes") || null });
                          if (s.kind === "bedroom") {
                            await setWashroomAccessBulk(s.id, d.getAll("washrooms").map(String));
                          }
                          await refresh();
                        }}
                      >
                        <TextField label="Name" name="name" value={s.name} required />
                        <TextField
                          label="Capacity"
                          name="capacity"
                          type="number"
                          value={s.capacity}
                          required
                        />
                        <Notes value={s.notes ?? ""} />
                        {s.kind === "bedroom" && (
                          <fieldset className="grid gap-2">
                            <legend className="mb-2 text-sm">Washroom access</legend>
                            {spaces
                              .filter((w) => w.kind === "washroom")
                              .map((w) => (
                                <label key={w.id} className="flex gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    name="washrooms"
                                    value={w.id}
                                    defaultChecked={access.some(
                                      (a) => a.bedroom_id === s.id && a.washroom_id === w.id,
                                    )}
                                  />
                                  {w.name}
                                </label>
                              ))}
                          </fieldset>
                        )}
                      </Editor>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground break-words">{s.notes}</p>
                    {s.kind === "bedroom" && (
                      <p className="mt-2 text-xs">
                        {access
                          .filter((a) => a.bedroom_id === s.id)
                          .map((a) => spaces.find((w) => w.id === a.washroom_id)?.name)
                          .join(" · ") || "No washroom assigned"}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
            </>}
            {tab === "roles" && me.data.isAdmin && <RoleManager />}
            {tab === "audit" && audit && <Audit />}
          </>
        )
      )}
    </div>
  );
}
function Audit() {
  const query = useAudit();
  const { data: residents = [] } = useResidents();
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-xl font-semibold">Audit history</h2>
      <DataState query={query} />
      <div className="divide-y border-y">
        {query.data?.map((a) => (
          <div key={a.id} className="py-3">
            <p className="text-sm font-medium capitalize">
              {a.action.replaceAll("_", " ")} · {a.entity}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleString()} ·{" "}
              {residents.find((r) => r.user_id === a.actor_id)?.display_name ?? "System"}
            </p>
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {JSON.stringify(a.details)}
            </p>
          </div>
        ))}
      </div>
      {!query.data?.length && !query.isPending && <Empty>No recorded admin actions yet.</Empty>}
    </section>
  );
}
