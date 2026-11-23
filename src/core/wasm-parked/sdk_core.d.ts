/* tslint:disable */
/* eslint-disable */

/**
 * The state of one `SUBSCRIBE` cursor. Each method takes and returns JSON
 * text in the form of the `subscription` conformance vectors' steps.
 */
export class Subscription {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * What `{"sqlstate", "message"}`, an error the server returned, comes to.
     */
    classify(input: string): string;
    /**
     * The `DECLARE` statement that opens the cursor, inside a transaction.
     */
    declareSql(): string;
    /**
     * The next `FETCH` for `{"max_rows", "timeout_ms"?}`, as
     * `{"sql", "timeout_ms"}`.
     */
    fetch(input: string): string;
    /**
     * A subscription from `{"subscribe", "start", "max_pending_bytes"?,
     * "max_timestamp_bytes"?}`.
     */
    constructor(options: string);
    /**
     * Accepts the last `FETCH`'s `{"columns", "rows"}` and returns
     * `{"events", "finished"}`.
     */
    push(input: string): string;
    /**
     * The stream's `AS OF`, once known.
     */
    readonly asOf: bigint | undefined;
    /**
     * Whether a protocol error ended the stream.
     */
    readonly isFailed: boolean;
    /**
     * Whether the stream has ended, cleanly or not.
     */
    readonly isFinished: boolean;
}

/**
 * Runs `function` of the conformance vectors on `input`, both JSON text,
 * and returns the output as JSON text.
 */
export function conformance(_function: string, input: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_subscription_free: (a: number, b: number) => void;
    readonly conformance: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly subscription_as_of: (a: number) => [number, bigint];
    readonly subscription_classify: (a: number, b: number, c: number) => [number, number, number, number];
    readonly subscription_declareSql: (a: number) => [number, number, number, number];
    readonly subscription_fetch: (a: number, b: number, c: number) => [number, number, number, number];
    readonly subscription_is_failed: (a: number) => number;
    readonly subscription_is_finished: (a: number) => number;
    readonly subscription_new: (a: number, b: number) => [number, number, number];
    readonly subscription_push: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
