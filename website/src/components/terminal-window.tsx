"use client";

interface TerminalWindowProps {
  title?: string;
  children: React.ReactNode;
}

export function TerminalWindow({ title = "proof.json", children }: TerminalWindowProps) {
  return (
    <div className="rounded-xl border border-border-subtle overflow-hidden shadow-lg">
      {/* macOS title bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-bg-elevated border-b border-border-subtle">
        <div className="flex items-center gap-[6px]">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="flex-1 text-center text-xs font-mono text-text-tertiary -ml-[54px]">
          {title}
        </span>
      </div>
      {/* Content */}
      <div className="bg-bg px-4 py-3 overflow-x-auto">
        {children}
      </div>
    </div>
  );
}
