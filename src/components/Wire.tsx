import { useEffect, useRef } from "react";
import type { Row, SdkEvent, Update } from "../core/sdk";
import type { WireEntry } from "../sim/live";

/** Keeps a scrolling pane pinned to its newest entry. */
export function useFollow<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

export function RowsTable({ columns, rows }: { columns: string[]; rows: Row[] }) {
  if (rows.length === 0) return <div className="empty">no rows</div>;
  return (
    <div className="table-wrap">
      <table className="rows">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r[1] === "t" ? "progress" : ""}>
              {r.map((cell, j) => (
                <td key={j}>{cell ?? "NULL"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WireLog({ entries }: { entries: WireEntry[] }) {
  const ref = useFollow<HTMLDivElement>(entries.length);
  return (
    <div className="pane-body tall" ref={ref}>
      {entries.length === 0 && <div className="empty">Nothing sent yet.</div>}
      {entries.map((e, i) =>
        e.dir === "out" ? (
          <div key={i} className="wire-line out">
            {e.sql}
            {e.note && <div className="wire-note">{e.note}</div>}
          </div>
        ) : e.dir === "in" ? (
          <div key={i} className="wire-line in">
            <span className="muted">
              ← {e.rows.length} row{e.rows.length === 1 ? "" : "s"}
              {e.rows.some((r) => r[1] === "t") ? ", with a progress row" : e.rows.length > 0 ? ", no progress row yet" : ""}
            </span>
            <RowsTable columns={e.columns} rows={e.rows} />
          </div>
        ) : (
          <div key={i} className="wire-line error">
            ✕ {e.sqlstate ? `SQLSTATE ${e.sqlstate}: ` : ""}
            {e.message}
            <div className="wire-note" style={{ color: "inherit" }}>
              The core classifies it as <strong>{describeClassification(e.classification)}</strong>.
            </div>
          </div>
        ),
      )}
    </div>
  );
}

export function describeClassification(c: { action: string; kind?: string; otherwise?: string }): string {
  if (c.action === "kind") return c.kind ?? "";
  if (c.action === "check_index") return "check_index: lost history, unless an index now serves the object";
  return `check_object: re-resolve the name first, otherwise ${c.otherwise}`;
}

export function UpdateLine({ u }: { u: Update }) {
  const ts = <span className="ts">{u.timestamp}</span>;
  if (u.op === "diff") {
    const plus = !u.diff.startsWith("-");
    return (
      <div className="update">
        {ts} <span className={plus ? "plus" : "minus"}>{plus ? "+" : "−"}{u.diff.replace("-", "")}</span>{" "}
        {JSON.stringify(u.row)}
      </div>
    );
  }
  if (u.op === "upsert") {
    return (
      <div className="update">
        {ts} <span className="plus">upsert</span> key {JSON.stringify(u.key)} = {JSON.stringify(u.value)}
      </div>
    );
  }
  return (
    <div className="update">
      {ts} <span className="minus">{u.op}</span> key {JSON.stringify(u.key)}
    </div>
  );
}

export function EventCard({ event, fresh }: { event: SdkEvent; fresh: boolean }) {
  if (event.event === "snapshot_chunk") {
    return (
      <div className={`event ${fresh ? "fresh" : ""}`}>
        <div className="event-head">
          <span className="badge warn">snapshot chunk</span>
          <span className="small muted">part of a large snapshot, released early to bound memory</span>
        </div>
        {event.updates.map((u, i) => (
          <UpdateLine key={i} u={u} />
        ))}
      </div>
    );
  }
  return (
    <div className={`event ${fresh ? "fresh" : ""}`}>
      <div className="event-head">
        <span className={`badge ${event.snapshot ? "accent" : "ok"}`}>{event.snapshot ? "snapshot batch" : "batch"}</span>
        <span className="small mono muted">
          {event.lower ?? "start"} → {event.upper}
        </span>
      </div>
      {event.updates.length === 0 ? (
        <div className="small muted">No changes. The frontier moved, so a checkpoint can move too.</div>
      ) : (
        event.updates.map((u, i) => <UpdateLine key={i} u={u} />)
      )}
    </div>
  );
}
