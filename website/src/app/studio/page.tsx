"use client";

import { useState, useCallback } from "react";

type Framework = {
  id: string;
  name: string;
  pkg: string;
  install: string;
  lang: "js" | "python";
  logo: string;
  invertLogo?: boolean; // true for black logos that need dark:invert
};

interface PolicyRule {
  enabled: boolean;
  value: string | number;
}

interface PolicyState {
  allowedTools: { enabled: boolean; tools: string[] };
  maxActions: PolicyRule;
  timeWindow: { enabled: boolean; start: string; end: string };
  rateLimit: PolicyRule;
}

// ─── Framework data ──────────────────────────────────────────────────────────

const JS_FRAMEWORKS: Framework[] = [
  { id: "anthropic-js", name: "Anthropic", pkg: "occ-anthropic", install: "npm install occ-anthropic", lang: "js", logo: "/logos/anthropic.svg", invertLogo: true },
  { id: "openai", name: "OpenAI", pkg: "occ-openai", install: "npm install occ-openai", lang: "js", logo: "/logos/openai.svg", invertLogo: true },
  { id: "vercel", name: "Vercel AI", pkg: "occ-vercel", install: "npm install occ-vercel", lang: "js", logo: "/logos/vercel.svg", invertLogo: true },
  { id: "langgraph", name: "LangGraph", pkg: "occ-langgraph", install: "npm install occ-langgraph", lang: "js", logo: "/logos/langchain.svg", invertLogo: true },
  { id: "mastra", name: "Mastra", pkg: "occ-mastra", install: "npm install occ-mastra", lang: "js", logo: "/logos/mastra.svg", invertLogo: true },
  { id: "cloudflare", name: "Cloudflare Workers", pkg: "occ-cloudflare", install: "npm install occ-cloudflare", lang: "js", logo: "/logos/cloudflare.svg" },
];

const PYTHON_FRAMEWORKS: Framework[] = [
  { id: "anthropic-py", name: "Anthropic", pkg: "occ-anthropic", install: "pip install occ-anthropic", lang: "python", logo: "/logos/anthropic.svg", invertLogo: true },
  { id: "openai-agents", name: "OpenAI Agents SDK", pkg: "occ-openai-agents", install: "pip install occ-openai-agents", lang: "python", logo: "/logos/openai.svg", invertLogo: true },
  { id: "langchain", name: "LangChain", pkg: "occ-langchain", install: "pip install occ-langchain", lang: "python", logo: "/logos/langchain.svg", invertLogo: true },
  { id: "crewai", name: "CrewAI", pkg: "occ-crewai", install: "pip install occ-crewai", lang: "python", logo: "/logos/crewai.svg" },
  { id: "gemini", name: "Google Gemini", pkg: "occ-gemini", install: "pip install occ-gemini", lang: "python", logo: "/logos/google.svg" },
  { id: "google-adk", name: "Google ADK", pkg: "occ-google-adk", install: "pip install occ-google-adk", lang: "python", logo: "/logos/google.svg" },
  { id: "llamaindex", name: "LlamaIndex", pkg: "occ-llamaindex", install: "pip install occ-llamaindex", lang: "python", logo: "/logos/llamaindex.svg", invertLogo: true },
  { id: "autogen", name: "AutoGen", pkg: "occ-autogen", install: "pip install occ-autogen", lang: "python", logo: "/logos/autogen.svg" },
  { id: "openclaw", name: "OpenClaw", pkg: "occ-openclaw", install: "pip install occ-openclaw", lang: "python", logo: "/logos/openclaw.svg" },
];

// ─── Code generation ─────────────────────────────────────────────────────────

function generateCode(fw: Framework, policy: PolicyState): string {
  const tools = policy.allowedTools.enabled ? policy.allowedTools.tools : [];
  const toolsStr = tools.length > 0 ? tools : ["search"];

  if (fw.lang === "python") {
    return generatePythonCode(fw, toolsStr, policy);
  }
  return generateJSCode(fw, toolsStr, policy);
}

