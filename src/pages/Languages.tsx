import { useState } from "react";
import rustLive from "../../demo/1-rust-live/src/main.rs?raw";
import pythonLive from "../../demo/2-python/live.py?raw";
import nodeLive from "../../demo/3-node/live.mjs?raw";
import { Code } from "../components/Code";
import { githubUrl } from "../lib/source";

const LANGS = {
  rust: {
    label: "Rust",
    code: rustLive,
    lang: "rust" as const,
    file: "demo/1-rust-live/src/main.rs",
    driver: "tokio-postgres",
    binding: "Uses the core directly.",
    shape: "An async next() that returns events: Event::Batch or Event::SnapshotChunk.",
    run: "cd demo/1-rust-live && cargo run",
  },
  python: {
    label: "Python",
    code: pythonLive,
    lang: "python" as const,
    file: "demo/2-python/live.py",
    driver: "psycopg",
    binding: "Binds the native core through PyO3, as one abi3 wheel per platform.",
    shape: "A context manager and an iterator of dict events.",
    run: "cd demo/2-python && source .venv/bin/activate && python live.py",
  },
  node: {
    label: "Node",
    code: nodeLive,
    lang: "javascript" as const,
    file: "demo/3-node/live.mjs",
    driver: "node-postgres",
    binding: "Runs the core as WebAssembly, so one package works on every platform.",
    shape: "An async iterator. Timestamps and diffs are BigInt, so they never lose precision.",
    run: "cd demo/3-node && node live.mjs",
  },
};

type Lang = keyof typeof LANGS;

export function Languages() {
  const [lang, setLang] = useState<Lang>("rust");
  const l = LANGS[lang];
  return (
    <>
      <div className="eyebrow">Build with it</div>
      <h1>Rust, Python, Node</h1>
      <p className="page-lead">
        One app, three languages. Each package is a thin layer over the same protocol core, on the Postgres driver
        people already use. Rust is the first package, and Python and Node follow it.
      </p>

      <div className="tabs">
        {(Object.keys(LANGS) as Lang[]).map((k) => (
          <button key={k} type="button" className={lang === k ? "on" : ""} onClick={() => setLang(k)}>
            {LANGS[k].label}
          </button>
        ))}
      </div>
      <Code code={l.code} lang={l.lang} title={l.file} />
      <dl className="kv" style={{ maxWidth: 760 }}>
        <dt>Driver</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>{l.driver}</dd>
        <dt>Core</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>{l.binding}</dd>
        <dt>Shape</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>{l.shape}</dd>
        <dt>Run it</dt>
        <dd>{l.run}</dd>
      </dl>
      <p className="small muted">
        The <a href="#/try">laptop guide</a> sets up Materialize and builds each package.
      </p>

      <h2>How three languages stay the same</h2>
      <div className="grid three">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>One core</h3>
          <p className="small">
            Decoding, batching, checkpoints, SQL, and error rules exist once, in Rust. A binding only passes strings in
            and out: the core's calls take and return the same JSON the test cases use.
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Shared test cases</h3>
          <p className="small">
            241 cases in JSON, written by hand from the design. The core runs them natively, and each package runs them
            again through its own binding. <a href="#/conformance">Run them here.</a>
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Generated types</h3>
          <p className="small">
            The core derives a JSON Schema for each value it hands out, and a generator writes the Python and TypeScript
            types from them. <code>cargo test</code> fails while a generated file is stale.
          </p>
        </div>
      </div>

      <h2>What each package writes by hand</h2>
      <p>
        Only the transport over its driver, the idiomatic API (iterators in Python, async iterators in Node), and its
        sinks. Compare the three transports:
      </p>
      <ul>
        <li>
          <a href={githubUrl("rust/src/live.rs")}>rust/src/live.rs</a>
        </li>
        <li>
          <a href={githubUrl("python/materialize_sdk/_live.py")}>python/materialize_sdk/_live.py</a>
        </li>
        <li>
          <a href={githubUrl("node/ts/live.ts")}>node/ts/live.ts</a>
        </li>
      </ul>

      <h2>The cost of one core</h2>
      <p>
        A Python wheel per platform, Rust stack traces in Python bug reports, and a Rust toolchain for a source build
        where no wheel exists. The fallback, if native packaging costs too much, is generated types with a hand-written
        engine per language, checked by the same test cases.
      </p>
    </>
  );
}
