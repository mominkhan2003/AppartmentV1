import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FloorPlan } from "@/components/flat/FloorPlan";
import { PageHeader, Panel, Stat } from "@/components/flat/Page";
import { pageHead } from "@/lib/flat-actions";
import { eur, nameOf, useBalances, useChores, useIssues, useMe, useResidents, useSpaces, type Space } from "@/lib/flat";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageHead("Overview", "Your FlatMate Hub balances, cleaning duties, issues and apartment floor plan."),
  component: Dashboard,
});

function Dashboard() {
  const { data: me } = useMe();
  const { data: spaces = [] } = useSpaces();
  const { data: residents = [] } = useResidents();
  const { data: balances = [] } = useBalances();
  const { data: chores = [] } = useChores();
  const { data: issues = [] } = useIssues();
  const [sel, setSel] = useState<Space | null>(null);
  const myBal = balances.find((b) => b.resident_id === me?.resident?.id)?.balance_cents ?? 0;
  const myChores = chores.filter((c) => c.current_resident_id === me?.resident?.id && c.active);
  const open = issues.filter((i) => i.status !== "resolved");

  return (
    <div>
      <PageHeader title={`Hi ${me?.resident?.display_name ?? ""}`} sub="Here's what's happening in the flat." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="My balance" value={eur(myBal)} tone={myBal < 0 ? "bad" : "good"} />
        <Stat label="My duties now" value={myChores.length} />
        <Stat label="Open issues" value={open.length} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <FloorPlan spaces={spaces} residents={residents} highlight={sel?.id} onSelect={setSel} />
        <div className="space-y-6">
          {sel && (
            <Panel title={sel.name}>
              <p className="text-sm capitalize text-muted-foreground">{sel.kind}{sel.notes ? ` · ${sel.notes}` : ""}</p>
              <ul className="mt-2 text-sm">
                {residents.filter((r) => r.room_id === sel.id).map((r) => <li key={r.id}>{r.display_name}</li>)}
              </ul>
              {chores.filter((c) => c.space_id === sel.id).map((c) => (
                <p key={c.id} className="mt-2 text-sm">{c.name}: <b>{nameOf(residents, c.current_resident_id)}</b>, due {c.next_due}</p>
              ))}
            </Panel>
          )}
          <Panel title="Cleaning this week">
            <ul className="space-y-2 text-sm">
              {chores.filter((c) => c.active).map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className="text-muted-foreground">{nameOf(residents, c.current_resident_id)} · {c.next_due}</span>
                </li>
              ))}
            </ul>
            <Link to="/cleaning" className="mt-3 inline-block text-sm text-primary underline">Open cleaning</Link>
          </Panel>
          <Panel title="Latest issues">
            <ul className="space-y-2 text-sm">
              {open.slice(0, 4).map((i) => (
                <li key={i.id} className="flex justify-between gap-2"><span className="truncate">{i.description}</span><span className="capitalize text-muted-foreground">{i.status.replace("_", " ")}</span></li>
              ))}
              {!open.length && <li className="text-muted-foreground">Nothing open 🎉</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
