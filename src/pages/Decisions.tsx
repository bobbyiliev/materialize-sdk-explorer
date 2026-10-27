import { useState } from "react";
import { DESIGN_DOC_URL, DESIGN_FOLLOWUP_PR } from "../lib/source";

interface Decision {
  title: string;
  chose: string;
  why: string;
  not?: string;
  area: "shape" | "correctness" | "sinks" | "operations";
}

const DECISIONS: Decision[] = [
  {
    area: "shape",
    title: "One protocol core in Rust, with no I/O",
    chose: "Every protocol rule lives in one library that never opens a connection. Each language wraps it with a thin transport over its usual driver.",
    why: "The bugs live in the engine: batching, resume, checkpoints. One engine means one place to fix them, and the same behavior everywhere.",
    not: "A hand-written SDK per language (the early prototypes already drifted), generated types with a hand-written engine (the engine stays duplicated), or SDKs generated from a spec (all the weight on the spec and tests).",
  },
  {
    area: "shape",
    title: "The name: Materialize SDK",
    chose: "One package with modules, starting with subscribe and sink.",
    why: "It leaves room for later features, such as checking a view's retention or a WebSocket transport, without renaming the package after users pin it.",
    not: "“Sink SDK” leaves out live UIs, caches, and agents that read a view with no sink. “Subscribe SDK” is accurate but too narrow. The name is still open, and product owns it.",
  },
  {
    area: "correctness",
    title: "A durable sink reads one table, source, or materialized view",
    chose: "Durable sinks run SUBSCRIBE <object>, the objects CREATE SINK accepts. Live streams, which never resume, accept any query.",
    why: "Only the plain object form skips the snapshot on resume. A query rehydrates its dataflow and re-reads its snapshot every time. It also keeps the move to durable subscriptions a transport change, and the SDK never splices user SQL.",
    not: "Accepting any SQL string. A sink that needs a filter or a join reads a materialized view that computes it.",
  },
  {
    area: "correctness",
    title: "Subscribe by catalog id",
    chose: "The SDK subscribes as SUBSCRIBE [u42 AS db.schema.name], by the id it fingerprinted.",
    why: "A blue/green deploy swaps names and leaves ids alone. By id, the stream keeps reading the object the SDK checked, so the identity check has no race.",
    not: "Subscribing by name. Whether the id form is a supported contract is an open question for the database team.",
  },
  {
    area: "correctness",
    title: "The checkpoint lives in the target, behind a compare-and-set",
    chose: "A checkpoint holds the epoch, generation, frontier, fingerprints, and any snapshot in progress. It encodes to the same text every time, and a sink stores and compares that text without reading it.",
    why: "Writing the data and the checkpoint in one transaction gives exactly-once state. The compare-and-set makes a stale worker's write fail instead of overwriting a newer one.",
  },
  {
    area: "correctness",
    title: "Every start takes the next epoch",
    chose: "A worker's start is a conditional write that raises the epoch. An older worker learns it was fenced from its next failed checkpoint write, and stops.",
    why: "Without the fence, a second copy of a sink overwrites the first one's progress during a deploy or a failover.",
  },
  {
    area: "correctness",
    title: "A required sink_id",
    chose: "Every durable sink names its checkpoint, like a consumer group id.",
    why: "A default, such as a class name, would give two deployments one checkpoint, and they would fence each other.",
  },
  {
    area: "correctness",
    title: "Every change keeps its mz_timestamp",
    chose: "Changes are consolidated per timestamp, never across a batch. A helper gives the net change per key for targets that only want the final state.",
    why: "Targets need the timestamp to order a delete before a re-insert, to make writes safe to repeat, and to build idempotency keys that survive a resume.",
    not: "Stamping every row with the batch's frontier. A batch spans many timestamps.",
  },
  {
    area: "operations",
    title: "Fetch in the background, into a bounded buffer",
    chose: "Fetching is separate from writing. A slow consumer fills the client's buffer, and the SDK fails with a typed error, then resumes from the last commit.",
    why: "Pausing the fetch loop would push the backlog into Materialize until it retires the subscribe. It also keeps a target transaction from staying open while the SDK waits for Materialize.",
  },
  {
    area: "operations",
    title: "commit_interval is time, not progress messages",
    chose: "The least time between two commits that carry no changes. A batch with changes always commits.",
    why: "Progress cadence is not a unit users can reason about.",
  },
  {
    area: "sinks",
    title: "A generation counter in the checkpoint",
    chose: "Each new snapshot raises the generation with a conditional write before it starts. Rows carry it, and a sweep removes older generations when a snapshot completes.",
    why: "A retry can get the same AS OF, and a swapped object can have an older one, so the AS OF cannot name a snapshot.",
  },
  {
    area: "sinks",
    title: "turbopuffer: tombstones, timestamp conditions, and new namespaces per snapshot",
    chose: "A delete writes a tombstone. Every write is conditional on a newer mz_timestamp. A new snapshot goes into new namespaces, and readers switch when it completes.",
    why: "Without transactions, a plain delete lets a replayed or stale upsert bring a key back, and an in-place snapshot lets a stale worker recreate a key that was deleted before it.",
  },
  {
    area: "sinks",
    title: "A duplicate key is rejected, not a crash",
    chose: "Key violation rows are rejected by default and logged without row data. The target keeps the key's previous value.",
    why: "This matches Materialize's own Kafka and Iceberg sinks, and a crash would repeat on every restart.",
  },
  {
    area: "operations",
    title: "Lost history stops by default",
    chose: "The default policy stops. The design adds policies to take a new snapshot, or to skip to now for notification-style consumers.",
    why: "Silently skipping changes is the failure the SDK exists to prevent. A skip is never a default, and is always logged.",
  },
  {
    area: "operations",
    title: "One session per subscription, no pooler",
    chose: "Each subscription holds its own connection for its whole life.",
    why: "Transaction-mode poolers break DECLARE and FETCH, and a session-mode pool gains nothing because the session is never returned.",
  },
  {
    area: "operations",
    title: "All error rules in one function",
    chose: "Errors are classified by SQLSTATE, message, and phase. The two that still need message text are pinned by test cases.",
    why: "The history-loss message has changed once already, which broke a client that matched its text. A nightly end-to-end suite catches the next change before users do.",
  },
];

