// A typed layer over the SDK's protocol core, compiled to WebAssembly by
// `scripts/sync-sdk.sh`. Everything the labs show about statements, batches,
// and errors comes from these calls. `bindCore` serves both the beta core and
// the parked full-stack core in `parked.ts`.

import init, { Subscription as WasmSubscription, conformance as wasmConformance } from "./wasm/sdk_core.js";

/** What `bindCore` needs from one WebAssembly build. */
export interface WasmCore {
  Subscription: new (options: string) => WasmSubscription;
  conformance(fn: string, input: string): string;
}

let loading: Promise<unknown> | null = null;

export function loadCore(): Promise<unknown> {
  loading ??= init();
  return loading;
}

export type Cell = string | null;
export type Row = Cell[];

export type Envelope = { kind: "diff" } | { kind: "upsert"; key: string[] };

export interface ObjectRef {
  id: string;
  database: string | null;
  schema: string;
  name: string;
}

export type Start = { kind: "snapshot"; as_of?: string } | { kind: "resume"; frontier: string };

export type Update =
  | { timestamp: string; op: "diff"; row: Row; diff: string }
  | { timestamp: string; op: "upsert"; key: Row; value: Row }
  | { timestamp: string; op: "delete"; key: Row }
  | { timestamp: string; op: "key_violation"; key: Row };

export type SdkEvent =
  | { event: "batch"; lower: string | null; upper: string; snapshot: boolean; updates: Update[] }
  | { event: "snapshot_chunk"; updates: Update[] };

export type ErrorKind =
  | "transient"
  | "credentials_expired"
  | "canceled"
  | "fell_behind"
  | "result_too_large"
  | "history_lost"
  | "object_dropped"
  | "schema_mismatch"
  | "stream_poisoned"
  | "indexed_target"
  | "fatal";

export type Classification =
  | { action: "kind"; kind: ErrorKind }
  | { action: "check_object"; otherwise: ErrorKind }
  | { action: "check_index" };

export type Phase = "starting" | "streaming";

/** The calls the pages make, bound to one WebAssembly build. */
export function bindCore(core: WasmCore) {
  /** Runs one of the conformance vectors' functions on `input`. */
  function conformance<T = unknown>(fn: string, input: unknown): T {
    return JSON.parse(core.conformance(fn, JSON.stringify(input))) as T;
  }

  function classify(sqlstate: string | null, message: string, phase: Phase): Classification {
    return conformance("classify", { sqlstate, message, phase });
  }

  /** One `SUBSCRIBE` cursor's protocol state, held by the core. */
  class CoreSubscription {
    private inner: WasmSubscription;

    constructor(options: { subscribe: { target: unknown; envelope: Envelope }; start: Start; max_pending_bytes?: string }) {
      this.inner = new core.Subscription(JSON.stringify(options));
    }

    declareSql(): string {
      return this.inner.declareSql();
    }

    fetch(maxRows: number, timeoutMs: number | null): { sql: string; timeout_ms: string | null } {
      const input: Record<string, string> = { max_rows: String(maxRows) };
      if (timeoutMs !== null) input.timeout_ms = String(timeoutMs);
      return JSON.parse(this.inner.fetch(JSON.stringify(input)));
    }

    push(columns: string[], rows: Row[]): { events: SdkEvent[]; finished: boolean } {
      return JSON.parse(this.inner.push(JSON.stringify({ columns, rows })));
    }

    classify(sqlstate: string | null, message: string): Classification {
      return JSON.parse(this.inner.classify(JSON.stringify({ sqlstate, message })));
    }

    get asOf(): bigint | undefined {
      return this.inner.asOf;
    }

    get isFinished(): boolean {
      return this.inner.isFinished;
    }

    free(): void {
      this.inner.free();
    }
  }

  return { conformance, classify, CoreSubscription };
}

const live = bindCore({ Subscription: WasmSubscription, conformance: wasmConformance });
export const { conformance, classify, CoreSubscription } = live;
export type CoreSubscription = InstanceType<typeof CoreSubscription>;
