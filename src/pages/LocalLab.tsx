import { useEffect, useReducer, useRef, useState } from "react";
import { Code } from "../components/Code";
import { Term } from "../components/Term";
import { Timeline } from "../components/Timeline";
import { EventCard, WireLog, useFollow } from "../components/Wire";
import type { Envelope, Row } from "../core/sdk";
import { local, type Status } from "../local/client";
import { LocalRunner } from "../local/runner";
import { DEFAULT_MAX_ROWS } from "../sim/live";
import { narrate } from "../sim/narrate";

const FRUITS = ["plum", "fig", "kiwi", "mango", "lime", "cherry", "grape", "peach", "melon", "date"];

interface Narration {
  title: string;
  lines: string[];
}

export function LocalLab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [offline, setOffline] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [envelope, setEnvelope] = useState<Envelope>({ kind: "diff" });
  const runner = useRef<LocalRunner | null>(null);
  const busy = useRef(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [auto, setAuto] = useState(false);
  const [lastCount, setLastCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [narration, setNarration] = useState<Narration | null>(null);
  const narrationRef = useFollow<HTMLDivElement>(narration);
  const state = runner.current?.state ?? { wire: [], events: [], frontier: null, asOf: null, failed: null };
  const eventsRef = useFollow<HTMLDivElement>(state.events.length);
  const started = state.wire.length > 0;
  const failed = state.failed;
  const frontier = state.frontier;

  const refresh = async () => setRows((await local.rows()).rows);

  useEffect(() => {
    local
      .status()
      .then(async (s) => {
        const { object } = s.object ? s : await local.setup();
        setStatus({ ...s, object });
        await refresh();
      })
      .catch((error: unknown) => setOffline(String(error instanceof Error ? error.message : error)));
    return () => void runner.current?.close();
  }, []);

  /** Runs one action at a time, then explains what went over the wire. */
  const act = async (title: string, action: () => Promise<void>, idle?: string) => {
    if (busy.current) return;
    busy.current = true;
    force();
    const before = runner.current;
    const wire0 = before?.state.wire.length ?? 0;
    const events0 = before?.state.events.length ?? 0;
    try {
      await action();
      await refresh();
    } catch (error) {
      setNarration({ title, lines: [`The local server failed: ${error instanceof Error ? error.message : error}`] });
      return;
    } finally {
      busy.current = false;
      force();
    }
    const now = runner.current;
    const fresh = now === before;
    setLastCount(fresh ? events0 : 0);
    const lines = now
      ? narrate(now.state.wire.slice(fresh ? wire0 : 0), now.state.events.slice(fresh ? events0 : 0), {
          held: now.held,
          frontier: now.state.frontier,
        })
      : [];
    setNarration({ title, lines: lines.length ? lines : [idle ?? "Nothing went over the wire. Click FETCH."] });
  };

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => void act("FETCH", fetchOne), 1000);
    return () => clearInterval(id);
  });

  const start = async (env = envelope) => {
    const maxRows = runner.current?.maxRows ?? DEFAULT_MAX_ROWS;
    await runner.current?.reset();
    runner.current = new LocalRunner(status!.object!, env, maxRows);
    await runner.current.open();
    await runner.current.stepUntilUpdates();
  };

  const fetchOne = async () => {
    await runner.current?.step();
  };

  const change = async (run: () => Promise<{ sql: string }>) => {
    const { sql } = await run();
    setLog((l) => [...l, `${sql};`].slice(-12));
  };

  const changed = "The change is in Materialize. Nothing went over the wire yet. Click FETCH to read it.";

  if (offline) return <Offline reason={offline} />;
  if (!status) return <p className="muted">Connecting to the local server…</p>;

  const disabled = busy.current;

  return (
    <>
      <div className="eyebrow">Your turn · real Materialize</div>
      <h1>Local lab</h1>
      <p className="page-lead">
        The protocol lab against a real Materialize. The SDK's core runs here in the browser and writes every
        statement. The local server only passes them to Materialize and returns its rows.
      </p>

      <div className="lab-console">
        <div>
          <div className="console-row">
            <span className="console-label">Stream</span>
            <button
              className="btn primary"
              type="button"
              disabled={disabled}
              onClick={() => act("Start the subscription", () => start())}
            >
              {started ? "Restart" : "Start subscription"}
            </button>
            <button className="btn" type="button" onClick={() => act("FETCH", fetchOne)} disabled={!started || !!failed || auto || disabled}>
              FETCH
            </button>
            <button className="btn" type="button" onClick={() => setAuto(!auto)} disabled={!started || !!failed}>
              {auto ? "Pause" : "Run on its own"}
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={!started || !!failed || disabled}
              onClick={() => {
                setAuto(false);
                void act("Dropped the connection", async () => {
                  await runner.current!.dropConnection();
                  await fetchOne();
                });
              }}
            >
              Drop connection
            </button>
            {failed && !frontier ? (
              <button className="btn" type="button" disabled={disabled} onClick={() => act("Started again with a snapshot", () => start())}>
                Start again with a snapshot
              </button>
            ) : (
              <button
                className="btn"
                type="button"
                disabled={!failed || disabled}
                onClick={() =>
                  act("Resumed from the frontier", async () => {
                    await runner.current!.open({ kind: "resume", frontier: frontier! });
                    await runner.current!.stepUntilUpdates();
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
              disabled={rows.length === 0 || disabled}
              onClick={() => act("Updated a row", () => change(() => local.update(Number(rows[0][0]), Number(rows[0][2]) + 1)), changed)}
            >
              Update a row
            </button>
            <button
              className="btn"
              type="button"
              disabled={rows.length === 0 || disabled}
              onClick={() => act("Deleted a row", () => change(() => local.remove(Number(rows[0][0]))), changed)}
            >
              Delete a row
            </button>
            <button
              className="btn"
              type="button"
              disabled={disabled}
              onClick={() =>
                act(
                  "Inserted a row",
                  () => change(() => local.insert([[FRUITS[Math.floor(Math.random() * FRUITS.length)], 1 + Math.floor(Math.random() * 9)]])),
                  changed,
                )
              }
            >
              Insert a row
            </button>
            <button
              className="btn"
              type="button"
              disabled={disabled}
              onClick={() =>
                act(
                  "Inserted 3 rows in one statement",
                  () => change(() => local.insert([0, 1, 2].map((i) => [FRUITS[(i + 3) % FRUITS.length], i + 1]))),
                  changed,
                )
              }
            >
              Insert 3 rows
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
                  disabled={disabled}
                  className={envelope.kind === env.kind ? "on" : ""}
                  onClick={() => {
                    if (envelope.kind === env.kind) return;
                    setEnvelope(env);
                    if (started) void act(`Restarted in the ${env.kind} envelope`, () => start(env));
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
                  disabled={!runner.current}
                  className={runner.current?.maxRows === n ? "on" : ""}
                  onClick={() => {
                    runner.current!.maxRows = n;
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
              Click <em>Start subscription</em>. Each action is explained here.
            </p>
          )}
        </div>
      </div>

      {failed && (
        <div className="callout warn">
          <strong>The stream ended with an error.</strong>
          <p>
            {frontier ? (
              <>
                Click <em>Resume</em>. The SDK opens a new cursor with <code>SNAPSHOT = false</code> and{" "}
                <Term name="AS OF F − 1" />, so no change arrives twice. The table keeps an hour of history, so the
                resume works for that long.
              </>
            ) : (
              <>No batch was released before the error, so a new snapshot is the only way to start.</>
            )}
          </p>
        </div>
      )}

      <div className="lab" style={{ marginTop: 16 }}>
        <section className="pane">
          <div className="pane-head">
            <h3>Materialize</h3>
            <span className="badge accent">real</span>
          </div>
          <div className="pane-body">
            <div className="small muted">
              <span className="mono">
                {status.object!.database}.{status.object!.schema}.{status.object!.name}
              </span>
              , catalog id <span className="mono">{status.object!.id}</span>
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
                        disabled={disabled}
                        onClick={() => act("Updated a row", () => change(() => local.update(Number(row[0]), Number(row[2]) + 1)), changed)}
                      >
                        qty +1
                      </button>{" "}
                      <button
                        type="button"
                        className="btn small danger"
                        disabled={disabled}
                        onClick={() => act("Deleted a row", () => change(() => local.remove(Number(row[0]))), changed)}
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
              <dt>version</dt>
              <dd className="mono small">{status.version}</dd>
              <dt>server</dt>
              <dd className="mono small" style={{ overflowWrap: "anywhere" }}>
                {status.url}
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
              <div className="empty">{started ? "Nothing yet. Click FETCH." : "Start the subscription."}</div>
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

      <h2>What is different from the simulation</h2>
      <ul>
        <li>
          Materialize's clock runs on its own. A table closes a timestamp about every second, so most{" "}
          <code>FETCH</code>es return one <Term name="progress row" /> and the core releases an empty batch. That empty
          batch still moves the frontier, which is what a durable sink commits.
        </li>
        <li>
          A timed <code>FETCH</code> almost never comes back empty, so the probe without a timeout is rare here.
        </li>
        <li>
          <em>Drop connection</em> closes the real socket under the cursor. The error and its classification come from
          the real failure.
        </li>
      </ul>
    </>
  );
}

function Offline({ reason }: { reason: string }) {
  return (
    <>
      <div className="eyebrow">Your turn · real Materialize</div>
      <h1>Local lab</h1>
      <p className="page-lead">
        The protocol lab against a real Materialize on your laptop. It needs a small local server, so it does not run
        on the hosted site.
      </p>
      <div className="callout warn">
        <strong>No local server found.</strong> <span className="small muted">({reason})</span>
      </div>
      <h2>Run it</h2>
      <p>
        You need Docker, <code>psql</code>, and Node 22 or later. From a clone of the explorer:
      </p>
      <Code
        lang="shell"
        code={`bash demo/setup/start-materialize.sh   # Materialize in Docker on port 26875
npm ci
npm run local                           # then open http://localhost:5173/#/local`}
      />
      <p className="small muted">
        To use another Materialize, set <code>MZ_URL</code>, for example{" "}
        <code>MZ_URL=postgres://user:password@host:6875/materialize npm run local</code>. The lab creates an{" "}
        <code>orders</code> table with an hour of <code>RETAIN HISTORY</code> if it does not exist, and changes its rows.
      </p>
    </>
  );
}
