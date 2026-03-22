import { ChangeEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { assetsApi } from "../api/assets";
import { secretsApi } from "../api/secrets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Settings, Check, Eye, EyeOff, RotateCw, Trash2, Plus, Plug, Copy, CheckCircle } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
  HintIcon
} from "../components/agent-config-primitives";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : "Failed to create invite"
      );
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);
  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Company Settings</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          General
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label="Company name" hint="The display name for your company.">
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional description shown in the company profile."
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder="Optional company description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Appearance
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label="Logo"
                hint="Upload a PNG, JPEG, WEBP, GIF, or SVG logo image."
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? "Removing..." : "Remove logo"}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : "Logo upload failed")}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">Uploading logo...</span>
                  )}
                </div>
              </Field>
              <Field
                label="Brand color"
                hint="Sets the hue for the company icon. Leave empty for auto-generated color."
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder="Auto"
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? "Saving..." : "Save changes"}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : "Failed to save"}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Hiring
        </div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label="Require board approval for new hires"
            hint="New agent hires stay pending until approved by board."
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
          />
        </div>
      </div>

      {/* Invites */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Invites
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              Generate an OpenClaw agent invite snippet.
            </span>
            <HintIcon text="Creates a short-lived OpenClaw agent invite and renders a copy-ready prompt." />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? "Generating..."
                : "Generate OpenClaw Invite Prompt"}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  OpenClaw Invite Prompt
                </div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    Copied
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? "Copied snippet" : "Copy snippet"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connect Your AI */}
      {selectedCompanyId && (
        <ConnectYourAI companyId={selectedCompanyId} />
      )}

      {/* API Keys */}
      {selectedCompanyId && (
        <CompanyApiKeys companyId={selectedCompanyId} />
      )}

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          Danger Zone
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Archive this company to hide it from the sidebar. This persists in
            the database.
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `Archive company "${selectedCompany.name}"? It will be hidden from the sidebar.`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? "Archiving..."
                : selectedCompany.status === "archived"
                ? "Already archived"
                : "Archive company"}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : "Failed to archive company"}
              </span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

