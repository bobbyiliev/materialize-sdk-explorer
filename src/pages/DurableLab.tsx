import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import {
  BatchPath,
  FreshnessChart,
  GenerationStages,
  HistoryWindow,
  Pipeline,
  WriteInspector,
  type FreshnessSample,
} from "../components/DurableViz";
import { Term, Ts } from "../components/Term";
import { useFollow } from "../components/Wire";
import type { Checkpoint } from "../core/sdk";
import { excerpt } from "../lib/source";
import { COMMIT_INTERVAL_TICKS, DurableWorker, SimTarget, setup, type SinkKind, type Step, type TargetEvent } from "../sim/durable";
import { SimMaterialize } from "../sim/materialize";

const FRUITS = ["plum", "fig", "kiwi", "mango", "lime", "cherry", "grape", "peach"];
const NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface Lab {
  server: SimMaterialize;
  target: SimTarget;
  workers: DurableWorker[];
  samples: FreshnessSample[];
  statuses: Map<string, string>;
}

function newLab(kind: SinkKind): Lab {
  return {
    server: new SimMaterialize([["apple", 3], ["pear", 5]]),
    target: new SimTarget(kind),
    workers: [],
    samples: [],
    statuses: new Map(),
  };
}

interface Narration {
  title: string;
  lines: string[];
}

/** The last step of each worker and the last target event, to find what an action added. */
interface Mark {
  steps: Map<string, Step | undefined>;
  event: TargetEvent | undefined;
}

const short = (ts: bigint | string) => `…${String(ts).slice(-5)}`;

