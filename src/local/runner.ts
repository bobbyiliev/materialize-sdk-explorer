// The SDK's live loop against a real Materialize, through the local server.
// It is `LiveRunner` with each round trip awaited, and with the state shapes
// the lab's components already draw.

import { CoreSubscription, type Envelope, type ObjectRef, type SdkEvent, type Start } from "../core/sdk";
import { DEFAULT_MAX_ROWS, type LiveState } from "../sim/live";
import { LocalError, local } from "./client";

/** `LiveOptions::default()` waits one second per `FETCH`. */
const TIMEOUT_MS = 1000;

export class LocalRunner {
  state: LiveState = { wire: [], events: [], frontier: null, asOf: null, failed: null };
  private sub: CoreSubscription | null = null;
  private cursor: number | null = null;

  constructor(
    private object: ObjectRef,
    readonly envelope: Envelope,
    public maxRows = DEFAULT_MAX_ROWS,
  ) {}

  async open(start: Start = { kind: "snapshot" }): Promise<void> {
    await this.close();
    this.state = { ...this.state, failed: null };
    this.sub = new CoreSubscription({ subscribe: { target: { kind: "object", ...this.object }, envelope: this.envelope }, start });
    const declare = this.sub.declareSql();
    this.out("BEGIN");
    this.out(declare);
    try {
      this.cursor = (await local.open(declare)).cursor;
    } catch (error) {
      this.fail(error);
    }
  }

  /** One round trip: the core's next `FETCH`, Materialize's rows, the core's events. */
  async step(): Promise<SdkEvent[]> {
    if (!this.sub || this.cursor === null || this.state.failed) return [];
    const fetch = this.sub.fetch(this.maxRows, TIMEOUT_MS);
    const probe = fetch.timeout_ms === null;
    this.out(
      fetch.sql,
      probe
        ? "A probe. The last timed FETCH came back empty, which also happens when the stream has ended, so this one waits without a timeout."
        : undefined,
    );
    let result;
    try {
      result = await local.fetch(this.cursor, fetch.sql);
    } catch (error) {
      this.fail(error);
      return [];
    }
    this.state.wire = [...this.state.wire, { dir: "in", columns: result.columns, rows: result.rows }];
    const { events } = this.sub.push(result.columns, result.rows);
    let frontier = this.state.frontier;
    for (const event of events) if (event.event === "batch") frontier = event.upper;
    this.state = {
      ...this.state,
      events: [...this.state.events, ...events],
      frontier,
      asOf: this.sub.asOf === undefined ? null : String(this.sub.asOf),
    };
    return events;
  }

  /**
   * FETCHes until the core releases a batch with updates, or the snapshot.
   * A real table closes a timestamp about every second, so most batches
   * between changes are empty.
   */
  async stepUntilUpdates(limit = 5): Promise<void> {
    for (let i = 0; i < limit && !this.state.failed; i++) {
      const events = await this.step();
      if (events.some((e) => e.event === "batch" && (e.snapshot || e.updates.length > 0))) return;
    }
  }

  /** Changes since the stream's last progress row, which the core holds until one arrives. */
  get held(): number {
    let held = 0;
    for (const entry of this.state.wire) {
      if (entry.dir === "out" && entry.sql.startsWith("DECLARE")) held = 0;
      if (entry.dir !== "in") continue;
      for (const row of entry.rows) held = row[1] === "t" ? 0 : held + 1;
    }
    return held;
  }

  /** Breaks the real connection under the cursor. The next FETCH fails. */
  async dropConnection(): Promise<void> {
    if (this.cursor !== null) await local.drop(this.cursor);
  }

  async close(): Promise<void> {
    const cursor = this.cursor;
    this.sub?.free();
    this.sub = null;
    this.cursor = null;
    if (cursor !== null) await local.close(cursor).catch(() => {});
  }

  async reset(): Promise<void> {
    await this.close();
    this.state = { wire: [], events: [], frontier: null, asOf: null, failed: null };
  }

  private out(sql: string, note?: string): void {
    this.state = { ...this.state, wire: [...this.state.wire, { dir: "out", sql, note }] };
  }

  private fail(error: unknown): void {
    const { sqlstate, message } =
      error instanceof LocalError ? error : { sqlstate: null, message: String(error) };
    const classification = this.sub!.classify(sqlstate, message);
    this.state = {
      ...this.state,
      wire: [...this.state.wire, { dir: "error", sqlstate, message, classification }],
      failed: classification,
    };
    this.cursor = null;
  }
}
