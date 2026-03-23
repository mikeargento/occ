"use client";

import { TOOL_CATEGORIES, categorizeTools } from "@/lib/categories";
import { CategoryCard } from "./category-card";

interface SwitchboardPanelProps {
  allTools: string[];
  enabledTools: Set<string>;
  onToggleCategory: (categoryId: string, enable: boolean) => void;
  onToggleTool: (toolName: string) => void;
  togglingTools: Set<string>;
}

export function SwitchboardPanel({
  allTools,
  enabledTools,
  onToggleCategory,
  onToggleTool,
  togglingTools,
}: SwitchboardPanelProps) {
  const grouped = categorizeTools(allTools);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TOOL_CATEGORIES.map((cat) => (
        <CategoryCard
          key={cat.id}
          id={cat.id}
          label={cat.label}
          icon={cat.icon}
          tools={grouped[cat.id] ?? []}
          enabledTools={enabledTools}
          onToggleCategory={onToggleCategory}
          onToggleTool={onToggleTool}
          togglingTools={togglingTools}
        />
      ))}
      {/* Other/uncategorized tools */}
      {(grouped["other"] ?? []).length > 0 && (
        <CategoryCard
          id="other"
          label="Other"
          icon="M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5"
          tools={grouped["other"]}
          enabledTools={enabledTools}
          onToggleCategory={onToggleCategory}
          onToggleTool={onToggleTool}
          togglingTools={togglingTools}
        />
      )}
    </div>
  );
}
