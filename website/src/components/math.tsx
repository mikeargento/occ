import katex from "katex";

/**
 * Inline math: renders LaTeX inline (like \(...\))
 */
export function M({ children, c }: { children?: string; c?: string }) {
  const tex = c || children || "";
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: false,
  });
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Display math: renders LaTeX as a block (like \[...\])
 */
export function MBlock({ children, c }: { children?: string; c?: string }) {
  const tex = c || children || "";
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: true,
  });
  return (
    <div
      className="my-4 overflow-x-auto border-l-[3px] border-border-subtle bg-bg-elevated px-4 py-3"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
