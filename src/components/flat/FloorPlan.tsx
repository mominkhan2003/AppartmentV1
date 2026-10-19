import { useState } from "react";
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

function centroid(pts: number[][]): [number, number] {
  const xs = pts.map((p) => p[0] ?? 0);
  const ys = pts.map((p) => p[1] ?? 0);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
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
  const shapes = spaces.map((s) => ({ s, pts: (s.shape as number[][]) ?? [] })).filter((x) => x.pts.length);
  // draw hall first so other rooms sit on top
  shapes.sort((a, b) => (a.s.kind === "hall" ? -1 : b.s.kind === "hall" ? 1 : 0));

  const layer = (depth: number, ghost: boolean) => (
    <svg
      viewBox="60 20 570 530"
      className="absolute inset-0 h-full w-full"
      style={{ transform: `translateZ(${depth}px)` }}
    >
      {shapes.map(({ s, pts }) => {
        const active = highlight === s.id || hover === s.id;
        return (
          <polygon
            key={s.id}
            points={pts.map((p) => p.join(",")).join(" ")}
            fill={ghost ? "var(--foreground)" : fill[s.kind] ?? fill["other"]}
            fillOpacity={ghost ? 0.08 : active ? 0.95 : 0.55}
            stroke="var(--foreground)"
            strokeOpacity={ghost ? 0.15 : 0.7}
            strokeWidth={active ? 3 : 1.5}
            className={ghost ? "" : "cursor-pointer transition-all"}
            onMouseEnter={ghost ? undefined : () => setHover(s.id)}
            onMouseLeave={ghost ? undefined : () => setHover(null)}
            onClick={ghost ? undefined : () => onSelect?.(s)}
          />
        );
      })}
      {!ghost &&
        shapes.map(({ s, pts }) => {
          const [x, y] = centroid(pts);
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
    </svg>
  );

  const hovered = spaces.find((s) => s.id === hover);
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{hovered ? `${hovered.name}${hovered.notes ? " · " + hovered.notes : ""}` : "Hover or tap a space"}</div>
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
      <div className="relative mx-auto aspect-[570/530] w-full max-w-xl" style={{ perspective: 1400 }}>
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={{
            transformStyle: "preserve-3d",
            transform: mode === "3d" ? "rotateX(55deg) rotateZ(-25deg) scale(0.85)" : "none",
          }}
        >
          {mode === "3d" && [0, 4, 8, 12, 16].map((d) => <div key={d}>{layer(d, true)}</div>)}
          {layer(mode === "3d" ? 20 : 0, false)}
        </div>
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