function generatePythonCode(fw: Framework, tools: string[], policy: PolicyState): string {
  const pyPkg = fw.pkg.replace(/-/g, "_");
  const toolsArray = `[${tools.map(t => `"${t}"`).join(", ")}]`;

  const policyEntries: string[] = [
    `        "allowed_tools": ${toolsArray}`,
    `        "default_deny": True`,
  ];
  if (policy.maxActions.enabled && policy.maxActions.value) {
    policyEntries.push(`        "max_actions": ${policy.maxActions.value}`);
  }
  if (policy.rateLimit.enabled && policy.rateLimit.value) {
    policyEntries.push(`        "rate_limit": ${policy.rateLimit.value}`);
  }
  if (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end) {
    policyEntries.push(`        "time_window": ("${policy.timeWindow.start}", "${policy.timeWindow.end}")`);
  }
  const policyBlock = policyEntries.join(",\n");

  const wrapperMap: Record<string, [string, string]> = {
    "anthropic-py": ["wrap_client", "client = wrap_client(anthropic.Anthropic(), signer=signer)"],
    "openai-agents": ["wrap_agent", "agent = wrap_agent(your_agent, signer=signer)"],
    "langchain": ["wrap_tools", "tools = wrap_tools(your_tools, signer=signer)"],
    "crewai": ["wrap_crew", "crew = wrap_crew(your_crew, signer=signer)"],
    "gemini": ["wrap_client", "client = wrap_client(genai.Client(), signer=signer)"],
    "google-adk": ["wrap_agent", "agent = wrap_agent(your_adk_agent, signer=signer)"],
    "llamaindex": ["wrap_query_engine", "engine = wrap_query_engine(your_engine, signer=signer)"],
    "autogen": ["wrap_agent", "agent = wrap_agent(your_agent, signer=signer)"],
  };

  const [importName, wrapLine] = wrapperMap[fw.id] || ["wrap_tools", "tools = wrap_tools(your_tools, signer=signer)"];

  return `from ${pyPkg} import OCCSigner, ${importName}

signer = OCCSigner(
    policy={
${policyBlock}
    }
)

# Wrap with OCC control — no valid proof, no action
${wrapLine}`;
}

function generateJSCode(fw: Framework, tools: string[], policy: PolicyState): string {
  const toolsArray = `[${tools.map(t => `'${t}'`).join(", ")}]`;

  const policyEntries: string[] = [
    `    allowedTools: ${toolsArray}`,
    `    defaultDeny: true`,
  ];
  if (policy.maxActions.enabled && policy.maxActions.value) {
    policyEntries.push(`    maxActions: ${policy.maxActions.value}`);
  }
  if (policy.rateLimit.enabled && policy.rateLimit.value) {
    policyEntries.push(`    rateLimit: ${policy.rateLimit.value}`);
  }
  if (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end) {
    policyEntries.push(`    timeWindow: { start: '${policy.timeWindow.start}', end: '${policy.timeWindow.end}' }`);
  }
  const policyBlock = policyEntries.join(",\n");

  const wrapperMap: Record<string, [string, string, string]> = {
    "anthropic-js": ["wrapAnthropic", "occ-anthropic", "const client = wrapAnthropic(new Anthropic(), {\n  policy: {\n" + policyBlock + "\n  }\n});"],
    "openai": ["wrapOpenAI", "occ-openai", "const client = wrapOpenAI(new OpenAI(), {\n  policy: {\n" + policyBlock + "\n  }\n});"],
    "vercel": ["wrapAI", "occ-vercel", "const ai = wrapAI({\n  policy: {\n" + policyBlock + "\n  }\n});"],
    "langgraph": ["wrapGraph", "occ-langgraph", "const graph = wrapGraph(yourGraph, {\n  policy: {\n" + policyBlock + "\n  }\n});"],
    "mastra": ["wrapMastra", "occ-mastra", "const mastra = wrapMastra(yourMastra, {\n  policy: {\n" + policyBlock + "\n  }\n});"],
    "cloudflare": ["wrapWorker", "occ-cloudflare", "export default wrapWorker(yourWorker, {\n  policy: {\n" + policyBlock + "\n  }\n});"],
  };

  const [importName, pkg, wrapBlock] = wrapperMap[fw.id] || ["wrap", fw.pkg, "const wrapped = wrap(yourClient, {\n  policy: {\n" + policyBlock + "\n  }\n});"];

  return `import { ${importName} } from '${pkg}';\n\n${wrapBlock}`;
}