const ALTERNATIVES = [
  {
    title: "Build only on durable subscriptions",
    why: "The semantics would be simplest, but nothing ships until the server does, and the sink needs its own checkpoint either way. The narrow scope lets the SDK move over later without an API break.",
  },
  {
    title: "Native server-side sinks per target",
    why: "Best for a few high-volume targets, but each target becomes a server feature with its own release train. The SDK serves the long tail, and shows which targets deserve a native sink.",
  },
  {
    title: "Kafka and its connectors",
    why: "Right for teams that run Kafka Connect already. It makes everyone else run Kafka to reach a cache, adds a hop, and loses the link between the target's state and a Materialize timestamp.",
  },
  {
    title: "Better docs only",
    why: "A correct pattern page already exists. Every team still turns it into code again, and gets a different step wrong.",
  },
  {
    title: "Extend the existing Python sink SDK",
    why: "It shares many choices, but it is Python only, subscribes to any SELECT (so a resume re-reads the snapshot), and needs transactional targets. The plan is to converge: the SDK's Python package takes over its transactional sinks.",
  },
];

const OPEN = [
  ["The name", "Is “Materialize SDK” right? Decide before the first publish.", "Product"],
  ["Subscribing by id", "Is SUBSCRIBE [u123 AS name] a supported contract? It makes the identity check race-free.", "Database"],
  ["Object swaps", "A swap stops the sink by default. Can deploy tooling confirm the old and new objects match, so the new snapshot can be skipped?", "Deploy tooling, Database"],
  ["History before durable subscriptions", "Durable mode needs RETAIN HISTORY, which is in private preview. Does it leave preview first, or does durable mode ship only where it is enabled?", "Product, Database"],
  ["turbopuffer visibility", "The guarantee is convergence. Do search users need a consistent view before the sink catches up?", "DevEx"],
  ["turbopuffer tombstones", "Tombstones are kept forever by default. Is the storage cost acceptable, and what grace period should a sweep use?", "DevEx"],
  ["Fencing during one long write", "A fenced worker learns at its next checkpoint write. How should a single long write learn sooner?", "DevEx"],
  ["Schema changes", "A changed output stops the sink. Should added columns be accepted?", "DevEx"],
  ["Repository home", "Should the packages move to their own repository, keeping the core and tests next to the server?", "DevEx"],
  ["Egress cost", "What does a large snapshot cost a customer, and is a sizing guide needed?", "Product"],
];

