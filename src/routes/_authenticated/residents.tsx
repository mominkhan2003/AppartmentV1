import { createFileRoute } from "@tanstack/react-router";
import { Plus, Pencil, Users } from "lucide-react";
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
  type Resident,
} from "@/lib/flat";
import { checked, pageHead } from "@/lib/flat-actions";
import { supabase } from "@/integrations/supabase/client";
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
                is_sample: false,
              }
            : {}),
        };
        await checked(
          r
            ? supabase.from("residents").update(values).eq("id", r.id)
            : supabase.from("residents").insert(values),
        );
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
        </>
      )}
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
              {(me?.isAdmin || r.user_id === me?.user.id) && edit(r)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Status value={r.active ? "active" : "inactive"} />
              {r.is_sample && <Status value="sample" />}
              <span className="text-sm text-muted-foreground">
                {spaces.find((s) => s.id === r.room_id)?.name ?? "Room not assigned"}
              </span>
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
