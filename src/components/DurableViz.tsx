import type { Checkpoint } from "../core/sdk";
import type { CheckpointAttempt, DurableWorker, SimTarget, SinkKind } from "../sim/durable";
import type { SimMaterialize } from "../sim/materialize";
import { Term, Ts } from "./Term";

/** The readable history, and where the next resume needs to read from. */
export function HistoryWindow({ server, checkpoint }: { server: SimMaterialize; checkpoint: Checkpoint | null }) {
  const now = server.now;
  const since = server.since();
  const resume = checkpoint?.frontier ? BigInt(checkpoint.frontier) - 1n : null;
  const lost = resume !== null && resume < since;
  const from = resume !== null && resume < since ? resume - (now - resume) / 8n : since;
  const span = Number(now - from) || 1;
  const pos = (t: bigint) => `${(Number(t - from) / span) * 100}%`;
  const margin = resume === null ? null : Number(resume - since) / 1000;
  return (
    <div className="card viz">
      <h3>
        <Term name="readable history">Readable history</Term>
      </h3>
      <div className="history">
        <div className="history-window" style={{ left: pos(since), right: "0%" }} />
        {resume !== null && (
          <div className={`history-mark ${lost ? "lost" : ""}`} style={{ left: pos(resume) }} title={String(resume)}>
            <span>F − 1</span>
          </div>
        )}
      </div>
      <div className="history-axis small muted">
        <span>
          readable from <Ts value={since} />
        </span>
        <span>
          now <Ts value={now} />
        </span>
      </div>
      <p className={`small ${lost ? "bad-text" : ""}`} style={{ margin: "8px 0 0" }}>
        {resume === null
          ? "No frontier yet. A resume needs history back to the checkpoint's frontier minus one."
          : lost
            ? `Lost: the resume point is ${(-margin!).toFixed(1)} s older than the oldest readable time. A resume fails.`
            : `A resume needs history back to F − 1. Margin: ${formatSeconds(margin!)}.`}
      </p>
    </div>
  );
}

function formatSeconds(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  return `${s.toFixed(1)} s`;
}

/** How one batch reaches the target, and where a crash can fall. */
export function BatchPath({ kind }: { kind: SinkKind }) {
  return (
    <div className="card viz">
      <h3>How a batch is written</h3>
      {kind === "transactional" ? (
        <>
          <div className="path">
            <div className="path-box together">
              <span>write the batch</span>
              <span>replace the checkpoint, if it is still the expected one</span>
              <small>one transaction</small>
            </div>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            A crash rolls both back. A stale worker's transaction fails its condition, so none of its batch lands.
          </p>
        </>
      ) : (
        <>
          <div className="path">
            <div className="path-box">write the batch</div>
            <div className="path-crash" title="A crash can fall here">
              ⚡
            </div>
            <div className="path-box">replace the checkpoint, if it is still the expected one</div>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            A crash between the two leaves the batch written and the checkpoint behind, so the next worker sends it again.
            Every write is conditional on a newer timestamp, so the repeat changes nothing.
          </p>
        </>
      )}
    </div>
  );
}

