// The SDK's live loop, as `LiveSubscription` runs it, with the simulated
// server in place of a Postgres connection: the core writes each statement,
// the server answers, and the core turns the rows into events.

import {
  CoreSubscription,
  type Classification,
  type Envelope,
  type Row,
  type SdkEvent,
  type Start,
} from "../core/sdk";
import { OBJECT, ServerError, type SimMaterialize } from "./materialize";

export type WireEntry =
  | { dir: "out"; sql: string; note?: string }
  | { dir: "in"; columns: string[]; rows: Row[] }
  | { dir: "error"; sqlstate: string | null; message: string; classification: Classification };

export interface LiveState {
  wire: WireEntry[];
  events: SdkEvent[];
  /** The upper of the latest batch: where a resume would start. */
  frontier: string | null;
  asOf: string | null;
  failed: Classification | null;
}

/** `LiveOptions::default()`: 1000 rows and a one second timeout per `FETCH`. */
export const DEFAULT_MAX_ROWS = 1000;
const TIMEOUT_MS = 1000;

export class LiveRunner {
  state: LiveState = { wire: [], events: [], frontier: null, asOf: null, failed: null };
  private sub: CoreSubscription | null = null;
  private cursor: number | null = null;
  private progressed = false;

  constructor(
    private server: SimMaterialize,
    readonly envelope: Envelope,
    public maxRows = DEFAULT_MAX_ROWS,
  ) {}

  open(start: Start = { kind: "snapshot" }): void {
    this.close();
    this.progressed = false;
    this.state = { ...this.state, failed: null };
    this.sub = new CoreSubscription({ subscribe: { target: { kind: "object", ...OBJECT }, envelope: this.envelope }, start });
    const declare = this.sub.declareSql();
    this.out("BEGIN");
    this.out(declare);
    try {
      this.cursor = this.server.declare(declare);
    } catch (error) {
      this.fail(error);
    }
  }

  /** One round trip: the core's next `FETCH`, the server's rows, the core's events. */
  step(): SdkEvent[] {
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
      result = this.server.fetch(this.cursor, this.maxRows, probe);
    } catch (error) {
      this.fail(error);
      return [];
    }
    this.state.wire = [...this.state.wire, { dir: "in", columns: result.columns, rows: result.rows }];
    if (result.rows.some((r) => r[1] === "t")) this.progressed = true;
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

  /** What the core makes of an error the server could return now. */
  classifyNow(sqlstate: string | null, message: string): Classification | null {
    return this.sub ? this.sub.classify(sqlstate, message) : null;
  }

  injectFailure(sqlstate: string | null, message: string): void {
    if (this.cursor !== null) this.server.failNext(this.cursor, new ServerError(sqlstate, message));
  }

  get phase(): "starting" | "streaming" {
    return this.progressed ? "streaming" : "starting";
  }

  close(): void {
    if (this.cursor !== null) this.server.close(this.cursor);
    this.sub?.free();
    this.sub = null;
    this.cursor = null;
  }

  reset(): void {
    this.close();
    this.state = { wire: [], events: [], frontier: null, asOf: null, failed: null };
  }

  private out(sql: string, note?: string): void {
    this.state = { ...this.state, wire: [...this.state.wire, { dir: "out", sql, note }] };
  }

  private fail(error: unknown): void {
    const { sqlstate, message } =
      error instanceof ServerError ? error : { sqlstate: null, message: String(error) };
    const classification = this.sub
      ? this.sub.classify(sqlstate, message)
      : ({ action: "kind", kind: "fatal" } as Classification);
    this.state = {
      ...this.state,
      wire: [...this.state.wire, { dir: "error", sqlstate, message, classification }],
      failed: classification,
    };
    this.cursor = null;
  }
}
