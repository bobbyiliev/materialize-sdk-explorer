# Materialize SDK Explorer

An interactive tour of the Materialize SDK preview: how it reads `SUBSCRIBE`,
how durable sinks keep a checkpoint and fence older workers, how errors are
classified, and how to write a sink. It also has a demo you can run on your
laptop.

The SDK is a preview and is not published yet. Its code is on the
[`sdk-preview` branch](https://github.com/bobbyiliev/materialize/tree/sdk-preview/misc/materialize-sdk),
and its design is in the
[design doc](https://github.com/MaterializeInc/materialize/blob/main/doc/developer/design/20260706_materialize_sdk.md).

## What runs in the browser

The labs run the SDK's real protocol core, compiled to WebAssembly from the
`sdk-preview` branch. The core writes every statement, decodes every row,
releases every batch, classifies every error, and makes every checkpoint
decision the pages show. Only Materialize (`src/sim/materialize.ts`) and a
sink's target (`src/sim/durable.ts`) are simulated.

The code the pages quote is copied from the same commit, so the excerpts and
their source links match the core that runs.

## Run the demo on your laptop

See [`demo/README.md`](demo/README.md). It starts Materialize in Docker and
runs a live subscription in Rust, Python, and Node, a Postgres sink, and a
turbopuffer search sink.

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
bash scripts/sync-sdk.sh                    # clones the sdk-preview branch into .sdk/
bash scripts/sync-sdk.sh ../path/to/checkout
```

It rebuilds `src/core/wasm/`, and copies the conformance cases to
`src/vectors/` and the quoted sources to `src/source/`. It needs Rust 1.98.1 or
later with the `wasm32-unknown-unknown` target, and wasm-pack 0.13.1. Commit
the results: the static host builds the site without Rust. Then run
`npm test`, since a changed core can change what the labs show.

## Deploy

Any static host works. On Cloudflare Pages, use the build command
`npm run build`, the output directory `dist`, and set `NODE_VERSION` to `22`.

## License

Apache 2.0, like the SDK.
