import { useEffect, useState, type ComponentType } from "react";
import { loadParkedCore } from "./core/parked";
import { loadCore } from "./core/sdk";
import { PARKED_COMMIT, PARKED_URL, SCOPE_UPDATE_PR, SDK_COMMIT } from "./lib/source";
import { Architecture } from "./pages/Architecture";
import { Conformance, ParkedConformance } from "./pages/Conformance";
import { Decisions } from "./pages/Decisions";
import { DurableLab } from "./pages/DurableLab";
import { Errors } from "./pages/Errors";
import { Evaluate } from "./pages/Evaluate";
import { Glossary } from "./pages/Glossary";
import { Languages } from "./pages/Languages";
import { LocalLab } from "./pages/LocalLab";
import { Overview } from "./pages/Overview";
import { ParkedTryIt } from "./pages/ParkedTryIt";
import { Problem } from "./pages/Problem";
import { ProtocolLab } from "./pages/ProtocolLab";
import { SinkApi } from "./pages/SinkApi";
import { TanStackDb } from "./pages/TanStackDb";
import { TryIt } from "./pages/TryIt";

export interface Route {
  path: string;
  title: string;
  group: string;
  tag?: string;
  /** Runs on the frozen full-stack core, behind a banner. */
  parked?: boolean;
  component: ComponentType;
}

export const ROUTES: Route[] = [
  { path: "", title: "Overview", group: "Start here", component: Overview },
  { path: "problem", title: "Why SUBSCRIBE is hard", group: "Start here", component: Problem },
  { path: "architecture", title: "Architecture", group: "How it works", component: Architecture },
  { path: "protocol", title: "Protocol lab", group: "How it works", tag: "live", component: ProtocolLab },
  { path: "errors", title: "Errors lab", group: "How it works", tag: "live", component: Errors },
  { path: "languages", title: "Rust, Python, Node", group: "Build with it", component: Languages },
  { path: "conformance", title: "Conformance tests", group: "Build with it", tag: "live", component: Conformance },
  { path: "tanstack-db", title: "Feeding TanStack DB", group: "Build with it", tag: "sketch", component: TanStackDb },
  { path: "decisions", title: "Design decisions", group: "Go deeper", component: Decisions },
  { path: "glossary", title: "Glossary", group: "Go deeper", component: Glossary },
  { path: "try", title: "Run it on your laptop", group: "Your turn", component: TryIt },
  { path: "local", title: "Local lab", group: "Your turn", tag: "real", component: LocalLab },
  { path: "evaluate", title: "What we want from you", group: "Your turn", component: Evaluate },
  { path: "durable", title: "Durable sink lab", group: "Parked", tag: "live", parked: true, component: DurableLab },
  { path: "sinks", title: "Writing a sink", group: "Parked", parked: true, component: SinkApi },
  {
    path: "parked-conformance",
    title: "Checkpoint tests",
    group: "Parked",
    tag: "live",
    parked: true,
    component: ParkedConformance,
  },
  { path: "try-sinks", title: "Run the sinks", group: "Parked", parked: true, component: ParkedTryIt },
];

function currentPath(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

export function App() {
  const [path, setPath] = useState(currentPath);
  const [ready, setReady] = useState(false);
  const [parkedReady, setParkedReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    loadCore().then(
      () => setReady(true),
      (error: unknown) => setFailed(String(error)),
    );
    const onHash = () => {
      setPath(currentPath());
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const index = Math.max(
    0,
    ROUTES.findIndex((r) => r.path === path),
  );
  const route = ROUTES[index];
  const Page = route.component;
  const groups = [...new Set(ROUTES.map((r) => r.group))];

  // The parked core loads only when a parked page first needs it.
  useEffect(() => {
    if (!route.parked || parkedReady) return;
    loadParkedCore().then(
      () => setParkedReady(true),
      (error: unknown) => setFailed(String(error)),
    );
  }, [route, parkedReady]);

  useEffect(() => {
    document.title = route.path ? `${route.title} · Materialize SDK Explorer` : "Materialize SDK Explorer";
  }, [route]);

  return (
    <div className="app">
      <div className="topbar">
        <button type="button" onClick={() => setMenu(!menu)} aria-label="Open the menu">
          ☰
        </button>
        <strong>Materialize SDK Explorer</strong>
      </div>
      <nav className={`sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="#/">
          <span className="brand-mark">M</span>
          <span>
            <div className="brand-name">Materialize SDK</div>
            <div className="brand-sub">Explorer · beta</div>
          </span>
        </a>
        {groups.map((group) => (
          <div className="nav-group" key={group}>
            <h4>{group}</h4>
            {ROUTES.filter((r) => r.group === group).map((r) => (
              <a key={r.path} href={`#/${r.path}`} className={`nav-link ${r === route ? "active" : ""}`}>
                {r.title}
                {r.tag && <span className="tag">{r.tag}</span>}
              </a>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          The labs run the SDK's real protocol core, compiled to WebAssembly from{" "}
          <span className="mono">{SDK_COMMIT.slice(0, 10)}</span>.
        </div>
      </nav>
      <main>
        {failed ? (
          <div className="callout warn">
            <strong>The protocol core did not load.</strong>
            <p>{failed}</p>
          </div>
        ) : ready && (!route.parked || parkedReady) ? (
          <>
            {route.parked && <ParkedBanner />}
            <Page />
            <Pager index={index} />
          </>
        ) : (
          <div className="loading">Loading the protocol core…</div>
        )}
      </main>
    </div>
  );
}

function ParkedBanner() {
  return (
    <div className="callout warn">
      <strong>Parked</strong>
      <p>
        Sinks, checkpoints, and durable mode are parked with the <a href={SCOPE_UPDATE_PR}>scope change</a>. The beta
        covers live subscriptions and small syncs. This page runs the full stack's core, frozen at{" "}
        <a href={PARKED_URL} className="mono">
          {PARKED_COMMIT.slice(0, 10)}
        </a>
        .
      </p>
    </div>
  );
}

function Pager({ index }: { index: number }) {
  const prev = ROUTES[index - 1];
  const next = ROUTES[index + 1];
  return (
    <div className="pager">
      {prev ? (
        <a href={`#/${prev.path}`}>
          <small>Previous</small>← {prev.title}
        </a>
      ) : (
        <span />
      )}
      {next && (
        <a href={`#/${next.path}`} style={{ textAlign: "right" }}>
          <small>Next</small>
          {next.title} →
        </a>
      )}
    </div>
  );
}
