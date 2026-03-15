"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadPolicy } from "@/lib/api";
import type { AgentPolicy, GlobalConstraints, SkillDefinition } from "@/lib/types";
import { Card } from "@/components/shared/card";
import { JsonDisplay } from "@/components/shared/json-display";

function createEmptyPolicy(): AgentPolicy {
  return {
    version: "occ/policy/1",
    name: "",
    description: "",
    createdAt: Date.now(),
    globalConstraints: {},
    skills: {},
  };
}

export function PolicyForm({ initial }: { initial?: AgentPolicy }) {
  const router = useRouter();
  const [policy, setPolicy] = useState<AgentPolicy>(
    initial ?? createEmptyPolicy()
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [newSkillKey, setNewSkillKey] = useState("");

  function updateGlobal(updates: Partial<GlobalConstraints>) {
    setPolicy((p) => ({
      ...p,
      globalConstraints: { ...p.globalConstraints, ...updates },
    }));
  }

  function addSkill() {
    if (!newSkillKey.trim()) return;
    const key = newSkillKey.trim().toLowerCase().replace(/\s+/g, "-");
    setPolicy((p) => ({
      ...p,
      skills: {
        ...p.skills,
        [key]: { name: newSkillKey.trim(), tools: [] },
      },
    }));
    setNewSkillKey("");
  }

  function removeSkill(key: string) {
    setPolicy((p) => {
      const skills = { ...p.skills };
      delete skills[key];
      return { ...p, skills };
    });
  }

  function updateSkill(key: string, updates: Partial<SkillDefinition>) {
    setPolicy((p) => ({
      ...p,
      skills: {
        ...p.skills,
        [key]: { ...p.skills[key]!, ...updates },
      },
    }));
  }

  async function handleSubmit() {
    if (!policy.name.trim()) {
      setError("Policy name is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const toCommit = { ...policy, createdAt: Date.now() };
      await loadPolicy(toCommit);
      router.push("/policies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to commit policy");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full bg-bg-inset border border-border rounded-lg px-3 py-2 text-[13px] text-text placeholder:text-text-tertiary focus:border-accent-dim outline-none transition-colors";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Form */}
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
            Policy Info
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-text-secondary mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={policy.name}
                onChange={(e) =>
                  setPolicy((p) => ({ ...p, name: e.target.value }))
                }
                className={inputClass}
                placeholder="e.g. Customer Service Agent Policy"
              />
            </div>
            <div>
              <label className="block text-[12px] text-text-secondary mb-1.5">
                Description
              </label>
              <textarea
                value={policy.description ?? ""}
                onChange={(e) =>
                  setPolicy((p) => ({
                    ...p,
                    description: e.target.value || undefined,
                  }))
                }
                className={`${inputClass} resize-none`}
                rows={2}
                placeholder="Brief description of what this policy enforces"
              />
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
            Global Constraints
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-text-secondary mb-1.5">
                  Max Spend (cents)
                </label>
                <input
                  type="number"
                  value={policy.globalConstraints.maxSpendCents ?? ""}
                  onChange={(e) =>
                    updateGlobal({
                      maxSpendCents: e.target.value
                        ? Number(e.target.value)
                        : undefined,
                    })
                  }
                  className={inputClass}
                  placeholder="e.g. 10000"
                />
              </div>
              <div>
                <label className="block text-[12px] text-text-secondary mb-1.5">
                  Rate Limit (calls)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={
                      policy.globalConstraints.rateLimit?.maxCalls ?? ""
                    }
                    onChange={(e) => {
                      const maxCalls = e.target.value
                        ? Number(e.target.value)
                        : 0;
                      updateGlobal({
                        rateLimit: maxCalls
                          ? {
                              maxCalls,
                              windowMs:
                                policy.globalConstraints.rateLimit?.windowMs ??
                                60000,
                            }
                          : undefined,
                      });
                    }}
                    className={inputClass}
                    placeholder="Max calls"
                  />
                  <select
                    value={
                      policy.globalConstraints.rateLimit?.windowMs ?? 60000
                    }
                    onChange={(e) => {
                      if (policy.globalConstraints.rateLimit) {
                        updateGlobal({
                          rateLimit: {
                            ...policy.globalConstraints.rateLimit,
                            windowMs: Number(e.target.value),
                          },
                        });
                      }
                    }}
                    className="bg-bg-inset border border-border rounded-lg px-2.5 py-2 text-[13px] text-text focus:border-accent-dim outline-none transition-colors"
                  >
                    <option value={60000}>/ min</option>
                    <option value={3600000}>/ hour</option>
                    <option value={86400000}>/ day</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-text-secondary mb-1.5">
                Blocked Tools (comma-separated)
              </label>
              <input
                type="text"
                value={
                  policy.globalConstraints.blockedTools?.join(", ") ?? ""
                }
                onChange={(e) =>
                  updateGlobal({
                    blockedTools: e.target.value
                      ? e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : undefined,
                  })
                }
                className={inputClass}
                placeholder="e.g. delete-user, drop-table"
              />
            </div>

            <div>
              <label className="block text-[12px] text-text-secondary mb-1.5">
                Allowed Tools (comma-separated, leave empty for all)
              </label>
              <input
                type="text"
                value={
                  policy.globalConstraints.allowedTools?.join(", ") ?? ""
                }
                onChange={(e) =>
                  updateGlobal({
                    allowedTools: e.target.value
                      ? e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                      : undefined,
                  })
                }
                className={inputClass}
                placeholder="Leave empty to allow all tools"
              />
            </div>
          </div>
        </Card>

        <Card>
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-4">
            Skills
          </p>
          <div className="space-y-3">
            {Object.entries(policy.skills).map(([key, skill]) => (
              <div
                key={key}
                className="bg-bg-inset rounded-lg border border-border-subtle p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium">{skill.name}</span>
                  <button
                    onClick={() => removeSkill(key)}
                    className="text-[11px] text-text-tertiary hover:text-error transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] text-text-tertiary mb-1">
                    Tools (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={skill.tools.join(", ")}
                    onChange={(e) =>
                      updateSkill(key, {
                        tools: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-1.5 text-[12px] text-text focus:border-accent-dim outline-none transition-colors"
                    placeholder="e.g. read-order, issue-refund, send-email"
                  />
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <input
                type="text"
                value={newSkillKey}
                onChange={(e) => setNewSkillKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkill()}
                className={inputClass}
                placeholder="New skill name"
              />
              <button
                onClick={addSkill}
                className="px-4 py-2 bg-bg-subtle border border-border rounded-lg text-[13px] text-text-secondary hover:text-text hover:bg-bg-subtle/80 transition-colors flex-shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </Card>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-[13px] text-error">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-[9px] bg-text text-bg rounded-lg text-[13px] font-medium hover:bg-accent transition-colors active:scale-[0.98] disabled:opacity-40"
          >
            {submitting ? "Committing..." : "Commit Policy"}
          </button>
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="px-4 py-[9px] bg-bg-subtle border border-border rounded-lg text-[13px] text-text-secondary hover:text-text transition-colors lg:hidden"
          >
            {showPreview ? "Hide Preview" : "Preview JSON"}
          </button>
        </div>
      </div>

      {/* JSON Preview */}
      <div
        className={`lg:col-span-2 ${showPreview ? "block" : "hidden lg:block"}`}
      >
        <div className="sticky top-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">
            Policy JSON
          </p>
          <JsonDisplay
            data={{ ...policy, createdAt: Date.now() }}
            maxHeight="calc(100vh - 200px)"
          />
        </div>
      </div>
    </div>
  );
}
