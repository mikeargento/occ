"use client";

import { useState } from "react";
import { ToggleSwitch } from "./toggle-switch";

interface CategoryCardProps {
  id: string;
  label: string;
  icon: string;
  tools: string[];
  enabledTools: Set<string>;
  onToggleCategory: (categoryId: string, enable: boolean) => void;
  onToggleTool: (toolName: string) => void;
  togglingTools: Set<string>;
}

export function CategoryCard({
  id,
  label,
  icon,
  tools,
  enabledTools,
  onToggleCategory,
  onToggleTool,
  togglingTools,
}: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const enabledCount = tools.filter((t) => enabledTools.has(t)).length;
  const allOn = tools.length > 0 && enabledCount === tools.length;
  const allOff = enabledCount === 0;
  const partial = !allOn && !allOff;

  const borderClass = allOn
    ? "border-l-2 border-l-success"
    : partial
    ? "border-l-2 border-l-warning"
    : "border-l-2 border-l-transparent";

  return (
    <div
      className={`rounded-xl border border-border bg-bg-elevated overflow-hidden transition-all duration-200 ${borderClass}`}
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-4">
        {/* Icon */}
        <div
          className={`flex-shrink-0 transition-colors duration-150 ${
            allOff ? "text-text-tertiary" : "text-success"
          }`}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {icon.split(" M").map((segment, i) => (
              <path key={i} d={i === 0 ? segment : `M${segment}`} />
            ))}
          </svg>
        </div>

        {/* Label + count */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text">{label}</p>
          {tools.length > 0 ? (
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {enabledCount} of {tools.length} tool{tools.length !== 1 ? "s" : ""} active
            </p>
          ) : (
            <p className="text-[11px] text-text-tertiary mt-0.5">
              No tools discovered yet
            </p>
          )}
        </div>

        {/* Master toggle */}
        <ToggleSwitch
          enabled={!allOff}
          onToggle={() => onToggleCategory(id, allOff || partial)}
          size="lg"
          disabled={tools.length === 0}
        />
      </div>

      {/* Expand trigger */}
      {tools.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-5 py-2 flex items-center justify-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary border-t border-border-subtle transition-colors"
        >
          {expanded ? "Hide tools" : "Show tools"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      )}

      {/* Expanded tool list */}
      {expanded && tools.length > 0 && (
        <div className="border-t border-border-subtle">
          {tools.map((tool, i) => {
            const isEnabled = enabledTools.has(tool);
            const isToggling = togglingTools.has(tool);
            return (
              <div
                key={tool}
                className="flex items-center gap-3 px-5 py-2.5 hover:bg-bg-subtle/30 transition-colors"
                style={{
                  animation: `slideUp 0.15s ease-out ${i * 50}ms both`,
                }}
              >
                <ToggleSwitch
                  enabled={isEnabled}
                  onToggle={() => onToggleTool(tool)}
                  size="sm"
                  loading={isToggling}
                />
                <span
                  className={`text-xs font-mono truncate transition-colors ${
                    isEnabled ? "text-text" : "text-text-tertiary"
                  }`}
                >
                  {tool}
                </span>
                <span
                  className={`text-[10px] ml-auto flex-shrink-0 ${
                    isEnabled ? "text-success" : "text-text-tertiary"
                  }`}
                >
                  {isEnabled ? "On" : "Off"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
