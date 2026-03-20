"use client";

import Link from "next/link";
import React from "react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { InteractiveSignerSection } from "./integrations/signer-toggle";
import { CopyButton } from "./integrations/copy-button";

/* eslint-disable @next/next/no-img-element */

/* ── Logo helper ── */

function Logo({ src, alt, invert }: { src: string; alt: string; invert?: boolean }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`w-9 h-9${invert ? " dark:invert" : ""}`}
    />
  );
}

const logos = {
  mcp: <Logo src="/logos/mcp.svg" alt="MCP" />,
  claude: <Logo src="/logos/anthropic.svg" alt="Anthropic" invert />,
  cursor: <Logo src="/logos/cursor.svg" alt="Cursor" invert />,
  openai: <Logo src="/logos/openai.svg" alt="OpenAI" invert />,
  langchain: <Logo src="/logos/langchain.svg" alt="LangChain" invert />,
  vercel: <Logo src="/logos/vercel.svg" alt="Vercel" invert />,
  crewai: <Logo src="/logos/crewai.svg" alt="CrewAI" />,
  google: <Logo src="/logos/google.svg" alt="Google" />,
  llamaindex: <Logo src="/logos/llamaindex.svg" alt="LlamaIndex" />,
  autogen: <Logo src="/logos/autogen.svg" alt="AutoGen" />,
  mastra: <Logo src="/logos/mastra.svg" alt="Mastra" invert />,
  cloudflare: <Logo src="/logos/cloudflare.svg" alt="Cloudflare" />,
  github: <Logo src="/logos/github.svg" alt="GitHub" invert />,
  composio: <Logo src="/logos/composio.svg" alt="Composio" invert />,
  agentops: <Logo src="/logos/agentops.svg" alt="AgentOps" invert />,
  julep: <Logo src="/logos/julep.svg" alt="Julep" invert />,
  relevanceai: <Logo src="/logos/relevanceai.svg" alt="Relevance AI" invert />,
  letta: <Logo src="/logos/letta.svg" alt="Letta" invert />,
  superagi: <Logo src="/logos/superagi.svg" alt="SuperAGI" invert />,
  openclaw: <Logo src="/logos/openclaw.svg" alt="OpenClaw" />,
};

/* ── Unique logos for hero grid (deduplicated by company) ── */
const heroLogos = [
  { key: "mcp", logo: logos.mcp, available: true },
  { key: "claude", logo: logos.claude, available: true },
  { key: "cursor", logo: logos.cursor, available: true },
  { key: "openai", logo: logos.openai, available: true },
  { key: "langchain", logo: logos.langchain, available: true },
  { key: "vercel", logo: logos.vercel, available: true },
  { key: "crewai", logo: logos.crewai, available: true },
  { key: "google", logo: logos.google, available: false },
  { key: "llamaindex", logo: logos.llamaindex, available: false },
  { key: "autogen", logo: logos.autogen, available: false },
  { key: "cloudflare", logo: logos.cloudflare, available: false },
  { key: "github", logo: logos.github, available: true },
  { key: "paperclip", logo: <Logo src="/logos/paperclip.svg" alt="Paperclip" invert />, available: true },
  { key: "composio", logo: logos.composio, available: true },
  { key: "openclaw", logo: logos.openclaw, available: false },
  { key: "mastra", logo: logos.mastra, available: false },
];

/* ── Framework data ── */

type Framework = {
  name: string;
  description: string;
  install?: string;
  status: "available" | "coming-soon";
  icon: string;
  logo?: React.ReactNode;
  snippet?: string;
};

