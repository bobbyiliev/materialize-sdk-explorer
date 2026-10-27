// Plain-language notes on what one action in the protocol lab did, written
// from the statements, rows, and events it produced.

import type { SdkEvent } from "../core/sdk";
import type { WireEntry } from "./live";

const short = (ts: string) => `…${ts.slice(-5)}`;

export function narrate(wire: WireEntry[], events: SdkEvent[]): string[] {
  const out: string[] = [];
  // The first rows after a DECLARE start with the progress row at the AS OF.
  const declared = wire.findIndex((e) => e.dir === "out" && e.sql.startsWith("DECLARE"));
  const firstIn = declared < 0 ? undefined : wire.slice(declared).find((e) => e.dir === "in");
  const resumedAt = wire
    .map((e) => (e.dir === "out" ? /SNAPSHOT = false\) AS OF (\d+)/.exec(e.sql)?.[1] : undefined))
    .find((x) => x !== undefined);
  for (const entry of wire) {
    if (entry.dir === "out") {
      if (entry.sql.startsWith("DECLARE")) {
        const resume = /SNAPSHOT = false\) AS OF (\d+)/.exec(entry.sql);
        out.push(
          resume
            ? `The SDK opened a new cursor with SNAPSHOT = false and AS OF ${short(resume[1])}, one below the last frontier, so the stream starts exactly where the last batch ended.`
            : "The SDK opened a cursor with SNAPSHOT = true, so Materialize starts with the rows as they are now.",
        );
      } else if (entry.note) {
        out.push(
          "The last timed FETCH came back empty, which can also mean the stream ended. So the SDK sent a FETCH without a timeout. It waits for the next row, here the next progress row.",
        );
      }
    } else if (entry.dir === "in") {
      const progress = entry.rows.filter((r) => r[1] === "t");
      const changes = entry.rows.length - progress.length;
      if (entry.rows.length === 0) {
        out.push("Materialize had nothing new yet, so the FETCH came back empty.");
      } else if (progress.length === 0) {
        out.push(
          `Materialize returned ${changes} change${changes === 1 ? "" : "s"} and no progress row. More changes at the same time could still come, so the core holds them, and your code gets nothing yet.`,
        );
      } else if (entry.rows[0][1] === "t" && progress.length > 1 && entry === firstIn) {
        const what =
          resumedAt === undefined
            ? `${changes} row${changes === 1 ? "" : "s"} at that time`
            : `${changes} change${changes === 1 ? "" : "s"} made after it`;
        out.push(
          `Materialize returned a first progress row at the AS OF ${short(entry.rows[0][0]!)}, where the stream starts, then ${what}, then a progress row at ${short(progress.at(-1)![0]!)} that closes them.`,
        );
      } else {
        out.push(
          `Materialize returned ${changes} change${changes === 1 ? "" : "s"} and ${progress.length} progress row${progress.length === 1 ? "" : "s"}, the latest at ${short(progress.at(-1)![0]!)}. Everything before it has arrived.`,
        );
      }
    } else {
      out.push(
        entry.classification.action === "kind" && entry.classification.kind === "transient"
          ? "The connection dropped. The core classifies the error as transient, so it is safe to resume."
          : `The stream failed. The core classifies the error as ${JSON.stringify(entry.classification)}.`,
      );
    }
  }
  for (const event of events) {
    if (event.event === "snapshot_chunk") {
      out.push(`Your code got part of a large snapshot: ${event.updates.length} rows.`);
      continue;
    }
    const n = event.updates.length;
    if (event.snapshot) {
      out.push(`Your code got the snapshot: ${n} row${n === 1 ? "" : "s"}, all at one timestamp, released when the next progress row closed it.`);
    } else if (n === 0) {
      out.push(`Your code got an empty batch. Nothing changed, but the frontier moved to ${short(event.upper)}, so a sink's checkpoint can move too.`);
    } else {
      const diffs = event.updates.filter((u) => u.op === "diff");
      const pair = diffs.some(
        (m) => m.diff.startsWith("-") && diffs.some((p) => !p.diff.startsWith("-") && p.timestamp === m.timestamp),
      );
      const keyed = event.updates.length - diffs.length;
      const resumed =
        resumedAt !== undefined && event.lower === String(BigInt(resumedAt) + 1n)
          ? ` It starts at the old frontier ${short(event.lower)}, so nothing from before the drop arrives again.`
          : "";
      out.push(
        `Your code got a batch with ${n} change${n === 1 ? "" : "s"}, up to the frontier ${short(event.upper)}.` +
          resumed +
          (pair ? " The update is a − of the old row and a + of the new one, at the same timestamp." : "") +
          (keyed ? " In the upsert envelope, each key gets its latest value, or a delete." : ""),
      );
    }
  }
  return out;
}
