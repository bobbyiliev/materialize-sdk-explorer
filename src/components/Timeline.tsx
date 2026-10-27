import type { SdkEvent } from "../core/sdk";
import type { WireEntry } from "../sim/live";

interface Column {
  ts: bigint;
  plus: number;
  minus: number;
  progress: boolean;
  released: boolean;
}

/** How many distinct timestamps the timeline shows, the newest ones. */
const SHOWN = 12;
const COL = 78;
const PAD = 56;

/**
 * Every timestamp the wire has carried, oldest on the left: changes above the
 * line, progress rows on it, and the batches the core released below it.
 * Changes the core still holds, because no progress row has passed them, are
 * hollow.
 */
export function Timeline({ wire, events }: { wire: WireEntry[]; events: SdkEvent[] }) {
  const columns = new Map<string, Column>();
  const column = (ts: string) => {
    let c = columns.get(ts);
    if (!c) {
      c = { ts: BigInt(ts), plus: 0, minus: 0, progress: false, released: false };
      columns.set(ts, c);
    }
    return c;
  };
  let resumeAsOf: bigint | null = null;
  for (const entry of wire) {
    if (entry.dir === "out") {
      const m = /SNAPSHOT = false\) AS OF (\d+)/.exec(entry.sql);
      if (m) resumeAsOf = BigInt(m[1]);
    }
    if (entry.dir !== "in") continue;
    for (const row of entry.rows) {
      const c = column(row[0]!);
      if (row[1] === "t") c.progress = true;
      else if (row[2]?.startsWith("-") || row[2] === "delete") c.minus++;
      else c.plus++;
    }
  }
  const batches = events.filter((e): e is Extract<SdkEvent, { event: "batch" }> => e.event === "batch");
  for (const b of batches) for (const u of b.updates) column(u.timestamp).released = true;

  const all = [...columns.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const shown = all.slice(-SHOWN);
  if (shown.length === 0) {
    return <div className="empty">The timeline fills in as rows arrive.</div>;
  }
  const first = shown[0].ts;
  const x = (i: number) => PAD + i * COL;
  const indexOf = (ts: bigint) => shown.findIndex((c) => c.ts === ts);
  const width = x(shown.length - 1) + PAD;
  const axisY = 96;

  // A batch covers [lower, upper): its changes, and its closing progress row at upper.
  const brackets = batches
    .map((b) => {
      const upper = BigInt(b.upper);
      const lower = b.lower === null ? null : BigInt(b.lower);
      const inside = shown.filter((c) => (lower === null || c.ts >= lower) && c.ts < upper && (c.plus || c.minus || lower === null));
      const end = indexOf(upper);
      if (end < 0) return null;
      const start = inside.length > 0 ? indexOf(inside[0].ts) : end;
      return { start, end, snapshot: b.snapshot, empty: b.updates.length === 0 };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null && b.start >= 0);

  const frontier = batches.at(-1)?.upper;
  const frontierIndex = frontier ? indexOf(BigInt(frontier)) : -1;
  const resumeIndex = resumeAsOf === null ? -1 : indexOf(resumeAsOf);

  return (
    <div className="timeline-wrap">
      <svg
        className="timeline"
        viewBox={`0 0 ${width} 190`}
        width={width}
        height={190}
        role="img"
        aria-label="Timeline of changes, progress rows, and released batches"
      >
        <defs>
          <marker id="tl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <line x1={PAD - 30} x2={width - 16} y1={axisY} y2={axisY} className="tl-axis" markerEnd="url(#tl-arrow)" />
        <text x={width - 18} y={axisY - 10} className="tl-note" textAnchor="end">
          time
        </text>
        {shown.map((c, i) => {
          const changes = [...Array(c.plus).fill("+"), ...Array(c.minus).fill("−")].slice(0, 4);
          return (
            <g key={String(c.ts)}>
              {changes.map((sign, k) => (
                <g key={k}>
                  <circle
                    cx={x(i)}
                    cy={axisY - 22 - k * 18}
                    r={7}
                    className={`tl-dot ${sign === "+" ? "plus" : "minus"} ${c.released ? "" : "held"}`}
                  />
                  <text x={x(i)} y={axisY - 18 - k * 18} className="tl-sign" textAnchor="middle">
                    {sign}
                  </text>
                </g>
              ))}
              {c.progress && (
                <rect x={x(i) - 6} y={axisY - 6} width={12} height={12} transform={`rotate(45 ${x(i)} ${axisY})`} className="tl-progress" />
              )}
              {!c.progress && <circle cx={x(i)} cy={axisY} r={2.5} className="tl-tick" />}
              <text x={x(i)} y={axisY + 22} className="tl-label" textAnchor="middle">
                +{String(c.ts - first)}
              </text>
            </g>
          );
        })}
        {brackets.map((b, k) => (
          <g key={k}>
            <path
              d={`M${x(b.start) - 10} ${axisY + 36} v8 H${x(b.end) + 2} v-8`}
              className={`tl-bracket ${b.snapshot ? "snapshot" : b.empty ? "empty" : ""}`}
            />
            <text x={(x(b.start) + x(b.end)) / 2 - 4} y={axisY + 62} className="tl-note" textAnchor="middle">
              {b.snapshot ? "snapshot batch" : b.empty ? "empty batch" : "batch"}
            </text>
          </g>
        ))}
        {frontierIndex >= 0 && (
          <g>
            <line x1={x(frontierIndex)} x2={x(frontierIndex)} y1={14} y2={axisY - 10} className="tl-frontier" />
            <text x={x(frontierIndex)} y={11} className="tl-frontier-label" textAnchor="middle">
              frontier
            </text>
          </g>
        )}
        {resumeIndex >= 0 && (
          <text x={x(resumeIndex)} y={axisY + 84} className="tl-resume" textAnchor="middle">
            AS OF F − 1
          </text>
        )}
      </svg>
      <div className="tl-legend small muted">
        <span>
          <span className="lg-dot plus" /> added
        </span>
        <span>
          <span className="lg-dot minus" /> removed
        </span>
        <span>
          <span className="lg-dot held" /> held: no progress row has passed it yet
        </span>
        <span>
          <span className="lg-diamond" /> progress row
        </span>
        <span>Labels are milliseconds after the first timestamp shown.</span>
      </div>
    </div>
  );
}
