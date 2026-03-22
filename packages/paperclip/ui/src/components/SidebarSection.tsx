import type { ReactNode } from "react";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
}

export function SidebarSection({ label, children }: SidebarSectionProps) {
  return (
    <div>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/50">
        {label}
      </div>
      <div className="flex flex-col gap-0.5 mt-1">{children}</div>
    </div>
  );
}
