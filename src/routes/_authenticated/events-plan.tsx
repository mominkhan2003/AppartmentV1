import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, Choice, Notes, Status, DataState, text } from "@/components/flat/Forms";
import { MediaSelect, ResidentSelect, utcToLocal, toUtc, formatUtc } from "@/components/flat/CmsBits";
import { useMe } from "@/lib/flat";
import { listEvents, getEvent, createEvent, updateEvent, duplicateEvent, setEventStatus, deleteEvent, saveShift, updateShift, deleteShift, assignShift, pageHead } from "@/lib/flat-actions";
import { mediaUrl } from "@/lib/api";
import type { EventCms } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/events-plan")({
  head: () => pageHead("Public events", "Plan public flat events, translations and team shifts."),
  component: EventsPlan,
});

const CATEGORIES = [
  { id: "community", name: "Community" },
  { id: "cooking", name: "Cooking" },
  { id: "organizing", name: "Organizing" },
  { id: "cleaning", name: "Cleaning" },
  { id: "other", name: "Other" },
];

function EventsPlan() {
  const me = useMe();
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const events = useQuery({ queryKey: ["events", filter, page], queryFn: () => listEvents({ status: filter || undefined, page }) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["events"] });
  if (!me.data?.isAdmin) {
    return <p role="alert" className="text-destructive">Only administrators can plan public events.</p>;
  }
  const pages = events.data ? Math.max(1, Math.ceil(events.data.total / events.data.per_page)) : 1;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Public events"
        sub="Published events appear on the public homepage with translations."
        action={<EventEditor onSaved={refresh} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="h-9 w-40 rounded-md border bg-background px-3 text-sm">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <DataState query={events} />
      {events.data && events.data.items.length === 0 && <Empty>No events yet — create the first one.</Empty>}
      <div className="grid gap-3">
        {(events.data?.items ?? []).map((event) => <EventCard key={event.id} event={event} onChanged={refresh} />)}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function EventEditor({ event, onSaved }: { event?: EventCms; onSaved: () => Promise<void> }) {
  const de = event?.translations.find((t) => t.locale === "de");
  const en = event?.translations.find((t) => t.locale === "en");
  return (
    <Editor
      title={event ? "Edit event" : "Create event"}
      trigger={
        event ? (
          <Button size="sm" variant="ghost" aria-label={"Edit event " + (de?.title ?? en?.title ?? event.slug)}>Edit</Button>
        ) : (
          <Button><CalendarDays className="h-4 w-4" />Create event</Button>
        )
      }
      onSave={async (d) => {
        const body = {
          starts_at: toUtc(text(d, "starts_at")),
          ends_at: toUtc(text(d, "ends_at")) ?? null,
          category: (text(d, "category") || "other") as EventCms["category"],
          meeting_point: text(d, "meeting_point") || null,
          address: text(d, "address") || null,
          cover_media_id: text(d, "cover_media_id") || null,
          additional_info: text(d, "additional_info") || null,
          de: { title: text(d, "de_title"), description: text(d, "de_description") },
          en: { title: text(d, "en_title"), description: text(d, "en_description") },
        };
        if (!body.de.title && !body.en.title) throw new Error("Provide a title in German or English");
        if (event) await updateEvent(event.id, body);
        else await createEvent(body);
        await onSaved();
      }}
    >
      <TextField label="Title (German)" name="de_title" value={de?.title ?? ""} />
      <Notes label="Description (German)" name="de_description" value={de?.description ?? ""} />
      <TextField label="Title (English)" name="en_title" value={en?.title ?? ""} />
      <Notes label="Description (English)" name="en_description" value={en?.description ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Starts" name="starts_at" type="datetime-local" value={event ? utcToLocal(event.starts_at) : ""} required />
        <TextField label="Ends (optional)" name="ends_at" type="datetime-local" value={event?.ends_at ? utcToLocal(event.ends_at) : ""} />
      </div>
      <Choice label="Category" name="category" value={event?.category ?? "community"} options={CATEGORIES} />
      <TextField label="Meeting point" name="meeting_point" value={event?.meeting_point ?? ""} />
      <TextField label="Address" name="address" value={event?.address ?? ""} />
      <MediaSelect label="Cover image" name="cover_media_id" value={event?.cover_media_id} />
      <Notes label="Additional info (e.g. what to bring)" name="additional_info" value={event?.additional_info ?? ""} />
    </Editor>
  );
}

function EventCard({ event, onChanged }: { event: EventCms; onChanged: () => Promise<void> }) {
  const [openShifts, setOpenShifts] = useState(false);
  const detail = useQuery({
    queryKey: ["event", event.id],
    enabled: openShifts,
    queryFn: () => getEvent(event.id),
  });
  const title = event.translations[0]?.title ?? event.slug;
  const cover = event.cover_media_id ? mediaUrl(event.cover_media_id) : null;
  return (
    <article className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-4">
        {cover && <img src={cover} alt="" className="h-14 w-20 rounded-lg border object-cover" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{title}</h3>
            <Status value={event.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatUtc(event.starts_at)} · {event.category}
            {event.meeting_point ? ` · ${event.meeting_point}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EventEditor event={event} onSaved={onChanged} />
          {event.status !== "published" && (
            <Button size="sm" variant="outline" onClick={async () => { await setEventStatus(event.id, "published"); await onChanged(); }}>Publish</Button>
          )}
          {event.status === "published" && (
            <Button size="sm" variant="outline" onClick={async () => { await setEventStatus(event.id, "draft"); await onChanged(); }}>Unpublish</Button>
          )}
          {event.status !== "archived" && (
            <Button size="sm" variant="ghost" onClick={async () => { await setEventStatus(event.id, "archived"); await onChanged(); }}>Archive</Button>
          )}
          <Button size="sm" variant="ghost" onClick={async () => { await duplicateEvent(event.id); await onChanged(); }} aria-label={"Duplicate " + title}>
            <Copy className="h-4 w-4" /><span className="sr-only">Duplicate</span>Copy
          </Button>
          <Editor
            title={"Delete " + title}
            destructive
            trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label={"Delete " + title}><Trash2 className="h-4 w-4" />Delete</Button>}
            onSave={async () => { await deleteEvent(event.id); await onChanged(); }}
          >
            <p className="text-sm">Delete the event including translations and shifts?</p>
          </Editor>
          <Button size="sm" variant="outline" onClick={() => setOpenShifts((v) => !v)}>
            Shifts {detail.data ? `(${detail.data.shifts.length})` : ""}
          </Button>
        </div>
      </div>
      {openShifts && (detail.isPending ? <p className="py-3 text-sm text-muted-foreground">Loading shifts…</p> : detail.error ? <DataState query={detail} /> : (
        <ShiftsPanel eventId={event.id} shifts={detail.data?.shifts ?? []} onChanged={async () => { await detail.refetch(); await onChanged(); }} />
      ))}
    </article>
  );
}

function ShiftsPanel({ eventId, shifts, onChanged }: { eventId: string; shifts: EventCms["shifts"]; onChanged: () => Promise<void> }) {
  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold uppercase text-muted-foreground">Team shifts</h4>
        <Editor
          title="Add shift"
          trigger={<Button size="sm" variant="outline"><Plus className="h-4 w-4" />Add shift</Button>}
          onSave={async (d) => {
            await saveShift(eventId, {
              name: text(d, "name"),
              starts_at: toUtc(text(d, "starts_at")),
              ends_at: toUtc(text(d, "ends_at")) ?? null,
              slots: Math.max(1, parseInt(text(d, "slots") || "1", 10) || 1),
              notes: text(d, "notes") || null,
            });
            await onChanged();
          }}
        >
          <TextField label="Shift name" name="name" required />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Starts" name="starts_at" type="datetime-local" required />
            <TextField label="Ends" name="ends_at" type="datetime-local" />
          </div>
          <TextField label="Number of slots" name="slots" type="number" value="1" required />
          <Notes label="Notes" name="notes" />
        </Editor>
      </div>
      {!shifts.length && <Empty>No shifts planned for this event.</Empty>}
      <div className="mt-3 grid gap-2">
        {shifts.map((shift) => (
          <div key={shift.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{shift.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatUtc(shift.starts_at)} — {formatUtc(shift.ends_at)} · {shift.planned_count}/{shift.slots} filled
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Editor
                  title="Edit shift"
                  trigger={<Button size="sm" variant="ghost">Edit</Button>}
                  onSave={async (d) => {
                    await saveShiftUpdate(shift.id, d);
                    await onChanged();
                  }}
                >
                  <TextField label="Shift name" name="name" value={shift.name} required />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField label="Starts" name="starts_at" type="datetime-local" value={utcToLocal(shift.starts_at)} required />
                    <TextField label="Ends" name="ends_at" type="datetime-local" value={shift.ends_at ? utcToLocal(shift.ends_at) : ""} />
                  </div>
                  <TextField label="Number of slots" name="slots" type="number" value={String(shift.slots)} required />
                  <Notes label="Notes" name="notes" value={shift.notes ?? ""} />
                </Editor>
                <Editor
                  title={"Delete " + shift.name}
                  destructive
                  trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label={"Delete shift " + shift.name}><Trash2 className="h-4 w-4" /></Button>}
                  onSave={async () => { await deleteShift(shift.id); await onChanged(); }}
                >
                  <p className="text-sm">Remove this shift and its assignments?</p>
                </Editor>
              </div>
            </div>
            {shift.assignments.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {shift.assignments.map((a) => (
                  <li key={a.resident_id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{a.display_name ?? a.resident_id} <Status value={a.status} /></span>
                    {a.status !== "declined" && (
                      <Button size="sm" variant="ghost" onClick={async () => { await assignShift(shift.id, { resident_id: a.resident_id, status: "declined" }); await onChanged(); }}>
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <ShiftAssignEditor shiftId={shift.id} slots={shift.slots} filled={shift.planned_count} onChanged={onChanged} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** PATCH /shifts/:id keeps the same field shape used when creating a shift. */
async function saveShiftUpdate(shiftId: string, d: FormData) {
  await updateShift(shiftId, {
    name: text(d, "name"),
    starts_at: toUtc(text(d, "starts_at")),
    ends_at: toUtc(text(d, "ends_at")) ?? null,
    slots: Math.max(1, parseInt(text(d, "slots") || "1", 10) || 1),
    notes: text(d, "notes") || null,
  });
}

function ShiftAssignEditor({ shiftId, slots, filled, onChanged }: { shiftId: string; slots: number; filled: number; onChanged: () => Promise<void> }) {
  return (
    <Editor
      title="Assign resident"
      trigger={<Button size="sm" variant="outline">Assign</Button>}
      onSave={async (d) => {
        await assignShift(shiftId, {
          resident_id: text(d, "resident_id"),
          status: text(d, "status") || "planned",
          note: text(d, "note") || null,
        });
        await onChanged();
      }}
    >
      <ResidentSelect label="Resident" name="resident_id" required />
      <Choice
        label="Status"
        name="status"
        value="planned"
        options={[
          { id: "planned", name: "Planned" },
          { id: "confirmed", name: "Confirmed" },
        ]}
      />
      <Notes label="Note" name="note" />
      {filled >= slots && <p className="text-sm text-destructive">All slots are already taken — remove someone first.</p>}
    </Editor>
  );
}
