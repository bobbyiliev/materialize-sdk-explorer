// The exception classes the core's WebAssembly glue throws, as in the Node
// package's `errors.ts`.

export class SdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The server broke the `SUBSCRIBE` protocol, a bug in Materialize or the SDK. */
export class ProtocolError extends SdkError {}

/** A timestamp's updates exceeded the memory limit. */
export class TimestampTooLarge extends SdkError {}

/** The SDK was called wrongly. */
export class UsageError extends SdkError {}
