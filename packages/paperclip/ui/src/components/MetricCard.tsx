import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
}

export function MetricCard({ icon: Icon, value, label, description, to, onClick }: MetricCardProps) {
  const isClickable = !!(to || onClick);

  const inner = (
    <div
      className={cn(
        "h-full rounded-xl border border-border/60 bg-card/50 px-4 py-4 sm:px-5 sm:py-5 transition-all duration-200",
        isClickable && "hover:bg-accent/40 hover:border-border hover:shadow-[0_2px_12px_rgba(0,0,0,0.15)] cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em] tabular-nums text-foreground">
            {value}
          </p>
          <p className="text-xs sm:text-[13px] font-medium text-muted-foreground mt-1.5">
            {label}
          </p>
          {description && (
            <div className="text-[11px] text-muted-foreground/60 mt-2 hidden sm:block leading-relaxed">{description}</div>
          )}
        </div>
        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-accent/60 shrink-0">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