const frameworks: Framework[] = [
  {
    name: "MCP (any server)",
    description: "Wrap ANY MCP server with one command",
    install: "npx occ-mcp-proxy --wrap npx <any-mcp-server>",
    status: "available",
    icon: "\u26a1",
    logo: logos.mcp,
    snippet: `npx occ-mcp-proxy --wrap npx @modelcontextprotocol/server-filesystem /home`,
  },
  {
    name: "Claude Desktop",
    description: "Wrap any MCP server with cryptographic proof",
    install: "Add to claude_desktop_config.json",
    status: "available",
    icon: "\u2728",
    logo: logos.claude,
    snippet: `{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": [
        "occ-mcp-proxy",
        "--wrap",
        "npx", "@modelcontextprotocol/server-filesystem", "/home"
      ]
    }
  }
}`,
  },
  {
    name: "Cursor",
    description: "Proof for every AI edit in your IDE",
    install: "Add to .cursor/mcp.json",
    status: "available",
    icon: "\u270e",
    logo: logos.cursor,
  },
  {
    name: "OpenAI",
    description: "Wrap OpenAI function calls with proof",
    install: "npm install occ-openai",
    status: "available",
    icon: "\u25cb",
    logo: logos.openai,
    snippet: `import { occWrap } from 'occ-openai';

const tools = occWrap([
  { name: 'search', fn: searchWeb },
  { name: 'calculate', fn: calculate },
]);
// Every function call gets a cryptographic receipt.`,
  },
  {
    name: "OpenAI Agents",
    description: "Cryptographic receipts for agent tool use",
    install: "pip install occ-openai-agents",
    status: "available",
    icon: "\u25cb",
    logo: logos.openai,
    snippet: `from occ_openai_agents import OccAgent

agent = OccAgent(
    name="researcher",
    tools=[search, summarize],
)
# Every tool invocation is signed.`,
  },
  {
    name: "LangChain",
    description: "OCC callback handler for LangChain",
    install: "pip install occ-langchain",
    status: "available",
    icon: "\ud83e\udd9c",
    logo: logos.langchain,
    snippet: `from occ_langchain import OccCallbackHandler, occ_tool

@occ_tool
def search(query: str) -> str:
    return web_search(query)

handler = OccCallbackHandler()
chain.invoke(input, config={"callbacks": [handler]})`,
  },
  {
    name: "LangGraph",
    description: "Proof for every node execution",
    status: "coming-soon",
    icon: "\ud83e\udd9c",
    logo: logos.langchain,
  },
  {
    name: "Vercel AI SDK",
    description: "Middleware for Vercel AI tool calls",
    install: "npm install occ-vercel",
    status: "available",
    icon: "\u25b2",
    logo: logos.vercel,
    snippet: `import { occMiddleware } from 'occ-vercel';
import { createAI } from 'ai';

const ai = createAI({
  middleware: [occMiddleware()],
});
// Proof for every tool call, automatically.`,
  },
  {
    name: "CrewAI",
    description: "OCC-wrapped tools for CrewAI agents",
    install: "pip install occ-crewai",
    status: "available",
    icon: "\ud83d\udee0",
    logo: logos.crewai,
  },
  {
    name: "Google Gemini",
    description: "Proof for Gemini function calling",
    status: "coming-soon",
    icon: "\u25c7",
    logo: logos.google,
  },
  {
    name: "Google ADK",
    description: "Agent Development Kit integration",
    status: "coming-soon",
    icon: "\u25c7",
    logo: logos.google,
  },
  {
    name: "LlamaIndex",
    description: "Tool-level proof for LlamaIndex agents",
    status: "coming-soon",
    icon: "\ud83e\udd99",
    logo: logos.llamaindex,
  },
  {
    name: "AutoGen",
    description: "Multi-agent proof chains for AutoGen",
    status: "coming-soon",
    icon: "\u2699",
    logo: logos.autogen,
  },
  {
    name: "OpenClaw",
    description: "Local AI assistant with 20+ messaging platforms",
    status: "coming-soon",
    icon: "🦞",
    logo: logos.openclaw,
  },
  {
    name: "Mastra",
    description: "TypeScript AI framework integration",
    status: "coming-soon",
    icon: "\u25ce",
    logo: logos.mastra,
  },
  {
    name: "Cloudflare Workers",
    description: "Edge-deployed AI with proof",
    status: "coming-soon",
    icon: "\u2601",
    logo: logos.cloudflare,
  },
  {
    name: "GitHub Actions",
    description: "Verify proof chains in CI",
    install: "uses: mikeargento/occ-verify-action@v1",
    status: "available",
    icon: "\u2699",
    logo: logos.github,
    snippet: `- name: Verify OCC proofs
  uses: mikeargento/occ-verify-action@v1
  with:
    proof-path: ./proof.jsonl`,
  },
];

/* ── Code examples for the bottom section ── */

const codeExamples = [
  {
    title: "Wrap any MCP server",
    lang: "bash",
    code: `npx occ-mcp-proxy --wrap npx @modelcontextprotocol/server-filesystem /home

# proof.jsonl appears in .occ/
# Every tool call → Ed25519 signed receipt`,
  },
  {
    title: "Python (LangChain)",
    lang: "python",
    code: `from occ import OccTool

@occ_tool
def search(query: str) -> str:
    return web_search(query)

# Every call is signed.
# Every denial is on the record.`,
  },
  {
    title: "TypeScript (Vercel AI)",
    lang: "typescript",
    code: `import { occMiddleware } from 'occ-vercel';

const ai = createAI({
  middleware: [occMiddleware()],
});

// Proof for every tool call, automatically.`,
  },
];

