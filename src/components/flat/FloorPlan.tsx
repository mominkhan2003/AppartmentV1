import { useMemo, useState } from "react";
import type { Resident, Space } from "@/lib/flat";
import { cn } from "@/lib/utils";

const fill: Record<string, string> = {
  bedroom: "var(--chart-1)",
  kitchen: "var(--chart-2)",
  hall: "var(--secondary)",
  balcony: "var(--chart-3)",
  washroom: "var(--chart-4)",
  storage: "var(--muted-foreground)",
  other: "var(--muted)",
};

/** Wall loft in plan units — keeps the extrusion proportional to the flat's own scale. */
const WALL_HEIGHT = 26;

type Pt = [number, number];

/** MySQL JSON shape column arrives decoded; tolerate legacy strings. */
function pointsOf(shape: unknown): Pt[] {
  const value = typeof shape === "string" ? safeParse(shape) : shape;
  if (!Array.isArray(value)) return [];
  return value
    .filter((p): p is number[] => Array.isArray(p) && p.length >= 2)
    .map((p) => [p[0] ?? 0, p[1] ?? 0]);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function centroid(pts: Pt[]): Pt {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** Darkens a CSS variable colour through color-mix for the wall loft faces. */
function shadeOf(kind: string) {
  const base = fill[kind] ?? fill["other"];
  return `color-mix(in srgb, ${base} 78%, var(--foreground))`;
}

/**
 * True-isometric projection of the floor plan (45° rotate, vertical squash):
 *   x' = (x − y) · kx          y' = (x + y) · ky − z
 * z lifts a point up the wall, so floor rims and wall tops share one maths path.
 */
function iso(pts: Pt[], z = 0): Pt[] {
  const kx = 0.72;
  const ky = 0.4;
  return pts.map(([x, y]) => [((x - y) * kx), ((x + y) * ky - z)] as Pt);
}

export function FloorPlan({
  spaces,
  residents,
  highlight,
  onSelect,
}: {
  spaces: Space[];
  residents: Resident[];
  highlight?: string | null | undefined;
  onSelect?: (s: Space) => void;
}) {
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [hover, setHover] = useState<string | null>(null);

  const rooms = useMemo(
    () =>
      spaces
        .map((s) => ({ s, pts: pointsOf(s.shape) }))
        .filter((r) => r.pts.length >= 3)
        // draw the hall under the rooms, and far rooms before near ones
        .sort((a, b) =>
          a.s.kind === "hall" ? -1 : b.s.kind === "hall" ? 1 : (centroid(a.pts)[0] + centroid(a.pts)[1]) - (centroid(b.pts)[0] + centroid(b.pts)[1]),
        ),
    [spaces],
  );

  const three = useMemo(() => {
    const far = rooms.map((r) => ({ ...r, screen: iso(r.pts, 0) }));
    const walls: { key: string; kind: string; corners: Pt[]; depth: number; active: boolean }[] = [];
    for (const r of far) {
      r.pts.forEach((p, i) => {
        const q = r.pts[(i + 1) % r.pts.length];
        if (!q) return;
        const a = iso([p], 0)[0];
        const b = iso([q], 0)[0];
        const c = iso([q], WALL_HEIGHT)[0];
        const d = iso([p], WALL_HEIGHT)[0];
        if (!a || !b || !c || !d) return;
        const depth = (p[0] + p[1] + q[0] + q[1]) / 2;
        walls.push({
          key: r.s.id + "#" + i,
          kind: r.s.kind,
          corners: [a, b, c, d],
          depth,
          active: highlight === r.s.id || hover === r.s.id,
        });
      });
    }
    walls.sort((a, b) => a.depth - b.depth);
    return { floors: far, walls };
  }, [rooms, highlight, hover]);

  const viewBox2d = useMemo(() => {
    const pts = rooms.flatMap((r) => r.pts);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 30;
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad].map((n) => Math.round(n));
  }, [rooms]);

  const viewBox3d = useMemo(() => {
    const pts = three.floors.flatMap((f) => f.screen);
    for (const w of three.walls) pts.push(...w.corners);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 34;
    return [
      Math.min(...xs) - pad,
      Math.min(...ys) - pad,
      Math.max(...xs) - Math.min(...xs) + 2 * pad,
      Math.max(...ys) - Math.min(...ys) + 2 * pad,
    ].map((n) => Math.round(n));
  }, [three]);

  const hovered = spaces.find((s) => s.id === hover);
  const activeIds = new Set([highlight, hover].filter(Boolean) as string[]);

  const floor = (
    <>
      {rooms.map(({ s, pts }) => {
        const active = activeIds.has(s.id);
        return (
          <polygon
            key={s.id}
            points={(mode === "3d" ? iso(pts, 0) : pts).map((p) => p.join(",")).join(" ")}
            fill={fill[s.kind] ?? fill["other"]}
            fillOpacity={!active ? 0.55 : 0.95}
            stroke="var(--foreground)"
            strokeOpacity={0.65}
            strokeWidth={active ? 2.5 : 1.5}
            strokeLinejoin="round"
            className="cursor-pointer transition-all"
            onMouseEnter={() => setHover(s.id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelect?.(s)}
          />
        );
      })}
    </>
  );

  const labels = (
    <>
      {rooms.map(({ s, pts }) => {
        const [cx, cy] = centroid(pts);
        const projected = mode === "3d" ? iso([[cx, cy]], 0)[0] : ([cx, cy] as Pt);
        if (!projected) return null;
        const [x, y] = projected;
        const occ = residents.filter((r) => r.room_id === s.id && r.active);
        return (
          <g key={s.id + "l"} pointerEvents="none">
            <text x={x} y={y} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">
              {s.code}
            </text>
            {occ.length > 0 && (
              <text x={x} y={y + 14} textAnchor="middle" fontSize={9} fill="var(--foreground)">
                {occ.map((o) => o.display_name.replace(" (sample)", "")).join(", ")}
              </text>
            )}
          </g>
        );
      })}
    </>
  );

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {hovered ? `${hovered.name}${hovered.notes ? " · " + hovered.notes : ""}` : "Hover or tap a space"}
        </div>
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1 uppercase", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <div
        className={
          "relative mx-auto w-full max-w-xl overflow-hidden rounded-xl " +
          (mode === "3d" ? "aspect-[4/3] bg-gradient-to-b from-transparent to-secondary/40" : "aspect-square")
        }
      >
        {mode === "2d" ? (
          <svg viewBox={viewBox2d.join(" ")} className="absolute inset-0 h-full w-full" shapeRendering="geometricPrecision">
            {floor}
            {labels}
          </svg>
        ) : (
          <svg viewBox={viewBox3d.join(" ")} className="absolute inset-0 h-full w-full" shapeRendering="geometricPrecision">
            {three.floors.map(({ s, screen }) => (
              <polygon
                key={"rim" + s.id}
                points={screen.map((p) => p.join(",")).join(" ")}
                fill="var(--card)"
                fillOpacity={0.25}
                stroke="var(--foreground)"
                strokeOpacity={activeIds.has(s.id) ? 0.8 : 0.4}
                strokeWidth={activeIds.has(s.id) ? 2 : 1}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            ))}
            {/* back-to-front walls — colour carries the room type, shade the loft edges */}
            {three.walls.map((w) => (
              <g key={w.key} pointerEvents="none">
                <polygon
                  points={w.corners.map((p) => p.join(",")).join(" ")}
                  fill={shadeOf(w.kind)}
                  stroke="var(--foreground)"
                  strokeOpacity={w.active ? 0.75 : 0.35}
                  strokeWidth={w.active ? 1.6 : 0.8}
                  strokeLinejoin="round"
                  fillOpacity={w.active ? 0.97 : 0.9}
                />
                <polygon
                  points={[w.corners[1], w.corners[2]].map((p) => (p ? p.join(",") : "")).filter(Boolean).join(" ")}
                  stroke="var(--foreground)"
                  strokeOpacity={0.25}
                  strokeWidth={0.8}
                  fill="none"
                  pointerEvents="none"
                />
              </g>
            ))}
            {floor}
            {labels}
          </svg>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries({ bedroom: "Room", kitchen: "Kitchen", hall: "Hall", washroom: "Washroom", balcony: "Balcony", storage: "Storage" }).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm border" style={{ background: fill[k] }} /> {l}
          </span>
        ))}
      </div>
    </div>
  );
}