// ─── Starter Packs ───────────────────────────────────────────────────────────

interface StarterPack {
  id: string;
  name: string;
  description: string;
  tools: string[];
  maxActions?: number;
  rateLimit?: number;
  timeWindow?: { start: string; end: string };
}

const STARTER_PACKS: StarterPack[] = [
  {
    id: "personal-assistant",
    name: "Personal Assistant",
    description: "Read email, calendar, contacts. Draft but can't send.",
    tools: ["search_web", "search_calendar", "read_email", "draft_email", "read_contacts", "set_reminder", "read_weather", "read_news", "calculate", "read_file", "search_notes"],
    maxActions: 200,
    rateLimit: 30,
  },
  {
    id: "devops-monitor",
    name: "DevOps Monitor",
    description: "Read logs and metrics. Can't deploy, restart, or modify.",
    tools: ["read_logs", "search_logs", "read_metrics", "read_alerts", "list_deployments", "read_deployment_status", "read_container_status", "read_cluster_health", "send_slack_message", "create_incident_ticket"],
    maxActions: 1000,
    rateLimit: 60,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description: "Read repos and comment on PRs. Can't merge or push.",
    tools: ["read_file", "list_files", "search_code", "read_pr", "comment_pr", "read_issues", "read_ci_status"],
    maxActions: 500,
    rateLimit: 30,
  },
  {
    id: "customer-support",
    name: "Customer Support",
    description: "Read tickets and draft replies. Can't issue refunds.",
    tools: ["read_ticket", "search_tickets", "draft_reply", "read_customer", "search_knowledge_base", "add_internal_note", "update_ticket_status"],
    maxActions: 300,
    rateLimit: 20,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Query databases and generate reports. Can't modify data.",
    tools: ["run_query", "read_table", "list_tables", "read_dashboard", "export_csv", "create_chart", "search_docs"],
    maxActions: 500,
    rateLimit: 15,
  },
  {
    id: "social-media",
    name: "Social Media",
    description: "Draft posts and read analytics. Approval required to publish.",
    tools: ["draft_post", "read_analytics", "read_mentions", "read_comments", "search_trends", "schedule_post", "read_inbox"],
    maxActions: 100,
    rateLimit: 10,
    timeWindow: { start: "09:00", end: "18:00" },
  },
];

// ─── Studio Page ─────────────────────────────────────────────────────────────

