import rustLive from "../../demo/1-rust-live/src/main.rs?raw";
import { Code } from "../components/Code";
import { BRANCH_URL, DESIGN_DOC_URL, DESIGN_FOLLOWUP_PR, SDK_COMMIT } from "../lib/source";

const CARDS = [
  { href: "#/protocol", title: "Protocol lab", text: "Change a table and watch every statement, row, and batch the SDK handles." },
  { href: "#/durable", title: "Durable sink lab", text: "Crash workers, start two at once, lose history, and see the checkpoint hold." },
  { href: "#/errors", title: "Errors lab", text: "Feed any SQLSTATE to the real classifier and see what the SDK does next." },
  { href: "#/sinks", title: "Writing a sink", text: "The two-method trait every target implements, with turbopuffer and Postgres." },
  { href: "#/conformance", title: "Conformance tests", text: "Run all 241 shared test cases against the core, here in your browser." },
  { href: "#/try", title: "Run it on your laptop", text: "Clone, start Materialize in Docker, and run the same apps against it." },
];

export function Overview() {
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Preview · October 2026</div>
        <h1>Read SUBSCRIBE correctly. Build custom sinks.</h1>
        <p className="page-lead">
          The Materialize SDK reads every change to a table or view, hands your code complete batches in order, and runs
          sinks that resume after a crash without losing a change or applying one twice. This site explains how it
          works, and lets you try every part of it.
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
          every row, releases every batch, classifies every error, and makes every checkpoint decision you see. Only
          Materialize and the sink's target are simulated, by a few hundred lines of TypeScript.
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
            A live UI or cache updates. Or a sink writes it to a target, such as Postgres or a search index, and saves
            its place, so a crash resumes right there.
          </div>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <a className="btn" href="#/protocol">
          See it step by step
        </a>
        <a className="btn" href="#/durable">
          See a sink survive crashes
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
            <li>The Rust package: live subscriptions and durable sinks, with checkpoints, fencing, and resume.</li>
            <li>A turbopuffer search sink, and a Postgres sink example.</li>
            <li>Python and Node packages over the same core.</li>
            <li>241 shared conformance cases that every package runs.</li>
            <li>An end-to-end suite against a real Materialize.</li>
          </ul>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Where to find it</h3>
          <ul className="small">
            <li>
              The code: the <a href={BRANCH_URL}>sdk-preview branch</a> (this site uses{" "}
              <span className="mono">{SDK_COMMIT.slice(0, 10)}</span>).
            </li>
            <li>
              The design: <a href={DESIGN_DOC_URL}>the design doc</a>, merged, and{" "}
              <a href={DESIGN_FOLLOWUP_PR}>a follow-up that aligns it with the prototype</a>.
            </li>
            <li>The review: the code lands as a stack of small PRs. The first ones are open.</li>
            <li>Not published yet on crates.io, PyPI, or npm. You build it from the branch.</li>
          </ul>
        </div>
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
          <h3 style={{ marginTop: 0 }}>Anyone building a sink</h3>
          <p className="small muted">How much code does a new target need, and what must it guarantee?</p>
        </div>
      </div>
    </>
  );
}
