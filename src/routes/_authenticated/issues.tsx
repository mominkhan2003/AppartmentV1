import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import {
  Editor,
  Choice,
  Notes,
  FileField,
  Status,
  DataState,
  text,
  upload,
} from "@/components/flat/Forms";
import {
  useIssues,
  useResidents,
  useSpaces,
  useMe,
  useRefresh,
  openFile,
} from "@/lib/flat";
import { createIssue, updateIssue, pageHead } from "@/lib/flat-actions";
import { canManage } from "@/lib/portal-permissions";
export const Route = createFileRoute("/_authenticated/issues")({
  head: () =>
    pageHead(
      "Issues",
      "Report household problems and follow assignments, responses and resolutions.",
    ),
  component: Issues,
});
function Issues() {
  const query = useIssues();
  const { data: spaces = [] } = useSpaces();
  const { data: residents = [] } = useResidents();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const [filter, setFilter] = useState("open");
  const issues = (query.data ?? []).filter(
    (i) =>
      filter === "all" || (filter === "open" ? i.status !== "resolved" : i.status === "resolved"),
  );
  return (
    <div>
      <PageHeader
        title="Issues"
        sub="Everything that needs attention"
        action={
          <Editor
            title="Report an issue"
            trigger={
              <Button>
                <Plus />
                Report issue
              </Button>
            }
            onSave={async (d) => {
              const file = upload(d);
              await createIssue(d, { reporterResidentId: me?.resident?.id ?? null, photo: file });
              await refresh();
            }}
          >
            <Choice
              label="Space"
              name="space"
              options={spaces.map((s) => ({ id: s.id, name: s.name }))}
            />
            <Choice
              label="Category"
              name="category"
              value="maintenance"
              options={["maintenance", "cleanliness", "damage", "other"].map((s) => ({
                id: s,
                name: s,
              }))}
            />
            <Notes label="Description" name="description" required />
            <FileField />
          </Editor>
        }
      />
      <div className="mb-5 flex gap-2">
        {["open", "resolved", "all"].map((s) => (
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
      <div className="grid gap-4 lg:grid-cols-2">
        {issues.map((i) => (
          <article key={i.id} className="rounded-lg border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <Status value={i.status} />
              {me && canManage(me.isAdmin, me.permissions, "issues.manage") && (
                <Editor
                  title="Update issue"
                  trigger={
                    <Button size="icon" variant="outline" aria-label="Update issue">
                      <Pencil />
                    </Button>
                  }
                  onSave={async (d) => {
                    const status = text(d, "status") as "open" | "acknowledged" | "in_progress" | "resolved";
                    await updateIssue(i.id, {
                      status,
                      assigned_resident_id: text(d, "assigned") || null,
                      admin_response: text(d, "response") || null,
                      resolution_notes: text(d, "resolution") || null,
                    });
                    await refresh();
                  }}
                >
                  <Choice
                    label="Status"
                    name="status"
                    value={i.status}
                    required
                    options={["open", "acknowledged", "in_progress", "resolved"].map((s) => ({
                      id: s,
                      name: s.replaceAll("_", " "),
                    }))}
                  />
                  <Choice
                    label="Assigned to"
                    name="assigned"
                    value={i.assigned_resident_id ?? ""}
                    options={residents
                      .filter((r) => r.active)
                      .map((r) => ({ id: r.id, name: r.display_name }))}
                  />
                  <Notes label="Admin response" name="response" value={i.admin_response ?? ""} />
                  <Notes label="Resolution" name="resolution" value={i.resolution_notes ?? ""} />
                </Editor>
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words font-medium">{i.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {spaces.find((s) => s.id === i.space_id)?.name ?? "Whole flat"} · {i.category} ·{" "}
              {new Date(i.created_at).toLocaleDateString()}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reported by{" "}
              {residents.find((r) => r.id === i.reporter_resident_id)?.display_name ?? "Resident"}
              {i.assigned_resident_id &&
                " · Assigned to " +
                  residents.find((r) => r.id === i.assigned_resident_id)?.display_name}
            </p>
            {i.admin_response && (
              <p className="mt-4 border-t pt-3 text-sm break-words">{i.admin_response}</p>
            )}
            {i.resolution_notes && (
              <p className="mt-2 text-sm text-success break-words">{i.resolution_notes}</p>
            )}
            {i.photo_media_id && (
              <Button
                variant="link"
                className="mt-2 px-0"
                onClick={() => openFile("photos", i.photo_media_id ?? "")}
              >
                <Image />
                View photo
              </Button>
            )}
          </article>
        ))}
      </div>
      {!query.isPending && !issues.length && (
        <Empty>No {filter === "all" ? "" : filter} issues.</Empty>
      )}
    </div>
  );
}
