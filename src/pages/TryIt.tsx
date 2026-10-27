import { Code } from "../components/Code";
import { BRANCH_URL, EXPLORER_REPO } from "../lib/source";

export function TryIt() {
  return (
    <>
      <div className="eyebrow">Your turn</div>
      <h1>Run it on your laptop</h1>
      <p className="page-lead">
        The same apps as the labs, against a real Materialize in Docker. About 15 minutes for the Rust part. The
        packages are not published yet, so a script checks the SDK out from the branch and you build it.
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
        <li>For the search sink: a turbopuffer API key. The Postgres sink needs no key.</li>
      </ul>

      <h2>1. Get the demo and the SDK</h2>
      <Code
        lang="shell"
        code={`git clone ${EXPLORER_REPO}.git
cd materialize-sdk-explorer/demo
bash setup/get-sdk.sh`}
      />
      <p className="small muted">
        <code>get-sdk.sh</code> fetches only the SDK's folder from the <a href={BRANCH_URL}>sdk-preview branch</a>, about
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
        It runs <code>materialize/materialized:latest</code> on port 26875, and turns on <code>RETAIN HISTORY</code>,
        which a durable sink needs to resume.
      </p>

      <h2>3. A live subscription in Rust</h2>
      <p>In psql:</p>
      <Code
        lang="sql"
        code={`CREATE TABLE orders (id int, item text, qty int) WITH (RETAIN HISTORY = FOR '1h');
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

      <h2>5. A durable sink into Postgres</h2>
      <p>No key needed. It keeps a Postgres table equal to <code>orders</code>, with each batch and its checkpoint in one transaction.</p>
      <Code lang="shell" code={`bash 4-sinks/postgres.sh`} />
      <p>In another terminal, change <code>orders</code> in psql, then look at the target:</p>
      <Code
        lang="shell"
        code={`psql postgres://postgres@localhost:15432/postgres -c "SELECT row, count FROM mz_rows ORDER BY row"
psql postgres://postgres@localhost:15432/postgres -c "SELECT checkpoint FROM mz_checkpoints"`}
      />
      <p>
        Stop the sink with Ctrl+C, change a row, and start it again. It resumes from its checkpoint without a new
        snapshot, and the epoch goes up by one. Start a second copy while the first runs: the first one stops with{" "}
        <code>Fenced</code>.
      </p>

      <h2>6. A search sink into turbopuffer</h2>
      <Code
        lang="sql"
        code={`CREATE TABLE articles (id int, title text, body text) WITH (RETAIN HISTORY = FOR '1h');
INSERT INTO articles VALUES
  (1, 'Cats', 'A cat sleeps on a sunny windowsill.'),
  (2, 'Rain', 'A dog splashes through puddles.'),
  (3, 'Markets', 'Stock markets rose after earnings.');`}
      />
      <Code
        lang="shell"
        code={`export TURBOPUFFER_API_KEY=...
bash 4-sinks/turbopuffer.sh sink

# in a second terminal, with the same key
bash 4-sinks/turbopuffer.sh search "a kitten resting in the sun"`}
      />
      <p>
        The cat article comes first, though no word matches. Update or delete a row and search again. Stop the sink,
        change a row, and start it again: it resumes without embedding everything again. Your namespaces are named{" "}
        <code>&lt;your user&gt;-sdk-demo__*</code>. Delete them in the turbopuffer console when you are done.
      </p>

      <h2>7. Run the SDK's own tests</h2>
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

      <h2>8. Clean up</h2>
      <Code lang="shell" code={`bash setup/stop.sh`} />

      <div className="callout">
        <strong>Want to change the SDK itself?</strong>
        <p>
          Work in a full checkout of the <a href={BRANCH_URL}>sdk-preview branch</a>. Its{" "}
          <code>misc/materialize-sdk/README.md</code> explains the layout and the tests.
        </p>
      </div>
    </>
  );
}
