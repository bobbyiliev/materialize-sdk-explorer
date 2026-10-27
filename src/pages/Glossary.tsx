import { GLOSSARY } from "../components/Term";

export function Glossary() {
  return (
    <>
      <div className="eyebrow">Go deeper</div>
      <h1>Glossary</h1>
      <p className="page-lead">
        The words this site uses, in plain terms. Across the site, a word with a dotted underline shows its meaning when
        you point at it.
      </p>
      <div className="grid two">
        {Object.entries(GLOSSARY).map(([term, meaning]) => (
          <div className="card" key={term}>
            <h3 style={{ margin: "0 0 4px" }}>{term}</h3>
            <p className="small" style={{ margin: 0 }}>
              {meaning}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
