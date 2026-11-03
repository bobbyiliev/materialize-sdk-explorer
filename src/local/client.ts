// Calls to the local lab's server, `local/bridge.ts`, which runs under
// `npm run local` and passes the core's statements to a real Materialize.

import type { ObjectRef, Row } from "../core/sdk";

export class LocalError extends Error {
  constructor(
    readonly sqlstate: string | null,
    message: string,
  ) {
    super(message);
  }
}

export interface Status {
  version: string;
  url: string;
  object: ObjectRef | null;
}

export interface Rows {
  columns: string[];
  rows: Row[];
}

async function call<T>(route: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`/local/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // The static site answers with its own page or a 404, never with JSON.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new LocalError(null, "no local server");
  }
  const reply = (await response.json()) as { ok?: T; error?: { sqlstate: string | null; message: string } };
  if (reply.error) throw new LocalError(reply.error.sqlstate, reply.error.message);
  return reply.ok as T;
}

export const local = {
  status: () => call<Status>("status"),
  setup: () => call<{ object: ObjectRef | null }>("setup"),
  rows: () => call<Rows>("rows"),
  insert: (items: Array<[string, number]>) => call<{ sql: string }>("insert", { items }),
  update: (id: number, qty: number) => call<{ sql: string }>("update", { id, qty }),
  remove: (id: number) => call<{ sql: string }>("delete", { id }),
  open: (sql: string) => call<{ cursor: number }>("open", { sql }),
  fetch: (cursor: number, sql: string) => call<Rows>("fetch", { cursor, sql }),
  drop: (cursor: number) => call<object>("drop", { cursor }),
  close: (cursor: number) => call<object>("close", { cursor }),
};
