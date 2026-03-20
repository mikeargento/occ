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

const TAG_REGEX = /(<k>|<\/k>|<s>|<\/s>|<b>|<\/b>|<n>|<\/n>)/;
const OPEN_TAGS = new Set(["<k>", "<s>", "<b>", "<n>"]);
const CLOSE_TAGS = new Set(["</k>", "</s>", "</b>", "</n>"]);

const TAG_CLASSES: Record<string, string> = {
  "<k>": "text-text",
  "<s>": "text-success/70",
  "<b>": "text-info/70",
  "<n>": "text-warning/70",
};

function colorize(json: string): React.ReactNode[] {
  return json.split("\n").map((line, i) => {
    const colored = line
      .replace(/("(?:[^"\\]|\\.)*")(\s*:)/g, "<k>$1</k>$2")
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ": <s>$1</s>")
      .replace(/:\s*(true|false|null)\b/g, ": <b>$1</b>")
      .replace(/:\s*(-?\d+\.?\d*)/g, ": <n>$1</n>");

    const parts = colored.split(TAG_REGEX);
    const nodes: React.ReactNode[] = [];
    let currentTag = "";
    let nodeKey = 0;

    for (const part of parts) {
      if (OPEN_TAGS.has(part)) {
        currentTag = part;
      } else if (CLOSE_TAGS.has(part)) {
        currentTag = "";
      } else if (part) {
        const cls = TAG_CLASSES[currentTag];
        nodes.push(
          cls
            ? <span key={nodeKey} className={cls}>{part}</span>
            : <span key={nodeKey}>{part}</span>
        );
        nodeKey++;
      }
    }

    return <span key={i}>{nodes}{"\n"}</span>;
  });
}