const ASKS = [
  "Dedicated SQLSTATEs for lost history, dataflow errors, a subscribe that fell behind, and a result over max_result_size.",
  "A final progress row at UP TO, so a bounded stream always closes its last data.",
  "A size check while a replica collects a subscribe batch, as peeks do, so an oversized batch fails before it runs the replica out of memory.",
  "Server-side chunking of the data between two progress rows, so a snapshot larger than max_result_size can be delivered.",
  "Durable subscriptions.",
  "Snapshot elision for a projection and filter, so sinks could accept them later.",
  "Subscribe errors that do not poison the stream, so a sink can dead-letter a bad row.",
  "A stable WebSocket SUBSCRIBE, for browsers and functions.",
  "Upsert key validation for SUBSCRIBE, or inferred keys in the catalog.",
  "RETAIN HISTORY out of private preview, unless durable subscriptions land first.",
];

const AREAS = { all: "All", shape: "Shape", correctness: "Correctness", sinks: "Sinks", operations: "Operations" } as const;

export function Decisions() {
  const [area, setArea] = useState<keyof typeof AREAS>("all");
  return (
    <>
      <div className="eyebrow">Go deeper</div>
      <h1>Design decisions</h1>
      <p className="page-lead">
        The choices that shape the SDK, why they were made, and what was not chosen. The full reasoning is in the{" "}
        <a href={DESIGN_DOC_URL}>design doc</a>, with a <a href={DESIGN_FOLLOWUP_PR}>follow-up</a> that aligns it with
        the prototype.
      </p>

      <div className="segmented" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {(Object.keys(AREAS) as (keyof typeof AREAS)[]).map((a) => (
          <button key={a} type="button" className={area === a ? "on" : ""} onClick={() => setArea(a)}>
            {AREAS[a]}
          </button>
        ))}
      </div>
      <div className="grid two">
        {DECISIONS.filter((d) => area === "all" || d.area === area).map((d) => (
          <div className="card" key={d.title}>
            <span className="badge accent">{AREAS[d.area]}</span>
            <h3 style={{ margin: "8px 0 6px" }}>{d.title}</h3>
            <p className="small" style={{ margin: "0 0 6px" }}>
              {d.chose}
            </p>
            <p className="small" style={{ margin: "0 0 6px" }}>
              <strong>Why:</strong> {d.why}
            </p>
            {d.not && (
              <p className="small muted" style={{ margin: 0 }}>
                <strong>Not chosen:</strong> {d.not}
              </p>
            )}
          </div>
        ))}
      </div>

      <h2>Approaches not taken</h2>
      <div className="grid two">
        {ALTERNATIVES.map((a) => (
          <div className="card" key={a.title}>
            <h3 style={{ marginTop: 0 }}>{a.title}</h3>
            <p className="small" style={{ margin: 0 }}>
              {a.why}
            </p>
          </div>
        ))}
      </div>

      <h2>Open questions</h2>
      <p>None of these blocks the prototype, because the design picks a safe default for each.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Question</th>
              <th>Detail</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {OPEN.map(([q, d, o]) => (
              <tr key={q}>
                <td>
                  <strong>{q}</strong>
                </td>
                <td>{d}</td>
                <td>{o}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What would help on the Materialize side</h2>
      <p>Where correct behavior needs the database, the database change is part of the plan.</p>
      <ol>
        {ASKS.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ol>
    </>
  );
}
