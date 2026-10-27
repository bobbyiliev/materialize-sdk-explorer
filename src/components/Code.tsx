import { Highlight, themes, type Language } from "prism-react-renderer";
import { useEffect, useState } from "react";

function useDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return dark;
}

export function Code({
  code,
  lang = "rust",
  title,
  href,
  highlight = [],
  maxHeight,
}: {
  code: string;
  lang?: Language | "shell" | "text";
  title?: string;
  href?: string;
  /** Substrings whose lines are marked. */
  highlight?: string[];
  maxHeight?: number;
}) {
  const dark = useDark();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const language = lang === "shell" || lang === "text" ? "markup" : lang;
  return (
    <figure className="code">
      <figcaption>
        <span className="code-title">{title ?? (lang === "shell" ? "terminal" : lang)}</span>
        <span className="code-actions">
          {href && (
            <a href={href} target="_blank" rel="noreferrer">
              source
            </a>
          )}
          <button type="button" onClick={copy}>
            {copied ? "copied" : "copy"}
          </button>
        </span>
      </figcaption>
      <Highlight theme={dark ? themes.vsDark : themes.github} code={code} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre style={maxHeight ? { maxHeight } : undefined}>
            {tokens.map((line, i) => {
              const text = line.map((t) => t.content).join("");
              const marked = highlight.some((h) => text.includes(h));
              const props = getLineProps({ line });
              return (
                <div key={i} {...props} className={`${props.className} ${marked ? "marked" : ""}`}>
                  {lang === "shell" || lang === "text"
                    ? text || " "
                    : line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
                </div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </figure>
  );
}
