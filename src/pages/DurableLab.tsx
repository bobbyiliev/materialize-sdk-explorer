import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import { useFollow } from "../components/Wire";
import type { Checkpoint } from "../core/sdk";
import { excerpt } from "../lib/source";
import { COMMIT_INTERVAL_TICKS, DurableWorker, SimTarget, setup, type SinkKind } from "../sim/durable";
import { SimMaterialize } from "../sim/materialize";

const FRUITS = ["plum", "fig", "kiwi", "mango", "lime", "cherry", "grape", "peach"];
const NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface Lab {
  server: SimMaterialize;
  target: SimTarget;
  workers: DurableWorker[];
}

function newLab(kind: SinkKind): Lab {
  return {
    server: new SimMaterialize([["apple", 3], ["pear", 5]]),
    target: new SimTarget(kind),
    workers: [],
  };
}

export function DurableLab() {
  const [kind, setKind] = useState<SinkKind>("non_transactional");
  const lab = useRef<Lab>(newLab(kind));
  const [auto, setAuto] = useState(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const { server, target, workers } = lab.current;

  const tick = () => {
    lab.current.server.tick();
    for (const w of lab.current.workers) if (w.running) w.step();
    force();
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(tick, 1100);
    return () => clearInterval(id);
  });

  const reset = (k = kind) => {
    setAuto(false);
    lab.current = newLab(k);
    force();
  };

  const startWorker = () => {
    const w = new DurableWorker(NAMES[lab.current.workers.length % NAMES.length], lab.current.server, lab.current.target);
    lab.current.workers = [...lab.current.workers, w];
    w.step();
    force();
  };

  const act = (f: () => void) => {
    f();
    force();
  };

  const checkpoint = target.checkpoint ? (JSON.parse(target.checkpoint) as Checkpoint) : null;
  const done = progress(lab.current);
  const transactional = kind === "transactional";
  const anyRunning = workers.some((w) => w.running);

  return (
    <>
      <div className="eyebrow">How it works · live</div>
      <h1>Durable sink lab</h1>
      <p className="page-lead">
        A durable sink writes a table into a target and keeps a checkpoint next to the rows. Start workers, crash them,
        run two at once, and lose history. Every checkpoint, every take-over, and every decision about a refused write
        comes from the SDK's real protocol core. Materialize and the target are simulated.
      </p>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Try this</h3>
          <ol className="tryit">
            {(transactional ? STEPS_TX : STEPS).map((s, i) => (
              <li key={s} className={done[i] ? "done" : ""}>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Controls</h3>
          <div className="toolbar">
            <span className="small muted">Target</span>
            <div className="segmented">
              <button
                type="button"
                className={!transactional ? "on" : ""}
                onClick={() => {
                  setKind("non_transactional");
                  reset("non_transactional");
                }}
              >
                no transactions (turbopuffer)
              </button>
              <button
                type="button"
                className={transactional ? "on" : ""}
                onClick={() => {
                  setKind("transactional");
                  reset("transactional");
                }}
              >
                transactional (Postgres)
              </button>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn primary" type="button" disabled={target.checkpoint !== null} onClick={() => act(() => setup(target))}>
              Set up the checkpoint
            </button>
            <button className="btn primary" type="button" disabled={target.checkpoint === null} onClick={startWorker}>
              Start a worker
            </button>
            <button className="btn" type="button" onClick={tick}>
              1 second passes
            </button>
            <button className="btn" type="button" onClick={() => setAuto(!auto)}>
              {auto ? "Pause" : "Run on its own"}
            </button>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <label className="check">
              <input
                type="checkbox"
                checked={server.retainHistory}
                onChange={(e) => act(() => (server.retainHistory = e.target.checked))}
              />
              <span>
                <code>RETAIN HISTORY = FOR '1h'</code> on the table
              </span>
            </label>
            <button className="btn" type="button" onClick={() => reset()}>
              Reset the lab
            </button>
          </div>
          <p className="small muted" style={{ marginBottom: 0 }}>
            The lab commits a quiet stream every {COMMIT_INTERVAL_TICKS} seconds to keep the log short. The SDK's default
            is one second.
          </p>
        </div>
      </div>

      <div className="lab" style={{ marginTop: 16 }}>
        <section className="pane">
          <div className="pane-head">
            <h3>Materialize</h3>
            <span className="badge">simulated</span>
          </div>
          <div className="pane-body">
            <table className="mini-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>item</th>
                  <th>qty</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...server.rows.values()].map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" className="btn small" onClick={() => act(() => server.update(row[0]!, Number(row[2]) + 1))}>
                        qty +1
                      </button>{" "}
                      <button type="button" className="btn small danger" onClick={() => act(() => server.delete(row[0]!))}>
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button
                className="btn"
                type="button"
                onClick={() =>
                  act(() => {
                    server.insert(FRUITS[Math.floor(Math.random() * FRUITS.length)], 1 + Math.floor(Math.random() * 9));
                  })
                }
              >
                Insert a row
              </button>
              <button className="btn" type="button" onClick={() => act(() => server.tick(5000n))}>
                5 seconds pass, no workers run
              </button>
            </div>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>now</dt>
              <dd>{String(server.now)}</dd>
              <dt>readable from</dt>
              <dd>
                {String(server.since())}
                {checkpoint?.frontier && BigInt(checkpoint.frontier) - 1n < server.since() && (
                  <span className="badge bad" style={{ marginLeft: 6 }}>
                    past the checkpoint
                  </span>
                )}
              </dd>
            </dl>
            <p className="small muted">
              A resume reads from the checkpoint's frontier minus one, so it fails once that falls below "readable from".
            </p>
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">
            <h3>Workers</h3>
            <span className="badge accent">durable loop over the core</span>
          </div>
          <div className="pane-body tall">
            {workers.length === 0 && (
              <div className="empty">
                {target.checkpoint === null ? "Set up the checkpoint, then start a worker." : "Start a worker."}
              </div>
            )}
            {[...workers].reverse().map((w) => (
              <WorkerCard key={w.name} worker={w} transactional={transactional} act={act} />
            ))}
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">
            <h3>Target</h3>
            <span className="badge">simulated</span>
          </div>
          <div className="pane-body tall">
            <h4 className="small muted" style={{ margin: "0 0 4px" }}>
              Checkpoint, stored next to the rows
            </h4>
            {checkpoint ? (
              <>
                <dl className="kv">
                  <dt>epoch</dt>
                  <dd>{checkpoint.epoch}</dd>
                  <dt>generation</dt>
                  <dd>{checkpoint.generation}</dd>
                  <dt>frontier</dt>
                  <dd>{checkpoint.frontier ?? "none yet"}</dd>
                  <dt>snapshot AS OF</dt>
                  <dd>{checkpoint.snapshot_as_of ?? "none in progress"}</dd>
                </dl>
                <details className="small" style={{ marginTop: 6 }}>
                  <summary>The exact text the sink stores</summary>
                  <pre className="json">{target.checkpoint}</pre>
                </details>
              </>
            ) : (
              <div className="empty">No checkpoint yet.</div>
            )}
            <h4 className="small muted" style={{ margin: "14px 0 4px" }}>
              Rows {transactional ? "" : "(a delete keeps a tombstone)"}
            </h4>
            <table className="mini-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>value</th>
                  <th>mz_timestamp</th>
                  <th>gen</th>
                </tr>
              </thead>
              <tbody>
                {[...target.docs]
                  .filter(([, d]) => !transactional || d.value !== null)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([key, d]) => (
                    <tr key={key} className={d.value === null ? "gone" : ""}>
                      <td>{key}</td>
                      <td>{d.value ? `${d.value[1]}, ${d.value[2]}` : "deleted"}</td>
                      <td className="mono">{String(d.ts).slice(-6)}</td>
                      <td>{String(d.generation)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <h4 className="small muted" style={{ margin: "14px 0 4px" }}>
              Writes the target received
            </h4>
            <TargetLog target={target} />
          </div>
        </section>
      </div>

      {anyRunning && auto && <p className="small muted">Running. Change rows in Materialize and watch the commits.</p>}

      <h2>What to notice</h2>
      <ul>
        <li>
          Every start is a <strong>take-over</strong>: a conditional write that raises the epoch. The older worker finds
          out at its next checkpoint write, which fails, and the core reads the stored checkpoint back to say why.
        </li>
        <li>
          {transactional
            ? "A transactional target writes each batch and its checkpoint in one transaction, so state is exactly once. A crash in the middle rolls both back."
            : "A target without transactions writes the batch first and the checkpoint second, so a crash in between replays the batch. Each write is conditional on the row's mz_timestamp, so the replay changes nothing."}
        </li>
        <li>
          A resume is <code>SNAPSHOT = false</code> with <code>AS OF</code> one below the checkpoint's frontier, so it
          starts exactly where the last commit ended.
        </li>
        <li>
          The first snapshot raises the generation. Rows are written under it, and a sweep removes rows of older
          generations once a snapshot completes.
        </li>
      </ul>

      <h2>The code behind it</h2>
      <p>
        The worker in this lab follows <code>DurableSink::stream</code> step by step. Here is the real one:
      </p>
      <Code {...codeOf(excerpt("rust/src/durable.rs", "async fn stream<T>(", "    }"))} maxHeight={520} />
    </>
  );
}

function codeOf(e: { code: string; path: string; url: string }) {
  return { code: e.code, title: e.path, href: e.url };
}

function WorkerCard({
  worker,
  transactional,
  act,
}: {
  worker: DurableWorker;
  transactional: boolean;
  act: (f: () => void) => void;
}) {
  const ref = useFollow<HTMLDivElement>(worker.steps.length);
  const tone =
    worker.status === "streaming" ? "ok" : worker.status === "fenced" || worker.status === "failed" || worker.status === "crashed" ? "bad" : "warn";
  return (
    <div className="card" style={{ padding: 12, marginBottom: 12, boxShadow: "none" }}>
      <div className="event-head" style={{ justifyContent: "space-between" }}>
        <span>
          <strong>Worker {worker.name}</strong> <span className={`badge ${tone}`}>{worker.status}</span>{" "}
          {worker.epoch && <span className="badge">epoch {worker.epoch}</span>}
        </span>
      </div>
      {worker.running && (
        <div className="toolbar" style={{ margin: "6px 0 8px" }}>
          <button type="button" className="btn small danger" onClick={() => act(() => worker.crash())}>
            Crash
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={worker.status !== "streaming" || worker.crashBeforeCheckpoint}
            onClick={() => act(() => (worker.crashBeforeCheckpoint = true))}
          >
            {worker.crashBeforeCheckpoint
              ? "Crashes at the next batch"
              : transactional
                ? "Crash mid-transaction"
                : "Crash after the batch, before the checkpoint"}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={worker.status !== "streaming"}
            onClick={() => act(() => worker.dropConnection())}
          >
            Drop its connection
          </button>
        </div>
      )}
      <div ref={ref} style={{ maxHeight: 260, overflow: "auto" }}>
        {worker.steps.map((s, i) => (
          <div key={i} className={`step ${s.tone ?? ""}`}>
            {s.text}
            {s.sql && (
              <div style={{ marginTop: 4 }}>
                <code>{s.sql}</code>
              </div>
            )}
            {s.detail && (
              <details>
                <summary className="small muted">details</summary>
                <pre className="json">{s.detail}</pre>
              </details>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetLog({ target }: { target: SimTarget }) {
  const ref = useFollow<HTMLDivElement>(target.events.length);
  return (
    <div ref={ref} style={{ maxHeight: 220, overflow: "auto" }}>
      {target.events.length === 0 && <div className="empty">Nothing yet.</div>}
      {target.events.map((e, i) => (
        <div key={i} className="small" style={{ padding: "2px 0" }}>
          <span className={`badge ${e.kind === "refused" ? "bad" : e.kind === "noop" ? "warn" : e.kind === "batch" ? "ok" : ""}`}>
            {e.worker}
          </span>{" "}
          {e.text}
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  "Set up the checkpoint and start worker A. It takes the checkpoint over and writes a snapshot.",
  "Change some rows and let time pass. Each batch is written, then committed.",
  "Click “Crash after the batch, before the checkpoint”, then change a row and let a second pass. A writes the change and crashes before its checkpoint. Start worker B: it sends the change again, and the target skips it.",
  "Start worker C while B runs. C takes over, and B is fenced at its next commit.",
  "Untick RETAIN HISTORY, crash the running worker, let 5 seconds pass, and start a worker. History is lost, and it stops.",
];

const STEPS_TX = [
  "Set up the checkpoint and start worker A. It takes the checkpoint over and writes a snapshot.",
  "Change some rows and let time pass. Each batch commits with its checkpoint, in one transaction.",
  "Click “Crash mid-transaction”, then change a row and let a second pass. The transaction rolls back. Start worker B: nothing had landed, so B writes the change once.",
  "Start worker C while B runs. C takes over, and B's next transaction is refused, so B is fenced.",
  "Untick RETAIN HISTORY, crash the running worker, let 5 seconds pass, and start a worker. History is lost, and it stops.",
];

function progress(lab: Lab): boolean[] {
  const steps = lab.workers.flatMap((w) => w.steps.map((s) => s.text));
  const tx = lab.target.kind === "transactional";
  const crashedBetween = steps.some((t) => t.startsWith("Crashed after the batch") || t.startsWith("Crashed in the middle"));
  return [
    steps.some((t) => t.includes("completes the snapshot")),
    steps.some((t) => /^Committed \d+ (upsert|delete)/.test(t)),
    tx
      ? crashedBetween && lab.workers.length > 1 && steps.some((t) => t.startsWith("Resuming"))
      : lab.target.events.some((e) => e.text.includes("already applied")),
    lab.workers.some((w) => w.status === "fenced"),
    steps.some((t) => t.startsWith("History lost")),
  ];
}
