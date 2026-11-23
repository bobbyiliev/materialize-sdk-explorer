import { EXPLORER_REPO, SCOPE_UPDATE_PR } from "../lib/source";

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
  "Kill the Valkey example with kill -9 during its snapshot, start it again, and compare the hash with the table.",
  "Insert two rows with the same id while the Valkey example runs. It should remove that key and say why.",
  "Restart the Materialize container while the Valkey example runs. It should reconnect and load a new snapshot.",
  "Swap two schemas, or replace a materialized view, while a live subscription runs.",
  "Use a REFRESH EVERY materialized view as the source, and watch a refresh arrive as one batch.",
  "Give it a snapshot near max_result_size, or a cluster with no replicas.",
  "Read a busy table and stop consuming. The subscription should fail with ConsumerFellBehind, not grow without bound.",
];

const PRODUCT = [
  "Follow the laptop guide from zero. Where did you get stuck, and how long did it take?",
  "Read the Rust app on the overview. Would a customer understand it without the docs?",
  "Are the names clear: LiveSubscription, Subscribe, batch, frontier?",
  "Open the errors lab. Does each error tell you what to do next?",
  "Is a new snapshot after each reconnect fine for live views and small syncs?",
  "Which target should come after Valkey, and which language do customers ask for first?",
  "Is “Materialize SDK” the right name?",
];

const GAPS = [
  "A connection factory for credentials that expire.",
  "Stopping cleanly on a signal, and metrics.",
  "A transport for browsers. The Node package runs over node-postgres.",
  "Packages on crates.io, PyPI, and npm. You build them from the branch.",
];

export function Evaluate() {
  return (
    <>
      <div className="eyebrow">Your turn</div>
      <h1>What we want from you</h1>
      <p className="page-lead">
        This is a beta, and the best time to change it is now. Here is what would help most from each team.
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
        The <a href="#/try">laptop guide</a> gets you a running Materialize and a Valkey sync in a few minutes. Then:
      </p>
      <ul>
        {BREAK_IT.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

      <h2>Known gaps</h2>
      <p>The beta does not have these yet. No need to report them.</p>
      <ul>
        {GAPS.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>

      <h2>How to send feedback</h2>
      <ul>
        <li>Reply in the Slack thread where you found this link. Anything is welcome, small or large.</li>
        <li>
          For the design, comment on the <a href={SCOPE_UPDATE_PR}>scope update</a>.
        </li>
        <li>
          For a problem with this site or the demo scripts, open an issue in <a href={EXPLORER_REPO}>its repository</a>.
        </li>
      </ul>
    </>
  );
}
