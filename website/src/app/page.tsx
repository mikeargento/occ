"use client";

import Link from "next/link";
import React, { useState, useCallback, useEffect } from "react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { InteractiveSignerSection } from "./integrations/signer-toggle";
import { CopyButton } from "./integrations/copy-button";
import {
  toUrlSafeB64,
  truncateHash,
  relativeTime,
  enforcementLabel,
  enforcementColor,
} from "@/lib/explorer";
import type { OCCProof } from "@/lib/occ";

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
  { key: "google", logo: logos.google, available: true },
  { key: "llamaindex", logo: logos.llamaindex, available: true },
  { key: "autogen", logo: logos.autogen, available: true },
  { key: "cloudflare", logo: logos.cloudflare, available: true },
  { key: "github", logo: logos.github, available: true },
  { key: "paperclip", logo: <Logo src="/logos/paperclip.svg" alt="Paperclip" invert />, available: true },
  { key: "composio", logo: logos.composio, available: true },
  { key: "openclaw", logo: logos.openclaw, available: true },
  { key: "mastra", logo: logos.mastra, available: true },
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
    install: "npm install occ-langgraph",
    status: "available",
    icon: "\ud83e\udd9c",
    logo: logos.langchain,
    snippet: `import { occNode } from 'occ-langgraph';

const searchNode = occNode(async (state) => {
  return { results: await search(state.query) };
}, 'search');`,
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
    install: "pip install occ-gemini",
    status: "available",
    icon: "\u25c7",
    logo: logos.google,
    snippet: `from occ_gemini import wrap_model

model = wrap_model(genai.GenerativeModel('gemini-pro'))
# Every function call gets a signed receipt.`,
  },
  {
    name: "Google ADK",
    description: "Agent Development Kit integration",
    install: "pip install occ-google-adk",
    status: "available",
    icon: "\u25c7",
    logo: logos.google,
    snippet: `from occ_google_adk import occ_tool, OccToolHook

@occ_tool
def search(query: str) -> str:
    return web_search(query)`,
  },
  {
    name: "LlamaIndex",
    description: "Tool-level proof for LlamaIndex agents",
    install: "pip install occ-llamaindex",
    status: "available",
    icon: "\ud83e\udd99",
    logo: logos.llamaindex,
    snippet: `from occ_llamaindex import OccTool, wrap_tools

safe_tools = wrap_tools([search_tool, calc_tool])
# Every tool call is signed.`,
  },
  {
    name: "AutoGen",
    description: "Multi-agent proof chains for AutoGen",
    install: "pip install occ-autogen",
    status: "available",
    icon: "\u2699",
    logo: logos.autogen,
    snippet: `from occ_autogen import occ_tool

@occ_tool
def calculator(expression: str) -> str:
    return str(eval(expression))`,
  },
  {
    name: "OpenClaw",
    description: "Local AI assistant with 20+ messaging platforms",
    install: "pip install occ-openclaw",
    status: "available",
    icon: "🦞",
    logo: logos.openclaw,
    snippet: `from occ_openclaw import occ_tool, OccMiddleware

@occ_tool
def send_message(text: str) -> str:
    return dispatch(text)`,
  },
  {
    name: "Mastra",
    description: "TypeScript AI framework integration",
    install: "npm install occ-mastra",
    status: "available",
    icon: "\u25ce",
    logo: logos.mastra,
    snippet: `import { occWrapTools } from 'occ-mastra';

const tools = occWrapTools({
  search: searchTool,
  calculate: calcTool,
});`,
  },
  {
    name: "Cloudflare Workers",
    description: "Edge-deployed AI with proof",
    install: "npm install occ-cloudflare",
    status: "available",
    icon: "\u2601",
    logo: logos.cloudflare,
    snippet: `import { occWrapTool } from 'occ-cloudflare';

const wrapped = occWrapTool(myTool, 'search');
const { result, proofs } = await wrapped.execute(args);`,
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

/* ── Live Proof Feed (homepage mini-explorer) ── */

interface HomeProofSummary {
  id: number;
  digestB64: string;
  counter: string | null;
  commitTime: number | null;
  enforcement: string;
  signerPub: string;
  hasAgency: boolean;
  hasTsa: boolean;
  attrName: string | null;
  indexedAt: string;
}

function LiveProofFeed() {
  const [proofs, setProofs] = useState<HomeProofSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proofs?limit=5&page=1")
      .then((r) => r.json())
      .then((data) => setProofs(data.proofs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-text-tertiary animate-pulse py-4">Loading live proofs...</div>;
  }

  if (proofs.length === 0) {
    return (
      <div className="text-sm text-text-secondary py-4">
        No proofs indexed yet. Commit a file through{" "}
        <Link href="/studio" className="text-text hover:underline">Studio</Link>{" "}
        to see it here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg overflow-hidden divide-y divide-border-subtle">
      {proofs.map((p) => (
        <HomeProofRow key={p.id} proof={p} />
      ))}
    </div>
  );
}

function HomeProofRow({ proof: p }: { proof: HomeProofSummary }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<OCCProof | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const res = await fetch(`/api/proofs/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`);
        if (res.ok) {
          const data = await res.json();
          const first = data.proofs?.[0]?.proof ?? data.proof;
          if (first) setDetail(first);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
  }, [expanded, detail, p.digestB64]);

  return (
    <div>
      <div className="flex items-center px-4 sm:px-5 py-3.5 hover:bg-bg-subtle/40 transition-colors">
        <button
          onClick={toggle}
          className="shrink-0 mr-2 sm:mr-3 text-text-tertiary hover:text-text transition-colors p-0.5"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
            className={`transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          >
            <path d="M3 1.5L7 5L3 8.5" />
          </svg>
        </button>
        <Link
          href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
          className="flex items-center justify-between flex-1 min-w-0"
        >
          <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
            <code className="text-xs sm:text-sm font-mono text-text truncate min-w-0">
              {p.digestB64}
            </code>
            <span className={`text-[10px] sm:text-xs font-medium shrink-0 ${enforcementColor(p.enforcement)}`}>
              <span className="hidden sm:inline">{enforcementLabel(p.enforcement)}</span>
              <span className="sm:hidden">{p.enforcement === "measured-tee" ? "TEE" : p.enforcement === "hw-key" ? "HW" : "SW"}</span>
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2 sm:ml-4">
            {p.hasAgency && (
              <span className="text-blue-600 dark:text-blue-400" title="Device-authorized">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
            )}
            {p.hasTsa && (
              <span className="text-purple-600 dark:text-purple-400" title="RFC 3161 timestamped">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </span>
            )}
            <span className="text-[10px] sm:text-xs text-text-tertiary w-14 sm:w-16 text-right">
              {p.commitTime ? relativeTime(p.commitTime) : "—"}
            </span>
          </div>
        </Link>
      </div>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 pt-1 bg-bg-subtle/20">
          {loading ? (
            <div className="text-xs text-text-tertiary animate-pulse py-2">Loading proof...</div>
          ) : detail ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">SHA-256 Digest</div>
                <code className="text-xs font-mono text-text break-all">{detail.artifact.digestB64}</code>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Signer</div>
                  <code className="font-mono text-text">{truncateHash(detail.signer.publicKeyB64, 12)}</code>
                </div>
                <div>
                  <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Enforcement</div>
                  <span className={`font-medium ${enforcementColor(detail.environment.enforcement)}`}>
                    {enforcementLabel(detail.environment.enforcement)}
                  </span>
                </div>
                {detail.commit.time && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Committed</div>
                    <span className="text-text">{new Date(detail.commit.time).toLocaleString()}</span>
                  </div>
                )}
                {detail.attribution?.name && (
                  <div>
                    <div className="text-[10px] text-text-tertiary uppercase tracking-wider">Attribution</div>
                    <span className="text-text">{detail.attribution.name}</span>
                  </div>
                )}
              </div>
              <Link
                href={`/explorer/${encodeURIComponent(toUrlSafeB64(p.digestB64))}`}
                className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors mt-1"
              >
                View full proof
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="text-xs text-text-tertiary py-2">Could not load proof details.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ── */

export default function Home() {
  const available = frameworks.filter((f) => f.status === "available");

  return (
    <>
    <div className="noise-overlay" />
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-28">
      {/* Hero */}
      <section className="relative mb-16 sm:mb-28">
                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-12">
          <div className="lg:max-w-xl">
            <h1 className="hero-animate text-3xl sm:text-5xl md:text-6xl font-bold tracking-[-0.04em] mb-6" style={{ animationDelay: "0ms" }}>
              One proof format.<br />
              Every AI framework.
            </h1>
            <p className="hero-animate text-text-secondary text-base sm:text-lg md:text-xl leading-relaxed" style={{ animationDelay: "120ms" }}>
              OCC runs beneath your tools, your agents, your entire stack.
              Every action produces a cryptographic receipt.
              If the receipt exists, it couldn&apos;t have happened any other way.
            </p>
            <div className="hero-animate mt-8 flex items-center gap-3" style={{ animationDelay: "160ms" }}>
              <code className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold tracking-tight text-text">
                npx occ
              </code>
              <CopyButton text="npx occ" />
            </div>
          </div>
          <div className="hero-animate grid grid-cols-4 gap-3 sm:gap-5 shrink-0" style={{ animationDelay: "200ms" }}>
            {heroLogos.map((h) => (
              <div
                key={h.key}
                className="flex items-center justify-center w-14 h-14 sm:w-20 sm:h-20 rounded-xl transition-all duration-300 bg-bg-elevated/50 hover:bg-bg-elevated"
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

      {/* Live Proof Explorer */}
      <section className="mb-20 sm:mb-28">
        <ScrollReveal>
        <div className="rounded-xl border border-border-subtle bg-bg-elevated p-6 sm:p-10 md:p-14">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">
              Live Proofs
            </h2>
            <Link
              href="/explorer"
              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 transition-colors"
            >
              View all in Explorer
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <p className="text-text-secondary text-base leading-relaxed max-w-2xl mb-6">
            Every integration produces the same{" "}
            <code className="font-mono text-sm bg-bg-subtle px-1.5 py-0.5 rounded">
              occ/1
            </code>{" "}
            proof format. These are real proofs committed through OCC — click to expand.
          </p>
          <LiveProofFeed />
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
              <p className="text-[11px] sm:text-xs text-text-secondary leading-relaxed line-clamp-3 sm:line-clamp-none">
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

      <p className="text-[13px] sm:text-sm text-text-secondary leading-relaxed mb-4">
        {description}
      </p>

      {install && (
        <div className="mt-auto">
          <div className="flex items-center gap-1 bg-bg rounded-lg px-3 py-2 min-w-0">
            <code className="flex-1 text-[11px] sm:text-xs font-mono text-text-tertiary overflow-x-auto whitespace-nowrap">
              {install}
            </code>
            <CopyButton text={snippet ?? install} />
          </div>
        </div>
      )}

    </div>
  );
}