/** Where the current snapshot is in its life, by the checkpoint's fields. */
export function GenerationStages({ checkpoint, target }: { checkpoint: Checkpoint | null; target: SimTarget }) {
  const gens = new Map<string, number>();
  for (const [, d] of target.docs) gens.set(String(d.generation), (gens.get(String(d.generation)) ?? 0) + 1);
  const stage = !checkpoint
    ? -1
    : checkpoint.snapshot_as_of !== null
      ? 1
      : checkpoint.frontier !== null
        ? 3
        : 0;
  const stages = ["raise the generation", "write rows under it", "complete the snapshot", "sweep older generations"];
  return (
    <div className="stages">
      <div className="small muted">
        <Term name="generation">Generation</Term> <strong className="mono">{checkpoint?.generation ?? "–"}</strong>
        {gens.size > 0 && (
          <>
            {" "}
            · rows by generation:{" "}
            {[...gens].map(([g, n]) => (
              <span key={g} className="mono">
                {" "}
                {g}: {n}
              </span>
            ))}
          </>
        )}
      </div>
      <ol className="stage-list">
        {stages.map((s, i) => (
          <li key={s} className={i < stage || (stage === 3 && i === 3) ? "past" : i === stage ? "now" : ""}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

const FIELDS: Array<keyof Checkpoint> = ["epoch", "generation", "frontier", "snapshot_as_of"];

/** The last conditional checkpoint write: what it expected, what was stored, and what it proposed. */
export function WriteInspector({ attempt }: { attempt: CheckpointAttempt | null }) {
  if (!attempt) return <div className="empty">No checkpoint write yet.</div>;
  const parse = (t: string | null) => (t ? (JSON.parse(t) as Checkpoint) : null);
  const expected = parse(attempt.expected);
  const stored = parse(attempt.stored);
  const proposed = parse(attempt.proposed);
  const cell = (c: Checkpoint | null, f: keyof Checkpoint) => (c ? String(c[f] ?? "null") : "none");
  return (
    <div>
      <div className="small" style={{ marginBottom: 6 }}>
        <span className={`badge ${attempt.applied ? "ok" : "bad"}`}>{attempt.applied ? "applied" : "refused"}</span>{" "}
        {attempt.by} wrote a <strong>{attempt.kind.replace(/_/g, " ")}</strong>.{" "}
        {attempt.applied
          ? "The stored text was the expected text, so the write replaced it."
          : "The stored text was not the expected text, so nothing changed."}
      </div>
      <div className="table-wrap">
        <table className="mini-table inspector">
          <thead>
            <tr>
              <th />
              <th>expected</th>
              <th>stored</th>
              <th>proposed</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => {
              const e = cell(expected, f);
              const s = cell(stored, f);
              const p = cell(proposed, f);
              return (
                <tr key={f}>
                  <td className="muted">{f.replace("_", " ")}</td>
                  <td className="mono">{short(e)}</td>
                  <td className={`mono ${e !== s ? "mismatch" : ""}`}>{short(s)}</td>
                  <td className={`mono ${p !== e ? "changed" : ""}`}>{short(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        The condition compares the whole text, so any field that differs, marked red, refuses the write. Purple marks
        what the write would change.
      </p>
    </div>
  );
}

function short(v: string): string {
  return /^\d{9,}$/.test(v) ? `…${v.slice(-5)}` : v;
}

const NODE_W = 230;
const NODE_H = 84;
const COL_X = [0, 320, 640];
const ROW = 104;

type Tone = "ok" | "warn" | "bad" | "idle" | "info";

interface NodeProps {
  x: number;
  y: number;
  kind: string;
  namespace: string;
  name: string;
  status: string;
  detail: string;
  tone: Tone;
}

function GraphNode({ x, y, kind, namespace, name, status, detail, tone }: NodeProps) {
  return (
    <div className="gnode" style={{ left: x, top: y, width: NODE_W }}>
      <div className="gnode-body">
        <span className="gnode-icon">{kind}</span>
        <span className="gnode-text">
          <span className="gnode-ns">{namespace}</span>
          <span className="gnode-name">{name}</span>
        </span>
      </div>
      <div className={`gnode-status tone-${tone}`}>
        <span>{status}</span>
        <span>{detail}</span>
      </div>
    </div>
  );
}

const seconds = (ms: bigint) => `${(Number(ms) / 1000).toFixed(1)} s`;

/**
 * The lab as a dataflow graph, drawn like the Console's workflow graph: the
 * table, every worker, and the target, with flowing edges for the workers that
 * are streaming.
 */
export function Pipeline({
  server,
  target,
  workers,
  checkpoint,
}: {
  server: SimMaterialize;
  target: SimTarget;
  workers: DurableWorker[];
  checkpoint: Checkpoint | null;
}) {
  const shown = workers.slice(-4);
  const rows = Math.max(shown.length, 1);
  const height = rows * ROW + 8;
  const mid = (height - NODE_H) / 2;
  const stored = checkpoint ? BigInt(checkpoint.epoch) : null;
  const lag = checkpoint?.frontier ? server.now + 1n - BigInt(checkpoint.frontier) : null;
  const targetTone: Tone = lag === null ? "idle" : lag <= 3500n ? "ok" : "warn";
  const width = COL_X[2] + NODE_W;

  const edge = (x1: number, y1: number, x2: number, y2: number, cls: string, key: string) => {
    const mx = (x1 + x2) / 2;
    return (
      <path
        key={key}
        d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
        className={`gedge ${cls}`}
        markerEnd={`url(#gdot-${cls.includes("flow") ? "on" : "off"})`}
      />
    );
  };

  return (
    <div className="card viz pipeline-card">
      <h3>The pipeline</h3>
      <div className="pipeline-scroll">
        <div className="pipeline" style={{ width, height }}>
          <svg width={width} height={height} className="gedges" aria-hidden="true">
            <defs>
              <marker id="gdot-on" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
                <circle cx="5" cy="5" r="4" className="gdot on" />
              </marker>
              <marker id="gdot-off" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6">
                <circle cx="5" cy="5" r="4" className="gdot" />
              </marker>
            </defs>
            {shown.map((w, i) => {
              const y = i * ROW + NODE_H / 2;
              const epoch = w.epoch ? BigInt(w.epoch) : null;
              const stale = w.running && epoch !== null && stored !== null && epoch < stored;
              const flowing = w.status === "streaming";
              const cls = flowing ? (stale ? "flow stale" : "flow") : "";
              return [
                edge(NODE_W, mid + NODE_H / 2, COL_X[1], y, cls, `in-${w.name}`),
                edge(COL_X[1] + NODE_W, y, COL_X[2], mid + NODE_H / 2, cls, `out-${w.name}`),
              ];
            })}
          </svg>
          <GraphNode
            x={COL_X[0]}
            y={mid}
            kind="T"
            namespace="materialize.public"
            name="orders"
            status="SUBSCRIBE by id"
            detail="u42"
            tone="info"
          />
          {shown.length === 0 && (
            <div className="gnode-empty" style={{ left: COL_X[1], top: mid, width: NODE_W, height: NODE_H }}>
              no workers yet
            </div>
          )}
          {shown.map((w, i) => {
            const epoch = w.epoch ? BigInt(w.epoch) : null;
            const owner = w.running && epoch !== null && epoch === stored;
            const stale = w.running && epoch !== null && stored !== null && epoch < stored;
            const tone: Tone = owner && w.status === "streaming" ? "ok" : stale ? "warn" : w.running ? "info" : w.status === "crashed" ? "idle" : "bad";
            const status = owner ? "owner" : stale ? "stale" : w.status;
            return (
              <GraphNode
                key={w.name}
                x={COL_X[1]}
                y={i * ROW}
                kind="W"
                namespace="DurableSink worker"
                name={`Worker ${w.name}`}
                status={status}
                detail={w.epoch ? `epoch ${w.epoch}` : ""}
                tone={tone}
              />
            );
          })}
          <GraphNode
            x={COL_X[2]}
            y={mid}
            kind={target.kind === "transactional" ? "P" : "N"}
            namespace={target.kind === "transactional" ? "Postgres" : "turbopuffer"}
            name={target.kind === "transactional" ? "mz_rows + mz_checkpoints" : `orders__i${checkpoint?.generation ?? "?"}`}
            status="Freshness"
            detail={lag === null ? "no commit yet" : seconds(lag)}
            tone={targetTone}
          />
        </div>
      </div>
      {workers.length > 4 && <p className="small muted">Showing the 4 newest workers.</p>}
    </div>
  );
}

export interface FreshnessSample {
  at: bigint;
  lagMs: number | null;
  label?: string;
}

/**
 * How far the target's committed frontier trails Materialize's clock, drawn
 * like the Console's freshness graph.
 */
export function FreshnessChart({ samples }: { samples: FreshnessSample[] }) {
  const W = 1000;
  const H = 200;
  const L = 40;
  const B = 24;
  const T = 40;
  const points = samples.slice(-80);
  if (points.length < 2) {
    return (
      <div className="card viz">
        <h3>Freshness of the target</h3>
        <div className="empty">Start a worker and let time pass.</div>
      </div>
    );
  }
  const t0 = points[0].at;
  const t1 = points[points.length - 1].at;
  const span = Math.max(1, Number(t1 - t0));
  const maxLag = Math.max(4000, ...points.map((p) => p.lagMs ?? 0));
  const step = Math.max(1000, Math.ceil((maxLag * 1.15) / 4000) * 1000);
  const yMax = step * 4;
  const x = (at: bigint) => L + (Number(at - t0) / span) * (W - L - 8);
  const y = (lag: number) => T + (1 - lag / yMax) * (H - T - B);
  const segments: string[] = [];
  let current = "";
  for (const p of points) {
    if (p.lagMs === null) {
      if (current) segments.push(current);
      current = "";
      continue;
    }
    current += `${current ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.lagMs).toFixed(1)} `;
  }
  if (current) segments.push(current);
  const ticks = [0, 1, 2, 3, 4].map((k) => k * step);
  const labels = points.filter((p) => p.label).slice(-5);
  const last = points[points.length - 1];
  return (
    <div className="card viz">
      <h3>Freshness of the target</h3>
      <div className="small muted">
        How far the committed <Term name="frontier" /> trails Materialize's clock. Now:{" "}
        <strong>{last.lagMs === null ? "no commit yet" : `${(last.lagMs / 1000).toFixed(1)} s`}</strong>
      </div>
      <div className="timeline-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="fchart" role="img" aria-label="Freshness over time">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - 8} y1={y(v)} y2={y(v)} className="fgrid" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end" className="flabel">
                {(v / 1000).toFixed(0)}s
              </text>
            </g>
          ))}
          {labels.map((p, i) => (
            <g key={i}>
              <line x1={x(p.at)} x2={x(p.at)} y1={T - 4} y2={H - B} className="fmark" />
              <text
                x={x(p.at)}
                y={14 + (i % 2) * 14}
                textAnchor={x(p.at) > W * 0.85 ? "end" : x(p.at) < L + 60 ? "start" : "middle"}
                className="fmark-label"
              >
                {p.label}
              </text>
            </g>
          ))}
          {segments.map((d, i) => (
            <path key={i} d={d} className="fline" />
          ))}
          {last.lagMs !== null && <circle cx={x(last.at)} cy={y(last.lagMs)} r={4} className="fdot" />}
          <text x={W - 8} y={H - 6} textAnchor="end" className="flabel">
            time →
          </text>
        </svg>
      </div>
    </div>
  );
}
