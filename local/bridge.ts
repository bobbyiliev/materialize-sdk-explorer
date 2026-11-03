// The local lab's server side: a Vite dev-server plugin that passes the
// statements the browser's SDK core writes to a real Materialize, and makes
// the lab's table changes. It runs only under `npm run local`, never in the
// static site.
//
// Each subscription gets its own connection, as in the SDK's Node binding,
// so a FETCH that waits never blocks a table change.

import type { IncomingMessage, ServerResponse } from "node:http";
import pg from "pg";
import type { Plugin } from "vite";

const TABLE = "orders";

type Row = Array<string | null>;

export function localMaterialize(url: string): Plugin {
  const admin = new pg.Pool({ connectionString: url, max: 2 });
  const cursors = new Map<number, pg.Client>();
  let nextCursor = 1;

  // Every cell stays in its text format, the form the core decodes.
  const text = { getTypeParser: () => (value: string) => value };

  async function run(client: pg.Client | pg.Pool, sql: string, values: unknown[] = []) {
    // The extended protocol refuses text that holds more than one statement.
    const result = await client.query<Row>({ text: sql, values, rowMode: "array", types: text, queryMode: "extended" } as pg.QueryArrayConfig);
    return { command: result.command, columns: result.fields.map((f) => f.name), rows: result.rows };
  }

  async function object() {
    const { rows } = await run(
      admin,
      `SELECT o.id, d.name, s.name, o.name FROM mz_catalog.mz_objects o
       JOIN mz_catalog.mz_schemas s ON s.id = o.schema_id
       LEFT JOIN mz_catalog.mz_databases d ON d.id = s.database_id
       WHERE o.name = $1 AND s.name = 'public' AND d.name = current_database()`,
      [TABLE],
    );
    const [id, database, schema, name] = rows[0] ?? [];
    return id ? { id, database, schema, name } : null;
  }

  const routes: Record<string, (body: any) => Promise<unknown>> = {
    async status() {
      const { rows } = await run(admin, "SELECT mz_version()");
      return { version: rows[0][0], url: redact(url), object: await object() };
    },

    // RETAIN HISTORY lets a resume read from an AS OF up to an hour back.
    async setup() {
      await run(admin, `CREATE TABLE IF NOT EXISTS ${TABLE} (id int, item text, qty int) WITH (RETAIN HISTORY = FOR '1h')`);
      const { rows } = await run(admin, `SELECT count(*) FROM ${TABLE}`);
      if (rows[0][0] === "0") await run(admin, `INSERT INTO ${TABLE} VALUES (1, 'apple', 3), (2, 'pear', 5)`);
      return { object: await object() };
    },

    async rows() {
      return run(admin, `SELECT id, item, qty FROM ${TABLE} ORDER BY id`);
    },

    async insert({ items }: { items: Array<[string, number]> }) {
      const { rows } = await run(admin, `SELECT coalesce(max(id), 0) FROM ${TABLE}`);
      const first = Number(rows[0][0]) + 1;
      const values = items.map(([item, qty], i) => `(${first + i}, ${literal(item)}, ${Math.trunc(qty)})`).join(", ");
      const sql = `INSERT INTO ${TABLE} VALUES ${values}`;
      await run(admin, sql);
      return { sql };
    },

    async update({ id, qty }: { id: number; qty: number }) {
      const sql = `UPDATE ${TABLE} SET qty = ${Math.trunc(qty)} WHERE id = ${Math.trunc(id)}`;
      await run(admin, sql);
      return { sql };
    },

    async delete({ id }: { id: number }) {
      const sql = `DELETE FROM ${TABLE} WHERE id = ${Math.trunc(id)}`;
      await run(admin, sql);
      return { sql };
    },

    async open({ sql }: { sql: string }) {
      expect(sql, "DECLARE ");
      const client = new pg.Client({ connectionString: url });
      // NOTE: without an `error` listener, a connection that drops while idle
      // crashes the dev server.
      client.on("error", () => {});
      await client.connect();
      try {
        await run(client, "BEGIN");
        await run(client, sql);
      } catch (error) {
        await client.end().catch(() => {});
        throw error;
      }
      const cursor = nextCursor++;
      cursors.set(cursor, client);
      return { cursor };
    },

    async fetch({ cursor, sql }: { cursor: number; sql: string }) {
      expect(sql, "FETCH ");
      const client = cursors.get(cursor);
      if (!client) throw new Error("connection closed");
      try {
        const result = await run(client, sql);
        // Anything else could pass for an empty FETCH, which ends the stream.
        if (result.command !== "FETCH") throw new Error(`expected FETCH, the server completed ${result.command}`);
        return result;
      } catch (error) {
        cursors.delete(cursor);
        await client.end().catch(() => {});
        throw error;
      }
    },

    // Breaks the socket under the cursor, so its next FETCH fails the way a
    // lost network connection does.
    async drop({ cursor }: { cursor: number }) {
      const client = cursors.get(cursor) as (pg.Client & { connection: { stream: { destroy(): void } } }) | undefined;
      client?.connection.stream.destroy();
      return {};
    },

    async close({ cursor }: { cursor: number }) {
      const client = cursors.get(cursor);
      cursors.delete(cursor);
      await client?.end().catch(() => {});
      return {};
    },
  };

  return {
    name: "local-materialize",
    configureServer(server) {
      server.middlewares.use("/local", (req, res) => void handle(req, res));
      server.httpServer?.once("close", () => {
        for (const client of cursors.values()) void client.end().catch(() => {});
        void admin.end();
      });
    },
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const route = routes[(req.url ?? "").replace(/^\//, "").split("?")[0]];
    res.setHeader("content-type", "application/json");
    if (!route || req.method !== "POST") {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: { sqlstate: null, message: "not found" } }));
      return;
    }
    try {
      res.end(JSON.stringify({ ok: await route(await body(req)) }));
    } catch (error) {
      // Only a server error carries a SQLSTATE. A socket error's `code` is not one.
      const sqlstate = error instanceof pg.DatabaseError ? (error.code ?? null) : null;
      const message = error instanceof Error ? error.message : String(error);
      res.end(JSON.stringify({ error: { sqlstate, message: message || "connection closed" } }));
    }
  }
}

function expect(sql: unknown, prefix: string): void {
  if (typeof sql !== "string" || !sql.startsWith(prefix)) {
    throw new Error(`the local lab only runs the core's ${prefix.trim()} statements`);
  }
}

function literal(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function redact(url: string): string {
  const parsed = new URL(url);
  parsed.password = "";
  return parsed.toString();
}

async function body(req: IncomingMessage): Promise<unknown> {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}
