"use client";

import { useState } from "react";

interface ToggleSwitchProps {
  enabled: boolean;
  onToggle: () => void;
  size?: "sm" | "lg";
  disabled?: boolean;
  loading?: boolean;
}

export function ToggleSwitch({
  enabled,
  onToggle,
  size = "sm",
  disabled = false,
  loading = false,
}: ToggleSwitchProps) {
  const [pulsing, setPulsing] = useState(false);

  const w = size === "lg" ? 48 : 36;
  const h = size === "lg" ? 26 : 20;
  const knob = size === "lg" ? 20 : 16;
  const pad = size === "lg" ? 3 : 2;
  const travel = w - knob - pad * 2;

  function handleClick() {
    if (disabled || loading) return;
    setPulsing(true);
    onToggle();
    setTimeout(() => setPulsing(false), 150);
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className="flex-shrink-0 focus:outline-none disabled:opacity-40"
      aria-label={enabled ? "Disable" : "Enable"}
    >
      <div
        style={{ width: w, height: h }}
        className={`rounded-full relative transition-colors duration-150 cursor-pointer ${
          enabled ? "bg-success" : "bg-border"
        } ${loading ? "opacity-60" : ""}`}
      >
        <div
          style={{
            width: knob,
            height: knob,
            top: pad,
            transform: `translateX(${enabled ? travel + pad : pad}px)${pulsing ? " scale(0.9)" : ""}`,
          }}
          className="absolute rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-150"
        />
      </div>
    </button>
  );
}
