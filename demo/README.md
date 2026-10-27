# Run the Materialize SDK on your laptop

The same apps as the explorer's labs, against a real Materialize in Docker.
The SDK is not published yet, so `setup/get-sdk.sh` checks it out from the
`sdk-preview` branch and you build it here.

## What you need

- Docker (Docker Desktop or OrbStack) and `psql`.
- Rust 1.98.1 or later. Run `rustup update` if yours is older.
- For Python: Python 3.10 or later.
- For Node: Node 22 or later, and wasm-pack
  (`cargo install wasm-pack --version 0.13.1 --locked`).
- For the search sink: a turbopuffer API key. The Postgres sink needs no key.

## 1. Get the SDK and start Materialize

From this folder:

```sh
bash setup/get-sdk.sh
bash setup/start-materialize.sh
export PGOPTIONS="-c client_min_messages=warning"
psql postgres://materialize@localhost:26875/materialize
```

`get-sdk.sh` fetches only the SDK's folder, about 4 MB, into `.sdk/`.
`start-materialize.sh` runs `materialize/materialized:latest` on port 26875 and
turns on `RETAIN HISTORY`, which a durable sink needs to resume.

## 2. A live subscription in Rust

In psql:

```sql
CREATE TABLE orders (id int, item text, qty int) WITH (RETAIN HISTORY = FOR '1h');
INSERT INTO orders VALUES (1, 'apple', 3), (2, 'pear', 5);
```

In a second terminal:

```sh
cd 1-rust-live && cargo run
```

Back in psql, one at a time:

```sql
INSERT INTO orders VALUES (3, 'plum', 1);
UPDATE orders SET qty = 4 WHERE id = 1;
DELETE FROM orders WHERE id = 2;
```

The update arrives as a `-` of the old row and a `+` of the new one, at the
same timestamp.

## 3. Python and Node

```sh
bash setup/build-python.sh
cd 2-python && source .venv/bin/activate && python live.py
```

```sh
bash setup/build-node.sh
cd 3-node && node live.mjs
```

## 4. A durable sink into Postgres

```sh
bash 4-sinks/postgres.sh
```

It starts a Postgres on port 15432 and keeps its `mz_rows` table equal to
`orders`, with each batch and its checkpoint in one transaction. Change
`orders`, then look at the target:

```sh
psql postgres://postgres@localhost:15432/postgres -c "SELECT row, count FROM mz_rows ORDER BY row"
psql postgres://postgres@localhost:15432/postgres -c "SELECT checkpoint FROM mz_checkpoints"
```

Stop the sink with Ctrl+C, change a row, and start it again: it resumes from
its checkpoint without a new snapshot, and the epoch goes up by one. Start a
second copy while the first runs: the first one stops with `Fenced`.

## 5. A search sink into turbopuffer

In psql:

```sql
CREATE TABLE articles (id int, title text, body text) WITH (RETAIN HISTORY = FOR '1h');
INSERT INTO articles VALUES
  (1, 'Cats', 'A cat sleeps on a sunny windowsill.'),
  (2, 'Rain', 'A dog splashes through puddles.'),
  (3, 'Markets', 'Stock markets rose after earnings.');
```

```sh
export TURBOPUFFER_API_KEY=...
bash 4-sinks/turbopuffer.sh sink

# in a second terminal, with the same key
bash 4-sinks/turbopuffer.sh search "a kitten resting in the sun"
```

The cat article comes first, though no word matches. Your namespaces are named
`<your user>-sdk-demo__*`. Delete them in the turbopuffer console when you are
done.

## 6. The SDK's own tests

```sh
cd .sdk/misc/materialize-sdk && cargo test
```

Against your Materialize:

```sh
psql postgres://mz_system@localhost:26877/materialize -c "ALTER SYSTEM SET enable_alter_table_add_column = true"
export MATERIALIZE_URL=postgres://materialize@localhost:26875/materialize
export MATERIALIZE_SYSTEM_URL=postgres://mz_system@localhost:26877/materialize
cargo test -p materialize-sdk --tests -- --ignored --skip before_a_restart --skip after_a_restart
```

## Clean up

```sh
bash setup/stop.sh
```
