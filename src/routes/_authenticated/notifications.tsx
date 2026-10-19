import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { DataState } from "@/components/flat/Forms";
import { formatUtc } from "@/components/flat/CmsBits";
import { notifications, markNotificationsRead, pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => pageHead("Notifications", "System messages from the hub: new requests, chores and issues."),
  component: Notifications,
});

function Notifications() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["notifications"], queryFn: notifications });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const rows = query.data?.items ?? [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        sub={query.data ? (query.data.unread ? `${query.data.unread} unread` : "You are all caught up") : undefined}
        action={
          <Button variant="outline" disabled={!query.data || query.data.unread === 0} onClick={async () => { await markNotificationsRead(); await refresh(); }}>
            <CheckCheck className="h-4 w-4" />Mark all read
          </Button>
        }
      />
      <DataState query={query} />
      {query.data && rows.length === 0 && <Empty>No notifications — quiet in the flat right now.</Empty>}
      <div className="divide-y border-y">
        {rows.map((n) => (
          <article key={n.id} className={"py-4" + (n.read_at ? "" : " bg-primary/5")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className={"break-words" + (n.read_at ? " font-medium" : " font-semibold")}>{n.title}</h2>
                {n.body && <p className="mt-1 break-words text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatUtc(n.created_at)} · {n.audience === "admin" ? "Admin notice" : "Personal"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {n.link && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={n.link as Parameters<typeof Link>[0]["to"]}>Open</Link>
                  </Button>
                )}
                {!n.read_at && (
                  <Button size="sm" variant="ghost" onClick={async () => { await markNotificationsRead(n.id); await refresh(); }}>
                    Mark read
                  </Button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
