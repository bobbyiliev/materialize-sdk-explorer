// A typed layer over the SDK's protocol core, compiled to WebAssembly from
// the sdk-preview branch by `scripts/sync-sdk.sh`. Everything the labs show
// about statements, batches, errors, and checkpoints comes from these calls.

import init, { Subscription as WasmSubscription, conformance as wasmConformance } from "./wasm/sdk_core.js";

let loading: Promise<unknown> | null = null;

export function loadCore(): Promise<unknown> {
  loading ??= init();
  return loading;
}

/** Runs one of the conformance vectors' functions on `input`. */
export function conformance<T = unknown>(fn: string, input: unknown): T {
  return JSON.parse(wasmConformance(fn, JSON.stringify(input))) as T;
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

/** One `SUBSCRIBE` cursor's protocol state, held by the core. */
export class CoreSubscription {
  private inner: WasmSubscription;

  constructor(options: { subscribe: { target: unknown; envelope: Envelope }; start: Start; max_pending_bytes?: string }) {
    this.inner = new WasmSubscription(JSON.stringify(options));
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

export interface Fingerprint {
  object: ObjectRef;
  shard: string;
  envelope: Envelope;
  columns: { name: string; type_oid: number; type_mod: number; nullable: boolean }[];
}

export interface Checkpoint {
  format: number;
  epoch: string;
  generation: string;
  frontier: string | null;
  snapshot_as_of: string | null;
  subscriptions: Record<string, Fingerprint>;
}

/** The write the SDK hands a sink or a store, from `checkpoint_write`. */
export interface CheckpointWrite {
  kind: "create" | "take_over" | "commit" | "complete_snapshot" | "start_snapshot" | "snapshot_write" | "fingerprints";
  expected: string | null;
  new: string;
  frontier?: string;
  generation?: string;
  as_of?: string;
  old_generation?: string;
}

export type CheckpointOperation =
  | { create: { subscriptions: Record<string, Fingerprint> } }
  | "take_over"
  | { commit: { upper: string } }
  | { start_snapshot: { subscriptions: Record<string, Fingerprint>; as_of: string } }
  | "snapshot_write";

export function checkpointWrite(current: Checkpoint | null, operation: CheckpointOperation): CheckpointWrite {
  const input = current ? { current, operation } : { operation };
  const out = conformance<{ write?: CheckpointWrite; error?: string }>("checkpoint_write", input);
  if (!out.write) throw new Error(`checkpoint_write refused: ${JSON.stringify(out)}`);
  return out.write;
}

/** What a conditional commit that did not apply comes to, from the stored checkpoint. */
export function checkCommit(stored: Checkpoint, expected: Checkpoint, upper: string): Record<string, unknown> {
  return conformance("checkpoint", { stored, operation: { check_commit: { expected, upper } } });
}

/** What a conditional write without a range comes to, from the stored checkpoint. */
export function checkWrite(stored: Checkpoint, expected: Checkpoint): Record<string, unknown> {
  return conformance("checkpoint", { stored, operation: { check_write: { expected } } });
}

export function classify(sqlstate: string | null, message: string, phase: Phase): Classification {
  return conformance("classify", { sqlstate, message, phase });
}
