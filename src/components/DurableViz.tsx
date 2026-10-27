import type { Checkpoint } from "../core/sdk";
import type { CheckpointAttempt, DurableWorker, SimTarget, SinkKind } from "../sim/durable";
import type { SimMaterialize } from "../sim/materialize";
import { Term, Ts } from "./Term";

/** Which worker owns the checkpoint, and which ones will find out they do not. */
export function Ownership({ workers, checkpoint }: { workers: DurableWorker[]; checkpoint: Checkpoint | null }) {
  const stored = checkpoint ? BigInt(checkpoint.epoch) : null;
  return (
    <div className="card viz">
      <h3>
        Who owns the <Term name="checkpoint" />
      </h3>
      <div className="small muted">
        Stored <Term name="epoch" />: <strong className="mono">{checkpoint?.epoch ?? "none"}</strong>
      </div>
      <div className="owners">
        {workers.length === 0 && <div className="empty">No workers yet.</div>}
        {workers.map((w) => {
          const epoch = w.epoch ? BigInt(w.epoch) : null;
          const owner = w.running && epoch !== null && epoch === stored;
          const stale = w.running && epoch !== null && stored !== null && epoch < stored;
          const label = owner
            ? "owner"
            : stale
              ? "stale: fenced at its next checkpoint write"
              : w.status === "fenced"
                ? "fenced"
                : w.status;
          return (
            <div key={w.name} className={`owner ${owner ? "is-owner" : stale ? "is-stale" : w.running ? "" : "is-down"}`}>
              <span className="owner-name">{w.name}</span>
              <span className="mono small">epoch {w.epoch ?? "–"}</span>
              <span className="small">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