export function DurableLab() {
  const [kind, setKind] = useState<SinkKind>("non_transactional");
  const lab = useRef<Lab>(newLab(kind));
  const [auto, setAuto] = useState(false);
  const [narration, setNarration] = useState<Narration | null>(null);
  const narrationRef = useFollow<HTMLDivElement>(narration);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const done = useRef<boolean[]>([]);
  const { server, target, workers } = lab.current;

  /** Samples the target's freshness, labeled with any worker whose status changed. */
  const record = () => {
    const l = lab.current;
    const changes: string[] = [];
    for (const w of l.workers) {
      const status = w.status === "starting" || w.status === "reconnecting" ? "starts" : w.status;
      const before = l.statuses.get(w.name);
      if (before !== status) {
        if (before === undefined) changes.push(`${w.name} ${status === "streaming" ? "starts" : status}`);
        else if (status !== "streaming") changes.push(`${w.name} ${status}`);
        l.statuses.set(w.name, status);
      }
    }
    const text = l.target.checkpoint;
    const frontier = text ? (JSON.parse(text) as Checkpoint).frontier : null;
    l.samples = [
      ...l.samples,
      {
        at: l.server.now,
        lagMs: frontier ? Number(l.server.now + 1n - BigInt(frontier)) : null,
        label: changes.join(", ") || undefined,
      },
    ].slice(-120);
  };

  const tickOnce = (ms = 1000n) => {
    lab.current.server.tick(ms);
    for (const w of lab.current.workers) if (w.running) w.step();
    record();
  };
  const ticks = (n: number) => {
    for (let i = 0; i < n; i++) tickOnce();
  };

  const mark = (): Mark => ({
    steps: new Map(lab.current.workers.map((w) => [w.name, w.steps.at(-1)])),
    event: lab.current.target.events.at(-1),
  });

  /** What the workers said, and what the target did on its own, since `m`. */
  const saidSince = (m: Mark): string[] => {
    const lines: string[] = [];
    for (const w of lab.current.workers) {
      const last = m.steps.get(w.name);
      const from = last === undefined ? 0 : w.steps.lastIndexOf(last) + 1;
      for (const step of w.steps.slice(from)) lines.push(`Worker ${w.name}: ${step.text}`);
    }
    const events = lab.current.target.events;
    const from = m.event === undefined ? 0 : events.lastIndexOf(m.event) + 1;
    for (const e of events.slice(from)) {
      if (e.kind === "noop" || e.kind === "refused") lines.push(`Target: ${e.worker} ${e.text}.`);
    }
    return lines.slice(-8);
  };

  /** Runs `f`, then explains it. `idle` explains an action that made no worker say anything. */
  const act = (title: string, f: () => void, idle?: () => string) => {
    const m = mark();
    f();
    record();
    const lines = saidSince(m);
    setNarration({ title, lines: lines.length ? lines : [idle ? idle() : "Nothing changed."] });
    force();
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => act("One second passed", () => tickOnce(), quiet), 1100);
    return () => clearInterval(id);
  });

  const reset = (k = kind) => {
    setAuto(false);
    lab.current = newLab(k);
    done.current = [];
    setNarration(null);
    force();
  };

  const startWorker = () => {
    const w = new DurableWorker(NAMES[lab.current.workers.length % NAMES.length], lab.current.server, lab.current.target);
    lab.current.workers = [...lab.current.workers, w];
    w.step();
    return w;
  };

  const running = () => lab.current.workers.filter((w) => w.running);
  const ensureRunning = () => {
    if (lab.current.target.checkpoint === null) setup(lab.current.target);
    if (running().length === 0) {
      startWorker();
      ticks(3);
    }
  };
  const firstRow = () => [...lab.current.server.rows.values()][0];
  const bumpFirst = () => {
    const row = firstRow();
    if (row) lab.current.server.update(row[0]!, Number(row[2]) + 1);
  };

  const changed = () =>
    running().length
      ? `The table changed at ${short(lab.current.server.now)}. A worker reads it at its next FETCH. Click 1 second passes.`
      : `The table changed at ${short(lab.current.server.now)}. No worker is running, so the target does not see it yet.`;
  function quiet() {
    return running().length
      ? `A second passed and the workers fetched. Nothing needed writing yet: a quiet stream commits every ${COMMIT_INTERVAL_TICKS} seconds.`
      : "A second passed. No worker is running.";
  }
  const gap = () => {
    const l = lab.current;
    const cp = l.target.checkpoint ? (JSON.parse(l.target.checkpoint) as Checkpoint) : null;
    const since = l.server.since();
    const base = `Materialize's clock moved 5 seconds and no worker ran. Readable history now starts at ${short(since)}.`;
    if (!cp?.frontier) return base;
    const resume = BigInt(cp.frontier) - 1n;
    return resume < since
      ? `${base} The checkpoint's AS OF F − 1 is ${short(resume)}, which is older, so a resume would lose history.`
      : `${base} The checkpoint's AS OF F − 1 is ${short(resume)}, still readable, so a resume works.`;
  };

  // Each step of the guide, done for you.
  const SHOW: Array<() => void> = [
    () => act("Set up and start worker A", () => ensureRunning()),
    () =>
      act("Change some rows and let time pass", () => {
        ensureRunning();
        lab.current.server.insert(FRUITS[lab.current.server.rows.size % FRUITS.length], 2);
        ticks(1);
        bumpFirst();
        ticks(1);
      }),
    () =>
      act("Crash between the batch and the checkpoint, then start B", () => {
        ensureRunning();
        running()[0].crashBeforeCheckpoint = true;
        bumpFirst();
        ticks(1);
        startWorker();
        ticks(2);
      }),
    () =>
      act("Start another worker while one runs", () => {
        ensureRunning();
        startWorker();
        bumpFirst();
        ticks(2);
      }),
    () =>
      act("Lose history, then start a worker", () => {
        ensureRunning();
        lab.current.server.retainHistory = false;
        for (const w of running()) w.crash();
        lab.current.server.tick(5000n);
        startWorker();
      }),
  ];

  const checkpoint = target.checkpoint ? (JSON.parse(target.checkpoint) as Checkpoint) : null;
  done.current = progress(lab.current).map((d, i) => d || !!done.current[i]);
  const next = done.current.findIndex((d) => !d);
  const transactional = kind === "transactional";
  const live = workers.filter((w) => w.running);
  const newest = live.at(-1);
  const rows = [...server.rows.values()];

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

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Try this</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Do each step with the controls below, or click <em>Show me</em>. Steps build on each other.
        </p>
        <ol className="tryit rows">
          {(transactional ? STEPS_TX : STEPS).map((s, i) => (
            <li key={s} className={done.current[i] ? "done" : i === next ? "next" : ""}>
              <span>{s}</span>
              <button type="button" className="btn small show-me" onClick={SHOW[i]} disabled={auto}>
                Show me
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="lab-console">
        <div>
          <div className="console-row">
            <span className="console-label">Workers</span>
            <button
              className="btn primary"
              type="button"
              disabled={target.checkpoint !== null}
              onClick={() =>
                act(
                  "Set up the checkpoint",
                  () => setup(target),
                  () => "The setup wrote the first checkpoint: epoch 1, generation 1, and no frontier. Now start a worker.",
                )
              }
            >
              Set up the checkpoint
            </button>
            <button className="btn primary" type="button" disabled={target.checkpoint === null} onClick={() => act("Started a worker", startWorker)}>
              Start a worker
            </button>
            <button className="btn" type="button" onClick={() => setAuto(!auto)}>
              {auto ? "Pause" : "Run on its own"}
            </button>
          </div>
          <div className="console-row">
            <span className="console-label">Time</span>
            <button className="btn" type="button" onClick={() => act("One second passed", () => tickOnce(), quiet)}>
              1 second passes
            </button>
            <button className="btn" type="button" onClick={() => act("5 seconds passed, no workers ran", () => server.tick(5000n), gap)}>
              5 seconds pass, no workers run
            </button>
          </div>
          <div className="console-row">
            <span className="console-label">Faults</span>
            <button
              type="button"
              className="btn danger"
              disabled={!newest}
              onClick={() => act(`Crashed worker ${newest!.name}`, () => newest!.crash())}
            >
              Crash {newest ? newest.name : "a worker"}
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={!newest || newest.status !== "streaming" || newest.crashBeforeCheckpoint}
              onClick={() =>
                act(
                  `Armed a crash in worker ${newest!.name}`,
                  () => (newest!.crashBeforeCheckpoint = true),
                  () =>
                    transactional
                      ? `Worker ${newest!.name} will crash in the middle of its next transaction. Change a row, then let a second pass.`
                      : `Worker ${newest!.name} will crash after its next batch lands and before the checkpoint does. Change a row, then let a second pass.`,
                )
              }
            >
              {newest?.crashBeforeCheckpoint ? `${newest.name} crashes at the next batch` : CRASH_LABEL[kind]}
            </button>
            <button
              type="button"
              className="btn"
              disabled={!newest || newest.status !== "streaming"}
              onClick={() =>
                act(
                  `Dropped worker ${newest!.name}'s connection`,
                  () => newest!.dropConnection(),
                  () => `The connection will fail at worker ${newest!.name}'s next FETCH. Let a second pass.`,
                )
              }
            >
              Drop {newest ? `${newest.name}'s` : "its"} connection
            </button>
          </div>
          <div className="console-row">
            <span className="console-label">Table</span>
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0}
              onClick={() => act("Updated a row", () => server.update(rows[0][0]!, Number(rows[0][2]) + 1), changed)}
            >
              Update a row
            </button>
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0}
              onClick={() => act("Deleted a row", () => server.delete(rows[0][0]!), changed)}
            >
              Delete a row
            </button>
            <button
              className="btn"
              type="button"
              onClick={() =>
                act(
                  "Inserted a row",
                  () => server.insert(FRUITS[Math.floor(Math.random() * FRUITS.length)], 1 + Math.floor(Math.random() * 9)),
                  changed,
                )
              }
            >
              Insert a row
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={server.retainHistory}
                onChange={(e) =>
                  act(
                    e.target.checked ? "Turned RETAIN HISTORY on" : "Turned RETAIN HISTORY off",
                    () => (server.retainHistory = e.target.checked),
                    () =>
                      server.retainHistory
                        ? "Materialize keeps an hour of history for the table, so a worker can resume after a long gap."
                        : "Materialize keeps only the default second of history now. A gap longer than that loses history.",
                  )
                }
              />
              <span>
                <code>RETAIN HISTORY = FOR '1h'</code>
              </span>
            </label>
          </div>
          <div className="console-row">
            <span className="console-label">Target</span>
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
                    if (kind === k) return;
                    setKind(k);
                    reset(k);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn" type="button" onClick={() => reset()}>
              Reset the lab
            </button>
          </div>
        </div>
        <div className="narration" aria-live="polite" ref={narrationRef}>
          <h3>{narration ? `What just happened: ${narration.title}` : "What just happened"}</h3>
          {narration ? (
            <ul>
              {narration.lines.map((l, i) => (
                <li key={`${narration.title}-${i}-${l.length}`}>{l}</li>
              ))}
            </ul>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Click <em>Set up the checkpoint</em>, or <em>Show me</em> on the first step. Each action is explained
              here. Switching the target resets the lab. The lab commits a quiet stream every {COMMIT_INTERVAL_TICKS}{" "}
              seconds to keep the log short, and the SDK's default is one second.
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Pipeline server={server} target={target} workers={workers} checkpoint={checkpoint} />
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
                {rows.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => act("Updated a row", () => server.update(row[0]!, Number(row[2]) + 1), changed)}
                      >
                        qty +1
                      </button>{" "}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => act("Deleted a row", () => server.delete(row[0]!), changed)}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">The table is empty. Insert a row.</div>}
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
            {target.docs.size === 0 && <div className="empty">No rows yet.</div>}
            {target.lastRefused && (
              <>
                <h4 className="pane-sub">Last refused checkpoint write</h4>
                <WriteInspector attempt={target.lastRefused} />
              </>
            )}
            <h4 className="pane-sub">Last checkpoint write</h4>
            <WriteInspector attempt={target.lastWrite} />
            <h4 className="pane-sub">Writes the target received</h4>
            <TargetLog target={target} />
          </div>
        </section>
      </div>

      <div style={{ marginTop: 16 }}>
        <FreshnessChart samples={lab.current.samples} />
      </div>

      <div className="grid two" style={{ marginTop: 16, alignItems: "stretch" }}>
        <HistoryWindow server={server} checkpoint={checkpoint} />
        <BatchPath kind={kind} />
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
  act: (title: string, f: () => void, idle?: () => string) => void;
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
          <button type="button" className="btn small danger" onClick={() => act(`Crashed worker ${worker.name}`, () => worker.crash())}>
            Crash
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={worker.status !== "streaming" || worker.crashBeforeCheckpoint}
            onClick={() =>
              act(
                `Armed a crash in worker ${worker.name}`,
                () => (worker.crashBeforeCheckpoint = true),
                () => `Worker ${worker.name} crashes at its next batch. Change a row, then let a second pass.`,
              )
            }
          >
            {worker.crashBeforeCheckpoint ? "Crashes at the next batch" : CRASH_LABEL[transactional ? "transactional" : "non_transactional"]}
          </button>
          <button
            type="button"
            className="btn small"
            disabled={worker.status !== "streaming"}
            onClick={() =>
              act(
                `Dropped worker ${worker.name}'s connection`,
                () => worker.dropConnection(),
                () => `The connection will fail at worker ${worker.name}'s next FETCH. Let a second pass.`,
              )
            }
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

const CRASH_LABEL: Record<SinkKind, string> = {
  non_transactional: "Crash between batch and checkpoint",
  transactional: "Crash mid-transaction",
};

const STEPS = [
  "Set up the checkpoint and start worker A. It takes the checkpoint over and writes a snapshot.",
  "Change some rows and let time pass. Each batch is written, then committed.",
  "Click “Crash between batch and checkpoint”, then change a row and let a second pass. A writes the change and crashes before its checkpoint. Start worker B: it sends the change again, and the target skips it.",
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
