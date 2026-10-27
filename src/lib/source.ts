// The SDK sources the pages quote, copied from the sdk-preview branch by
// `scripts/sync-sdk.sh`. Excerpts are found by their text, so a quote follows
// the code when it moves.

import version from "../sdk-version.json";

const files = import.meta.glob("../source/**/*", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

export const SDK_COMMIT: string = version.commit;
export const SDK_BRANCH: string = version.branch;
export const FORK = "https://github.com/bobbyiliev/materialize";
export const BRANCH_URL = `${FORK}/tree/${SDK_BRANCH}/misc/materialize-sdk`;
export const DESIGN_DOC_URL =
  "https://github.com/MaterializeInc/materialize/blob/main/doc/developer/design/20260706_materialize_sdk.md";
export const DESIGN_FOLLOWUP_PR = "https://github.com/MaterializeInc/materialize/pull/40130";
export const EXPLORER_REPO = "https://github.com/bobbyiliev/materialize-sdk-explorer";

export function sourceFile(path: string): string {
  const text = files[`../source/${path}`];
  if (text === undefined) throw new Error(`no synced source ${path}`);
  return text;
}

export function githubUrl(path: string, line?: number, end?: number): string {
  const anchor = line ? `#L${line}${end && end !== line ? `-L${end}` : ""}` : "";
  return `${FORK}/blob/${SDK_COMMIT}/misc/materialize-sdk/${path}${anchor}`;
}

export interface Excerpt {
  code: string;
  path: string;
  line: number;
  end: number;
  url: string;
}

/**
 * The lines of `path` from the first one containing `start` through the first
 * later line that starts with `end` (or `end` lines, when a number). With
 * `docs`, the doc comments and attributes above the start come along.
 */
export function excerpt(path: string, start: string, end: string | number, docs = true): Excerpt {
  const lines = sourceFile(path).split("\n");
  let from = lines.findIndex((l) => l.includes(start));
  if (from < 0) throw new Error(`"${start}" not found in ${path}`);
  let to: number;
  if (typeof end === "number") {
    to = from + end - 1;
  } else {
    // A closing brace or an indented marker matches at its column, so it ends
    // the item that opened there. Any other marker matches at any indent.
    const anyIndent = end !== "}" && end.trim() === end;
    to = lines.findIndex((l, i) => i > from && (l.startsWith(end) || (anyIndent && l.trimStart().startsWith(end))));
    if (to < 0) throw new Error(`"${end}" not found after "${start}" in ${path}`);
  }
  if (docs) {
    while (from > 0 && /^\s*(\/\/\/|#\[|\/\*\*|\*|""")/.test(lines[from - 1])) from--;
  }
  const chunk = lines.slice(from, to + 1);
  const indent = Math.min(...chunk.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return {
    code: chunk.map((l) => l.slice(indent)).join("\n"),
    path,
    line: from + 1,
    end: to + 1,
    url: githubUrl(path, from + 1, to + 1),
  };
}
