// The SDK's durable loop, as `DurableSink::run` runs it, over the simulated
// server and a simulated target. Every checkpoint, every conditional check,
// and every conflict comes from the real core through `checkpoint_write` and
// `checkpoint`. The target and its conditional writes are simulated.

import {
  checkCommit,
  checkWrite,
  checkpointWrite,
  classify,
  conformance,
  CoreSubscription,
  type Checkpoint,
  type CheckpointWrite,
  type Envelope,
  type Fingerprint,
  type Row,
  type SdkEvent,
  type Update,
} from "../core/sdk";
import { CATALOG_OBJECT, OBJECT, OBJECT_NAME, ServerError, type SimMaterialize } from "./materialize";

export const ENVELOPE: Envelope = { kind: "upsert", key: ["id"] };
export type SinkKind = "transactional" | "non_transactional";

/** The lab commits a quiet stream every few seconds so the log stays readable. The SDK's default is one second. */
export const COMMIT_INTERVAL_TICKS = 3;

export interface Doc {
  value: Row | null;
  ts: bigint;
  generation: bigint;
}

export interface TargetEvent {
  worker: string;
  text: string;
  kind: "batch" | "checkpoint" | "refused" | "sweep" | "noop";
}

/**
 * A target keyed by `id`, like the turbopuffer sink's namespace or the
 * Postgres example's table, with the checkpoint stored next to the rows.
 */
export class SimTarget {
  docs = new Map<string, Doc>();
  checkpoint: string | null = null;
  events: TargetEvent[] = [];

  constructor(public kind: SinkKind) {}

  /**
   * Writes `updates` without a checkpoint condition. Each write is
   * conditional on the update's timestamp, so a repeated or late change
   * leaves the target as if it applied once and in order.
   */
  applyBatch(_worker: string, updates: Update[], generation: bigint): number {
    let changed = 0;
    for (const u of updates) {
      if (u.op !== "upsert" && u.op !== "delete") continue;
      const key = u.key[0] as string;
      const ts = BigInt(u.timestamp);
      const doc = this.docs.get(key);
      if (doc && doc.generation === generation && doc.ts >= ts) continue;
      this.docs.set(key, { value: u.op === "upsert" ? [key, ...u.value] : null, ts, generation });
      changed++;
    }
    return changed;
  }

  /** A conditional checkpoint write: it applies only if the stored text is the expected one. */
  writeCheckpoint(write: CheckpointWrite): boolean {
    if (this.checkpoint !== write.expected) return false;
    this.checkpoint = write.new;
    return true;
  }

  sweep(generation: bigint): number {
    let removed = 0;
    for (const [key, doc] of this.docs) {
      if (doc.generation < generation) {
        this.docs.delete(key);
        removed++;
      }
    }
    return removed;
  }

  visible(): Array<[string, Doc]> {
    return [...this.docs].filter(([, d]) => d.value !== null).sort((a, b) => Number(a[0]) - Number(b[0]));
  }

  log(worker: string, kind: TargetEvent["kind"], text: string): void {
    this.events = [...this.events, { worker, kind, text }].slice(-60);
  }
}

export type WorkerStatus = "starting" | "reconnecting" | "streaming" | "fenced" | "crashed" | "failed";

export interface Step {
  text: string;
  sql?: string;
  detail?: string;
  tone?: "ok" | "warn" | "bad";
}

/** One worker running a durable subscription, one step per lab tick. */
export class DurableWorker {
  status: WorkerStatus = "starting";
  steps: Step[] = [];
  current: Checkpoint | null = null;
  /** Set to crash after the next batch lands and before its checkpoint does. */
  crashBeforeCheckpoint = false;
  private sub: CoreSubscription | null = null;
  private cursor: number | null = null;
  private started = false;
  private quietTicks = 0;

  constructor(
    readonly name: string,
    private server: SimMaterialize,
    private target: SimTarget,
  ) {}

  get running(): boolean {
    return this.status === "starting" || this.status === "reconnecting" || this.status === "streaming";
  }

  step(): void {
    if (this.status === "starting") this.start();
    // A reconnect keeps the checkpoint this worker took over. Only a new start takes over.
    else if (this.status === "reconnecting") this.openStream();
    else if (this.status === "streaming") this.stream();
  }

  dropConnection(): void {
    if (this.cursor !== null) this.server.failNext(this.cursor, new ServerError(null, "connection closed"));
  }

  get epoch(): string | null {
    return this.current?.epoch ?? null;
  }

  crash(): void {
    this.closeStream();
    this.status = "crashed";
    this.say({ text: "Crashed. The checkpoint stays where the last commit left it.", tone: "bad" });
  }

