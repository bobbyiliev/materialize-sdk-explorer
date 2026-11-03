// Runs the local lab's runner against a real Materialize, through a running
// `npm run local` (LOCAL_URL, http://localhost:5173 by default). It changes
// rows in the lab's `orders` table.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initSync } from "../src/core/wasm/sdk_core.js";
import type { Envelope, SdkEvent, Update } from "../src/core/sdk";
import { local } from "../src/local/client";
import { LocalRunner } from "../src/local/runner";

const base = process.env.LOCAL_URL ?? "http://localhost:5173";
const fetchAt = globalThis.fetch;
globalThis.fetch = ((path: string, init?: RequestInit) => fetchAt(base + path, init)) as typeof fetch;
initSync({ module: readFileSync(join(process.env.ROOT!, "src/core/wasm/sdk_core_bg.wasm")) });

const updates = (events: SdkEvent[], snapshot: boolean): Update[] =>
  events.flatMap((e) => (e.event === "batch" && e.snapshot === snapshot ? e.updates : []));

async function test(name: string, f: () => Promise<void>) {
  await f();
  console.log(`ok - ${name}`);
}

const { object } = await local.setup();
assert.ok(object, "the lab's table exists");

for (const envelope of [{ kind: "diff" }, { kind: "upsert", key: ["id"] }] as Envelope[]) {
  await test(`${envelope.kind}: snapshot, update, a dropped connection, and a resume`, async () => {
    const { rows } = await local.rows();
    const runner = new LocalRunner(object, envelope);
    await runner.open();
    await runner.stepUntilUpdates();
    assert.equal(updates(runner.state.events, true).length, rows.length, "the snapshot has every row");

    const [id, , qty] = rows[0];
    await local.update(Number(id), Number(qty) + 1);
    await runner.stepUntilUpdates();
    const changed = updates(runner.state.events, false);
    if (envelope.kind === "diff") {
      assert.deepEqual(
        changed.map((u) => u.op === "diff" && u.diff),
        ["-1", "1"],
        "an update is a − and a + at one timestamp",
      );
      assert.equal(changed[0].timestamp, changed[1].timestamp);
    } else {
      assert.deepEqual(
        changed.map((u) => u.op === "upsert" && u.key),
        [[id]],
        "an update is one upsert for its key",
      );
    }

    await runner.dropConnection();
    await runner.step();
    assert.deepEqual(runner.state.failed, { action: "kind", kind: "transient" }, "a dropped connection is transient");

    const { sql } = await local.insert([["plum", 2]]);
    const inserted = /VALUES \((\d+),/.exec(sql)![1];
    const before = runner.state.events.length;
    await runner.open({ kind: "resume", frontier: runner.state.frontier! });
    await runner.stepUntilUpdates();
    const declare = runner.state.wire.findLast((w) => w.dir === "out" && w.sql.startsWith("DECLARE"));
    assert.match(declare?.dir === "out" ? declare.sql : "", /SNAPSHOT = false\) AS OF \d+$/);
    const resumed = updates(runner.state.events.slice(before), false);
    assert.equal(resumed.length, 1, "the resume delivers only the change made after the drop");
    const row = resumed[0].op === "diff" ? resumed[0].row : resumed[0].op === "upsert" ? resumed[0].key : [];
    assert.equal(row[0], inserted);

    await runner.close();
    await local.remove(Number(inserted));
  });
}
console.log("all passed");
