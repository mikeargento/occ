import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { agentsApi } from "../api/agents";
import { secretsApi } from "../api/secrets";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import {
  isOnboardingPath,
} from "../lib/onboarding-route";
import {
  Building2,
  Key,
  Eye,
  EyeOff,
  Loader2,
  X,
} from "lucide-react";

type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "process"
  | "http"
  | "openclaw_gateway";

function providerToAdapterType(provider: string): AdapterType {
  switch (provider) {
    case "ANTHROPIC_API_KEY":
      return "claude_local";
    case "OPENAI_API_KEY":
      return "codex_local";
    case "GEMINI_API_KEY":
      return "gemini_local";
    case "CURSOR_API_KEY":
      return "cursor";
    default:
      return "claude_local";
  }
}

export function OnboardingWizard() {
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } =
    useCompany();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  // Check if the current route is an onboarding path
  const isRouteOnboarding =
    !companyPrefix || !companiesLoading
      ? isOnboardingPath(location.pathname)
      : false;
  const effectiveOnboardingOpen =
    onboardingOpen || (isRouteOnboarding && !routeDismissed);

  // Existing company passed in via options (e.g. from Dashboard "Create one here")
  const existingCompanyId = onboardingOptions.companyId;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Company
  const [companyName, setCompanyName] = useState("");

  // API Key
  const [apiKeyProvider, setApiKeyProvider] = useState("ANTHROPIC_API_KEY");
  const [apiKeyValue, setApiKeyValue] = useState("");
  const [apiKeyShowValue, setApiKeyShowValue] = useState(false);

  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  function reset() {
    setLoading(false);
    setError(null);
    setCompanyName("");
    setApiKeyProvider("ANTHROPIC_API_KEY");
    setApiKeyValue("");
    setApiKeyShowValue(false);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  async function handleGetStarted() {
    setLoading(true);
    setError(null);
    try {
      // 1. Create or reuse company
      let companyId = existingCompanyId ?? null;
      let companyPrefix: string | null = null;

      if (!companyId) {
        if (!companyName.trim()) {
          setError("Company name is required.");
          setLoading(false);
          return;
        }
        const company = await companiesApi.create({
          name: companyName.trim(),
        });
        companyId = company.id;
        companyPrefix = company.issuePrefix;
        setSelectedCompanyId(company.id);
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      } else {
        // Backfill prefix from existing companies list
        const existing = companies.find((c) => c.id === companyId);
        if (existing) companyPrefix = existing.issuePrefix;
      }

      // 2. Save API key as company secret (if provided)
      if (apiKeyValue.trim()) {
        await secretsApi.create(companyId, {
          name: apiKeyProvider,
          value: apiKeyValue.trim(),
          provider: "local_encrypted",
        });
      }

      // 3. Auto-create CEO agent with adapter based on API key provider
      const adapterType = providerToAdapterType(apiKeyProvider);
      const adapter = getUIAdapter(adapterType);
      const adapterConfig = adapter.buildAdapterConfig({
        ...defaultCreateValues,
        adapterType,
        dangerouslySkipPermissions: adapterType === "claude_local",
      });

      await agentsApi.create(companyId, {
        name: "CEO",
        role: "ceo",
        adapterType,
        adapterConfig,
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1,
          },
        },
      });

      // 4. Navigate with a full page load to avoid stale React state race
      // The companies list hasn't re-rendered yet after refetch, so Layout
      // would clobber selectedCompanyId. A hard navigation ensures clean state.
      window.location.href = companyPrefix ? `/${companyPrefix}/dashboard` : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (companyName.trim() || existingCompanyId) handleGetStarted();
    }
  }

  if (!effectiveOnboardingOpen) return null;

  // If an existing company was passed in, we skip the company name field
  const needsCompany = !existingCompanyId;

  return (
    <Dialog
      open={effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRouteDismissed(true);
          handleClose();
        }
      }}
    >
      <DialogPortal>
        <div className="fixed inset-0 z-50 bg-background" />
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onKeyDown={handleKeyDown}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          <div className="w-full max-w-md px-8">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold">Set up your workspace</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {needsCompany
                  ? "Create a company and configure your AI provider to get started."
                  : "Configure your AI provider to get started."}
              </p>
            </div>

            <div className="space-y-5">
              {/* Company name */}
              {needsCompany && (
                <div className="group">
                  <label className="text-xs text-muted-foreground mb-1 block group-focus-within:text-foreground transition-colors">
                    <Building2 className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                    Company name
                  </label>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoFocus
                  />
                </div>
              )}

              {/* API Key provider + value */}
              <div className="space-y-3">
                <div className="group">
                  <label className="text-xs text-muted-foreground mb-1 block group-focus-within:text-foreground transition-colors">
                    <Key className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
                    AI Provider
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={apiKeyProvider}
                    onChange={(e) => setApiKeyProvider(e.target.value)}
                  >
                    <option value="ANTHROPIC_API_KEY">
                      Anthropic (Claude)
                    </option>
                    <option value="OPENAI_API_KEY">OpenAI</option>
                    <option value="GEMINI_API_KEY">Google (Gemini)</option>
                    <option value="CURSOR_API_KEY">Cursor</option>
                  </select>
                </div>

                <div className="group">
                  <label className="text-xs text-muted-foreground mb-1 block group-focus-within:text-foreground transition-colors">
                    API key
                  </label>
                  <div className="relative">
                    <input
                      type={apiKeyShowValue ? "text" : "password"}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 pr-9 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="sk-..."
                      value={apiKeyValue}
                      onChange={(e) => setApiKeyValue(e.target.value)}
                      autoFocus={!needsCompany}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setApiKeyShowValue((v) => !v)}
                      tabIndex={-1}
                    >
                      {apiKeyShowValue ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                    Your API key is encrypted. All agents inherit it
                    automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-3">
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 space-y-3">
              <Button
                className="w-full"
                disabled={loading || (needsCompany && !companyName.trim())}
                onClick={handleGetStarted}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {loading ? "Setting up..." : "Get Started"}
              </Button>

              {apiKeyValue.trim() === "" && (
                <button
                  type="button"
                  className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  onClick={handleGetStarted}
                  disabled={loading || (needsCompany && !companyName.trim())}
                >
                  Skip API key and configure later
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}
