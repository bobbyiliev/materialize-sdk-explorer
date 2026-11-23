import { Code } from "../components/Code";

export function ParkedTryIt() {
  return (
    <>
      <h1>Run the sinks on your laptop</h1>
      <p className="page-lead">
        The durable sinks from the full stack, against the Materialize from{" "}
        <a href="#/try">Run it on your laptop</a>. Do steps 1 and 2 there first.
      </p>

      <h2>1. Get the full stack</h2>
      <Code lang="shell" code={`bash setup/get-sdk.sh parked`} />
      <p className="small muted">
        It checks out the frozen full stack into <code>demo/.sdk-parked</code>, next to the beta in{" "}
        <code>demo/.sdk</code>.
      </p>

      <h2>2. Give orders a history</h2>
      <p>
        A durable sink resumes from its checkpoint, so the table's history must outlast the time it is stopped.{" "}
        <code>start-materialize.sh</code> already turned on <code>RETAIN HISTORY</code>. In psql:
      </p>
      <Code lang="sql" code={`ALTER TABLE orders SET (RETAIN HISTORY FOR '1h');`} />

      <h2>3. A durable sink into Postgres</h2>
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

      <h2>4. A search sink into turbopuffer</h2>
      <p>This one needs a turbopuffer API key.</p>
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
    </>
  );
}
