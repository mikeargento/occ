const VARIANTS = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-error/10 text-error border-error/20",
  info: "bg-info/10 text-info border-info/20",
  neutral: "bg-bg-subtle text-text-secondary border-border",
} as const;

export function Badge({
  variant = "neutral",
  children,
  dot,
}: {
  variant?: keyof typeof VARIANTS;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[11px] font-medium border leading-none ${VARIANTS[variant]}`}
    >
      {dot && (
        <span
          className={`w-[5px] h-[5px] rounded-full ${
            variant === "success"
              ? "bg-success"
              : variant === "error"
              ? "bg-error"
              : variant === "warning"
              ? "bg-warning"
              : variant === "info"
              ? "bg-info"
              : "bg-text-tertiary"
          }`}
        />
      )}
      {children}
    </span>
  );
}
