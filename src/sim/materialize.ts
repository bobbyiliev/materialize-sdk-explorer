// A small simulation of Materialize's side of `SUBSCRIBE`: one table, its
// change history, a compaction frontier, and cursors that answer `FETCH`.
//
// Only this file is simulated. The statements it receives, and everything
// done with the rows it returns, come from the SDK's real protocol core.
//
// It follows the server's rules that the SDK depends on: the first progress
// row is at the `AS OF`, a snapshot's rows are all at the `AS OF`, a change at
// time t arrives before the progress row
// that passes t, `SNAPSHOT = false` with `AS OF t` emits only changes after t,
// and an `AS OF` below the compaction frontier is refused.

import type { Envelope, ObjectRef, Row } from "../core/sdk";

export const OBJECT: ObjectRef = { id: "u42", database: "materialize", schema: "public", name: "orders" };
export const OBJECT_NAME = "materialize.public.orders";
export const COLUMNS = ["id", "item", "qty"];

/** What `mz_catalog` would say about the table, in the core's catalog form. */
export const CATALOG_OBJECT = {
  object: OBJECT,
  kind: "table",
  shard: "s1",
  retention_ms: "3600000",
  columns: [
    { name: "id", type_oid: 23, type_mod: -1, nullable: true },
    { name: "item", type_oid: 25, type_mod: -1, nullable: true },
    { name: "qty", type_oid: 23, type_mod: -1, nullable: true },
  ],
};

export class ServerError extends Error {
  constructor(
    readonly sqlstate: string | null,
    message: string,
  ) {
    super(message);
  }
}

interface Change {
  ts: bigint;
  row: Row;
  diff: 1 | -1;
}

interface Cursor {
  envelope: Envelope;
  /** Every change below this time is queued. */
  frontier: bigint;
  queue: Row[];
  columns: string[];
  failure: ServerError | null;
}

/** The default compaction window of a table without `RETAIN HISTORY`. */
const DEFAULT_RETENTION_MS = 1000n;
const RETAINED_MS = 3_600_000n;

export class SimMaterialize {
  now: bigint;
  rows = new Map<string, Row>();
  retainHistory = true;
  /** Raised by "compact history", as if the retention had passed. */
  private compactedTo = 0n;
  private log: Change[] = [];
  private cursors = new Map<number, Cursor>();
  private nextCursor = 1;
  private nextId = 1;

  constructor(seed: Array<[string, number]> = []) {
    // A fixed start keeps timestamps readable and the same on every visit.
    this.now = 1793110000000n;
    for (const [item, qty] of seed) this.insert(item, qty);
    this.tick();
  }

  /** The oldest time a new `SUBSCRIBE` can read. */
  since(): bigint {
    const window = this.retainHistory ? RETAINED_MS : DEFAULT_RETENTION_MS;
    const since = this.now > window ? this.now - window : 0n;
    return since > this.compactedTo ? since : this.compactedTo;
  }

  compactHistory(): void {
    this.compactedTo = this.now;
  }

  /** One second of wall-clock time passes. */
  tick(ms = 1000n): void {
    this.now += ms;
  }

  // Each write lands just after the latest time any cursor has queued, so it
  // is never below a frontier a reader has already passed.
  private writeTime(): bigint {
    this.now += 1n + BigInt(Math.floor(Math.random() * 40));
    return this.now;
  }

  insert(item: string, qty: number): string {
    return this.insertMany([[item, qty]])[0];
  }

  /** One `INSERT` of several rows, all at one timestamp. */
  insertMany(items: Array<[string, number]>): string[] {
    const ts = this.writeTime();
    return items.map(([item, qty]) => {
      const id = String(this.nextId++);
      const row: Row = [id, item, String(qty)];
      this.rows.set(id, row);
      this.log.push({ ts, row, diff: 1 });
      return id;
    });
  }

  update(id: string, qty: number): void {
    const old = this.rows.get(id);
    if (!old) return;
    const ts = this.writeTime();
    const row: Row = [old[0], old[1], String(qty)];
    this.rows.set(id, row);
    this.log.push({ ts, row: old, diff: -1 }, { ts, row, diff: 1 });
  }

  delete(id: string): void {
    const old = this.rows.get(id);
    if (!old) return;
    const ts = this.writeTime();
    this.rows.delete(id);
    this.log.push({ ts, row: old, diff: -1 });
  }