/* ── Page ── */

export default function Home() {
  const available = frameworks.filter((f) => f.status === "available");
  const comingSoon = frameworks.filter((f) => f.status === "coming-soon");

  return (
    <>
    <div className="noise-overlay" />
    <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
      {/* Hero */}
      <section className="relative mb-20 sm:mb-28">
        <div className="hero-glow" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
          <div className="lg:max-w-xl">
            <h1 className="hero-animate text-[2rem] sm:text-5xl md:text-6xl font-bold tracking-[-0.04em] mb-6 whitespace-nowrap" style={{ animationDelay: "0ms" }}>
              One proof format.<br />
              Every AI framework.
            </h1>
            <p className="hero-animate text-text-secondary text-lg sm:text-xl leading-relaxed" style={{ animationDelay: "120ms" }}>
              OCC runs beneath your tools, your agents, your entire stack.
              Every action produces a cryptographic receipt.
              If the receipt exists, it couldn&apos;t have happened any other way.
            </p>
          </div>
          <div className="hero-animate grid grid-cols-4 gap-4 sm:gap-5 shrink-0" style={{ animationDelay: "200ms" }}>
            {heroLogos.map((h) => (
              <div
                key={h.key}
                className="flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-xl transition-all duration-300 bg-bg-elevated/50 hover:bg-bg-elevated"
                title={h.key}
              >
                {h.logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signer Mode Toggle */}
      <ScrollReveal>
        <InteractiveSignerSection />
      </ScrollReveal>

      {/* Available */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            Available now
          </h2>
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
            {available.length} integrations
          </span>
        </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {available.map((f, i) => (
            <ScrollReveal key={f.name} delay={i * 40} className="h-full">
              <FrameworkCard framework={f} />
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Coming Soon */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <div className="flex items-center gap-3 mb-10">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            Coming soon
          </h2>
          <span className="inline-flex items-center rounded-full bg-bg-subtle px-2.5 py-0.5 text-xs font-medium text-text-tertiary">
            {comingSoon.length} planned
          </span>
        </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {comingSoon.map((f, i) => (
            <ScrollReveal key={f.name} delay={i * 40} className="h-full">
              <FrameworkCard framework={f} />
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Code Examples */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] mb-4">
          Three lines to proof
        </h2>
        <p className="text-text-secondary text-base leading-relaxed max-w-xl mb-10">
          No matter which framework you use, integration is the same pattern:
          wrap, call, verify.
        </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {codeExamples.map((ex, i) => (
            <ScrollReveal key={ex.title} delay={i * 60}>
            <div
              className="rounded-xl border border-border-subtle bg-bg-elevated p-6 flex flex-col h-full transition-all duration-300 hover:border-border"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
                  {ex.lang}
                </span>
                <span className="text-text-tertiary">&middot;</span>
                <span className="text-sm font-medium text-text-secondary">
                  {ex.title}
                </span>
              </div>
              <div className="relative flex-1">
                <div className="absolute top-0 right-0">
                  <CopyButton text={ex.code} />
                </div>
                <pre className="text-sm font-mono text-text-secondary leading-relaxed overflow-x-auto">
                  <code>{ex.code}</code>
                </pre>
              </div>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Universal Proof Format */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-10 sm:p-14">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] mb-4">
            Universal Proof Format
          </h2>
          <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-6">
            Every integration produces the same{" "}
            <code className="font-mono text-sm bg-bg-subtle px-1.5 py-0.5 rounded">
              occ/1
            </code>{" "}
            proof format. Same Ed25519 signatures. Same verification algorithm.
            Whether the proof was generated by a Python agent, a TypeScript MCP
            server, or a CI pipeline — the output is identical and
            interchangeable.
          </p>
          <pre className="text-sm font-mono text-text-secondary leading-relaxed bg-bg rounded-lg p-6 overflow-x-auto">
            <code>{`{
  "version": "occ/1",
  "timestamp": "2026-03-19T...",
  "tool": "search",
  "input_digest": "sha256:...",
  "output_digest": "sha256:...",
  "signature": "ed25519:...",
  "public_key": "ed25519:..."
}`}</code>
          </pre>
        </div>
        </ScrollReveal>
      </section>

      {/* Orchestrators */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">
            Orchestrators
          </h2>
          <span className="inline-flex items-center rounded-full bg-bg-subtle px-2.5 py-0.5 text-xs font-medium text-text-tertiary">
            Agent platforms
          </span>
        </div>
        <p className="text-text-secondary text-base leading-relaxed max-w-xl mb-10">
          OCC plugs into multi-agent orchestration platforms. Run agents through
          any orchestrator — every tool call still gets a cryptographic receipt.
        </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            {
              name: "Paperclip",
              description: "Agent control plane with task management, multi-agent orchestration, and cryptographic proof on every action",
              status: "available" as const,
              logo: <Logo src="/logos/paperclip.svg" alt="Paperclip" invert />,
            },
            {
              name: "Composio",
              description: "250+ tool integrations with cryptographic proof on every call",
              status: "coming-soon" as const,
              logo: logos.composio,
            },
            {
              name: "LangSmith",
              description: "Proof-enriched traces for LangChain observability",
              status: "coming-soon" as const,
              logo: logos.langchain,
            },
            {
              name: "Julep",
              description: "Stateful agent workflows with proof at every step",
              status: "coming-soon" as const,
              logo: logos.julep,
            },
            {
              name: "AgentOps",
              description: "Agent observability with cryptographic audit trails",
              status: "coming-soon" as const,
              logo: logos.agentops,
            },
            {
              name: "Relevance AI",
              description: "No-code agent builder with proof integration",
              status: "coming-soon" as const,
              logo: logos.relevanceai,
            },
            {
              name: "Letta (MemGPT)",
              description: "Long-term memory agents with proof chains",
              status: "coming-soon" as const,
              logo: logos.letta,
            },
            {
              name: "SuperAGI",
              description: "Autonomous agent framework with OCC receipts",
              status: "coming-soon" as const,
              logo: logos.superagi,
            },
          ] as const).map((o, i) => (
            <ScrollReveal key={o.name} delay={i * 40}>
            <div
              className={`rounded-xl border p-5 flex flex-col h-full transition-all duration-300 hover:border-border ${
                o.status === "available"
                  ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                  : "border-border-subtle bg-bg-elevated"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {o.logo && <div className="shrink-0">{o.logo}</div>}
                  <h3 className="text-sm font-semibold">{o.name}</h3>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    o.status === "available"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-bg-subtle text-text-tertiary"
                  }`}
                >
                  {o.status === "available" ? "Available" : "Coming Soon"}
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                {o.description}
              </p>
            </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* CTA */}
      <ScrollReveal>
      <section className="text-center">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] mb-4">
          Don&apos;t see your framework?
        </h2>
        <p className="text-text-secondary text-base leading-relaxed max-w-lg mx-auto mb-8">
          OCC is open source. Add proof to any tool-calling framework in
          minutes. Contributions welcome.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-lg bg-text text-bg px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          >
            Documentation
          </Link>
          <a
            href="https://github.com/mikeargento/occ"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center justify-center rounded-lg border border-border-subtle px-6 py-3 text-sm font-semibold text-text-secondary hover:text-text hover:border-border transition-colors"
          >
            GitHub
          </a>
        </div>
      </section>
      </ScrollReveal>
    </div>
    </>
  );
}

/* ── Card component ── */

function FrameworkCard({ framework }: { framework: Framework }) {
  const { name, description, install, status, logo, snippet } = framework;
  const isAvailable = status === "available";
  const isMCP = name === "MCP (any server)";

  return (
    <div
      className={`group rounded-xl border p-6 flex flex-col h-full transition-all duration-300 ${
        isMCP
          ? "border-emerald-500/30 bg-emerald-500/[0.03] hover:border-emerald-500/50"
          : "border-border-subtle bg-bg-elevated hover:border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            {logo}
          </div>
          <h3 className="text-base font-semibold">{name}</h3>
        </div>
        <span
          className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isAvailable
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-bg-subtle text-text-tertiary"
          }`}
        >
          {isAvailable ? "Available" : "Coming Soon"}
        </span>
      </div>

      <p className="text-sm text-text-secondary leading-relaxed mb-4">
        {description}
      </p>

      {install && (
        <div className="mt-auto">
          <div className="flex items-center gap-1 bg-bg rounded-lg px-3 py-2">
            <code className="flex-1 text-xs font-mono text-text-tertiary overflow-x-auto">
              {install}
            </code>
            <CopyButton text={install} />
          </div>
        </div>
      )}

    </div>
  );
}