  private start(): void {
    const text = this.target.checkpoint;
    if (text === null) {
      this.say({ text: "No checkpoint. Run the setup step first.", tone: "bad" });
      this.status = "failed";
      return;
    }
    const stored = JSON.parse(text) as Checkpoint;
    const write = checkpointWrite(stored, "take_over");
    if (!this.target.writeCheckpoint(write)) {
      this.say({ text: "The take-over lost to a newer write. Reading the checkpoint again.", tone: "warn" });
      return;
    }
    this.current = JSON.parse(write.new) as Checkpoint;
    this.target.log(this.name, "checkpoint", `take-over: epoch ${stored.epoch} to ${this.current.epoch}`);
    this.say({
      text: `Took the checkpoint over: epoch ${stored.epoch} to ${this.current.epoch}. Any older worker is now fenced at its next checkpoint write.`,
      detail: write.new,
      tone: "ok",
    });
    if (this.current.frontier !== null) this.sweep(BigInt(this.current.generation));
    this.openStream();
  }

  private openStream(): void {
    const current = this.current!;
    const start =
      current.frontier !== null
        ? ({ kind: "resume", frontier: current.frontier } as const)
        : ({ kind: "snapshot" } as const);
    this.started = current.frontier !== null;
    this.sub = new CoreSubscription({ subscribe: { target: { kind: "object", ...OBJECT }, envelope: ENVELOPE }, start });
    const declare = this.sub.declareSql();
    try {
      this.cursor = this.server.declare(declare);
    } catch (error) {
      this.say({
        text: current.frontier !== null ? `Resuming from frontier ${current.frontier}.` : "Starting a snapshot.",
        sql: declare,
      });
      this.fail(error, "starting");
      return;
    }
    this.status = "streaming";
    this.say({
      text:
        current.frontier !== null
          ? `Resuming from frontier ${current.frontier}: no snapshot, and AS OF ${BigInt(current.frontier) - 1n} so the stream starts exactly at the frontier.`
          : "No frontier yet, so the stream starts with a snapshot.",
      sql: declare,
    });
  }

  private stream(): void {
    const sub = this.sub!;
    const fetch = sub.fetch(1000, 1000);
    let result;
    try {
      result = this.server.fetch(this.cursor!, 1000, fetch.timeout_ms === null);
    } catch (error) {
      this.fail(error, "streaming");
      return;
    }
    const { events } = sub.push(result.columns, result.rows);
    for (const event of events) {
      if (!this.handle(event)) return;
    }
  }

  /** Handles one event, and returns whether the worker keeps running. */
  private handle(event: SdkEvent): boolean {
    if (!this.started) {
      const asOf = String(this.sub!.asOf);
      const write = checkpointWrite(this.current!, {
        start_snapshot: { subscriptions: this.current!.subscriptions, as_of: asOf },
      });
      if (!this.commitCheckpoint(write)) return false;
      this.started = true;
      this.say({
        text: `Started a snapshot as of ${asOf} under generation ${write.generation}. Its rows are written under the new generation, next to the old one's.`,
        detail: write.new,
      });
    }
    if (event.event === "snapshot_chunk") {
      this.target.applyBatch(this.name, event.updates, BigInt(this.current!.generation));
      return true;
    }
    const completes = this.current!.snapshot_as_of !== null;
    if (event.updates.length === 0 && !completes && ++this.quietTicks < COMMIT_INTERVAL_TICKS) return true;
    this.quietTicks = 0;
    const write = checkpointWrite(this.current!, { commit: { upper: event.upper } });
    const generation = BigInt(this.current!.generation);
    const updates = event.updates.filter((u) => u.op !== "key_violation");
    const summary = describe(updates);

    if (this.target.kind === "transactional") {
      // The batch and its checkpoint commit in one transaction, or neither does.
      if (this.target.checkpoint !== write.expected) return this.refused(write, event.upper);
      if (this.crashBeforeCheckpoint) {
        this.crashBeforeCheckpoint = false;
        this.say({ text: "Crashed in the middle of the transaction. It rolls back, so neither the batch nor the checkpoint landed.", tone: "bad" });
        this.crash();
        return false;
      }
      this.target.applyBatch(this.name, updates, generation);
      this.target.writeCheckpoint(write);
      this.target.log(this.name, "batch", `${summary} + checkpoint ${event.upper}, one transaction`);
    } else {
      if (updates.length > 0) {
        const changed = this.target.applyBatch(this.name, updates, generation);
        const skipped = updates.length - changed;
        this.target.log(
          this.name,
          changed === 0 ? "noop" : "batch",
          changed === 0
            ? `${summary} again: already applied, nothing changed`
            : skipped > 0
              ? `${summary}: ${skipped} already applied and skipped`
              : summary,
        );
      }
      if (this.crashBeforeCheckpoint) {
        this.crashBeforeCheckpoint = false;
        this.say({
          text: `Crashed after the batch landed and before its checkpoint. The checkpoint still says ${this.current!.frontier ?? "no frontier"}, so the next worker sends these changes again.`,
          tone: "bad",
        });
        this.crash();
        return false;
      }
      if (!this.target.writeCheckpoint(write)) return this.refused(write, event.upper);
      this.target.log(this.name, "checkpoint", `commit ${event.upper}`);
    }

    this.current = JSON.parse(write.new) as Checkpoint;
    this.say({
      text:
        write.kind === "complete_snapshot"
          ? `Committed ${event.upper}, which completes the snapshot.`
          : updates.length > 0
            ? `Committed ${summary} up to ${event.upper}.`
            : `Committed the quiet stream up to ${event.upper}.`,
      tone: "ok",
    });
    if (completes) this.sweep(generation);
    return true;
  }

