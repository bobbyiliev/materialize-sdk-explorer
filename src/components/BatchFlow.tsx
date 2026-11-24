interface Row {
  label: string;
  steps: string[];
  /** Steps drawn as the SDK's, by index. */
  sdk: number[];
  cost: string;
  costClass: string;
}

const ROWS: Row[] = [
  {
    label: "Console today",
    steps: ["SUBSCRIBE rows", "Rebuild the whole set", "Diff the whole set", "Collection"],
    sdk: [],
    cost: "the whole set, at every closed timestamp",
    costClass: "flow-cost-bad",
  },
  {
    label: "With the SDK",
    steps: ["SUBSCRIBE rows", "Closed batch", "One change per key", "Collection"],
    sdk: [1],
    cost: "only the changes in the batch",
    costClass: "flow-cost-ok",
  },
];

const LEFT = 120;
const BOX_W = 160;
const BOX_H = 40;
const GAP = 44;
const ROW_H = 104;

/** The console's path into the collection next to the SDK's, with what each step costs. */
export function BatchFlow() {
  const width = LEFT + 4 * BOX_W + 3 * GAP + 4;
  const height = ROWS.length * ROW_H;
  const x = (i: number) => LEFT + i * (BOX_W + GAP);
  return (
    <figure className="sequence">
      <div className="timeline-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="Today the console rebuilds the whole keyed set and diffs it against the collection at every closed timestamp. With the SDK, a closed batch becomes one change per key, so each step costs only the batch."
        >
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {ROWS.map((row, r) => {
            const top = r * ROW_H + 8;
            const mid = top + BOX_H / 2;
            return (
              <g key={row.label}>
                <text x={0} y={mid + 4} className="seq-head-text">
                  {row.label}
                </text>
                {row.steps.map((step, i) => (
                  <g key={step}>
                    <rect
                      x={x(i)}
                      y={top}
                      width={BOX_W}
                      height={BOX_H}
                      rx={8}
                      className={`seq-head ${row.sdk.includes(i) ? "core" : ""}`}
                    />
                    <text x={x(i) + BOX_W / 2} y={mid + 4} textAnchor="middle" className="flow-step">
                      {step}
                    </text>
                    {i > 0 && (
                      <line
                        x1={x(i - 1) + BOX_W + 4}
                        x2={x(i) - 6}
                        y1={mid}
                        y2={mid}
                        className="seq-msg"
                        markerEnd="url(#flow-arrow)"
                      />
                    )}
                  </g>
                ))}
                <path
                  d={`M${x(1)} ${top + BOX_H + 10} v6 H${x(2) + BOX_W} v-6`}
                  className={`flow-bracket ${row.costClass}`}
                />
                <text x={(x(1) + x(2) + BOX_W) / 2} y={top + BOX_H + 34} textAnchor="middle" className={`flow-cost ${row.costClass}`}>
                  costs {row.cost}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="small muted">
        Both paths end in the same collection writes. The SDK path skips the full rebuild and the full diff, because a
        closed batch already says what changed.
      </figcaption>
    </figure>
  );
}
