import { BatchFlow } from "../components/BatchFlow";
import { Code } from "../components/Code";
import { githubUrl } from "../lib/source";

const CONSOLE = "https://github.com/MaterializeInc/materialize/blob/main/console/src/api/materialize";

const WRITE_LOOP = `import { createCollection } from "@tanstack/db";
import { LiveSubscription, type Update } from "materialize-sdk";

type Row = (string | null)[];
const keyOf = (row: Row) => String(row[0]); // the first column is the key

/** The row each key has after a closed batch, or null once it is deleted. */
function latestPerKey(updates: Update[]): Map<string, Row | null> {
  const latest = new Map<string, { timestamp: bigint; row: Row | null }>();
  for (const update of updates) {
    if (update.op !== "diff") continue;
    const key = keyOf(update.row);
    const seen = latest.get(key);
    if (update.diff > 0n) {
      latest.set(key, { timestamp: update.timestamp, row: update.row });
    } else if (!(seen?.row && seen.timestamp === update.timestamp)) {
      // At one timestamp, the new row can arrive before the old one's retraction.
      latest.set(key, { timestamp: update.timestamp, row: null });
    }
  }
  return new Map([...latest].map(([key, { row }]) => [key, row]));
}

export const orders = createCollection<Row, string>({
  id: "orders",
  getKey: keyOf,
  sync: {
    rowUpdateMode: "full",
    sync: ({ begin, write, commit, markReady }) => {
      const written = new Set<string>();
      const opening = LiveSubscription.open(URL, "SELECT id, status, total FROM orders");
      (async () => {
        for await (const event of await opening) {
          begin();
          for (const [key, row] of latestPerKey(event.updates)) {
            if (row === null) {
              if (written.delete(key)) write({ type: "delete", key });
            } else {
              write({ type: written.has(key) ? "update" : "insert", value: row });
              written.add(key);
            }
          }
          commit();
          if (event.event === "batch" && event.snapshot) markReady();
        }
      })();
      return () => void opening.then((live) => live.close());
    },
  },
});`;

export function TanStackDb() {
  return (
    <>
      <div className="eyebrow">Build with it</div>
      <h1>Feeding a TanStack DB collection</h1>
      <p className="page-lead">
        A sketch of how the SDK's events could keep a TanStack DB collection up to date, and what is still missing to
        do it in a browser. It is a starting point for discussion, not a supported integration.
      </p>
      <div className="callout warn">
        <strong>Sketch</strong>
        <p>The code below has not been built or run. It shows the shape of the write loop.</p>
      </div>

      <h2>Compared with the console today</h2>
      <p>
        The console's <a href={`${CONSOLE}/SubscribeManager.ts`}>SubscribeManager</a> rebuilds the whole keyed set at
        each closed timestamp, and <a href={`${CONSOLE}/subscribeCollection.ts`}>subscribeCollection</a> diffs that set
        against the collection to find the changes. Both steps cost the size of the whole set. With closed batches from
        the SDK, each step costs the size of the batch.
      </p>
      <BatchFlow />

      <h2>One closed batch, one transaction</h2>
      <p>The SDK hands out two kinds of event, and each maps to one collection transaction:</p>
      <dl className="kv" style={{ maxWidth: 760 }}>
        <dt>Snapshot chunk</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>
          Part of the snapshot, released early to bound memory. Write it, but do not call <code>markReady</code> yet.
        </dd>
        <dt>Snapshot batch</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>
          Completes the snapshot. Write it, then call <code>markReady</code>.
        </dd>
        <dt>Later batch</dt>
        <dd style={{ fontFamily: "var(--sans)" }}>
          Every change below a closed timestamp, so one <code>begin</code>/<code>commit</code> never shows half a
          transaction.
        </dd>
      </dl>
      <p>
        The Node package delivers plain diff updates: a row with <code>+1</code> or <code>-1</code>. The write loop
        reduces each batch to one change per key, then writes an <code>insert</code>, <code>update</code>, or{" "}
        <code>delete</code>. It runs where the SDK runs, in a Node process.
      </p>
      <Code code={WRITE_LOOP} lang="typescript" title="orders.ts (sketch, not run)" />
      <p className="small muted">
        A key with more than one row at a timestamp breaks the one-row-per-key assumption. The upsert envelope reports
        that as a key violation, and a UI collection needs a policy for it: drop the key, as the{" "}
        <a href={githubUrl("rust/examples/valkey.rs")}>Valkey example</a> does, or fail the whole collection.
      </p>

      <h2>What a browser still needs</h2>
      <p>
        The Node package runs over <code>pg</code>, and its WebAssembly core is built for Node, so neither loads in a
        browser. The core already has the parts a browser transport would reuse: the statements, the decoder, batching
        with memory limits, and error rules. Missing:
      </p>
      <ul>
        <li>
          A browser build of the core (<code>wasm-pack --target web</code>) and a package without <code>pg</code>.
        </li>
        <li>
          A transport over the WebSocket SQL API. The core drives <code>BEGIN</code>, <code>DECLARE</code>, and{" "}
          <code>FETCH</code> on one session, and whether the WebSocket API keeps that transaction open across messages
          needs checking.
        </li>
        <li>
          A cell format. The decoder reads each cell in its Postgres text format. The WebSocket API sends values as
          JSON, and lists, maps, and records arrive as JSON structures, not text.
        </li>
      </ul>

      <h2>Reconnects</h2>
      <p>
        The beta takes a new snapshot on each reconnect. To avoid an empty UI, a collection can keep its old rows until
        the new snapshot batch arrives, then <code>truncate</code> and write the snapshot in one transaction. That holds
        the snapshot chunks in memory until then.
      </p>
      <p>
        Resuming without a snapshot works for one table, source, or materialized view with <code>RETAIN HISTORY</code>
        , not for a query. A feed defined as a query would move to a materialized view first.
      </p>

      <h2>Open questions</h2>
      <ul>
        <li>Is the target a Node server, which can use the beta as it is, or a browser app?</li>
        <li>Which key violation policy fits a UI collection?</li>
        <li>Is the console's full re-diff a measured cost today, or an expected one?</li>
      </ul>
    </>
  );
}
