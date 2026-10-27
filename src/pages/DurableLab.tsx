import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import { BatchPath, GenerationStages, HistoryWindow, Ownership, WriteInspector } from "../components/DurableViz";
import { Term, Ts } from "../components/Term";
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
  const done = useRef<boolean[]>([]);
  const { server, target, workers } = lab.current;

  const tickOnce = (ms = 1000n) => {
    lab.current.server.tick(ms);
    for (const w of lab.current.workers) if (w.running) w.step();
  };
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) tickOnce();
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      tickOnce();
      force();
    }, 1100);
    return () => clearInterval(id);
  });

  const reset = (k = kind) => {
    setAuto(false);
    lab.current = newLab(k);
    done.current = [];
    force();
  };

  const startWorker = () => {
    const w = new DurableWorker(NAMES[lab.current.workers.length % NAMES.length], lab.current.server, lab.current.target);
    lab.current.workers = [...lab.current.workers, w];
    w.step();
    return w;
  };

  const act = (f: () => void) => {
    f();
    force();
  };

  const running = () => lab.current.workers.filter((w) => w.running);
  const ensureRunning = () => {
    if (lab.current.target.checkpoint === null) setup(lab.current.target);
    if (running().length === 0) {
      startWorker();
      ticks(3);
    }
  };
  const bumpFirst = () => {
    const row = [...lab.current.server.rows.values()][0];
    if (row) lab.current.server.update(row[0]!, Number(row[2]) + 1);
  };

  // Each step of the guide, done for you.
  const SHOW: Array<() => void> = [
    () =>
      act(() => {
        ensureRunning();
      }),
    () =>
      act(() => {
        ensureRunning();
        lab.current.server.insert(FRUITS[lab.current.server.rows.size % FRUITS.length], 2);
        ticks(1);
        bumpFirst();
        ticks(1);
      }),
    () =>
      act(() => {
        ensureRunning();
        running()[0].crashBeforeCheckpoint = true;
        bumpFirst();
        ticks(1);
        startWorker();
        ticks(2);
      }),
    () =>
      act(() => {
        ensureRunning();
        startWorker();
        bumpFirst();
        ticks(2);
      }),
    () =>
      act(() => {
        ensureRunning();
        lab.current.server.retainHistory = false;
        for (const w of running()) w.crash();
        lab.current.server.tick(5000n);
        startWorker();
      }),
  ];

  const checkpoint = target.checkpoint ? (JSON.parse(target.checkpoint) as Checkpoint) : null;
  done.current = progress(lab.current).map((d, i) => d || !!done.current[i]);
  const transactional = kind === "transactional";

  return (
    <>
      <div className="eyebrow">How it works · live</div>
      <h1>Durable sink lab</h1>
      <p className="page-lead">
        A durable sink copies a table into a target and keeps a <Term name="checkpoint" /> next to the rows, so it can
        resume after a crash. Start workers, crash them, run two at once, and lose history. Every checkpoint and every
        decision about a refused write comes from the SDK's real protocol core. Materialize and the target are
        simulated.
      </p>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Try this</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            Do each step with the controls, or click <em>Show me</em>. Steps build on each other.
          </p>
          <ol className="tryit">
            {(transactional ? STEPS_TX : STEPS).map((s, i) => (
              <li key={s} className={done.current[i] ? "done" : ""}>
                {s}
                <button type="button" className="btn small show-me" onClick={SHOW[i]} disabled={auto}>
                  Show me
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Controls</h3>
          <div className="toolbar">
            <span className="small muted">Target (switching resets the lab)</span>
            <div className="segmented">
              {(
                [
                  ["non_transactional", "no transactions (turbopuffer)"],
                  ["transactional", "transactional (Postgres)"],
                ] as Array<[SinkKind, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  className={kind === k ? "on" : ""}
                  onClick={() => {
                    setKind(k);
                    reset(k);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn primary" type="button" disabled={target.checkpoint !== null} onClick={() => act(() => setup(target))}>
              Set up the checkpoint
            </button>
            <button className="btn primary" type="button" disabled={target.checkpoint === null} onClick={() => act(startWorker)}>
              Start a worker
            </button>
            <button className="btn" type="button" onClick={() => act(() => tickOnce())}>
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

      <div className="grid three" style={{ marginTop: 16, alignItems: "stretch" }}>
        <Ownership workers={workers} checkpoint={checkpoint} />
        <HistoryWindow server={server} checkpoint={checkpoint} />
        <BatchPath kind={kind} />
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
            <p className="small muted">
              Changes reach the target only when a worker runs, so let time pass after you change a row.
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
            <h4 className="pane-sub">Checkpoint, stored next to the rows</h4>
            {checkpoint ? (
              <>
                <dl className="kv">
                  <dt>
                    <Term name="epoch" />
                  </dt>
                  <dd>{checkpoint.epoch}</dd>
                  <dt>
                    <Term name="generation" />
                  </dt>
                  <dd>{checkpoint.generation}</dd>
                  <dt>
                    <Term name="frontier" />
                  </dt>
                  <dd>{checkpoint.frontier ? <Ts value={checkpoint.frontier} /> : "none yet"}</dd>
                  <dt>snapshot AS OF</dt>
                  <dd>{checkpoint.snapshot_as_of ? <Ts value={checkpoint.snapshot_as_of} /> : "none in progress"}</dd>
                </dl>
                <GenerationStages checkpoint={checkpoint} target={target} />
                <details className="small" style={{ marginTop: 6 }}>
                  <summary>The exact text the sink stores</summary>
                  <pre className="json">{target.checkpoint}</pre>
                </details>
              </>
            ) : (
              <div className="empty">No checkpoint yet.</div>
            )}
            {target.lastRefused && (
              <>
                <h4 className="pane-sub">Last refused checkpoint write</h4>
                <WriteInspector attempt={target.lastRefused} />
              </>
            )}
            <h4 className="pane-sub">Last checkpoint write</h4>
            <WriteInspector attempt={target.lastWrite} />
            <h4 className="pane-sub">Rows {transactional ? "" : "(a delete keeps a tombstone)"}</h4>
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
                      <td>
                        <Ts value={d.ts} />
                      </td>
                      <td>{String(d.generation)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <h4 className="pane-sub">Writes the target received</h4>
            <TargetLog target={target} />
          </div>
        </section>
      </div>

      <h2>What to notice</h2>
      <ul>
        <li>
          Every start is a <strong>take-over</strong>: a conditional write that raises the <Term name="epoch" />. The
          older worker finds out at its next checkpoint write, which fails, and the core reads the stored checkpoint back
          to say why. The inspector in the target shows the field that did not match.
        </li>
        <li>
          {transactional ? (
            <>
              A <Term name="transactional sink" /> writes each batch and its checkpoint in one transaction, so state is
              exactly once. A crash in the middle rolls both back.
            </>
          ) : (
            <>
              A <Term name="non-transactional sink" /> writes the batch first and the checkpoint second, so a crash in
              between replays the batch. Each write is conditional on the row's mz_timestamp, so the replay changes
              nothing.
            </>
          )}
        </li>
        <li>
          A resume is <code>SNAPSHOT = false</code> with <Term name="AS OF F − 1" />, so it starts exactly where the last
          commit ended. It needs Materialize to still have history back to that point.
        </li>
        <li>
          The first snapshot raises the <Term name="generation" />. Rows are written under it, and a sweep removes rows
          of older generations once a snapshot completes.
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
  "Start another worker while one runs. The new one takes over, and the old one is fenced at its next commit.",
  "Untick RETAIN HISTORY, crash the running worker, let 5 seconds pass, and start a worker. History is lost, and it stops.",
];

const STEPS_TX = [
  "Set up the checkpoint and start worker A. It takes the checkpoint over and writes a snapshot.",
  "Change some rows and let time pass. Each batch commits with its checkpoint, in one transaction.",
  "Click “Crash mid-transaction”, then change a row and let a second pass. The transaction rolls back. Start worker B: nothing had landed, so B writes the change once.",
  "Start another worker while one runs. The new one takes over, and the old one's next transaction is refused, so it is fenced.",
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