  /** A conditional commit that did not apply: the core says why. */
  private refused(write: CheckpointWrite, upper: string): boolean {
    const stored = JSON.parse(this.target.checkpoint!) as Checkpoint;
    const outcome = checkCommit(stored, JSON.parse(write.expected!) as Checkpoint, upper);
    this.target.log(this.name, "refused", `commit ${upper} refused: ${outcome.conflict ?? outcome.commit}`);
    if (outcome.commit === "already_committed") {
      this.current = JSON.parse(write.new) as Checkpoint;
      return true;
    }
    this.stop(outcome);
    return false;
  }

  private stop(outcome: Record<string, unknown>): void {
    this.closeStream();
    this.status = "fenced";
    this.say({
      text:
        outcome.conflict === "fenced"
          ? `Fenced: the checkpoint is at epoch ${outcome.stored}, and this worker holds epoch ${outcome.epoch}. A newer worker took over, so this one stops.`
          : `Stopped: the core calls this write ${String(outcome.conflict)}.`,
      detail: JSON.stringify(outcome),
      tone: "bad",
    });
  }

  /** A checkpoint write without a batch, such as the start of a snapshot. */
  private commitCheckpoint(write: CheckpointWrite): boolean {
    if (this.target.writeCheckpoint(write)) {
      this.current = JSON.parse(write.new) as Checkpoint;
      this.target.log(this.name, "checkpoint", write.kind.replace("_", " "));
      return true;
    }
    const stored = JSON.parse(this.target.checkpoint!) as Checkpoint;
    this.stop(checkWrite(stored, JSON.parse(write.expected!) as Checkpoint));
    return false;
  }

  private sweep(generation: bigint): void {
    const removed = this.target.sweep(generation);
    if (removed > 0) {
      this.target.log(this.name, "sweep", `removed ${removed} rows of generations below ${generation}`);
      this.say({ text: `Swept ${removed} rows left by older generations.` });
    }
  }

  private fail(error: unknown, phase: "starting" | "streaming"): void {
    const { sqlstate, message } = error instanceof ServerError ? error : { sqlstate: null, message: String(error) };
    let classification = classify(sqlstate, message, phase);
    let kind = classification.action === "kind" ? classification.kind : null;
    if (classification.action === "check_index") {
      // No index on the subscribing cluster serves the table, so the core resolves the check as lost history.
      kind = conformance<{ kind: string }>("resolve_index_check", { indexes: [] }).kind as typeof kind;
    }
    this.closeStream();
    if (kind === "transient") {
      this.status = "reconnecting";
      this.say({
        text: `Lost the connection (${message}). The core classifies it as transient, so the worker reconnects with backoff and resumes from its last commit.`,
        tone: "warn",
      });
      return;
    }
    this.status = "failed";
    this.say({
      text:
        kind === "history_lost"
          ? "History lost: Materialize no longer has the changes since the checkpoint's frontier. The prototype stops here. The design plans a policy that takes a new snapshot into a fresh generation instead."
          : `Stopped with ${kind ?? JSON.stringify(classification)}: ${message}`,
      detail: `SQLSTATE ${sqlstate}: ${message}\nclassify: ${JSON.stringify(classification)}`,
      tone: "bad",
    });
  }

  private closeStream(): void {
    if (this.cursor !== null) this.server.close(this.cursor);
    this.sub?.free();
    this.sub = null;
    this.cursor = null;
  }

  private say(step: Step): void {
    this.steps = [...this.steps, step].slice(-40);
  }
}

/** The fingerprint the setup step records, from the core's catalog parsing. */
export function fingerprint(): Fingerprint {
  const out = conformance<{ fingerprint: Fingerprint }>("catalog", {
    fingerprint: { object: CATALOG_OBJECT, envelope: ENVELOPE },
  });
  return out.fingerprint;
}

/** `DurableSink::setup`: the first checkpoint, unless one exists. */
export function setup(target: SimTarget): CheckpointWrite | null {
  if (target.checkpoint !== null) return null;
  const write = checkpointWrite(null, { create: { subscriptions: { [OBJECT_NAME]: fingerprint() } } });
  target.writeCheckpoint(write);
  target.log("setup", "checkpoint", "created the checkpoint");
  return write;
}

function describe(updates: Update[]): string {
  const upserts = updates.filter((u) => u.op === "upsert").length;
  const deletes = updates.filter((u) => u.op === "delete").length;
  const parts = [];
  if (upserts) parts.push(`${upserts} upsert${upserts > 1 ? "s" : ""}`);
  if (deletes) parts.push(`${deletes} delete${deletes > 1 ? "s" : ""}`);
  return parts.join(" and ") || "no changes";
}
