// The parked full-stack core, frozen at `sdk-full/40-docs-ci` and built by
// `scripts/sync-sdk.sh`. Only the parked pages use it: checkpoints, fencing,
// and the durable loop are not in the beta core.

import init, { Subscription, conformance as wasmConformance } from "./wasm-parked/sdk_core.js";
import { bindCore, type Envelope, type ObjectRef } from "./sdk";

let loading: Promise<unknown> | null = null;

export function loadParkedCore(): Promise<unknown> {
  loading ??= init();
  return loading;
}

const parked = bindCore({ Subscription, conformance: wasmConformance });
export const { conformance, classify, CoreSubscription } = parked;
export type CoreSubscription = InstanceType<typeof CoreSubscription>;
export type { Envelope, Row, SdkEvent, Update } from "./sdk";

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
