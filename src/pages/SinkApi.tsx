import { useState } from "react";
import { Code } from "../components/Code";
import { excerpt } from "../lib/source";

export function SinkApi() {
  const trait = excerpt("rust/src/sink.rs", "pub trait Sink: Send", "}");
  const request = excerpt("rust/src/sink.rs", "pub enum WriteRequest<'a>", "}");
  const turbopuffer = excerpt("turbopuffer/src/sink.rs", "impl Sink for TurbopufferSink", "}", false);
  const postgres = excerpt("rust/examples/postgres_sink.rs", "impl Sink for Postgres", "}", false);
  const setup = excerpt("turbopuffer/examples/search.rs", "let mut sink = TurbopufferSink::new", "durable.run(&materialize, tls)", false);
  const [tab, setTab] = useState<"turbopuffer" | "postgres">("turbopuffer");

  return (
    <>
      <div className="eyebrow">Build with it</div>
      <h1>Writing a sink</h1>
      <p className="page-lead">
        A sink is the code that writes batches to one target. The SDK runs everything else: fetching, snapshots,
        resume, retries, fencing, and history checks. A sink implements one small trait, and has one conditional write
        to get right.
      </p>

      <h2>Make it, wrap it, run it</h2>
      <p>This is all the setup the turbopuffer search example needs:</p>
      <Code code={setup.code} title={setup.path} href={setup.url} highlight={["DurableSink::new", ".setup(", "durable.run"]} />

      <h2>The trait</h2>
      <p>
        <code>load</code> reads the checkpoint, <code>write</code> applies a request. The other methods have defaults.
        A target that cannot store a checkpoint, such as a webhook, implements only <code>sink_type</code> and{" "}
        <code>write</code>, and the SDK keeps its checkpoint in a separate store.
      </p>
      <Code code={trait.code} title={trait.path} href={trait.url} highlight={["fn load", "fn write", "fn sink_type"]} />

      <h2>What the SDK asks a sink to write</h2>
      <p>
        Every write goes through <code>write</code>, so a sink has one conditional checkpoint write to get right. The
        request type cannot express a write with neither a batch nor a checkpoint.
      </p>
      <Code code={request.code} title={request.path} href={request.url} />

      <h2>Two kinds of target</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th />
              <th>Transactional</th>
              <th>Non-transactional</th>
              <th>No checkpoint store</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Example</td>
              <td>Postgres</td>
              <td>turbopuffer, a cache</td>
              <td>a webhook, a queue</td>
            </tr>
            <tr>
              <td>Gets</td>
              <td>
                <code>BatchAndCheckpoint</code>, <code>Checkpoint</code>
              </td>
              <td>
                <code>Batch</code>, then <code>Checkpoint</code>
              </td>
              <td>
                <code>Batch</code> only
              </td>
            </tr>
            <tr>
              <td>Guarantee</td>
              <td>Exactly-once state: the batch and its checkpoint commit together.</td>
              <td>At-least-once delivery. With writes that are safe to repeat, the target still reaches the right state.</td>
              <td>At-least-once delivery, with the checkpoint in a separate store.</td>
            </tr>
            <tr>
              <td>After a crash</td>
              <td>The transaction rolls back, so nothing is half written.</td>
              <td>The last batch may arrive again. Applying it again must change nothing.</td>
              <td>The last batch may arrive again. The receiver deduplicates.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        The <a href="#/durable">durable sink lab</a> shows the first two side by side.
      </p>

      <h2>What a sink must guarantee</h2>
      <ul>
        <li>
          A checkpoint write applies only if the stored checkpoint is still the expected one, and the first only if none
          exists. It returns <em>not applied</em> only when that condition failed, and <em>unknown</em> when the
          response was lost.
        </li>
        <li>
          <code>load</code> returns the latest applied checkpoint, also after a write whose response was lost.
        </li>
        <li>
          A transactional write applies the batch and the checkpoint together or not at all, and its condition sees the
          latest committed checkpoint. A target that cannot do both is non-transactional.
        </li>
        <li>
          Every non-transactional write can apply again, or late. A keyed sink must leave the target as if each change
          applied once and in order.
        </li>
        <li>
          The SDK makes one call at a time, and drops a call that runs past its timeout. A dropped call must leave
          nothing the next call can see, such as an open transaction.
        </li>
        <li>
          <code>sweep_generations</code> deletes what older generations wrote, and is safe to run again.
        </li>
      </ul>

      <h2>Two real sinks</h2>
      <div className="tabs">
        <button type="button" className={tab === "turbopuffer" ? "on" : ""} onClick={() => setTab("turbopuffer")}>
          turbopuffer (no transactions)
        </button>
        <button type="button" className={tab === "postgres" ? "on" : ""} onClick={() => setTab("postgres")}>
          Postgres (transactional)
        </button>
      </div>
      {tab === "turbopuffer" ? (
        <>
          <Code code={turbopuffer.code} title={turbopuffer.path} href={turbopuffer.url} />
          <h3>How it stays correct without transactions</h3>
          <ul>
            <li>
              <strong>Tombstones, not deletes.</strong> A delete writes the key with <code>deleted = true</code> and its{" "}
              <code>mz_timestamp</code>. A plain delete would let a replayed older upsert bring the key back.
            </li>
            <li>
              <strong>Every write is conditional on a newer timestamp.</strong> A replayed or stale write meets a newer
              document or tombstone and is skipped. So each namespace reaches the right state under at-least-once
              delivery.
            </li>
            <li>
              <strong>The checkpoint has its own namespace</strong>, as one document. Every patch is conditional on a{" "}
              <code>revision</code> field, so it is a compare-and-set on the whole document.
            </li>
            <li>
              <strong>A new snapshot goes into new namespaces</strong> (an incarnation, such as{" "}
              <code>articles__i3</code>), and readers switch when it completes. Rewriting in place would let a stale
              worker recreate a key deleted before the snapshot.
            </li>
            <li>
              <strong>The guarantee is convergence.</strong> Once the sink has caught up past every write any worker
              made, every namespace equals the table at the committed frontier. Before that, a reader can see part of a
              batch.
            </li>
            <li>
              <strong>Embedding is turbopuffer's.</strong> The sink names a hosted model, so neither the sink nor
              Materialize runs embedding code. A rate limit counts as throttling, not as a failure, so a long snapshot
              does not stall.
            </li>
          </ul>
        </>
      ) : (
        <>
          <Code code={postgres.code} title={postgres.path} href={postgres.url} maxHeight={560} />
          <p>
            Each batch and the checkpoint commit in one Postgres transaction. Once the first snapshot completes, the
            target always equals the object at the committed frontier, and a restart resumes from there. The design
            plans a full Postgres reference sink after the prototype, because it is the sink that proves the
            transactional path.
          </p>
        </>
      )}
    </>
  );
}
