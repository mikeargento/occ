import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { proofsApi } from "../api/proofs";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { ProofStats } from "../components/ProofStats";
import { ProofTimeline } from "../components/ProofTimeline";
import { ProofChainIndicator } from "../components/ProofChainIndicator";
import { Shield, Download } from "lucide-react";

export function ProofLog() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [agentFilter, setAgentFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [enforcementFilter, setEnforcementFilter] = useState<string>("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Proof Log" }]);
  }, [setBreadcrumbs]);

  const filterParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (agentFilter) p.agentId = agentFilter;
    if (typeFilter) p.proofType = typeFilter;
    if (enforcementFilter) p.enforcement = enforcementFilter;
    p.limit = "100";
    return p;
  }, [agentFilter, typeFilter, enforcementFilter]);

  const {
    data: proofData,
    isLoading: proofsLoading,
  } = useQuery({
    queryKey: queryKeys.proofs.list(selectedCompanyId!, filterParams),
    queryFn: () => proofsApi.list(selectedCompanyId!, filterParams),
    enabled: !!selectedCompanyId,
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.proofs.stats(selectedCompanyId!),
    queryFn: () => proofsApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30000,
  });

  const { data: agentList } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={Shield} message="Select a company to view proofs." />;
  }

  if (proofsLoading || statsLoading) {
    return <PageSkeleton variant="list" />;
  }

  const proofs = proofData?.proofs ?? [];
  const agents = (agentList as Array<{ id: string; name: string }>) ?? [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Proof Log</h1>
        <div className="flex items-center gap-3">
          {proofs.length > 0 && <ProofChainIndicator proofs={proofs} />}
          {proofs.length > 0 && (
            <a
              href={`/api/companies/${selectedCompanyId}/proofs/export?${new URLSearchParams(filterParams)}`}
              download
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Export all ({proofData?.total ?? 0})
            </a>
          )}
        </div>
      </div>

      {stats && (
        <ProofStats
          stats={stats}
          onAgentClick={(id) => setAgentFilter(id === agentFilter ? "" : id)}
        />
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="text-sm bg-background border border-border rounded-md px-3 py-1.5 text-foreground"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="text-sm bg-background border border-border rounded-md px-3 py-1.5 text-foreground"
        >
          <option value="">All types</option>
          <option value="pre-exec">Pre-exec</option>
          <option value="post-exec">Post-exec</option>
          <option value="event">Event</option>
        </select>

        <select
          value={enforcementFilter}
          onChange={(e) => setEnforcementFilter(e.target.value)}
          className="text-sm bg-background border border-border rounded-md px-3 py-1.5 text-foreground"
        >
          <option value="">All enforcement</option>
          <option value="tee">TEE only</option>
          <option value="stub">Stub only</option>
        </select>

        {(agentFilter || typeFilter || enforcementFilter) && (
          <button
            onClick={() => {
              setAgentFilter("");
              setTypeFilter("");
              setEnforcementFilter("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}

        <span className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">
          {proofData?.total ?? 0} proofs
        </span>
      </div>

      {/* Timeline */}
      {proofs.length > 0 ? (
        <ProofTimeline proofs={proofs} />
      ) : (
        <EmptyState icon={Shield} message="No cryptographic proofs yet. Run an agent task to generate proofs." />
      )}
    </div>
  );
}
