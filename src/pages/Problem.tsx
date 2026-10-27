import { Code } from "../components/Code";

const HAZARDS = [
  {
    title: "Batches end at progress rows, not at FETCH boundaries",
    text: "A FETCH returns at most N rows, so one point in time can be split across two FETCHes. Only a progress row proves that every change below its timestamp has arrived. Committing before that commits half a transaction.",
    lab: "Protocol lab, step 3",
  },
  {
    title: "Resume needs AS OF F − 1, not F",
    text: "With SNAPSHOT = false, AS OF t emits changes strictly after t. A consumer that holds everything below frontier F must resume at F − 1. AS OF F skips the changes at F, and anything lower repeats them.",
    lab: "Protocol lab, step 6",
  },
  {
    title: "History expires, even during a short outage",
    text: "RETAIN HISTORY keeps a window behind the object's upper. After an outage the upper catches up and the window moves with it, so a one-hour window can expire during a one-hour outage. Without RETAIN HISTORY, a table keeps about one second.",
    lab: "Durable lab, step 5",
  },
  {
    title: "An index can quietly shorten history",
    text: "If the object has an index on the cluster the subscribe runs on, the read follows the index's history, one second by default, and not the object's RETAIN HISTORY. The resume then fails with the same error as lost history.",
    lab: "Errors lab",
  },
  {
    title: "A query re-reads its whole snapshot on every resume",
    text: "SUBSCRIBE to an object with SNAPSHOT = false never reads the snapshot. Any query, even SELECT * FROM mv, reads the whole snapshot at the AS OF before it emits anything. That is why a durable sink reads one table, source, or materialized view.",
  },
  {
    title: "The stream's shape is easy to assume wrong",
    text: "Changes are ordered by time and then by row bytes, so a retraction does not always come first. One batch spans many timestamps, so 'at most one row per key' holds per timestamp, not per batch. A stream with UP TO can end without a final progress row.",
  },
  {
    title: "An empty FETCH does not mean the stream ended",
    text: "A FETCH with a timeout returns nothing both when the timeout passes and when the stream has ended. Only an empty FETCH without a timeout proves the end.",
    lab: "Protocol lab, step 4",
  },
  {
    title: "The same error code means different things",
    text: "A dataflow error, a result over max_result_size, and a real internal error all arrive as XX000. Lost history is 22000, shared with other data errors. Retrying the wrong one loops forever, and giving up on the wrong one stops a healthy sink.",
    lab: "Errors lab",
  },
  {
    title: "Big snapshots fail on the server",
    text: "A snapshot is one timestamp, so it cannot exceed max_result_size (1 GB by default). The replica builds the whole batch before it checks the size, so a very large one can run the replica out of memory first. Retrying repeats the failure.",
  },
  {
    title: "Two copies of a sink overwrite each other",
    text: "During a deploy or a failover, two workers can run at once. Without fencing, the older one keeps committing and moves the checkpoint back, or writes over the newer one's work.",
    lab: "Durable lab, step 4",
  },
];

export function Problem() {
  return (
    <>
      <div className="eyebrow">Start here</div>
      <h1>Why SUBSCRIBE is hard to read correctly</h1>
      <p className="page-lead">
        <code>SUBSCRIBE</code> streams every change to a query or an object. It is the right building block for caches,
        search indexes, a team's own Postgres, notifications, live UIs, and agents. But reading it correctly takes a
        protocol, and every team writes that protocol again by hand.
      </p>

      <h2>The protocol, in five steps</h2>
      <ol>
        <li>
          Subscribe <code>WITH (PROGRESS, SNAPSHOT = true)</code>.
        </li>
        <li>Buffer changes until a progress row proves their timestamp is closed.</li>
        <li>Apply the closed batch and save its frontier, atomically.</li>
        <li>
          On restart, resume <code>WITH (PROGRESS, SNAPSHOT = false) AS OF frontier − 1</code>.
        </li>
        <li>Keep history readable at the saved frontier, and fail loudly when it is not.</li>
      </ol>
      <p>
        Each step has a failure mode that does not show up in testing. The existing integrations we reviewed each got a
        different step wrong: replaying the full snapshot on every restart, saving the wrong timestamp mid-batch,
        guessing batch boundaries without progress rows, or crashing on a duplicate key. None of them reconnected, and
        none had tests.
      </p>

      <Code
        lang="sql"
        title="what the SDK sends for you"
        code={`BEGIN;
DECLARE c CURSOR FOR SUBSCRIBE ["u42" AS "materialize"."public"."orders"]
  WITH (PROGRESS, SNAPSHOT = false) AS OF 1793110004091;
FETCH 1000 c WITH (TIMEOUT = '1000 milliseconds');
-- ...and the decoding, batching, checkpoints, and retries around it`}
      />

      <h2>Ten things that go wrong</h2>
      <p className="muted">Each was checked against Materialize's code for the design. The labs let you trigger most of them.</p>
      {HAZARDS.map((h, i) => (
        <div className="hazard" key={h.title}>
          <span className="num">{i + 1}</span>
          <div>
            <h3>{h.title}</h3>
            <p>{h.text}</p>
            {h.lab && <span className="badge accent">Try it: {h.lab}</span>}
          </div>
        </div>
      ))}

      <h2>What the SDK promises</h2>
      <div className="callout ok">
        <p>
          With the SDK, you cannot commit an unclosed timestamp, cannot get the <code>AS OF</code> arithmetic wrong, and
          cannot silently lose or duplicate changes across a restart.
        </p>
      </div>
      <p>
        The test of that promise kills a sink at random points. A target that commits data and checkpoint together
        must then hold exactly <code>SELECT ... AS OF F − 1</code>, where <code>F</code> is its committed frontier. A
        target without transactions must hold the same once the sink has caught up.
      </p>
    </>
  );
}
