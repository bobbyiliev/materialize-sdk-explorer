import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import { Term, Ts } from "../components/Term";
import { Timeline } from "../components/Timeline";
import { EventCard, WireLog, useFollow } from "../components/Wire";
import type { Envelope, SdkEvent } from "../core/sdk";
import { excerpt } from "../lib/source";
import { DEFAULT_MAX_ROWS, LiveRunner } from "../sim/live";
import { SimMaterialize } from "../sim/materialize";
import { narrate } from "../sim/narrate";

const FRUITS = ["plum", "fig", "kiwi", "mango", "lime", "cherry", "grape", "peach", "melon", "date"];

interface Narration {
  title: string;
  lines: string[];
}

export function ProtocolLab() {
  const server = useRef(new SimMaterialize([["apple", 3], ["pear", 5]]));
  const [envelope, setEnvelope] = useState<Envelope>({ kind: "diff" });
  const runner = useRef(new LiveRunner(server.current, envelope));
  const [auto, setAuto] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [narration, setNarration] = useState<Narration | null>(null);
  const narrationRef = useFollow<HTMLDivElement>(narration);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const state = runner.current.state;
  const started = state.wire.length > 0;
  const eventsRef = useFollow<HTMLDivElement>(state.events.length);

  /** Runs `action`, then explains what it sent, received, and released. `idle` explains an action with no round trip. */
  const act = (title: string, action: () => void, idle?: () => string) => {
    const before = runner.current;
    const wire0 = before.state.wire.length;
    const events0 = before.state.events.length;
    action();
    const now = runner.current;
    const fresh = now === before;
    setLastCount(fresh ? events0 : 0);
    const lines = narrate(now.state.wire.slice(fresh ? wire0 : 0), now.state.events.slice(fresh ? events0 : 0), {
      held: now.held,
      frontier: now.state.frontier,
    });
    setNarration({ title, lines: lines.length ? lines : [idle ? idle() : "Nothing went over the wire. Click FETCH."] });
    force();
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      act("One second passed, then a FETCH", () => {
        server.current.tick();
        runner.current.step();
      });
    }, 1400);
    return () => clearInterval(id);
  });

  const restart = (env = envelope) => {
    runner.current.reset();
    runner.current = new LiveRunner(server.current, env, runner.current.maxRows);
    runner.current.open();
  };
  const start = (env = envelope) => {
    restart(env);
    runner.current.stepWhileHeld();
  };
  const ensureStarted = () => {
    if (!runner.current.state.wire.length || runner.current.state.failed) start();
  };

  const fetch = () => runner.current.step();

  const sql = (text: string, action: () => void) => {
    action();
    setLog((l) => [...l, text].slice(-12));
  };

  const firstRow = () => [...server.current.rows.values()][0];

  const update = (id: string, qty: number) =>
    sql(`UPDATE orders SET qty = ${qty} WHERE id = ${id};`, () => server.current.update(id, qty));

  const remove = (id: string) => sql(`DELETE FROM orders WHERE id = ${id};`, () => server.current.delete(id));

  const insertThree = () =>
    sql("INSERT INTO orders VALUES (...), (...), (...);", () =>
      server.current.insertMany([0, 1, 2].map((i) => [FRUITS[(i + 3) % FRUITS.length], i + 1])),
    );

  const insertOne = () => {
    const item = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const qty = 1 + Math.floor(Math.random() * 9);
    sql(`INSERT INTO orders VALUES (..., '${item}', ${qty});`, () => server.current.insert(item, qty));
  };

  const setMaxRows = (n: number) => {
    runner.current.maxRows = n;
  };

  const changed = () =>
    runner.current.state.wire.length && !runner.current.state.failed
      ? `The change is in Materialize at ${short(server.current.now)}. Nothing went over the wire yet. Click FETCH to read it.`
      : "The table changed. Start the subscription to read it.";
  const ticked = () =>
    runner.current.state.wire.length && !runner.current.state.failed
      ? `Materialize's clock moved to ${short(server.current.now)}. The next FETCH gets a progress row that moves the frontier.`
      : `Materialize's clock moved to ${short(server.current.now)}.`;

  // Each step of the guide, done for you.
  const SHOW: Array<() => void> = [
    () => act("Start the subscription", () => start()),
    () =>
      act("Update a row", () => {
        ensureStarted();
        const row = firstRow();
        if (row) update(row[0]!, Number(row[2]) + 1);
        fetch();
      }),
    () =>
      act("Insert 3 rows, with 2 rows per FETCH", () => {
        ensureStarted();
        setMaxRows(2);
        insertThree();
        fetch();
        fetch();
      }),
    () =>
      act("FETCH twice with nothing new", () => {
        ensureStarted();
        setMaxRows(DEFAULT_MAX_ROWS);
        fetch();
        fetch();
        fetch();
      }),
    () =>
      act("Switch to the upsert envelope and update a row", () => {
        const env: Envelope = { kind: "upsert", key: ["id"] };
        setEnvelope(env);
        setMaxRows(DEFAULT_MAX_ROWS);
        start(env);
        const row = firstRow();
        if (row) update(row[0]!, Number(row[2]) + 1);
        fetch();
      }),
    () =>
      act("Drop the connection, then resume", () => {
        ensureStarted();
        runner.current.injectFailure(null, "connection closed");
        fetch();
        insertOne();
        const frontier = runner.current.state.frontier;
        if (frontier) {
          runner.current.open({ kind: "resume", frontier });
          runner.current.stepWhileHeld();
        }
      }),
  ];

  // A step stays done after a restart starts a new stream.
  const done = useRef<boolean[]>([]);
  done.current = progress(runner.current, state.events, state.wire).map((d, i) => d || !!done.current[i]);
  const steps = done.current;
  const next = steps.findIndex((d) => !d);
  const frontier = state.frontier;
  const failed = state.failed;
  const rows = [...server.current.rows.values()];

  return (
    <>
      <div className="eyebrow">How it works · live</div>
      <h1>Protocol lab</h1>
      <p className="page-lead">
        Change a table and watch what the SDK does with <Term name="SUBSCRIBE" />: what it sends, what comes back, and
        what your code receives. Every statement and every batch comes from the SDK's real protocol core. Only
        Materialize is simulated.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>Try this</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Do each step with the controls below, or click <em>Show me</em>. A step gets a check mark once you have seen it.
        </p>
        <ol className="tryit rows">
          {STEPS.map((s, i) => (
            <li key={s} className={steps[i] ? "done" : i === next ? "next" : ""}>
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
            <span className="console-label">Stream</span>
            <button className="btn primary" type="button" onClick={() => act("Start the subscription", () => start())}>
              {started ? "Restart" : "Start subscription"}
            </button>
            <button className="btn" type="button" onClick={() => act("FETCH", fetch)} disabled={!started || !!failed || auto}>
              FETCH
            </button>
            <button className="btn" type="button" onClick={() => setAuto(!auto)} disabled={!started || !!failed}>
              {auto ? "Pause" : "Run on its own"}
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={!started || !!failed}
              onClick={() => {
                setAuto(false);
                act("Dropped the connection", () => {
                  runner.current.injectFailure(null, "connection closed");
                  fetch();
                });
              }}
            >
              Drop connection
            </button>
            {failed && !frontier ? (
              <button className="btn" type="button" onClick={() => act("Started again with a snapshot", () => start())}>
                Start again with a snapshot
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                disabled={!failed}
                onClick={() =>
                  act("Resumed from the frontier", () => {
                    runner.current.open({ kind: "resume", frontier: frontier! });
                    runner.current.stepWhileHeld();
                  })
                }
              >
                Resume
              </button>
            )}
          </div>
          <div className="console-row">
            <span className="console-label">Table</span>
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0}
              onClick={() => act("Updated a row", () => update(rows[0][0]!, Number(rows[0][2]) + 1), changed)}
            >
              Update a row
            </button>
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0}
              onClick={() => act("Deleted a row", () => remove(rows[0][0]!), changed)}
            >
              Delete a row
            </button>
            <button className="btn" type="button" onClick={() => act("Inserted a row", insertOne, changed)}>
              Insert a row
            </button>
            <button className="btn" type="button" onClick={() => act("Inserted 3 rows in one statement", insertThree, changed)}>
              Insert 3 rows
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => act("One second passed", () => sql("-- one second passes", () => server.current.tick()), ticked)}
            >
              1 second passes
            </button>
          </div>
          <div className="console-row">
            <span className="console-label">Options</span>
            <span className="small muted">
              <Term name="envelope">Envelope</Term>
            </span>
            <div className="segmented">
              {(
                [
                  ["diff", { kind: "diff" }],
                  ["upsert (KEY id)", { kind: "upsert", key: ["id"] }],
                ] as Array<[string, Envelope]>
              ).map(([label, env]) => (
                <button
                  key={label}
                  type="button"
                  className={envelope.kind === env.kind ? "on" : ""}
                  onClick={() => {
                    if (envelope.kind === env.kind) return;
                    setEnvelope(env);
                    if (started) act(`Restarted in the ${env.kind} envelope`, () => start(env));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="small muted">Rows per FETCH</span>
            <div className="segmented">
              {[DEFAULT_MAX_ROWS, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={runner.current.maxRows === n ? "on" : ""}
                  onClick={() => {
                    setMaxRows(n);
                    force();
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
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
              Click <em>Start subscription</em>, or <em>Show me</em> on the first step. Each action is explained here.
            </p>
          )}
        </div>
      </div>

      {failed && (
        <div className="callout warn">
          <strong>The stream ended with an error.</strong>
          <p>
            A live subscription hands the error to your app. A durable sink resumes on its own when the error is
            transient: it reconnects with <code>SNAPSHOT = false</code> and <Term name="AS OF F − 1" />, where{" "}
            <code>F</code> is its last commit.{" "}
            {frontier ? (
              <>
                Click <em>Resume</em> to see that statement.
              </>
            ) : (
              <>
                No batch was released before the error, so there is no <code>F</code> yet, and a new snapshot is the
                only way to start.
              </>
            )}
          </p>
        </div>
      )}

      <div className="lab" style={{ marginTop: 16 }}>
        <section className="pane">
          <div className="pane-head">
            <h3>Materialize</h3>
            <span className="badge">simulated</span>
          </div>
          <div className="pane-body">
            <div className="small muted">
              <span className="mono">materialize.public.orders</span>, catalog id <span className="mono">u42</span>
            </div>
            <table className="mini-table" style={{ marginTop: 6 }}>
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
                        onClick={() => act("Updated a row", () => update(row[0]!, Number(row[2]) + 1), changed)}
                      >
                        qty +1
                      </button>{" "}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => act("Deleted a row", () => remove(row[0]!), changed)}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">The table is empty. Insert a row.</div>}
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>now</dt>
              <dd>
                <Ts value={server.current.now} />
              </dd>
              <dt>
                <Term name="readable history">readable from</Term>
              </dt>
              <dd>
                <Ts value={server.current.since()} />
              </dd>
            </dl>
            {log.length > 0 && (
              <>
                <h4 className="small muted" style={{ margin: "14px 0 4px" }}>
                  You ran
                </h4>
                {log.map((l, i) => (
                  <div key={i} className="mono small" style={{ overflowWrap: "anywhere" }}>
                    {l}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        <section className="pane">
          <div className="pane-head">
            <h3>On the wire</h3>
            <span className="badge accent">SQL from the core</span>
          </div>
          <WireLog entries={state.wire} />
        </section>

        <section className="pane">
          <div className="pane-head">
            <h3>Your code gets</h3>
            <span className="badge accent">events from the core</span>
          </div>
          <div className="pane-body tall" ref={eventsRef}>
            {state.events.length === 0 && (
              <div className="empty">
                {!started
                  ? "Start the subscription."
                  : runner.current.held > 0
                    ? `The core holds ${runner.current.held} changes until a progress row closes them. Click FETCH.`
                    : "Nothing yet. Click FETCH."}
              </div>
            )}
            {state.events.map((e, i) => (
              <EventCard key={i} event={e} fresh={i >= lastCount} />
            ))}
          </div>
        </section>
      </div>

      <section className="pane" style={{ marginTop: 16 }}>
        <div className="pane-head">
          <h3>Timeline</h3>
          <span className="small muted">
            A <Term name="batch" /> is released only when a <Term name="progress row" /> closes it.
          </span>
        </div>
        <div className="pane-body" style={{ maxHeight: "none" }}>
          <Timeline wire={state.wire} events={state.events} />
        </div>
      </section>

      <h2>What to notice</h2>
      <ul>
        <li>
          The first <Term name="progress row" /> is at the <Term name="AS OF" />. The <Term name="snapshot" />
          's rows are all at that one timestamp, and the snapshot is released only when the next progress row closes it.
        </li>
        <li>
          With 2 rows per <code>FETCH</code>, a <code>FETCH</code> can return changes without a progress row. The core
          holds them, hollow on the timeline. Your code never sees half of a point in time.
        </li>
        <li>
          After a timed <code>FETCH</code> comes back empty, the next one has no timeout. An empty result with a timeout
          could also mean the stream ended, and only that second <code>FETCH</code> can tell.
        </li>
        <li>
          The SDK subscribes by catalog id, <code>["u42" AS ...]</code>, so a renamed or swapped object cannot change
          what the stream reads.
        </li>
      </ul>

      <h2>The code behind it</h2>
      <Code {...codeOf(excerpt("rust/src/live.rs", "pub async fn next(&mut self)", "    }"))} />
    </>
  );
}

const short = (ts: bigint | string) => `…${String(ts).slice(-5)}`;

function codeOf(e: { code: string; path: string; url: string }) {
  return { code: e.code, title: e.path, href: e.url };
}

const STEPS = [
  "Start the subscription. The two rows arrive as one snapshot batch.",
  "Update a row, then FETCH. The update is a − and a + at the same timestamp.",
  "Set rows per FETCH to 2, insert 3 rows, and FETCH twice. The first FETCH has no progress row, so the core holds the changes.",
  "FETCH twice without changing anything. The empty timed FETCH is followed by one without a timeout.",
  "Switch to the upsert envelope and change a row. You get one upsert per key.",
  "Drop the connection, then resume. No change arrives twice.",
];

function progress(runner: LiveRunner, events: SdkEvent[], wire: LiveRunner["state"]["wire"]): boolean[] {
  const batches = events.filter((e) => e.event === "batch");
  return [
    batches.some((b) => b.snapshot),
    batches.some((b) => {
      const diffs = b.updates.filter((u) => u.op === "diff");
      return diffs.some((m) => m.diff.startsWith("-") && diffs.some((p) => !p.diff.startsWith("-") && p.timestamp === m.timestamp));
    }),
    wire.some((w) => w.dir === "in" && w.rows.length > 0 && !w.rows.some((r) => r[1] === "t")),
    wire.some((w) => w.dir === "out" && !!w.note),
    runner.envelope.kind === "upsert" && batches.some((b) => !b.snapshot && b.updates.some((u) => u.op === "upsert" || u.op === "delete")),
    wire.some((w) => w.dir === "out" && w.sql.includes("SNAPSHOT = false")),
  ];
}
