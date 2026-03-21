"use client";

import { useCallback, useRef, useState } from "react";
import { Card } from "@/components/shared/card";
import { Badge } from "@/components/shared/badge";
import type { AgentPolicy } from "@/lib/types";

interface ParsedPolicy {
  name: string;
  version: string;
  description?: string;
  allowedTools: string[];
  blockedTools: string[];
  maxSpendCents?: number;
  rateLimit?: { maxCalls: number; windowMs: number };
  timeWindows?: { daysOfWeek?: number[]; startUtc: string; endUtc: string }[];
  skills: Record<string, { name: string; tools: string[] }>;
}

function parsePolicyMarkdown(content: string): ParsedPolicy {
  const lines = content.split("\n");

  // Extract name from first H1 or H2
  let name = "Imported Policy";
  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    if (h1Match) {
      name = h1Match[1].trim();
      break;
    }
    if (h2Match && name === "Imported Policy") {
      name = h2Match[1].trim();
    }
  }

  // Extract version
  let version = "1.0.0";
  const versionMatch = content.match(/[Vv]ersion[:\s]+([^\n\r]+)/);
  if (versionMatch) version = versionMatch[1].trim();

  // Extract description
  let description: string | undefined;
  const descMatch = content.match(/[Dd]escription[:\s]+([^\n\r]+)/);
  if (descMatch) description = descMatch[1].trim();

  // Extract allowed tools
  const allowedTools: string[] = [];
  const allowedSection = content.match(
    /[Aa]llowed\s+[Tt]ools[:\s]*\n([\s\S]*?)(?=\n(?:##|[A-Z]|\n\n)|$)/
  );
  if (allowedSection) {
    const toolLines = allowedSection[1].split("\n");
    for (const tl of toolLines) {
      const match = tl.match(/[-*]\s+`?([^`\n]+)`?/);
      if (match) allowedTools.push(match[1].trim());
    }
  }
  // Also check for inline comma-separated
  const inlineAllowed = content.match(
    /[Aa]llowed\s+[Tt]ools[:\s]+([^\n]+)/
  );
  if (inlineAllowed && allowedTools.length === 0) {
    const parts = inlineAllowed[1].split(/[,;]/);
    for (const p of parts) {
      const cleaned = p.replace(/`/g, "").trim();
      if (cleaned) allowedTools.push(cleaned);
    }
  }

  // Extract blocked tools
  const blockedTools: string[] = [];
  const blockedSection = content.match(
    /[Bb]locked\s+[Tt]ools[:\s]*\n([\s\S]*?)(?=\n(?:##|[A-Z]|\n\n)|$)/
  );
  if (blockedSection) {
    const toolLines = blockedSection[1].split("\n");
    for (const tl of toolLines) {
      const match = tl.match(/[-*]\s+`?([^`\n]+)`?/);
      if (match) blockedTools.push(match[1].trim());
    }
  }

  // Extract spend limit
  let maxSpendCents: number | undefined;
  const spendMatch = content.match(
    /(?:[Mm]ax\s*[Ss]pend|[Ss]pend\s*[Ll]imit)[:\s]+\$?([\d.]+)/
  );
  if (spendMatch) {
    const dollars = parseFloat(spendMatch[1]);
    if (!isNaN(dollars)) maxSpendCents = Math.round(dollars * 100);
  }

  // Extract rate limit
  let rateLimit: { maxCalls: number; windowMs: number } | undefined;
  const rateMatch = content.match(
    /[Rr]ate\s*[Ll]imit[:\s]+(\d+)\s*(?:calls?)?\s*(?:per|\/)\s*(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour)/i
  );
  if (rateMatch) {
    const maxCalls = parseInt(rateMatch[1]);
    const windowVal = parseInt(rateMatch[2]);
    const unit = rateMatch[3].toLowerCase();
    let windowMs = windowVal * 1000;
    if (unit.startsWith("m")) windowMs = windowVal * 60 * 1000;
    if (unit.startsWith("h")) windowMs = windowVal * 60 * 60 * 1000;
    rateLimit = { maxCalls, windowMs };
  }

  // Extract time windows
  const timeWindows: { daysOfWeek?: number[]; startUtc: string; endUtc: string }[] = [];
  const timeMatch = content.match(
    /[Tt]ime\s*[Ww]indow[:\s]+(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/
  );
  if (timeMatch) {
    timeWindows.push({ startUtc: timeMatch[1], endUtc: timeMatch[2] });
  }

  // Extract skills sections
  const skills: Record<string, { name: string; tools: string[] }> = {};
  const skillRegex = /###\s+[Ss]kill[:\s]+(.+)\n([\s\S]*?)(?=\n###|\n##|$)/g;
  let skillMatch;
  while ((skillMatch = skillRegex.exec(content)) !== null) {
    const skillName = skillMatch[1].trim();
    const skillBody = skillMatch[2];
    const skillTools: string[] = [];
    const toolLines = skillBody.split("\n");
    for (const tl of toolLines) {
      const match = tl.match(/[-*]\s+`?([^`\n]+)`?/);
      if (match) skillTools.push(match[1].trim());
    }
    if (skillTools.length > 0) {
      skills[skillName.toLowerCase().replace(/\s+/g, "-")] = {
        name: skillName,
        tools: skillTools,
      };
    }
  }

  return {
    name,
    version,
    description,
    allowedTools,
    blockedTools,
    maxSpendCents,
    rateLimit,
    timeWindows: timeWindows.length > 0 ? timeWindows : undefined,
    skills,
  };
}

function toAgentPolicy(parsed: ParsedPolicy): AgentPolicy {
  const skills: Record<string, { name: string; tools: string[] }> = {};
  for (const [key, val] of Object.entries(parsed.skills)) {
    skills[key] = { name: val.name, tools: val.tools };
  }

  return {
    version: "occ/policy/1",
    name: parsed.name,
    description: parsed.description,
    createdAt: Date.now(),
    globalConstraints: {
      allowedTools: parsed.allowedTools.length > 0 ? parsed.allowedTools : undefined,
      blockedTools: parsed.blockedTools.length > 0 ? parsed.blockedTools : undefined,
      maxSpendCents: parsed.maxSpendCents,
      rateLimit: parsed.rateLimit,
      allowedTimeWindows: parsed.timeWindows,
    },
    skills,
  };
}

export function PolicyImport({ onApplied, agentId }: { onApplied: () => void; agentId?: string }) {
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedPolicy | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".md")) {
      setApplyError("Only .md files are supported.");
      return;
    }
    setApplyError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        const result = parsePolicyMarkdown(content);
        setParsed(result);
      } catch {
        setApplyError("Failed to parse the policy file.");
        setParsed(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleCancel = useCallback(() => {
    setParsed(null);
    setFileName(null);
    setApplyError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleApply = useCallback(async () => {
    if (!parsed) return;
    setApplying(true);
    setApplyError(null);

    try {
      const policy = toAgentPolicy(parsed);
      const baseUrl =
        typeof window !== "undefined"
          ? localStorage.getItem("occ-proxy-url") || ""
          : "";
      const endpoint = agentId
        ? `/api/agents/${encodeURIComponent(agentId)}/policy`
        : "/api/policy";
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
      }
      setParsed(null);
      setFileName(null);
      onApplied();
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply policy.");
    } finally {
      setApplying(false);
    }
  }, [parsed, onApplied]);

  const formatWindowMs = (ms: number) => {
    if (ms >= 3600000) return `${ms / 3600000}h`;
    if (ms >= 60000) return `${ms / 60000}m`;
    return `${ms / 1000}s`;
  };

  return (
    <div className="mb-6">
      {/* Drop zone */}
      {!parsed && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className={`
            relative cursor-pointer rounded-xl border border-dashed
            transition-colors duration-150
            flex flex-col items-center justify-center py-8 px-4
            ${
              dragging
                ? "border-accent bg-bg-subtle/60"
                : "border-border hover:border-text-tertiary hover:bg-bg-subtle/30"
            }
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".md"
            onChange={handleInputChange}
            className="hidden"
          />
          <svg
            className="w-6 h-6 text-text-tertiary mb-2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm text-text-secondary">
            Drop a policy .md file here, or click to select
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">
            Accepts policy markdown files exported from Studio
          </p>
        </div>
      )}

      {/* Error */}
      {applyError && !parsed && (
        <div className="mt-3 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
          {applyError}
        </div>
      )}

      {/* Preview */}
      {parsed && (
        <Card className="animate-slide-up">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-[14px] font-medium">{parsed.name}</h3>
                <Badge variant="info">v{parsed.version}</Badge>
              </div>
              {parsed.description && (
                <p className="text-sm text-text-secondary mt-1">
                  {parsed.description}
                </p>
              )}
              {fileName && (
                <p className="text-[11px] text-text-tertiary mt-1 font-mono">
                  {fileName}
                </p>
              )}
            </div>
            <Badge variant="neutral">Preview</Badge>
          </div>

          {/* Rules summary */}
          <div className="space-y-4">
            {/* Allowed tools */}
            {parsed.allowedTools.length > 0 && (
              <div>
                <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-2">
                  Allowed Tools
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.allowedTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex px-2 py-1 rounded-md bg-success/10 text-success text-[11px] font-mono border border-success/20"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Blocked tools */}
            {parsed.blockedTools.length > 0 && (
              <div>
                <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-2">
                  Blocked Tools
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {parsed.blockedTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex px-2 py-1 rounded-md bg-error/10 text-error text-[11px] font-mono border border-error/20"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Limits row */}
            {(parsed.maxSpendCents !== undefined ||
              parsed.rateLimit ||
              parsed.timeWindows) && (
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border-subtle">
                <div>
                  <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                    Spend Limit
                  </p>
                  <p className="text-[14px] font-medium tabular-nums">
                    {parsed.maxSpendCents !== undefined
                      ? `$${(parsed.maxSpendCents / 100).toFixed(2)}`
                      : "Unlimited"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                    Rate Limit
                  </p>
                  <p className="text-[14px] font-medium tabular-nums">
                    {parsed.rateLimit
                      ? `${parsed.rateLimit.maxCalls} / ${formatWindowMs(parsed.rateLimit.windowMs)}`
                      : "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-1.5">
                    Time Window
                  </p>
                  <p className="text-[14px] font-medium">
                    {parsed.timeWindows && parsed.timeWindows.length > 0
                      ? `${parsed.timeWindows[0].startUtc} - ${parsed.timeWindows[0].endUtc}`
                      : "Unrestricted"}
                  </p>
                </div>
              </div>
            )}

            {/* Skills */}
            {Object.keys(parsed.skills).length > 0 && (
              <div className="pt-3 border-t border-border-subtle">
                <p className="text-[11px] text-text-tertiary uppercase tracking-[0.05em] mb-2">
                  Skills
                </p>
                <div className="space-y-2">
                  {Object.entries(parsed.skills).map(([key, skill]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="font-medium text-[13px]">
                        {skill.name}
                      </span>
                      <span className="text-text-tertiary text-[11px]">
                        {skill.tools.length} tool{skill.tools.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error in preview */}
          {applyError && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-error/5 border border-error/20 text-sm text-error">
              {applyError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-5 pt-5 border-t border-border-subtle">
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-text text-bg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {applying ? "Applying..." : "Apply Policy"}
            </button>
            <button
              onClick={handleCancel}
              disabled={applying}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text rounded-lg border border-border hover:bg-bg-subtle transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