function ConnectYourAI({ companyId }: { companyId: string }) {
  const [copied, setCopied] = useState(false);
  const [copiedDelightId, setCopiedDelightId] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["mcp-config", companyId],
    queryFn: async () => {
      const res = await fetch(`/mcp/config/${companyId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load connection config");
      return res.json() as Promise<{
        token: string;
        url: string;
        snippet: { mcpServers: { "occ-agent": { url: string } } };
      }>;
    },
  });

  const snippetJson = data
    ? JSON.stringify(data.snippet, null, 2)
    : "";

  async function handleCopy() {
    if (!snippetJson) return;
    try {
      await navigator.clipboard.writeText(snippetJson);
      setCopied(true);
      setCopiedDelightId((prev) => prev + 1);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may not be available */
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Connect Your AI
        </div>
      </div>
      <div className="space-y-3 rounded-md border border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-medium">
            Use your own AI with OCC Agent
          </span>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect Claude Desktop, Cursor, Windsurf, or any MCP-compatible AI to
          your OCC Agent dashboard. Your AI subscription powers the compute.
          OCC Agent is the control plane.
        </p>

        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading connection config...</p>
        )}

        {data && (
          <>
            <div className="relative">
              <pre className="rounded-lg border border-border bg-muted/30 px-3 py-3 font-mono text-xs leading-relaxed overflow-x-auto select-all">
                {snippetJson}
              </pre>
              <button
                onClick={handleCopy}
                className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-background/80 border border-border/50 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? (
                  <>
                    <CheckCircle key={copiedDelightId} className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy
                  </>
                )}
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <p className="text-[11px] text-muted-foreground/70 font-medium uppercase tracking-wide">
                How to connect
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>
                  Copy the snippet above
                </li>
                <li>
                  <strong>Claude Desktop:</strong> Paste into{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    claude_desktop_config.json
                  </code>
                </li>
                <li>
                  <strong>Cursor / Windsurf:</strong> Add as an MCP server in settings
                </li>
                <li>
                  Your AI can now create issues, manage agents, and view your dashboard
                </li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const KNOWN_API_KEYS = [
  { value: "ANTHROPIC_API_KEY", label: "Anthropic (Claude)" },
  { value: "OPENAI_API_KEY", label: "OpenAI (Codex / GPT)" },
  { value: "GEMINI_API_KEY", label: "Google (Gemini)" },
  { value: "CURSOR_API_KEY", label: "Cursor" },
] as const;

function CompanyApiKeys({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showNewValue, setShowNewValue] = useState(false);
  const [rotateId, setRotateId] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [showRotateValue, setShowRotateValue] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: secrets = [], isLoading } = useQuery({
    queryKey: ["company-secrets", companyId],
    queryFn: () => secretsApi.list(companyId),
  });

  // Filter to only show secrets that match known API key names
  const apiKeySecrets = secrets.filter((s) =>
    KNOWN_API_KEYS.some((k) => k.value === s.name)
  );
  const availableKeys = KNOWN_API_KEYS.filter(
    (k) => !secrets.some((s) => s.name === k.value)
  );

  const createMutation = useMutation({
    mutationFn: (data: { name: string; value: string }) =>
      secretsApi.create(companyId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-secrets", companyId] });
      setNewKeyName("");
      setNewKeyValue("");
      setShowNewValue(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save key");
    },
  });

  const rotateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) =>
      secretsApi.rotate(id, { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-secrets", companyId] });
      setRotateId(null);
      setRotateValue("");
      setShowRotateValue(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to rotate key");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => secretsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-secrets", companyId] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    },
  });

  function handleCreate() {
    if (!newKeyName || !newKeyValue) return;
    createMutation.mutate({ name: newKeyName, value: newKeyValue });
  }

  function handleRotate(id: string) {
    if (!rotateValue) return;
    rotateMutation.mutate({ id, value: rotateValue });
  }

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? All agents using this key will stop working.`)) return;
    deleteMutation.mutate(id);
  }

  const labelFor = (name: string) =>
    KNOWN_API_KEYS.find((k) => k.value === name)?.label ?? name;

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        API Keys
      </div>
      <div className="space-y-3 rounded-md border border-border px-4 py-4">
        <p className="text-xs text-muted-foreground">
          API keys set here are inherited by all agents in this company. Agent-level keys override these defaults.
        </p>

        {/* Existing keys */}
        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading...</p>
        )}
        {apiKeySecrets.map((secret) => (
          <div
            key={secret.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{labelFor(secret.name)}</div>
              <div className="text-xs text-muted-foreground font-mono">{secret.name}</div>
            </div>
            {rotateId === secret.id ? (
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <input
                    type={showRotateValue ? "text" : "password"}
                    className="w-56 rounded-md border border-border bg-transparent px-2.5 py-1 text-xs font-mono outline-none pr-7"
                    placeholder="New key value"
                    value={rotateValue}
                    onChange={(e) => setRotateValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowRotateValue(!showRotateValue)}
                  >
                    {showRotateValue ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRotate(secret.id)}
                  disabled={!rotateValue || rotateMutation.isPending}
                >
                  {rotateMutation.isPending ? "..." : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setRotateId(null); setRotateValue(""); setShowRotateValue(false); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRotateId(secret.id)}
                  title="Rotate key"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(secret.id, secret.name)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        ))}

        {/* Also show non-API-key secrets if any */}
        {secrets.filter((s) => !KNOWN_API_KEYS.some((k) => k.value === s.name)).map((secret) => (
          <div
            key={secret.id}
            className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium font-mono">{secret.name}</div>
              {secret.description && (
                <div className="text-xs text-muted-foreground">{secret.description}</div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRotateId(secret.id)}
                title="Rotate"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(secret.id, secret.name)}
                className="text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        {/* Add new key */}
        {availableKeys.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            <select
              className="flex-[2] rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
            >
              <option value="">Add API key...</option>
              {availableKeys.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            {newKeyName && (
              <>
                <div className="relative flex-[3]">
                  <input
                    type={showNewValue ? "text" : "password"}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none pr-8"
                    placeholder="sk-ant-..."
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewValue(!showNewValue)}
                  >
                    {showNewValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newKeyValue || createMutation.isPending}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {createMutation.isPending ? "Saving..." : "Add"}
                </Button>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {apiKeySecrets.length === 0 && !isLoading && (
          <p className="text-xs text-muted-foreground/60 pt-1">
            No API keys configured. Add one to enable AI agents.
          </p>
        )}
      </div>
    </div>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in OCC Agent, then retry.
Suggested steps:
- choose a hostname that resolves to the OCC Agent host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart OCC Agent
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in OCC Agent, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test OCC Agent-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from OCC Agent. Test it. `
    : "";

  return `You're invited to join an OCC Agent organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than OCC Agent, OCC Agent must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that OCC Agent can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, OCC Agent will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "occ-agent-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to OCC Agent (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}
