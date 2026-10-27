const LANES = ["Your code", "Transport (driver)", "Protocol core", "Materialize"];

interface Message {
  from: number;
  to: number;
  label: string;
  note?: string;
}

const MESSAGES: Message[] = [
  { from: 0, to: 1, label: "next()" },
  { from: 1, to: 2, label: "fetch()" },
  { from: 2, to: 1, label: "FETCH 1000 c WITH (TIMEOUT = '1000 ms')", note: "SQL text" },
  { from: 1, to: 3, label: "FETCH ..." },
  { from: 3, to: 1, label: "rows: changes and a progress row" },
  { from: 1, to: 2, label: "push(rows)", note: "one call per FETCH" },
  { from: 2, to: 1, label: "a closed batch", note: "held rows stay in the core" },
  { from: 1, to: 0, label: "Event::Batch" },
];

const LANE_W = 200;
const TOP = 46;
const STEP = 46;

/** One FETCH through the layers: which side writes the SQL, and which side holds rows. */
export function Sequence() {
  const width = LANE_W * LANES.length;
  const height = TOP + STEP * MESSAGES.length + 20;
  const cx = (i: number) => LANE_W * i + LANE_W / 2;
  return (
    <figure className="sequence">
      <div className="timeline-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label="One FETCH: your code asks the transport for the next event, the core writes the FETCH, the driver sends it to Materialize, the core turns the rows into a closed batch, and your code receives it."
        >
          <defs>
            <marker id="seq-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
            </marker>
          </defs>
          {LANES.map((lane, i) => (
            <g key={lane}>
              <rect x={cx(i) - 80} y={4} width={160} height={28} rx={8} className={`seq-head ${i === 2 ? "core" : ""}`} />
              <text x={cx(i)} y={22} textAnchor="middle" className="seq-head-text">
                {lane}
              </text>
              <line x1={cx(i)} x2={cx(i)} y1={32} y2={height - 6} className="seq-life" />
            </g>
          ))}
          {MESSAGES.map((m, k) => {
            const y = TOP + STEP * k + 14;
            const x1 = cx(m.from);
            const x2 = cx(m.to);
            const dir = x2 > x1 ? 1 : -1;
            return (
              <g key={k} className={m.from === 2 || m.to === 2 ? "seq-core" : ""}>
                <line x1={x1 + dir * 4} x2={x2 - dir * 6} y1={y} y2={y} className="seq-msg" markerEnd="url(#seq-arrow)" />
                <text x={(x1 + x2) / 2} y={y - 7} textAnchor="middle" className="seq-label">
                  {m.label}
                </text>
                {m.note && (
                  <text x={(x1 + x2) / 2} y={y + 15} textAnchor="middle" className="seq-note">
                    {m.note}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="small muted">
        The core never touches the network. It writes the SQL, and it decides what to release. The driver only carries
        text and rows between them.
      </figcaption>
    </figure>
  );
}
