import { Highlight } from "./Highlight";

export function SummaryLines({ lines, terms }: { lines: readonly string[]; terms?: string[] }) {
  return (
    <ol className="summary-lines">
      {lines.map((line, i) => (
        <li key={i} data-n={i + 1}>
          <Highlight text={line} terms={terms} />
        </li>
      ))}
    </ol>
  );
}
