import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, Choice, Notes, text } from "@/components/flat/Forms";
import { mondayOf, shiftDays, useMealPlan, useMe, useResidents, useRefresh } from "@/lib/flat";
import { pageHead } from "@/lib/flat-actions";
import { saveMealCell, clearMealCell } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/weekly")({
  head: () =>
    pageHead(
      "Weekly menu",
      "Who cooks dinner — and optionally lunch and breakfast — for each day of the week.",
    ),
  component: WeeklyMenu,
});

const DAYS = [
  { day: 1, label: "Monday" },
  { day: 2, label: "Tuesday" },
  { day: 3, label: "Wednesday" },
  { day: 4, label: "Thursday" },
  { day: 5, label: "Friday" },
  { day: 6, label: "Saturday" },
  { day: 7, label: "Sunday" },
] as const;

const MEALS = ["dinner", "lunch", "breakfast"] as const;
type MealKind = (typeof MEALS)[number];

type MealEntry = {
  day_of_week: number;
  meal: string;
  cook_resident_id: string | null;
  cook_name: string | null;
  participants: string[];
  notes: string | null;
};

function cellOf(items: MealEntry[], day: number, meal: MealKind): MealEntry | undefined {
  return items.find((i) => i.day_of_week === day && i.meal === meal);
}

function WeeklyMenu() {
  const [week, setWeek] = useState(() => mondayOf());
  const { data, isPending } = useMealPlan(week);
  const { data: residents = [] } = useResidents();
  const { data: me } = useMe();
  const refresh = useRefresh();
  const isAdmin = !!me?.isAdmin;
  const items = data?.items ?? [];
  const active = residents.filter((r) => r.active);

  function weekLabel(iso: string) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // 1 = Monday

  const editor = (day: number, meal: MealKind, entry?: MealEntry) => (
    <Editor
      title={`Edit ${meal} · ${DAYS.find((d) => d.day === day)?.label} · week of ${weekLabel(week)}`}
      trigger={
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
          <Pencil className="h-3 w-3" />
          {entry ? "Edit" : "Add"}
        </Button>
      }
      onSave={async (d) => {
        const cook = text(d, "cook") || null;
        const participants = d.getAll("participants[]").map(String);
        if (!cook && !participants.length && !text(d, "notes")) {
          await clearMealCell(week, day, meal);
        } else {
          await saveMealCell({
            week,
            day,
            meal,
            cook_resident_id: cook,
            participants,
            notes: text(d, "notes") || null,
          });
        }
        await refresh();
      }}
    >
      <Choice
        label="Who cooks?"
        name="cook"
        value={entry?.cook_resident_id ?? ""}
        options={active.map((r) => ({ id: r.id, name: r.display_name }))}
      />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Who joins?</legend>
        {active.map((r) => (
          <label key={r.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="participants[]"
              value={r.id}
              defaultChecked={entry?.participants.includes(r.id)}
            />
            {r.display_name}
          </label>
        ))}
        {!active.length && <p className="text-sm text-muted-foreground">No active residents yet.</p>}
      </fieldset>
      <Notes label="What's on the table?" name="notes" value={entry?.notes ?? ""} />
    </Editor>
  );

  const clearButton = (day: number, meal: MealKind, entry?: MealEntry) =>
    isAdmin && entry && (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground"
        aria-label={`Clear ${meal} on ${DAYS.find((d) => d.day === day)?.label}`}
        onClick={async () => {
          await clearMealCell(week, day, meal);
          await refresh();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );

  const mealRow = (day: number, meal: MealKind, emphasize: boolean) => {
    const entry = cellOf(items, day, meal);
    return (
      <div className={emphasize ? "border-t-2 border-primary/30 pt-2" : "border-t pt-2"}>
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              "uppercase tracking-wide " +
              (emphasize ? "text-xs font-semibold text-primary" : "text-xs font-medium text-muted-foreground")
            }
          >
            {meal}
          </span>
          <span className="flex items-center gap-1">{isAdmin && editor(day, meal, entry)}{clearButton(day, meal, entry)}</span>
        </div>
        <p className="mt-1 text-sm font-medium break-words">
          {entry?.cook_name ?? <span className="text-muted-foreground">Not planned yet</span>}
        </p>
        {entry?.notes && (
          <p className="mt-0.5 text-xs text-muted-foreground break-words">{entry.notes}</p>
        )}
        {entry && entry.participants.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-1">
            {entry.participants.map((pid) => {
              const r = residents.find((x) => x.id === pid);
              if (!r) return null;
              return (
                <span
                  key={pid}
                  className="rounded-full bg-secondary px-2 py-0.5 text-[11px] leading-none text-secondary-foreground"
                >
                  {r.display_name.replace(" (sample)", "")}
                </span>
              );
            })}
          </p>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Weekly menu"
        sub="Rotate cooking fairly — dinner first, lunch and breakfast when you want them."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeek(shiftDays(week, -7))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <span className="min-w-40 text-center text-sm font-medium">Week of {weekLabel(week)}</span>
            <Button variant="outline" size="sm" onClick={() => setWeek(shiftDays(week, 7))} aria-label="Next week">
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setWeek(mondayOf())}>
              <UtensilsCrossed />
              This week
            </Button>
          </div>
        }
      />

      {!isAdmin && (
        <p className="mb-4 text-sm text-muted-foreground">
          Only admins edit the plan — ask them in the household group chat for changes.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DAYS.map(({ day, label }) => (
          <article
            key={day}
            className={
              "rounded-lg border bg-card p-4 " +
              (day === todayDow && week === mondayOf() ? "ring-2 ring-primary/40" : "")
            }
          >
            <h2 className="flex items-center justify-between font-semibold">
              {label}
              {day === todayDow && week === mondayOf() && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary-foreground">
                  today
                </span>
              )}
            </h2>
            <div className="mt-3 space-y-2">{mealRow(day, "dinner", true)}{mealRow(day, "lunch", false)}{mealRow(day, "breakfast", false)}</div>
          </article>
        ))}
      </div>

      {!isPending && !items.length && <Empty>Nothing planned for this week yet.</Empty>}
    </div>
  );
}
