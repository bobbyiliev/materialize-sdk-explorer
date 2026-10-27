import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import { EventCard, WireLog, useFollow } from "../components/Wire";
import type { Envelope, SdkEvent } from "../core/sdk";
import { excerpt } from "../lib/source";
import { DEFAULT_MAX_ROWS, LiveRunner } from "../sim/live";
import { SimMaterialize } from "../sim/materialize";

const FRUITS = ["plum", "fig", "kiwi", "mango", "lime", "cherry", "grape", "peach", "melon", "date"];

function useForce(): () => void {
  return useReducer((x: number) => x + 1, 0)[1];
}

export function ProtocolLab() {
  const server = useRef(new SimMaterialize([["apple", 3], ["pear", 5]]));
  const [envelope, setEnvelope] = useState<Envelope>({ kind: "diff" });
  const runner = useRef(new LiveRunner(server.current, envelope));
  const [auto, setAuto] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const force = useForce();
  const state = runner.current.state;
  const started = state.wire.length > 0;
  const eventsRef = useFollow<HTMLDivElement>(state.events.length);

  const fetchOnce = () => {
    setLastCount(runner.current.state.events.length);
    runner.current.step();
    force();
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      server.current.tick();
      setLastCount(runner.current.state.events.length);
      runner.current.step();
      force();
    }, 1200);
    return () => clearInterval(id);
  }, [auto, force]);

  const start = (env = envelope) => {
    runner.current.reset();
    runner.current = new LiveRunner(server.current, env, runner.current.maxRows);
    runner.current.open();
    setLastCount(0);
    force();
  };

  const sql = (text: string, action: () => void) => {
    action();
    setLog((l) => [...l, text].slice(-12));
    force();
  };

  const insert = () => {
    const item = FRUITS[Math.floor(Math.random() * FRUITS.length)];
    const qty = 1 + Math.floor(Math.random() * 9);
    sql(`INSERT INTO orders VALUES (..., '${item}', ${qty});`, () => server.current.insert(item, qty));
  };

  const insertThree = () => {
    sql("INSERT INTO orders VALUES (...), (...), (...);", () =>
      server.current.insertMany([0, 1, 2].map((i) => [FRUITS[(i + 3) % FRUITS.length], i + 1])),
    );
  };

  const switchEnvelope = (env: Envelope) => {
    setEnvelope(env);
    if (started) start(env);
  };

  const steps = progress(runner.current, state.events, state.wire);
  const frontier = state.frontier;
  const failed = state.failed;

  return (
    <>
      <div className="eyebrow">How it works · live</div>
      <h1>Protocol lab</h1>
      <p className="page-lead">
        A table on the left, the wire in the middle, and what the SDK hands your code on the right. Every statement and
        every batch comes from the SDK's real protocol core. Only Materialize is simulated.
      </p>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Try this</h3>
          <ol className="tryit">
            {STEPS.map((s, i) => (
              <li key={s} className={steps[i] ? "done" : ""}>
                {s}
              </li>
            ))}
          </ol>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Controls</h3>
          <div className="toolbar">
            <button className="btn primary" type="button" onClick={() => start()}>
              {started ? "Restart subscription" : "Start subscription"}
            </button>
            <button className="btn" type="button" onClick={fetchOnce} disabled={!started || !!failed || auto}>
              FETCH
            </button>
            <button className="btn" type="button" onClick={() => sql("-- one second passes", () => server.current.tick())}>
              1 second passes
            </button>
            <button className="btn" type="button" onClick={() => setAuto(!auto)} disabled={!started || !!failed}>
              {auto ? "Pause" : "Run on its own"}
            </button>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <span className="small muted">Envelope</span>
            <div className="segmented">
              <button type="button" className={envelope.kind === "diff" ? "on" : ""} onClick={() => switchEnvelope({ kind: "diff" })}>
                diff
              </button>
              <button
                type="button"
                className={envelope.kind === "upsert" ? "on" : ""}
                onClick={() => switchEnvelope({ kind: "upsert", key: ["id"] })}
              >
                upsert (KEY id)
              </button>
            </div>
            <span className="small muted">Rows per FETCH</span>
            <div className="segmented">
              {[DEFAULT_MAX_ROWS, 2].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={runner.current.maxRows === n ? "on" : ""}
                  onClick={() => {
                    runner.current.maxRows = n;
                    force();
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button
              className="btn danger"
              type="button"
              disabled={!started || !!failed}
              onClick={() => {
                setAuto(false);
                runner.current.injectFailure(null, "connection closed");
                fetchOnce();
              }}
            >
              Drop the connection
            </button>
            <button
              className="btn"
              type="button"
              disabled={!failed || !frontier}
              onClick={() => {
                runner.current.open({ kind: "resume", frontier: frontier! });
                force();
              }}
            >
              Resume from {frontier ? `frontier ${frontier}` : "the frontier"}
            </button>
          </div>
        </div>
      </div>

      {failed && (
        <div className="callout warn">
          <strong>The stream ended with an error.</strong>
          <p>
            A live subscription hands the error to your app. A durable sink resumes on its own when the error is
            transient: it reconnects with <code>SNAPSHOT = false</code> and <code>AS OF F − 1</code>, where{" "}
            <code>F</code> is its last commit. Click <em>Resume</em> to see that statement, and check that no change
            arrives twice.
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
                {[...server.current.rows.values()].map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td>{row[1]}</td>
                    <td>{row[2]}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="btn small"
                        onClick={() =>
                          sql(`UPDATE orders SET qty = ${Number(row[2]) + 1} WHERE id = ${row[0]};`, () =>
                            server.current.update(row[0]!, Number(row[2]) + 1),
                          )
                        }
                      >
                        qty +1
                      </button>{" "}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => sql(`DELETE FROM orders WHERE id = ${row[0]};`, () => server.current.delete(row[0]!))}
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={insert}>
                Insert a row
              </button>
              <button className="btn" type="button" onClick={insertThree}>
                Insert 3 rows
              </button>
            </div>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>now</dt>
              <dd>{String(server.current.now)}</dd>
              <dt>readable from</dt>
              <dd>{String(server.current.since())}</dd>
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
              <div className="empty">{started ? "Click FETCH." : "Start the subscription."}</div>
            )}
            {state.events.map((e, i) => (
              <EventCard key={i} event={e} fresh={i >= lastCount} />
            ))}
          </div>
        </section>
      </div>

      <h2>What to notice</h2>
      <ul>
        <li>
          The first progress row is at the <code>AS OF</code>. The snapshot's rows are all at that one timestamp, and the
          snapshot is released only when the next progress row closes it.
        </li>
        <li>
          With 2 rows per <code>FETCH</code>, a <code>FETCH</code> can return changes without a progress row. The core
          holds them. Your code never sees half of a point in time.
        </li>
        <li>
          After a timed <code>FETCH</code> comes back empty, the next one has no timeout. An empty result with a timeout
          could also mean the stream ended, and only the probe can tell.
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

function codeOf(e: { code: string; path: string; url: string }) {
  return { code: e.code, title: e.path, href: e.url };
}

const STEPS = [
  "Start the subscription. The two rows arrive as one snapshot batch.",
  "Click qty +1 on a row, then FETCH. The update is a − and a + at the same timestamp.",
  "Set rows per FETCH to 2, insert 3 rows, and FETCH until the batch appears. It waits for the progress row.",
  "FETCH twice without changing anything. The empty timed FETCH is followed by a probe.",
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
