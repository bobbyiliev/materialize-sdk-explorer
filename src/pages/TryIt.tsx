import { Code } from "../components/Code";
import { BRANCH_URL, EXPLORER_REPO, excerpt } from "../lib/source";

export function TryIt() {
  const sync = excerpt("rust/examples/valkey.rs", "async fn sync(", "}");
  const valkeyCode = { code: sync.code, title: sync.path, href: sync.url, maxHeight: 420 };
  return (
    <>
      <div className="eyebrow">Your turn</div>
      <h1>Run it on your laptop</h1>
      <p className="page-lead">
        The same apps as the labs, against a real Materialize in Docker. About 15 minutes for the Rust part. The
        packages are not published yet, so a script checks the SDK out from the branch and you build it.
      </p>
      <p className="small muted">
        To see the protocol lab itself against a real Materialize, without building the SDK, see the{" "}
        <a href="#/local">Local lab</a>.
      </p>

      <h2>What you need</h2>
      <ul>
        <li>Docker (Docker Desktop or OrbStack) and <code>psql</code>.</li>
        <li>
          Rust 1.98.1 or later. Run <code>rustup update</code> if yours is older.
        </li>
        <li>For Python: Python 3.10 or later.</li>
        <li>
          For Node: Node 22 or later, and wasm-pack (<code>cargo install wasm-pack --version 0.13.1 --locked</code>).
        </li>
      </ul>

      <h2>1. Get the demo and the SDK</h2>
      <Code
        lang="shell"
        code={`git clone ${EXPLORER_REPO}.git
cd materialize-sdk-explorer/demo
bash setup/get-sdk.sh`}
      />
      <p className="small muted">
        <code>get-sdk.sh</code> fetches only the SDK's folder from the <a href={BRANCH_URL}>sdk-beta branch</a>, about
        4 MB, into <code>demo/.sdk</code>.
      </p>

      <h2>2. Start Materialize</h2>
      <Code
        lang="shell"
        code={`bash setup/start-materialize.sh
export PGOPTIONS="-c client_min_messages=warning"
psql postgres://materialize@localhost:26875/materialize`}
      />
      <p className="small muted">
        It runs <code>materialize/materialized:latest</code> on port 26875.
      </p>

      <h2>3. A live subscription in Rust</h2>
      <p>In psql:</p>
      <Code
        lang="sql"
        code={`CREATE TABLE orders (id int, item text, qty int);
INSERT INTO orders VALUES (1, 'apple', 3), (2, 'pear', 5);`}
      />
      <p>In a second terminal:</p>
      <Code lang="shell" code={`cd demo/1-rust-live && cargo run`} />
      <p>Back in psql, one at a time, and watch the app:</p>
      <Code
        lang="sql"
        code={`INSERT INTO orders VALUES (3, 'plum', 1);
UPDATE orders SET qty = 4 WHERE id = 1;
DELETE FROM orders WHERE id = 2;`}
      />
      <p>
        The update arrives as a <code>-</code> of the old row and a <code>+</code> of the new one, at the same timestamp.
      </p>

      <h2>4. The same in Python and Node</h2>
      <Code
        lang="shell"
        title="python"
        code={`bash setup/build-python.sh
cd 2-python && source .venv/bin/activate && python live.py`}
      />
      <Code
        lang="shell"
        title="node"
        code={`bash setup/build-node.sh
cd 3-node && node live.mjs`}
      />

      <h2>5. Keep a Valkey hash in step with orders</h2>
      <p>
        No key needed. The SDK's Valkey example keeps the hash <code>orders</code> equal to the table, keyed by{" "}
        <code>id</code>:
      </p>
      <Code lang="shell" code={`bash 5-valkey/valkey.sh`} />
      <p>In another terminal, change <code>orders</code> in psql, then look at the hash:</p>
      <Code lang="shell" code={`docker exec valkey-sdk-demo valkey-cli HGETALL orders`} />
      <p>
        Each batch is applied in one <code>MULTI</code>, so a reader sees all of a timestamp's changes or none. Stop it
        with Ctrl+C, change a row, and start it again. It loads a new snapshot into <code>orders:loading</code> and
        swaps it in with one <code>RENAME</code>, so readers keep the old contents until the new ones are complete.
      </p>
      <p>One connection of the example, from the snapshot to each later batch:</p>
      <Code {...valkeyCode} />

      <h2>6. Run the SDK's own tests</h2>
      <p>Everything that needs no server:</p>
      <Code lang="shell" code={`cd .sdk/misc/materialize-sdk && cargo test`} />
      <p>The Rust tests against your Materialize:</p>
      <Code
        lang="shell"
        code={`psql postgres://mz_system@localhost:26877/materialize -c "ALTER SYSTEM SET enable_alter_table_add_column = true"
export MATERIALIZE_URL=postgres://materialize@localhost:26875/materialize
export MATERIALIZE_SYSTEM_URL=postgres://mz_system@localhost:26877/materialize
cargo test -p materialize-sdk --tests -- --ignored --skip before_a_restart --skip after_a_restart`}
      />

      <h2>7. Clean up</h2>
      <Code lang="shell" code={`bash setup/stop.sh`} />

      <p className="small muted">
        The durable sinks into Postgres and turbopuffer are parked. They still run on the full stack: see{" "}
        <a href="#/try-sinks">Run the sinks on your laptop</a>.
      </p>

      <div className="callout">
        <strong>Want to change the SDK itself?</strong>
        <p>
          Work in a full checkout of the <a href={BRANCH_URL}>sdk-beta branch</a>. Its{" "}
          <code>misc/materialize-sdk/README.md</code> explains the layout and the tests.
        </p>
      </div>
    </>
  );
}
