import { useState } from "react";
import { Code } from "../components/Code";
import { Sequence } from "../components/Sequence";
import { excerpt, githubUrl } from "../lib/source";

interface Layer {
  name: string;
  short: string;
  owns: string[];
  not: string;
  files: Array<[string, string]>;
}

const LAYERS: Layer[] = [
  {
    name: "Your app or your sink",
    short: "a loop over events, or a Sink with load and write",
    owns: [
      "What to do with each batch: render it, cache it, index it, write it.",
      "For a sink: how the target stores rows and a checkpoint, behind one conditional write.",
    ],
    not: "Nothing about progress rows, AS OF, retries, or fencing.",
    files: [
      ["turbopuffer/src/sink.rs", "the turbopuffer sink"],
      ["rust/examples/postgres_sink.rs", "the Postgres sink example"],
    ],
  },
  {
    name: "Durable loop",
    short: "DurableSink: checkpoints, fencing, resume, snapshots, retries",
    owns: [
      "Takes the checkpoint over at start, which fences any older worker.",
      "Starts with a snapshot, or resumes from the checkpoint's frontier.",
      "Writes each batch with its checkpoint, settles lost responses, and retries with backoff.",
      "Checks the object's identity on every reconnect, and sweeps old generations after a snapshot.",
    ],
    not: "It asks the core for every checkpoint and every decision about a failed write.",
    files: [
      ["rust/src/durable.rs", "DurableSink"],
      ["rust/src/sink.rs", "the Sink trait"],
    ],
  },
  {
    name: "Transport, per language",
    short: "tokio-postgres, psycopg, node-postgres",
    owns: [
      "The connection, TLS, and authentication, through the driver people already use.",
      "A background fetch loop with a bounded buffer, so a slow consumer never pushes its backlog into Materialize.",
      "The idiomatic API: a Rust stream, a Python iterator, a Node async iterator.",
    ],
    not: "No protocol rules. It passes the core's SQL to the driver and the driver's rows to the core.",
    files: [
      ["rust/src/live.rs", "Rust LiveSubscription"],
      ["python/materialize_sdk/_live.py", "Python"],
      ["node/ts/live.ts", "Node"],
    ],
  },
  {
    name: "Protocol core",
    short: "Rust, no I/O, compiled into every package",
    owns: [
      "The SQL: SUBSCRIBE by catalog id, DECLARE, FETCH, and the AS OF F − 1 arithmetic, in one function.",
      "Decoding rows, and releasing a batch only when a progress row closes it.",
      "Checkpoints: their exact text, take-overs, commits, snapshots, and why a conditional write failed.",
      "Classifying every error by SQLSTATE, message, and phase.",
    ],
    not: "It never opens a connection. It takes rows in a function call and returns events, SQL, and decisions.",
    files: [
      ["core/src/batch.rs", "batches"],
      ["core/src/checkpoint.rs", "checkpoints"],
      ["core/src/classify.rs", "errors"],
      ["core/src/statement.rs", "SQL"],
    ],
  },
  {
    name: "Materialize",
    short: "SUBSCRIBE ... WITH (PROGRESS)",
    owns: ["Changes, progress rows, history, and errors."],
    not: "No server changes are needed for the prototype. The design lists the ones that would make it better.",
    files: [],
  },
];

export function Architecture() {
  const [selected, setSelected] = useState(3);
  const layer = LAYERS[selected];
  const statement = excerpt("core/src/statement.rs", "pub fn sql(&self, start: Start)", "    }");
  return (
    <>
      <div className="eyebrow">How it works</div>
      <h1>Architecture</h1>
      <p className="page-lead">
        Every rule of the protocol lives in one Rust library with no I/O. Each language wraps it with a thin transport
        over its usual Postgres driver. So Rust, Python, and Node behave the same, because they run the same code.
      </p>

      <div className="split">
        <div>
          <p className="small muted">Click a layer.</p>
          <div className="layers" role="list">
            {LAYERS.map((l, i) => (
              <button
                type="button"
                key={l.name}
                className={`layer ${i === selected ? "on" : ""}`}
                onClick={() => setSelected(i)}
              >
                <span>
                  <strong>{l.name}</strong>
                  <br />
                  <small>{l.short}</small>
                </span>
                <span className="muted">›</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{layer.name}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            It owns:
          </p>
          <ul className="small">
            {layer.owns.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
          <p className="small">
            <strong>What it does not do:</strong> {layer.not}
          </p>
          {layer.files.length > 0 && (
            <p className="small">
              Code:{" "}
              {layer.files.map(([path, label], i) => (
                <span key={path}>
                  {i > 0 && " · "}
                  <a href={githubUrl(path)} target="_blank" rel="noreferrer">
                    {label}
                  </a>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <h2>One FETCH, end to end</h2>
      <Sequence />
      <p>
        Rows cross into the core once per <code>FETCH</code>, not once per row, so the cost of calling into WebAssembly
        from Node, or into native code from Python, stays small. The labs on this site use exactly this path, with the
        core compiled to WebAssembly.
      </p>

      <h2>Why one core, and not one SDK per language</h2>
      <div className="grid two">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Chosen: one core, thin bindings</h3>
          <p className="small">
            Python binds the native build through PyO3. Node uses the WebAssembly build, one package for every platform.
            Rust uses the library directly. Each package keeps its native driver, so TLS, auth, and async stay native.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Not chosen</h3>
          <ul className="small">
            <li>
              <strong>Hand-written per language:</strong> each language gets its own state machine, and the early
              prototypes already drifted apart.
            </li>
            <li>
              <strong>Generated types, hand-written engine:</strong> leaves the engine, where the bugs were, duplicated.
            </li>
            <li>
              <strong>SDKs generated from a spec:</strong> puts all the weight on the spec and the tests, which the
              core needs anyway.
            </li>
          </ul>
        </div>
      </div>

      <h2>The resume arithmetic lives in one place</h2>
      <p>
        The SDK subscribes by catalog id, as <code>[u42 AS db.schema.name]</code>, so a name swapped during a deploy
        cannot switch the stream to another object. The <code>F − 1</code> is computed in exactly one function.
      </p>
      <Code code={statement.code} title={statement.path} href={statement.url} highlight={["resume_as_of", "SNAPSHOT"]} />
    </>
  );
}
