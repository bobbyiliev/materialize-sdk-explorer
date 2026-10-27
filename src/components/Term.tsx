import type { ReactNode } from "react";

/** Plain-language definitions, shown on hover and on the glossary page. */
export const GLOSSARY: Record<string, string> = {
  SUBSCRIBE:
    "A Materialize statement that streams every change to a query or an object: first its current rows, then each insert, update, and delete as it happens.",
  "progress row":
    "A row SUBSCRIBE sends to say that time has moved: every change before its timestamp has now arrived. Only a progress row lets the SDK hand over a batch.",
  timestamp:
    "When a change happened, as Materialize counts time: milliseconds since 1970. Every change carries one, called mz_timestamp.",
  frontier:
    "The point in time up to which everything has arrived, and nothing older will come. A batch ends at a frontier, and a checkpoint stores one.",
  batch:
    "Every change between two frontiers, handed to your code at once and in order. A batch never contains half of a point in time.",
  snapshot: "The rows as they are at one point in time, sent first, before the changes that follow.",
  "AS OF": "The point in time a subscription starts reading at.",
  "AS OF F − 1":
    "How a subscription resumes. SNAPSHOT = false with AS OF t sends only changes after t, so to start exactly at frontier F, the SDK asks for F − 1.",
  checkpoint:
    "A small text the sink stores next to its data: who owns it (the epoch), which snapshot it is on (the generation), and how far it got (the frontier).",
  epoch:
    "A number in the checkpoint that goes up by one each time a worker starts. A worker holding an older epoch is fenced at its next checkpoint write.",
  fenced: "Stopped because a newer worker took the checkpoint over. This keeps two copies of a sink from overwriting each other.",
  generation:
    "A number in the checkpoint that goes up with each new snapshot. Rows are written under it, and rows of older generations are swept away.",
  envelope:
    "The shape of each change. The diff envelope sends a row with +1 or −1. The upsert envelope sends the latest value for a key, or a delete.",
  "readable history":
    "How far back Materialize can still answer. RETAIN HISTORY keeps a window. Without it, a table keeps about one second.",
  "transactional sink":
    "A target that can write a batch and its checkpoint in one transaction, such as Postgres. Its state is exactly once.",
  "non-transactional sink":
    "A target that writes the batch first and the checkpoint second, such as turbopuffer. A batch can arrive again, so each write must be safe to repeat.",
};

/** A term with its definition on hover or focus. */
export function Term({ name, children }: { name: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const definition = GLOSSARY[name];
  return (
    <span className="term" tabIndex={0}>
      {children ?? name}
      {definition && (
        <span className="term-tip" role="tooltip">
          {definition}
        </span>
      )}
    </span>
  );
}

/**
 * A Materialize timestamp, with the leading digits that rarely change dimmed so
 * the part that moves is easy to read.
 */
export function Ts({ value }: { value: string | bigint | null | undefined }) {
  if (value === null || value === undefined) return <span className="muted">none</span>;
  const text = String(value);
  const cut = Math.max(0, text.length - 5);
  return (
    <span className="ts-value" title={text}>
      <span className="ts-head">{text.slice(0, cut)}</span>
      {text.slice(cut)}
    </span>
  );
}
