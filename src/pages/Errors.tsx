import { useState } from "react";
import { Code } from "../components/Code";
import { describeClassification } from "../components/Wire";
import { classify, conformance, type Classification, type Phase } from "../core/sdk";
import { excerpt } from "../lib/source";
import vectors from "../vectors/classify.json";

interface Preset {
  name: string;
  input: { sqlstate: string | null; message: string; phase: Phase };
}

const PRESETS = vectors.cases as Preset[];

const KINDS: Record<string, { label: string; does: string }> = {
  transient: {
    label: "Transient",
    does: "Reconnect and resume from the last commit, with backoff from 1 second to 1 minute, for up to 10 attempts. Then stop.",
  },
  credentials_expired: {
    label: "CredentialsExpired",
    does: "The design reconnects once with fresh credentials from a connection factory, and treats a second refusal as fatal. The prototype has no connection factory yet.",
  },
  canceled: { label: "Canceled", does: "Stop. Retrying a cancel would make a sink impossible to stop." },
  fell_behind: {
    label: "FellBehind",
    does: "Materialize retired the subscribe because the client read too slowly. Resume from the last commit, with backoff.",
  },
  result_too_large: {
    label: "ResultTooLarge",
    does: "Stop, and name the remedies: subscribe to a smaller materialized view, or have an administrator raise max_result_size. A retry repeats the failure.",
  },
  history_lost: {
    label: "HistoryLost",
    does: "Apply the history-loss policy, which stops by default. The design adds policies that take a new snapshot or skip to now. The prototype stops.",
  },
  object_dropped: { label: "ObjectDropped", does: "Stop: the object, or the cluster it ran on, is gone." },
  schema_mismatch: {
    label: "SchemaMismatch",
    does: "Stop. Resuming would mix rows of two shapes in one target.",
  },
  stream_poisoned: {
    label: "StreamPoisoned",
    does: "Stop. A dataflow error repeats until the data or the object changes, so a retry cannot fix it.",
  },
  indexed_target: {
    label: "IndexedTarget",
    does: "Stop, and name the remedy: subscribe from a cluster with no index on the object. An index keeps one second of history by default, whatever the object's RETAIN HISTORY.",
  },
  fatal: { label: "Fatal", does: "Stop. This covers authentication, SQL, and protocol errors." },
};

const CHANGES = ["unchanged", "dropped", "schema_changed", "replaced", "swapped"] as const;

const OUTCOMES: Record<string, string> = {
  replaced:
    "The object was replaced in place (same storage, new catalog id). Check the retention again, then resume, and record the new id in the checkpoint.",
  swapped:
    "The name now points at other storage, as after a blue/green swap. Stop by default. A planned option takes a new snapshot from the new object instead.",
};

