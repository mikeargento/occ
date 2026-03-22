import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, message, action, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-accent/60 border border-border/40 mb-5">
        <Icon className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <p className="text-[13px] text-muted-foreground max-w-[280px] leading-relaxed mb-5">{message}</p>
      {action && onAction && (
        <Button onClick={onAction} size="sm" className="rounded-lg">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {action}
        </Button>
      )}
    </div>
  );
}
