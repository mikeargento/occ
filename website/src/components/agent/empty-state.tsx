export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: "shield" | "agents" | "log" | "default";
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-11 h-11 rounded-xl bg-bg-subtle border border-border flex items-center justify-center mb-4">
        <IconForType type={icon ?? "default"} />
      </div>
      <h3 className="text-sm font-medium text-text mb-1.5">{title}</h3>
      <p className="text-[13px] text-text-tertiary max-w-[280px] leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function IconForType({ type }: { type: string }) {
  if (type === "shield") {
    return (
      <svg className="w-5 h-5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M8 1.5L3 3.75V7.5C3 11 5.5 13.5 8 14.5C10.5 13.5 13 11 13 7.5V3.75L8 1.5Z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "agents") {
    return (
      <svg className="w-5 h-5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
        <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
        <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
      </svg>
    );
  }
  if (type === "log") {
    return (
      <svg className="w-5 h-5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M4.5 4h7M4.5 7h7M4.5 10h5M4.5 13h3" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3.5M8 10.5v0.5" strokeLinecap="round" />
    </svg>
  );
}