export function Errors() {
  const [input, setInput] = useState<Preset["input"]>(PRESETS[12].input);
  const [indexed, setIndexed] = useState(false);
  const [change, setChange] = useState<(typeof CHANGES)[number]>("unchanged");
  let result: Classification | null = null;
  let error: string | null = null;
  try {
    result = classify(input.sqlstate, input.message, input.phase);
  } catch (e) {
    error = String(e);
  }

  let finalKind: string | null = null;
  let outcome: string | null = null;
  if (result?.action === "kind") finalKind = result.kind;
  if (result?.action === "check_index") {
    finalKind = conformance<{ kind: string }>("resolve_index_check", { indexes: indexed ? ["orders_idx"] : [] }).kind;
  }
  if (result?.action === "check_object") {
    const out = conformance<{ outcome: string; kind?: string }>("resolve_object_check", {
      otherwise: result.otherwise,
      change,
    });
    if (out.outcome === "error") finalKind = out.kind ?? null;
    else outcome = out.outcome;
  }

  const code = excerpt("core/src/classify.rs", "pub fn classify(sqlstate", "}", false);

  return (
    <>
      <div className="eyebrow">How it works · live</div>
      <h1>Errors lab</h1>
      <p className="page-lead">
        Materialize reuses error codes: a dataflow error, a result that is too large, and a real internal error all
        arrive as <code>XX000</code>. The SDK classifies every error by its SQLSTATE, its message, and whether it came
        before or after the first progress row. Pick an error, or type your own, and the real classifier answers.
      </p>

      <div className="split">
        <div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>The error</h3>
            <label className="field">
              <span>SQLSTATE (empty for a lost connection, with no server error)</span>
              <input
                type="text"
                value={input.sqlstate ?? ""}
                onChange={(e) => setInput({ ...input, sqlstate: e.target.value.trim() || null })}
              />
            </label>
            <label className="field">
              <span>Message</span>
              <textarea rows={2} value={input.message} onChange={(e) => setInput({ ...input, message: e.target.value })} />
            </label>
            <label className="field">
              <span>When it arrived</span>
              <select value={input.phase} onChange={(e) => setInput({ ...input, phase: e.target.value as Phase })}>
                <option value="starting">starting: before the first progress row</option>
                <option value="streaming">streaming: after the first progress row</option>
              </select>
            </label>
          </div>
          <h3>Real cases from the conformance tests</h3>
          <div className="card" style={{ padding: "6px 14px", maxHeight: 420, overflow: "auto" }}>
            {PRESETS.map((p) => (
              <div className="case-row" key={p.name}>
                <button type="button" className="btn small" onClick={() => setInput(p.input)}>
                  use
                </button>
                <span>
                  <span className="mono small">{p.input.sqlstate ?? "none"}</span> · {p.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="result-box">
            <div className="small muted">The core says</div>
            {error ? (
              <p>{error}</p>
            ) : (
              result && (
                <p className="mono" style={{ margin: "4px 0 0", fontSize: "1.05rem" }}>
                  {describeClassification(result)}
                </p>
              )
            )}
          </div>

          {result?.action === "check_index" && (
            <div className="card" style={{ marginTop: 12 }}>
              <p className="small" style={{ marginTop: 0 }}>
                This error means lost history, unless an index on the subscribing cluster serves the object, which
                rejects the <code>AS OF</code> the same way. The SDK lists the indexes to decide.
              </p>
              <label className="check">
                <input type="checkbox" checked={indexed} onChange={(e) => setIndexed(e.target.checked)} />
                An index on the subscribing cluster serves the object
              </label>
            </div>
          )}

          {result?.action === "check_object" && (
            <div className="card" style={{ marginTop: 12 }}>
              <p className="small" style={{ marginTop: 0 }}>
                This error can come from the object changing. The SDK resolves the name again and compares it with the
                fingerprint in the checkpoint. What did it find?
              </p>
              <div className="segmented" style={{ flexWrap: "wrap" }}>
                {CHANGES.map((c) => (
                  <button key={c} type="button" className={change === c ? "on" : ""} onClick={() => setChange(c)}>
                    {c.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(finalKind || outcome) && (
            <div className="card" style={{ marginTop: 12 }}>
              <div className="small muted">So it is</div>
              <h3 style={{ margin: "2px 0 8px" }}>{finalKind ? KINDS[finalKind]?.label ?? finalKind : outcome}</h3>
              <p className="small" style={{ margin: 0 }}>
                <strong>A durable sink:</strong> {finalKind ? KINDS[finalKind]?.does : OUTCOMES[outcome!]}
              </p>
              <p className="small muted" style={{ marginBottom: 0 }}>
                A live subscription returns the classified error to your code.
              </p>
            </div>
          )}

          <div className="callout" style={{ marginTop: 16 }}>
            <strong>Why the phase matters</strong>
            <p>
              Before the first progress row, an <code>XX000</code> can mean the object changed between the name lookup
              and the subscribe, so the SDK checks the object. After it, the same code is a dataflow error that will
              repeat, so the stream is poisoned.
            </p>
          </div>
        </div>
      </div>

      <h2>Every rule, in one function</h2>
      <p>
        Two errors still need their message text: lost history and a result that is too large. All message matching
        lives here, and each message is pinned by a conformance case, so a changed server message fails a test before
        it reaches a user.
      </p>
      <Code code={code.code} title={code.path} href={code.url} maxHeight={560} />
    </>
  );
}
