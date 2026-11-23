import rustLive from "../../demo/1-rust-live/src/main.rs?raw";
import { Code } from "../components/Code";
import { BRANCH_URL, DESIGN_DOC_URL, SCOPE_UPDATE_PR, SDK_COMMIT } from "../lib/source";

const CARDS = [
  { href: "#/protocol", title: "Protocol lab", text: "Change a table and watch every statement, row, and batch the SDK handles." },
  { href: "#/errors", title: "Errors lab", text: "Feed any SQLSTATE to the real classifier and see what the SDK does next." },
  { href: "#/conformance", title: "Conformance tests", text: "Run every shared test case against the core, here in your browser." },
  { href: "#/try", title: "Run it on your laptop", text: "Clone, start Materialize in Docker, and keep a Valkey hash in step with a table." },
  { href: "#/local", title: "Local lab", text: "The protocol lab against a real Materialize, without building the SDK." },
];

export function Overview() {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Beta · November 2026</div>
        <h1>Read SUBSCRIBE correctly.</h1>
        <p className="page-lead">
          The Materialize SDK reads every change to a table or view and hands your code complete batches in order, for
          live views and small syncs such as a cache. This site explains how it works, and lets you try every part of
          it.
        </p>
        <div className="toolbar" style={{ marginTop: 18 }}>
          <a className="btn primary" href="#/protocol">
            Open the protocol lab
          </a>
          <a className="btn" href="#/try">
            Run it on your laptop
          </a>
          <a className="btn" href="#/evaluate">
            What we want from you
          </a>
        </div>
      </div>

      <div className="callout">
        <strong>The labs run the real SDK.</strong>
        <p>
          The SDK's protocol core is compiled to WebAssembly and runs in this page. It writes every statement, decodes
          every row, releases every batch, and classifies every error you see. Only Materialize is simulated, by a few
          hundred lines of TypeScript.
        </p>
      </div>

      <h2>What it does, in one picture</h2>
      <div className="story">
        <div className="story-step">
          <div className="story-label">1. A table changes in Materialize</div>
          <code>UPDATE orders SET qty = 4 WHERE id = 1;</code>
        </div>
        <div className="story-arrow" aria-hidden="true">
          →
        </div>
        <div className="story-step">
          <div className="story-label">2. The SDK waits until that moment is complete</div>
          <div className="mono small">
            <span className="minus-text">− apple, 3</span> and <span className="plus-text">+ apple, 4</span>, at one
            timestamp, released when a progress row says nothing earlier is still coming
          </div>
        </div>
        <div className="story-arrow" aria-hidden="true">
          →
        </div>
        <div className="story-step">
          <div className="story-label">3. Your code gets one complete batch</div>
          <div className="small">
            A live UI or a cache updates. After a reconnect, the SDK takes a new snapshot and delivers at least
            once.
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <a className="btn" href="#/protocol">
          See it step by step
        </a>
        <a className="btn" href="#/try">
          Sync a Valkey hash
        </a>
      </div>

      <h2>The whole app, in Rust</h2>
      <p>
        Connect, then loop over events. Each batch holds every change up to a point in time, in order, and is released
        only when Materialize says that point is complete.
      </p>
      <Code code={rustLive} title="demo/1-rust-live/src/main.rs" highlight={["LiveSubscription::connect", "live.next()"]} />

      <h2>Explore</h2>
      <div className="grid three">
        {CARDS.map((c) => (
          <a key={c.href} className="card link-card" href={c.href}>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </a>
        ))}
      </div>

      <h2>Where it stands</h2>
      <div className="grid two">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Built and tested</h3>
          <ul className="small">
            <li>The protocol core in Rust, with no I/O.</li>
            <li>Live subscriptions in Rust, Python, and Node, over the same core.</li>
            <li>The resume arithmetic and catalog checks in the core, for one object, for apps that keep their own frontier.</li>
            <li>An example that keeps a Valkey hash equal to a relation.</li>
            <li>Shared conformance cases that every package runs.</li>
            <li>An end-to-end suite against a real Materialize.</li>
          </ul>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Where to find it</h3>
          <ul className="small">
            <li>
              The code: the <a href={BRANCH_URL}>sdk-beta branch</a> (this site uses{" "}
              <span className="mono">{SDK_COMMIT.slice(0, 10)}</span>).
            </li>
            <li>
              The design: <a href={DESIGN_DOC_URL}>the design doc</a>, and{" "}
              <a href={SCOPE_UPDATE_PR}>the scope update</a> that narrows it to the beta.
            </li>
            <li>The review: the code lands as a stack of small PRs, one at a time.</li>
            <li>Not published yet on crates.io, PyPI, or npm. You build it from the branch.</li>
          </ul>
        </div>
      </div>

      <div className="callout">
        <strong>Parked: sinks and durable mode.</strong>
        <p>
          Every SUBSCRIBE result passes through environmentd, so sinks built on it do not scale out. The sink framework,
          checkpoints, and the Postgres and turbopuffer sinks are parked with{" "}
          <a href={SCOPE_UPDATE_PR}>the scope update</a>. Their pages stay under <em>Parked</em> in the menu, running
          the frozen full stack.
        </p>
      </div>

      <h2>Who this is for</h2>
      <div className="grid three">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Product</h3>
          <p className="small muted">
            Is the API easy to start with? Are the names and errors clear? Does it cover the use cases you hear about?
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Database engineers</h3>
          <p className="small muted">
            Does the SDK rely on anything about <code>SUBSCRIBE</code> that is not true, or not promised? Where can it
            break?
          </p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Anyone building a live view or a sync</h3>
          <p className="small muted">How much code does a cache or a UI need on top of the SDK?</p>
        </div>
      </div>
    </>
  );
}
