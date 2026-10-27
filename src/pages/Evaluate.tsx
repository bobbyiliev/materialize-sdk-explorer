import { DESIGN_FOLLOWUP_PR, EXPLORER_REPO } from "../lib/source";

const RELIED_ON = [
  "The first progress row of a cursor is at its AS OF, before any data.",
  "A snapshot's rows are all at the AS OF, and a snapshot is one timestamp.",
  "Every change below a progress row's timestamp arrives before that progress row.",
  "With SNAPSHOT = false, AS OF t emits only changes after t.",
  "SUBSCRIBE [u123 AS db.schema.name] resolves by id, and fails once the id is gone.",
  "An empty timed FETCH can mean a timeout or the end. An empty FETCH without a timeout means the end.",
  "A stream with UP TO can end without a final progress row.",
  "An index on the subscribing cluster limits the readable history to the index's, one second by default.",
  "Lost history is 22000 with “could not find a valid timestamp for the query”.",
  "During a subscribe, 53200 means the client fell behind, and a result over max_result_size is XX000 with “result exceeds max size”.",
  "A changed output fails the first FETCH with 0A000 “cached plan must not change result type”.",
  "A replacement materialized view keeps its storage shard and gets a new catalog id.",
];

const BREAK_IT = [
  "Kill the Postgres sink with kill -9 in the middle of a batch, restart it, and compare mz_rows with SELECT ... AS OF F − 1 at its frontier.",
  "Run two copies of a sink with one sink_id. Exactly one should keep running.",
  "Lower the table's RETAIN HISTORY while the sink is stopped, then start it.",
  "Create an index on the table in the subscribing cluster, then restart the sink.",
  "Swap two schemas, or replace a materialized view, while the sink runs and while it is stopped.",
  "Use a REFRESH EVERY materialized view as the source, and stop the sink across a refresh.",
  "Give it a snapshot near max_result_size, or a cluster with no replicas.",
  "Restart the Materialize container while a sink is streaming.",
];

const PRODUCT = [
  "Follow the laptop guide from zero. Where did you get stuck, and how long did it take?",
  "Read the Rust app on the overview. Would a customer understand it without the docs?",
  "Are the names clear: LiveSubscription, DurableSink, Sink, sink_id, epoch, generation, frontier?",
  "Open the errors lab. Does each error tell you what to do next?",
  "Which target should come after turbopuffer, and which language do customers ask for first?",
  "The durable mode needs RETAIN HISTORY, which is in private preview. Is that acceptable for a first release?",
  "turbopuffer readers can see part of a batch until the sink catches up. Is that fine for search?",
  "Is “Materialize SDK” the right name?",
];

const GAPS = [
  "Multi-view subscriptions, with one consistent timestamp across several views.",
  "The skip and dead-letter delivery policies, and the history-loss policies. The prototype stops.",
  "A connection factory for credentials that expire.",
  "Stopping cleanly on a signal, and metrics.",
  "The startup checks for an index on the subscribing cluster and for enough retention.",
  "Idempotency keys for event targets such as webhooks.",
  "In the turbopuffer sink: continuing a crashed snapshot, writing changes during a snapshot, and deleting retired namespaces.",
];

export function Evaluate() {
  return (
    <>
      <div className="eyebrow">Your turn</div>
      <h1>What we want from you</h1>
      <p className="page-lead">
        This is a preview, and the best time to change it is now. Here is what would help most from each team.
      </p>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card">
          <span className="badge accent">Product</span>
          <h2 style={{ marginTop: 8 }}>Try the experience</h2>
          <ol>
            {PRODUCT.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
        <div className="card">
          <span className="badge accent">Database team</span>
          <h2 style={{ marginTop: 8 }}>Check what it relies on</h2>
          <p className="small muted">
            The SDK depends on these server behaviors. Which ones are not true, not promised, or likely to change?
          </p>
          <ol className="small">
            {RELIED_ON.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </div>
      </div>

      <h2>Try to break it</h2>
      <p>
        The <a href="#/try">laptop guide</a> gets you a running Materialize and a Postgres sink in a few minutes. Then:
      </p>
      <ul>
        {BREAK_IT.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <h2>Known gaps</h2>
      <p>The design covers these, and the prototype does not have them yet. No need to report them.</p>
      <ul>
        {GAPS.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>

      <h2>How to send feedback</h2>
      <ul>
        <li>Reply in the Slack thread where you found this link. Anything is welcome, small or large.</li>
        <li>
          For the design, comment on the <a href={DESIGN_FOLLOWUP_PR}>design doc follow-up</a>.
        </li>
        <li>
          For a problem with this site or the demo scripts, open an issue in <a href={EXPLORER_REPO}>its repository</a>.
        </li>
      </ul>
    </>
  );
}