export default function StudioPage() {
  const [selectedFramework, setSelectedFramework] = useState<Framework | null>(null);
  const [policy, setPolicy] = useState<PolicyState>({
    allowedTools: { enabled: true, tools: [] },
    maxActions: { enabled: false, value: "" as unknown as number },
    timeWindow: { enabled: false, start: "09:00", end: "17:00" },
    rateLimit: { enabled: false, value: "" as unknown as number },
  });
  const [toolInput, setToolInput] = useState("");
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = useCallback((pack: StarterPack) => {
    setActivePreset(pack.id);
    setPolicy({
      allowedTools: { enabled: true, tools: [...pack.tools] },
      maxActions: { enabled: !!pack.maxActions, value: pack.maxActions || ("" as unknown as number) },
      rateLimit: { enabled: !!pack.rateLimit, value: pack.rateLimit || ("" as unknown as number) },
      timeWindow: { enabled: !!pack.timeWindow, start: pack.timeWindow?.start || "09:00", end: pack.timeWindow?.end || "17:00" },
    });
  }, []);

  const generatePolicyMarkdown = useCallback((fw: Framework, pol: PolicyState): string => {
    const lines: string[] = [];
    lines.push(`# Policy: ${fw.name} Agent`);
    lines.push(`version: 1.0`);
    lines.push(``);

    // Allowed Tools
    lines.push(`## Allowed Tools`);
    if (pol.allowedTools.tools.length > 0) {
      pol.allowedTools.tools.forEach(t => lines.push(`- ${t}`));
    } else {
      lines.push(`<!-- default-deny: no tools allowed -->`);
    }
    lines.push(``);

    // Limits — only if at least one is enabled
    const hasLimits = (pol.maxActions.enabled && pol.maxActions.value) || (pol.rateLimit.enabled && pol.rateLimit.value);
    if (hasLimits) {
      lines.push(`## Limits`);
      if (pol.maxActions.enabled && pol.maxActions.value) {
        lines.push(`- max_actions: ${pol.maxActions.value}`);
      }
      if (pol.rateLimit.enabled && pol.rateLimit.value) {
        lines.push(`- rate_limit: ${pol.rateLimit.value}/min`);
      }
      lines.push(``);
    }

    // Time Window — only if enabled
    if (pol.timeWindow.enabled && pol.timeWindow.start && pol.timeWindow.end) {
      const startH = parseInt(pol.timeWindow.start.split(":")[0], 10);
      const endH = parseInt(pol.timeWindow.end.split(":")[0], 10);
      lines.push(`## Time Window`);
      lines.push(`- hours: ${startH}-${endH}`);
      lines.push(``);
    }

    return lines.join("\n");
  }, []);

  const downloadPolicy = useCallback(() => {
    if (!selectedFramework) return;
    const md = generatePolicyMarkdown(selectedFramework, policy);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedFramework.id}-policy.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }, [selectedFramework, policy, generatePolicyMarkdown]);

  const addTool = useCallback((name: string) => {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return;
    setPolicy(prev => ({
      ...prev,
      allowedTools: {
        ...prev.allowedTools,
        tools: prev.allowedTools.tools.includes(trimmed)
          ? prev.allowedTools.tools
          : [...prev.allowedTools.tools, trimmed],
      },
    }));
    setToolInput("");
  }, []);

  const removeTool = useCallback((name: string) => {
    setPolicy(prev => ({
      ...prev,
      allowedTools: {
        ...prev.allowedTools,
        tools: prev.allowedTools.tools.filter(t => t !== name),
      },
    }));
  }, []);

  const copyToClipboard = useCallback(async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch { /* noop */ }
  }, []);

  const hasRules = policy.allowedTools.tools.length > 0 ||
    (policy.maxActions.enabled && policy.maxActions.value) ||
    (policy.rateLimit.enabled && policy.rateLimit.value) ||
    (policy.timeWindow.enabled && policy.timeWindow.start && policy.timeWindow.end);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mb-3">
          Policy Studio
        </h1>
        <p className="text-text-secondary text-[15px] leading-relaxed">
          Build your AI control layer. Pick a framework, define the rules, get the code.
        </p>
      </div>

      <div className="space-y-8">

        {/* ── Step 1: Pick your framework ── */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
              selectedFramework
                ? "bg-success/15 text-success"
                : "bg-bg-elevated border border-border-subtle text-text-secondary"
            }`}>
              {selectedFramework ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 6.5l3 3L10 3" />
                </svg>
              ) : "1"}
            </span>
            <h2 className="text-sm font-semibold text-text">Pick your framework</h2>
          </div>

          <div className="space-y-8 pl-10">
            {/* Row 1: JavaScript */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-success mb-2">JavaScript</div>
              <div className="flex flex-wrap gap-3">
                {JS_FRAMEWORKS.map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw)}
                    className={`px-4 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer flex items-center gap-2.5 ${
                      selectedFramework?.id === fw.id
                        ? "bg-success/10 text-success border border-success/25"
                        : "text-text-secondary hover:text-text hover:bg-bg-elevated border border-border-subtle"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fw.logo} alt="" width={18} height={18} className={`shrink-0 opacity-70 ${fw.invertLogo ? "dark:invert" : ""}`} />
                    <span className="font-medium">{fw.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Row 2: Python */}
            <div>
              <div className="text-[11px] uppercase tracking-[0.1em] text-success mb-2">Python</div>
              <div className="flex flex-wrap gap-3">
                {PYTHON_FRAMEWORKS.map(fw => (
                  <button
                    key={fw.id}
                    onClick={() => setSelectedFramework(fw)}
                    className={`px-4 py-2.5 rounded-lg text-sm transition-all duration-150 cursor-pointer flex items-center gap-2.5 ${
                      selectedFramework?.id === fw.id
                        ? "bg-success/10 text-success border border-success/25"
                        : "text-text-secondary hover:text-text hover:bg-bg-elevated border border-border-subtle"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fw.logo} alt="" width={18} height={18} className={`shrink-0 opacity-70 ${fw.invertLogo ? "dark:invert" : ""}`} />
                    <span className="font-medium">{fw.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Step 2: Define your rules ── */}
        {selectedFramework && (
          <section className="animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold shrink-0 ${
                hasRules
                  ? "bg-success/15 text-success"
                  : "bg-bg-elevated border border-border-subtle text-text-secondary"
              }`}>
                {hasRules ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.5l3 3L10 3" />
                  </svg>
                ) : "2"}
              </span>
              <h2 className="text-sm font-semibold text-text">Define your rules</h2>
            </div>

            <div className="pl-10 space-y-3">
              {/* Starter packs */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-text">Start from a preset</label>
                  {activePreset && (
                    <button
                      onClick={() => {
                        setActivePreset(null);
                        setPolicy({
                          allowedTools: { enabled: true, tools: [] },
                          maxActions: { enabled: false, value: "" as unknown as number },
                          timeWindow: { enabled: false, start: "09:00", end: "17:00" },
                          rateLimit: { enabled: false, value: "" as unknown as number },
                        });
                      }}
                      className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STARTER_PACKS.map(pack => (
                    <button
                      key={pack.id}
                      onClick={() => applyPreset(pack)}
                      className={`text-left px-3 py-2.5 rounded-lg text-xs transition-all duration-150 cursor-pointer border ${
                        activePreset === pack.id
                          ? "bg-success/10 border-success/25 text-success"
                          : "border-border-subtle text-text-secondary hover:text-text hover:bg-bg"
                      }`}
                    >
                      <div className="font-semibold mb-0.5">{pack.name}</div>
                      <div className="text-[10px] opacity-70 leading-snug">{pack.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default deny indicator */}
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-bg-elevated border border-border-subtle">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-tertiary shrink-0">
                  <rect x="2" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className="text-xs text-text-secondary">Default deny — only listed tools are allowed</span>
              </div>

              {/* Allowed tools */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-text">Allowed tools</label>
                </div>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={toolInput}
                    onChange={e => setToolInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); addTool(toolInput); }
                    }}
                    placeholder="e.g. search, send_email"
                    className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                  />
                  <button
                    onClick={() => addTool(toolInput)}
                    disabled={!toolInput.trim()}
                    className="h-9 px-3 rounded-lg text-xs font-semibold bg-bg border border-border-subtle text-text-secondary hover:text-text hover:border-border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Add
                  </button>
                </div>
                {policy.allowedTools.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {policy.allowedTools.tools.map(tool => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-success/10 text-success text-xs font-mono"
                      >
                        {tool}
                        <button
                          onClick={() => removeTool(tool)}
                          className="hover:text-success/70 cursor-pointer text-[10px] leading-none"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {policy.allowedTools.tools.length === 0 && (
                  <p className="text-[11px] text-text-tertiary mt-1">No tools allowed yet. With default-deny, no tool calls will be permitted.</p>
                )}
              </div>

              {/* Max actions */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text">Max actions</label>
                  <button
                    onClick={() => setPolicy(prev => ({ ...prev, maxActions: { ...prev.maxActions, enabled: !prev.maxActions.enabled } }))}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                      policy.maxActions.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      policy.maxActions.enabled ? "translate-x-4" : ""
                    }`} />
                  </button>
                </div>
                {policy.maxActions.enabled && (
                  <div className="mt-3">
                    <input
                      type="number"
                      min="1"
                      value={policy.maxActions.value || ""}
                      onChange={e => setPolicy(prev => ({ ...prev, maxActions: { ...prev.maxActions, value: parseInt(e.target.value) || ("" as unknown as number) } }))}
                      placeholder="e.g. 50"
                      className="w-full h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                    />
                    <p className="text-[11px] text-text-tertiary mt-1.5">Budget envelope — total tool calls allowed per session</p>
                  </div>
                )}
              </div>

              {/* Rate limit */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text">Rate limit</label>
                  <button
                    onClick={() => setPolicy(prev => ({ ...prev, rateLimit: { ...prev.rateLimit, enabled: !prev.rateLimit.enabled } }))}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                      policy.rateLimit.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      policy.rateLimit.enabled ? "translate-x-4" : ""
                    }`} />
                  </button>
                </div>
                {policy.rateLimit.enabled && (
                  <div className="mt-3">
                    <input
                      type="number"
                      min="1"
                      value={policy.rateLimit.value || ""}
                      onChange={e => setPolicy(prev => ({ ...prev, rateLimit: { ...prev.rateLimit, value: parseInt(e.target.value) || ("" as unknown as number) } }))}
                      placeholder="e.g. 10"
                      className="w-full h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:border-success/40 transition-colors"
                    />
                    <p className="text-[11px] text-text-tertiary mt-1.5">Maximum tool calls per minute</p>
                  </div>
                )}
              </div>

              {/* Time window */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text">Time window</label>
                  <button
                    onClick={() => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, enabled: !prev.timeWindow.enabled } }))}
                    className={`relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer ${
                      policy.timeWindow.enabled ? "bg-success" : "bg-bg-subtle border border-border-subtle"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      policy.timeWindow.enabled ? "translate-x-4" : ""
                    }`} />
                  </button>
                </div>
                {policy.timeWindow.enabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="time"
                      value={policy.timeWindow.start}
                      onChange={e => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, start: e.target.value } }))}
                      className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text focus:outline-none focus:border-success/40 transition-colors"
                    />
                    <span className="text-xs text-text-tertiary">to</span>
                    <input
                      type="time"
                      value={policy.timeWindow.end}
                      onChange={e => setPolicy(prev => ({ ...prev, timeWindow: { ...prev.timeWindow, end: e.target.value } }))}
                      className="flex-1 h-9 bg-bg rounded-lg border border-border-subtle px-3 text-sm text-text focus:outline-none focus:border-success/40 transition-colors"
                    />
                  </div>
                )}
                {policy.timeWindow.enabled && (
                  <p className="text-[11px] text-text-tertiary mt-1.5">Tools only available during this window</p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Step 3: Generated code ── */}
        {selectedFramework && (
          <section className="animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold bg-bg-elevated border border-border-subtle text-text-secondary shrink-0">
                3
              </span>
              <h2 className="text-sm font-semibold text-text">Drop this into your project</h2>
            </div>

            <div className="pl-10 space-y-4">
              {/* Install command */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary">Install</span>
                  <button
                    onClick={() => copyToClipboard(selectedFramework.install, setCopiedInstall)}
                    className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
                  >
                    {copiedInstall ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="px-4 py-3">
                  <code className="text-sm font-mono text-success">{selectedFramework.install}</code>
                </div>
              </div>

              {/* Generated code */}
              <div className="rounded-xl border border-border-subtle bg-bg-elevated overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
                  <span className="text-[11px] uppercase tracking-[0.1em] text-text-tertiary">
                    {selectedFramework.lang === "python" ? "Python" : "JavaScript"}
                  </span>
                  <button
                    onClick={() => copyToClipboard(generateCode(selectedFramework, policy), setCopiedCode)}
                    className="text-xs text-text-tertiary hover:text-text transition-colors cursor-pointer"
                  >
                    {copiedCode ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="px-4 py-3 overflow-x-auto">
                  <code className="text-sm font-mono text-text leading-relaxed whitespace-pre">{generateCode(selectedFramework, policy)}</code>
                </pre>
              </div>

              {/* Explanation */}
              <div className="rounded-lg border border-border-subtle px-4 py-3">
                <p className="text-xs text-text-secondary leading-relaxed">
                  The proof is the authorization. Your agent constructs a cryptographic proof for every tool call — if it cannot build a valid proof that satisfies the policy, the action does not execute. No proof, no action.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ── Step 4: Export your rules ── */}
        {selectedFramework && (
          <section className="animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <span className="inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold bg-bg-elevated border border-border-subtle text-text-secondary shrink-0">
                4
              </span>
              <h2 className="text-sm font-semibold text-text">Export your rules</h2>
            </div>

            <div className="pl-10 space-y-3">
              <button
                onClick={downloadPolicy}
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold bg-success text-white hover:bg-success/90 transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M7 2v7.5M4 7l3 3 3-3" />
                  <path d="M2 10.5v1a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5v-1" />
                </svg>
                {downloaded ? "Downloaded!" : "Download policy.md"}
              </button>
              <p className="text-[11px] text-text-tertiary">
                Import this file in your OCC Agent dashboard to apply these rules.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