  /** Opens a cursor for a `DECLARE ... CURSOR FOR SUBSCRIBE` the core wrote. */
  declare(sql: string): number {
    const snapshot = /SNAPSHOT = (true|false)/.exec(sql)?.[1] === "true";
    const asOfText = /\bAS OF (\d+)/.exec(sql)?.[1];
    const upsertKey = /ENVELOPE UPSERT \(KEY \(([^)]*)\)\)/.exec(sql)?.[1];
    const envelope: Envelope = upsertKey
      ? { kind: "upsert", key: upsertKey.split(",").map((k) => k.trim().replace(/"/g, "")) }
      : { kind: "diff" };
    const asOf = asOfText === undefined ? this.now : BigInt(asOfText);
    if (asOf < this.since()) {
      throw new ServerError("22000", "could not find a valid timestamp for the query");
    }
    const columns =
      envelope.kind === "upsert"
        ? ["mz_timestamp", "mz_progressed", "mz_state", ...COLUMNS]
        : ["mz_timestamp", "mz_progressed", "mz_diff", ...COLUMNS];
    // The first progress row is at the `AS OF`, before any data.
    const cursor: Cursor = { envelope, frontier: asOf + 1n, queue: [progressRow(asOf, columns.length)], columns, failure: null };
    if (snapshot) {
      for (const row of this.stateAt(asOf).values()) {
        cursor.queue.push(
          envelope.kind === "upsert"
            ? [String(asOf), "f", "upsert", ...row]
            : [String(asOf), "f", "1", ...row],
        );
      }
    }
    cursor.queue.push(progressRow(asOf + 1n, columns.length));
    const id = this.nextCursor++;
    this.cursors.set(id, cursor);
    return id;
  }

  /** Makes the cursor's next `FETCH` fail with this error. */
  failNext(cursorId: number, error: ServerError): void {
    const cursor = this.cursors.get(cursorId);
    if (cursor) cursor.failure = error;
  }

  close(cursorId: number): void {
    this.cursors.delete(cursorId);
  }

  /**
   * Answers `FETCH maxRows`: queued rows, then the changes up to now and a
   * progress row. A `FETCH` without a timeout waits for rows, so when none
   * are ready, time passes until the next progress row.
   */
  fetch(cursorId: number, maxRows: number, wait = false): { columns: string[]; rows: Row[] } {
    const cursor = this.cursors.get(cursorId);
    if (!cursor) throw new ServerError("34000", "cursor does not exist");
    if (cursor.failure) {
      const failure = cursor.failure;
      this.cursors.delete(cursorId);
      throw failure;
    }
    if (wait && cursor.queue.length === 0 && this.now + 1n <= cursor.frontier) this.tick();
    const upper = this.now + 1n;
    if (upper > cursor.frontier) {
      cursor.queue.push(...this.changes(cursor, cursor.frontier, upper));
      cursor.queue.push(progressRow(upper, cursor.columns.length));
      cursor.frontier = upper;
    }
    return { columns: cursor.columns, rows: cursor.queue.splice(0, maxRows) };
  }

  private stateAt(ts: bigint): Map<string, Row> {
    const state = new Map<string, Row>();
    for (const change of this.log) {
      if (change.ts > ts) break;
      const id = change.row[0] as string;
      if (change.diff > 0) state.set(id, change.row);
      else if (state.get(id) === change.row) state.delete(id);
    }
    return state;
  }

  /** The rows for the changes in `[lower, upper)`, in time order. */
  private changes(cursor: Cursor, lower: bigint, upper: bigint): Row[] {
    const window = this.log.filter((c) => c.ts >= lower && c.ts < upper);
    if (cursor.envelope.kind === "diff") {
      return window.map((c) => [String(c.ts), "f", String(c.diff), ...c.row]);
    }
    // The upsert envelope reports each key's state after each time.
    const out: Row[] = [];
    const times = [...new Set(window.map((c) => c.ts))];
    for (const ts of times) {
      const after = this.stateAt(ts);
      const keys = [...new Set(window.filter((c) => c.ts === ts).map((c) => c.row[0] as string))];
      for (const key of keys) {
        const row = after.get(key);
        out.push(row ? [String(ts), "f", "upsert", ...row] : [String(ts), "f", "delete", key, null, null]);
      }
    }
    return out;
  }
}

function progressRow(ts: bigint, width: number): Row {
  return [String(ts), "t", ...Array<null>(width - 2).fill(null)];
}
