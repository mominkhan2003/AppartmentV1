import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Plus, Pencil, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import {
  Editor,
  TextField,
  Choice,
  Notes,
  FileField,
  DataState,
  text,
  upload,
  Status,
} from "@/components/flat/Forms";
import {
  useChores,
  useChoreEvents,
  useResidents,
  useSpaces,
  useMe,
  useRefresh,
  nameOf,
  openFile,
} from "@/lib/flat";
import { saveChore, completeChore, reportChoreNeeded, choreAdminAction, pageHead } from "@/lib/flat-actions";
export const Route = createFileRoute("/_authenticated/cleaning")({
  head: () =>
    pageHead(
      "Cleaning",
      "Cleaning assignments, rotation order, completion photos and duty history.",
    ),
  component: Cleaning,
});
function Cleaning() {
  const query = useChores();
  const { data: events = [] } = useChoreEvents();
  const { data: residents = [] } = useResidents();
  const { data: spaces = [] } = useSpaces();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const [mine, setMine] = useState(false);
  const chores = query.data ?? [];
  const active = residents.filter((r) => r.active);
  const editor = (c?: (typeof chores)[number]) => (
    <Editor
      title={c ? "Edit duty" : "Add duty"}
      trigger={
        <Button
          variant={c ? "outline" : "default"}
          size={c ? "icon" : "default"}
          aria-label={c ? "Edit " + c.name : undefined}
        >
          {c ? (
            <Pencil />
          ) : (
            <>
              <Plus />
              Add duty
            </>
          )}
        </Button>
      }
      onSave={async (d) => {
        const members = d.getAll("members").map(String);
        const current = text(d, "assigned") || members[0] || null;
        if (current && !members.includes(current))
          throw new Error("The assigned resident must belong to the rotation");
        await saveChore(d, { choreId: c?.id, members });
        await refresh();
      }}
    >
      <TextField label="Name" name="name" value={c?.name} required />
      <Choice
        label="Kind"
        name="kind"
        value={c?.kind ?? "other"}
        required
        options={["washroom", "hall", "kitchen", "garbage", "other"].map((s) => ({
          id: s,
          name: s,
        }))}
      />
      <Choice
        label="Space"
        name="space"
        value={c?.space_id ?? ""}
        options={spaces.map((s) => ({ id: s.id, name: s.name }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Every (days)"
          name="frequency"
          type="number"
          value={c?.frequency_days ?? 7}
          required
        />
        <TextField
          label="Next due"
          name="due"
          type="date"
          value={c?.next_due ?? new Date().toISOString().slice(0, 10)}
          required
        />
      </div>
      <Choice
        label="Assigned resident"
        name="assigned"
        value={c?.current_resident_id ?? ""}
        options={active.map((r) => ({ id: r.id, name: r.display_name }))}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Rotation members</legend>
        {[...active]
          .sort((a, b) => (c?.members.indexOf(a.id) ?? 0) - (c?.members.indexOf(b.id) ?? 0))
          .map((r) => (
            <label key={r.id} className="flex gap-2 text-sm">
              <input
                name="members"
                value={r.id}
                type="checkbox"
                defaultChecked={c ? c.members.includes(r.id) : true}
              />
              {r.display_name}
            </label>
          ))}
      </fieldset>
      <label className="flex gap-2 text-sm">
        <input name="rotates" type="checkbox" defaultChecked={c?.rotates ?? true} />
        Rotate after completion
      </label>
      <label className="flex gap-2 text-sm">
        <input name="active" type="checkbox" defaultChecked={c?.active ?? true} />
        Active duty
      </label>
    </Editor>
  );
  return (
    <div>
      <PageHeader
        title="Cleaning"
        sub="A fair turn for everyone"
        action={me?.isAdmin ? editor() : undefined}
      />
      <div className="mb-5 flex gap-2">
        <Button variant={!mine ? "default" : "outline"} onClick={() => setMine(false)}>
          All duties
        </Button>
        <Button variant={mine ? "default" : "outline"} onClick={() => setMine(true)}>
          My duties
        </Button>
      </div>
      <DataState query={query} />
      <div className="grid gap-4 lg:grid-cols-2">
        {chores
          .filter(
            (c) =>
              (c.active || me?.isAdmin) && (!mine || c.current_resident_id === me?.resident?.id),
          )
          .map((c) => (
            <article key={c.id} className="rounded-lg border bg-card p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {spaces.find((s) => s.id === c.space_id)?.name ?? c.kind} · Every{" "}
                    {c.frequency_days} days
                  </p>
                </div>
                {me?.isAdmin && editor(c)}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <strong>{nameOf(residents, c.current_resident_id)}</strong>
                <Status
                  value={
                    !c.active
                      ? "inactive"
                      : c.next_due < new Date().toISOString().slice(0, 10)
                        ? "overdue"
                        : "due " + c.next_due
                  }
                />
              </div>
              {c.needed_reported_at && (
                <p className="mt-2 text-sm text-destructive">Cleaning requested</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground break-words">
                {c.members.map((id) => nameOf(residents, id)).join(" → ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.active &&
                  c.current_resident_id &&
                  (me?.isAdmin || c.current_resident_id === me?.resident?.id) && (
                    <Editor
                      title={"Complete " + c.name}
                      trigger={
                        <Button size="sm">
                          <Check />
                          Mark complete
                        </Button>
                      }
                      onSave={async (d) => {
                        const file = upload(d);
                        await completeChore(c.id, d, file);
                        await refresh();
                      }}
                    >
                      <Notes />
                      <FileField />
                    </Editor>
                  )}
                <Editor
                  title="Request cleaning"
                  trigger={
                    <Button variant="outline" size="sm">
                      Needs cleaning
                    </Button>
                  }
                  onSave={async (d) => {
                    await reportChoreNeeded(c.id, text(d, "notes"));
                    await refresh();
                  }}
                >
                  <Notes label="Reason" required />
                </Editor>
                {me?.isAdmin && (
                  <Editor
                    title="Change current turn"
                    trigger={
                      <Button variant="outline" size="sm">
                        Change turn
                      </Button>
                    }
                    onSave={async (d) => {
                      await choreAdminAction(
                        c.id,
                        text(d, "action") as "skip" | "reset" | "reassign",
                        text(d, "target") || null,
                        text(d, "notes"),
                      );
                      await refresh();
                    }}
                  >
                    <Choice
                      label="Action"
                      name="action"
                      value="skip"
                      required
                      options={[
                        { id: "skip", name: "Skip current turn" },
                        { id: "reset", name: "Reset rotation" },
                        { id: "reassign", name: "Reassign" },
                      ]}
                    />
                    <Choice
                      label="Resident (for reassign)"
                      name="target"
                      options={active
                        .filter((r) => c.members.includes(r.id))
                        .map((r) => ({ id: r.id, name: r.display_name }))}
                    />
                    <Notes label="Reason" required />
                  </Editor>
                )}
              </div>
            </article>
          ))}
      </div>
      {!query.isPending && !chores.length && <Empty>No cleaning duties yet.</Empty>}
      <section className="mt-8">
        <h2 className="mb-4 text-xl font-semibold">Recent activity</h2>
        <div className="divide-y border-y">
          {events.map((e) => (
            <div key={e.id} className="flex justify-between gap-3 py-3 text-sm">
              <div>
                <p>
                  {chores.find((c) => c.id === e.chore_id)?.name ?? "Duty"} ·{" "}
                  {e.event_type.replaceAll("_", " ")} · {nameOf(residents, e.resident_id)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground break-words">
                  {new Date(e.created_at).toLocaleString()}
                  {e.reason ? " · " + e.reason : ""}
                </p>
              </div>
              {e.photo_media_id && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="View completion photo"
                  onClick={() => openFile("photos", e.photo_media_id ?? "")}
                >
                  <Image />
                </Button>
              )}
            </div>
          ))}
        </div>
        {!events.length && <Empty>No activity yet.</Empty>}
      </section>
    </div>
  );
}
