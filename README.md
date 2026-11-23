# Materialize SDK Explorer

An interactive tour of the Materialize SDK beta: how it reads `SUBSCRIBE` for
live views and small syncs, and how errors are classified. It also has a demo
you can run on your laptop.

The SDK is a beta and is not published yet. Its code is on the
[`sdk-beta` branch](https://github.com/bobbyiliev/materialize/tree/sdk-beta/misc/materialize-sdk),
and its design is in the
[design doc](https://github.com/MaterializeInc/materialize/blob/main/doc/developer/design/20260706_materialize_sdk.md),
narrowed to the beta by
[the scope update](https://github.com/MaterializeInc/materialize/pull/40806).

The sinks, checkpoints, and durable mode are parked. Their pages stay under
*Parked* in the menu, and run the full stack frozen at the
[`sdk-full/40-docs-ci` branch](https://github.com/bobbyiliev/materialize/tree/sdk-full/40-docs-ci/misc/materialize-sdk).

## What runs in the browser

The labs run the SDK's real protocol core, compiled to WebAssembly from the
`sdk-beta` branch. The core writes every statement, decodes every row, releases
every batch, and classifies every error the pages show. Only Materialize
(`src/sim/materialize.ts`) is simulated. The parked pages run the full stack's
core, which makes every checkpoint decision, against a simulated sink target
(`src/sim/durable.ts`).

The code the pages quote is copied from the same commit, so the excerpts and
their source links match the core that runs.

## Run the demo on your laptop

See [`demo/README.md`](demo/README.md). It starts Materialize in Docker and
runs a live subscription in Rust, Python, and Node, and the Valkey example. The
parked Postgres and turbopuffer sinks still run on the full stack.

## Run the lab against a real Materialize

The Local lab page (`#/local`) is the protocol lab with a real Materialize in
place of the simulation. The core still runs in the browser. A small server in
the Vite dev server (`local/bridge.ts`) passes its statements to Materialize.

```sh
bash demo/setup/start-materialize.sh   # Materialize in Docker on port 26875
npm ci
npm run local                           # then open http://localhost:5173/#/local
npm run test:local                      # in another terminal: the lab against it
```

Set `MZ_URL` to use another Materialize. The page creates an `orders` table
with an hour of `RETAIN HISTORY` if it does not exist, and changes its rows.
On the hosted site, the page only shows these steps.

## Develop the site

Needs Node 22 or later.

```sh
npm ci
npm run dev     # http://localhost:5173
npm test        # every conformance case, and the labs' scenarios
npm run build   # the static site, in dist/
```

## Update to a newer SDK

```sh
bash scripts/sync-sdk.sh                            # clones both branches into .sdk/
bash scripts/sync-sdk.sh ../beta/checkout ../full/checkout
```

It rebuilds `src/core/wasm/` from `sdk-beta`, and copies the conformance cases
to `src/vectors/` and the quoted sources to `src/source/`. It does the same for
the parked pages from `sdk-full/40-docs-ci`, into `src/core/wasm-parked/`,
`src/vectors-parked/` (only the vectors the beta lacks), and
`src/source-parked/`. It needs Rust 1.98.1 or
later with the `wasm32-unknown-unknown` target, and wasm-pack 0.13.1. Commit
the results: the static host builds the site without Rust. Then run
`npm test`, since a changed core can change what the labs show.

## Deploy

Any static host works. On Cloudflare Pages, use the build command
`npm run build`, the output directory `dist`, and set `NODE_VERSION` to `22`.

## License

Apache 2.0, like the SDK.
