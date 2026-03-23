"use client";

import { useState, useEffect } from "react";

interface CustomRulesProps {
  agentId: string;
  initialRules?: string;
}

export function CustomRules({ agentId, initialRules = "" }: CustomRulesProps) {
  const [rules, setRules] = useState(initialRules);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  async function handleSave() {
    setSaving(true);
    try {
      const baseUrl =
        typeof window !== "undefined"
          ? localStorage.getItem("occ-proxy-url") || ""
          : "";
      await fetch(`${baseUrl}/api/agents/${encodeURIComponent(agentId)}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      setSaved(true);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={rules}
        onChange={(e) => {
          setRules(e.target.value);
          setSaved(false);
        }}
        placeholder={`Write rules in plain English:\n\n• Never send emails to addresses outside @company.com\n• Always ask before deleting files\n• Maximum 10 API calls per minute\n• Don't access medical records without patient consent`}
        className="w-full min-h-[200px] rounded-xl bg-bg-inset border border-border-subtle px-4 py-3 text-sm text-text placeholder:text-text-tertiary/50 focus:border-accent-dim outline-none transition-colors resize-y leading-relaxed"
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-text-tertiary">
          Rules are enforced on every tool call. Changes take effect immediately.
        </p>
        <button
          onClick={handleSave}
          disabled={saved || saving}
          className="px-4 py-2 text-xs font-medium rounded-lg bg-text text-bg hover:opacity-90 disabled:opacity-30 transition-all active:scale-[0.97]"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save Rules"}
        </button>
      </div>
    </div>
  );
}
