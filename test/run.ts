// Checks that the site's simulation and the synced core agree: every
// conformance case passes through the WebAssembly build, and the labs'
// scenarios end as the SDK's design says they must.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { initSync } from "../src/core/wasm/sdk_core.js";
import { conformance, type SdkEvent } from "../src/core/sdk";
import { DurableWorker, SimTarget, setup } from "../src/sim/durable";
import { LiveRunner } from "../src/sim/live";
import { SimMaterialize } from "../src/sim/materialize";

const root = process.env.ROOT!;
initSync({ module: readFileSync(join(root, "src/core/wasm/sdk_core_bg.wasm")) });

function test(name: string, f: () => void) {
  f();
  console.log(`ok - ${name}`);
}

const batches = (events: SdkEvent[]) => events.filter((e) => e.event === "batch");

test("every conformance case passes through the WebAssembly build", () => {
  let n = 0;
  for (const file of readdirSync(join(root, "src/vectors"))) {
    const suite = JSON.parse(readFileSync(join(root, "src/vectors", file), "utf8"));
    for (const c of suite.cases) {
      assert.deepEqual(conformance(suite.function, c.input), c.expect, `${file}: ${c.name}`);
      n++;
    }
  }
  assert.equal(n, 241);
});

test("a live subscription gets a snapshot, then an update as − and + at one timestamp", () => {
  const server = new SimMaterialize([["apple", 3], ["pear", 5]]);
  const live = new LiveRunner(server, { kind: "diff" });
  live.open();
  const [snapshot] = batches(live.step());
  assert.ok(snapshot.event === "batch" && snapshot.snapshot && snapshot.updates.length === 2);
  server.update("1", 4);
  const [update] = batches(live.step());
  assert.ok(update.event === "batch");
  assert.deepEqual(update.updates.map((u) => (u.op === "diff" ? u.diff : u.op)), ["-1", "1"]);
  assert.equal(new Set(update.updates.map((u) => u.timestamp)).size, 1);
});

test("a FETCH without a progress row releases nothing", () => {
  const server = new SimMaterialize();
  const live = new LiveRunner(server, { kind: "diff" }, 2);
  live.open();
  live.step();
  server.insertMany([["a", 1], ["b", 2], ["c", 3]]);
  assert.equal(batches(live.step()).length, 0);
  const [batch] = batches(live.step());
  assert.ok(batch.event === "batch" && batch.updates.length === 3);
});

test("a resume after a dropped connection repeats nothing and misses nothing", () => {
  const server = new SimMaterialize([["apple", 3]]);
  const live = new LiveRunner(server, { kind: "diff" });
  live.open();
  live.step();
  live.injectFailure(null, "connection closed");
  live.step();
  assert.deepEqual(live.state.failed, { action: "kind", kind: "transient" });
  server.insert("plum", 1);
  live.open({ kind: "resume", frontier: live.state.frontier! });
  const updates = batches(live.step()).flatMap((b) => (b.event === "batch" ? b.updates : []));
  assert.deepEqual(updates.map((u) => (u.op === "diff" ? u.row[1] : null)), ["plum"]);
});

test("a resume below the readable history is lost history", () => {
  const server = new SimMaterialize([["apple", 3]]);
  const live = new LiveRunner(server, { kind: "diff" });
  live.open();
  live.step();
  server.retainHistory = false;
  server.tick(5000n);
  live.open({ kind: "resume", frontier: live.state.frontier! });
  assert.deepEqual(live.state.failed, { action: "check_index" });
});

for (const kind of ["non_transactional", "transactional"] as const) {
  test(`${kind}: a crash between batch and checkpoint, a take-over, and a fence leave the target right`, () => {
    const server = new SimMaterialize([["apple", 3], ["pear", 5]]);
    const target = new SimTarget(kind);
    setup(target);
    const workers: DurableWorker[] = [];
    const start = (name: string) => {
      const w = new DurableWorker(name, server, target);
      workers.push(w);
      w.step();
      return w;
    };
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        server.tick();
        for (const w of workers) if (w.running) w.step();
      }
    };
    const a = start("A");
    tick(2);
    a.crashBeforeCheckpoint = true;
    server.update("1", 9);
    tick();
    assert.equal(a.status, "crashed");
    const b = start("B");
    tick(2);
    if (kind === "non_transactional") assert.ok(target.events.some((e) => e.worker === "B" && e.text.includes("already applied")));
    start("C");
    server.delete("2");
    tick(2);
    assert.equal(b.status, "fenced");
    const rows = target.visible().map(([, d]) => d.value);
    assert.deepEqual(rows, [...server.rows.values()]);
  });
}

console.log("all passed");
