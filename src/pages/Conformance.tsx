import { useMemo, useState } from "react";
import { conformance } from "../core/sdk";
import { githubUrl } from "../lib/source";

interface Case {
  name: string;
  input: unknown;
  expect: unknown;
}

interface Result extends Case {
  actual: unknown;
  pass: boolean;
}

const files = import.meta.glob("../vectors/*.json", { eager: true, import: "default" }) as Record<
  string,
  { function: string; cases: Case[] }
>;

const SUITES = Object.entries(files)
  .map(([path, suite]) => ({ file: path.split("/").pop()!, ...suite }))
  .sort((a, b) => a.file.localeCompare(b.file));

const ABOUT: Record<string, string> = {
  decode: "Turning SUBSCRIBE rows into changes, for both envelopes.",
  batch: "Releasing a batch only when a progress row closes it, and the resume rules.",
  append: "Joining batches that waited for a slow consumer.",
  latest_by_key: "The latest change per key in a batch.",
  subscribe_sql: "The SUBSCRIBE statement, including the AS OF F − 1 arithmetic.",
  fetch_sql: "The FETCH statement and its timeout.",
  subscription: "A whole cursor: DECLARE, FETCH, rows in, events out.",
  classify: "Classifying errors by SQLSTATE, message, and phase.",
  compare_identity: "Telling a replaced object from a swapped or changed one.",
  resolve_object_check: "What an error means once the object has been checked.",
  resolve_index_check: "Lost history, or an index that limits it.",
  checkpoint: "Checkpoint text, take-overs, fencing, and settling lost responses.",
  checkpoint_write: "The writes the SDK hands a sink.",
  catalog: "Catalog queries and their parsing, and fingerprints.",
};

const CONCEPTS: Record<string, string[]> = {
  "Batches and resume": ["decode", "batch", "append", "latest_by_key", "subscription"],
  "SQL statements": ["subscribe_sql", "fetch_sql", "catalog"],
  "Errors": ["classify", "resolve_object_check", "resolve_index_check"],
  "Checkpoints and fencing": ["checkpoint", "checkpoint_write"],
  "Object identity": ["compare_identity"],
};

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => equal(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  return keys.length === Object.keys(bo).length && keys.every((k) => equal(ao[k], bo[k]));
}

function runAll(): { suite: (typeof SUITES)[number]; results: Result[]; ms: number }[] {
  return SUITES.map((suite) => {
    const start = performance.now();
    const results = suite.cases.map((c) => {
      let actual: unknown;
      try {
        actual = conformance(suite.function, c.input);
      } catch (e) {
        actual = { thrown: String(e) };
      }
      return { ...c, actual, pass: equal(actual, c.expect) };
    });
    return { suite, results, ms: performance.now() - start };
  });
}

export function Conformance() {
  const [run, setRun] = useState(0);
  const runs = useMemo(() => runAll(), [run]);
  const [open, setOpen] = useState<string | null>(null);
  const [concept, setConcept] = useState<string>("All");
  const total = runs.reduce((n, r) => n + r.results.length, 0);
  const passed = runs.reduce((n, r) => n + r.results.filter((x) => x.pass).length, 0);
  const ms = runs.reduce((n, r) => n + r.ms, 0);

  return (
    <>
      <div className="eyebrow">Build with it · live</div>
      <h1>Conformance tests</h1>
      <p className="page-lead">
        These JSON files define how every SDK package behaves. The core runs them natively, and the Rust, Python, and
        Node packages run them again through their own bindings. Here they run through the WebAssembly build, the same
        one the Node package ships.
      </p>

      <div className="grid three" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="small muted">Passed</div>
          <div className="stat" style={{ color: passed === total ? "var(--ok)" : "var(--bad)" }}>
            {passed} / {total}
          </div>
        </div>
        <div className="card">
          <div className="small muted">Functions</div>
          <div className="stat">{runs.length}</div>
        </div>
        <div className="card">
          <div className="small muted">Time, in your browser</div>
          <div className="stat">{ms.toFixed(0)} ms</div>
          <button type="button" className="btn small" onClick={() => setRun(run + 1)}>
            Run again
          </button>
        </div>
      </div>

      <p>
        The expected outputs are written by hand from the design, not recorded from the code. A change in behavior
        changes a case, so it is reviewed as data, and every package sees it. Open a case to see its input, what it
        expects, and what the core returned.
      </p>

      <div className="segmented" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {["All", ...Object.keys(CONCEPTS)].map((c) => (
          <button key={c} type="button" className={concept === c ? "on" : ""} onClick={() => setConcept(c)}>
            {c}
          </button>
        ))}
      </div>

      {runs
        .filter(({ suite }) => concept === "All" || CONCEPTS[concept].includes(suite.function))
        .map(({ suite, results }) => {
        const ok = results.filter((r) => r.pass).length;
        return (
          <div className="card" key={suite.file} style={{ marginBottom: 12 }}>
            <div className="event-head" style={{ justifyContent: "space-between" }}>
              <span>
                <strong className="mono">{suite.function}</strong>{" "}
                <span className={`badge ${ok === results.length ? "ok" : "bad"}`}>
                  {ok}/{results.length}
                </span>
              </span>
              <a className="small" href={githubUrl(`conformance/${suite.file}`)} target="_blank" rel="noreferrer">
                {suite.file}
              </a>
            </div>
            <p className="small muted" style={{ margin: "2px 0 6px" }}>
              {ABOUT[suite.function]}
            </p>
            <details>
              <summary className="small">Show the {results.length} cases</summary>
              {results.map((r) => {
                const key = `${suite.file}:${r.name}`;
                return (
                  <div key={key} className="case-row" style={{ display: "block" }}>
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => setOpen(open === key ? null : key)}
                      style={{ marginRight: 8 }}
                    >
                      {open === key ? "hide" : "open"}
                    </button>
                    <span className={`badge ${r.pass ? "ok" : "bad"}`}>{r.pass ? "pass" : "fail"}</span> {r.name}
                    {open === key && (
                      <div className="grid two" style={{ marginTop: 6 }}>
                        <div>
                          <div className="small muted">input</div>
                          <pre className="json">{JSON.stringify(r.input, null, 2)}</pre>
                        </div>
                        <div>
                          <div className="small muted">expected</div>
                          <pre className="json">{JSON.stringify(r.expect, null, 2)}</pre>
                          <div className="small muted">
                            what the core returned{r.pass ? ", the same" : ", different"}
                          </div>
                          <pre className="json">{JSON.stringify(r.actual, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </details>
          </div>
        );
      })}
    </>
  );
}
