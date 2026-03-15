"use client";

export function JsonDisplay({
  data,
  maxHeight = "400px",
}: {
  data: unknown;
  maxHeight?: string;
}) {
  const json = JSON.stringify(data, null, 2);

  return (
    <div
      className="relative rounded-lg border border-border-subtle bg-bg-inset overflow-auto"
      style={{ maxHeight }}
    >
      <pre className="text-[12px] leading-[1.6] font-mono p-4 text-text-secondary">
        {colorize(json)}
      </pre>
    </div>
  );
}

function colorize(json: string): React.ReactNode[] {
  return json.split("\n").map((line, i) => {
    const colored = line
      .replace(
        /("(?:[^"\\]|\\.)*")(\s*:)/g,
        '<k>$1</k>$2'
      )
      .replace(
        /:\s*("(?:[^"\\]|\\.)*")/g,
        ': <s>$1</s>'
      )
      .replace(
        /:\s*(true|false|null)\b/g,
        ': <b>$1</b>'
      )
      .replace(
        /:\s*(-?\d+\.?\d*)/g,
        ': <n>$1</n>'
      );

    return (
      <span key={i}>
        {colored.split(/(<k>|<\/k>|<s>|<\/s>|<b>|<\/b>|<n>|<\/n>)/).reduce<React.ReactNode[]>(
          (acc, part, j) => {
            if (part === "<k>" || part === "</k>" || part === "<s>" || part === "</s>" || part === "<b>" || part === "</b>" || part === "<n>" || part === "</n>") return acc;
            const prev = colored.split(/(<k>|<\/k>|<s>|<\/s>|<b>|<\/b>|<n>|<\/n>)/);
            const idx = prev.indexOf(part);
            const openTag = idx > 0 ? prev[idx - 1] : "";
            if (openTag === "<k>") {
              acc.push(<span key={j} className="text-text">{part}</span>);
            } else if (openTag === "<s>") {
              acc.push(<span key={j} className="text-success/70">{part}</span>);
            } else if (openTag === "<b>") {
              acc.push(<span key={j} className="text-info/70">{part}</span>);
            } else if (openTag === "<n>") {
              acc.push(<span key={j} className="text-warning/70">{part}</span>);
            } else {
              acc.push(<span key={j}>{part}</span>);
            }
            return acc;
          },
          []
        )}
        {"\n"}
      </span>
    );
  });
}
