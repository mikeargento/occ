import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  proxyControlApi,
  type SignerConfig,
  type PolicyConfig,
  type AuditEntry,
  type ConsensusRequest,
} from "../api/proxy-control";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  Radio,
  Users,
  Settings,
  Plus,
  X,
  Check,
  AlertTriangle,
  Clock,
  ChevronDown,
} from "lucide-react";

// ── Rules Tab ──

function RulesTab() {
  const queryClient = useQueryClient();
  const { data: policyData } = useQuery({
    queryKey: ["proxy", "policy"],
    queryFn: () => proxyControlApi.getPolicy(),
  });

  const policy = policyData?.policy;

  const updatePolicy = useMutation({
    mutationFn: (update: Partial<PolicyConfig>) => proxyControlApi.updatePolicy(update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy", "policy"] }),
  });

  const [newReadPath, setNewReadPath] = useState("");
  const [newWritePath, setNewWritePath] = useState("");

  if (!policy) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading policy...</div>;
  }

  const permissions = [
    { key: "writeCode", label: "Write code" },
    { key: "createFiles", label: "Create files" },
    { key: "deleteFiles", label: "Delete files" },
    { key: "executeCommands", label: "Execute commands" },
    { key: "accessNetwork", label: "Access network" },
    { key: "accessSecrets", label: "Access secrets" },
  ];

  function addPath(type: "read" | "write") {
    const value = type === "read" ? newReadPath.trim() : newWritePath.trim();
    if (!value) return;
    const key = type === "read" ? "readPaths" : "writePaths";
    const current = [...policy![key]];
    current.push(value);
    updatePolicy.mutate({ [key]: current });
    if (type === "read") setNewReadPath("");
    else setNewWritePath("");
  }

  function removePath(type: "read" | "write", index: number) {
    const key = type === "read" ? "readPaths" : "writePaths";
    const current = [...policy![key]];
    current.splice(index, 1);
    updatePolicy.mutate({ [key]: current });
  }

  function togglePermission(key: string, enabled: boolean) {
    updatePolicy.mutate({
      permissions: { ...policy!.permissions, [key]: enabled },
    });
  }

  function updateRate(value: number) {
    updatePolicy.mutate({ globalRate: value });
  }

  function updateSpend(value: number) {
    updatePolicy.mutate({ maxSpend: value });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* File Boundaries - Read */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="text-muted-foreground">Read Boundaries</span>
          </h3>
          <div className="space-y-1.5">
            {policy.readPaths.map((path, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <code className="flex-1 truncate font-mono text-muted-foreground">{path}</code>
                <button
                  onClick={() => removePath("read", i)}
                  className="text-red-500 hover:text-red-400 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {policy.readPaths.length === 0 && (
              <p className="text-xs text-muted-foreground/60">No read paths configured</p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Input
              value={newReadPath}
              onChange={(e) => setNewReadPath(e.target.value)}
              placeholder="/path/to/allow"
              className="text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && addPath("read")}
            />
            <Button size="sm" variant="outline" onClick={() => addPath("read")} className="h-8 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* File Boundaries - Write */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="text-muted-foreground">Write Boundaries</span>
          </h3>
          <div className="space-y-1.5">
            {policy.writePaths.map((path, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <code className="flex-1 truncate font-mono text-muted-foreground">{path}</code>
                <button
                  onClick={() => removePath("write", i)}
                  className="text-red-500 hover:text-red-400 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {policy.writePaths.length === 0 && (
              <p className="text-xs text-muted-foreground/60">No write paths configured</p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <Input
              value={newWritePath}
              onChange={(e) => setNewWritePath(e.target.value)}
              placeholder="/path/to/allow"
              className="text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && addPath("write")}
            />
            <Button size="sm" variant="outline" onClick={() => addPath("write")} className="h-8 px-2">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Rate Limits */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Rate Limits</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground min-w-[100px]">Max calls/min</Label>
              <input
                type="range"
                min="1"
                max="120"
                value={policy.globalRate}
                onChange={(e) => updateRate(+e.target.value)}
                className="flex-1 accent-amber-500 h-1"
              />
              <span className="text-sm font-semibold w-8 text-right">{policy.globalRate}</span>
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground min-w-[100px]">Max spend/hr ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={policy.maxSpend}
                onChange={(e) => updateSpend(+e.target.value)}
                className="w-24 text-xs h-8"
              />
            </div>
          </div>
        </div>

        {/* Consensus — Required Approvals */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Multi-Agent Consensus</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground min-w-[120px]">Required approvals</Label>
              <input
                type="range"
                min="0"
                max="10"
                value={policy.requiredApprovals ?? 0}
                onChange={(e) => updatePolicy.mutate({ requiredApprovals: +e.target.value })}
                className="flex-1 accent-amber-500 h-1"
              />
              <span className="text-sm font-semibold w-8 text-right">{policy.requiredApprovals ?? 0}</span>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              {(policy.requiredApprovals ?? 0) === 0
                ? "Disabled — actions execute immediately"
                : `${policy.requiredApprovals} agent${(policy.requiredApprovals ?? 0) > 1 ? "s" : ""} must approve before execution. Any change resets all approvals.`}
            </p>
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-md text-xs">
              <span>Reviewers can edit</span>
              <label className="relative w-9 h-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.permissions?.reviewersCanEdit !== false}
                  onChange={(e) => togglePermission("reviewersCanEdit", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-red-500/80 peer-checked:bg-green-500/80 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Action Permissions — full width below */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Action Permissions</h3>
        <div className="grid grid-cols-2 gap-2">
          {permissions.map((perm) => (
            <div
              key={perm.key}
              className="flex items-center justify-between px-3 py-2 bg-muted/30 rounded-md text-xs"
            >
              <span>{perm.label}</span>
              <label className="relative w-9 h-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.permissions[perm.key] !== false}
                  onChange={(e) => togglePermission(perm.key, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-red-500/80 peer-checked:bg-green-500/80 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Proof Feed Tab ──

function ProofFeedTab() {
  const [filter, setFilter] = useState<"all" | "allowed" | "denied">("all");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const { data: auditData } = useQuery({
    queryKey: ["proxy", "audit"],
    queryFn: () => proxyControlApi.getAudit(50),
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (auditData?.entries) {
      setEntries(auditData.entries);
    }
  }, [auditData]);

  // SSE connection
  useEffect(() => {
    const evtSource = new EventSource("/api/proxy/events");
    eventSourceRef.current = evtSource;

    evtSource.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);
        if (evt.type === "tool-executed" || evt.type === "policy-violation") {
          const entry: AuditEntry = {
            id: `live-${Date.now()}`,
            tool: evt.tool,
            allowed: evt.type === "tool-executed",
            timestamp: evt.timestamp,
            agentId: evt.agentId,
          };
          setEntries((prev) => [entry, ...prev].slice(0, 50));
        }
      } catch { /* ignore parse errors */ }
    };

    return () => {
      evtSource.close();
    };
  }, []);

  const filtered = filter === "all"
    ? entries
    : entries.filter((e) => (filter === "allowed" ? e.allowed : !e.allowed));

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {(["all", "allowed", "denied"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors ${
              filter === f
                ? "border-amber-500 text-amber-500 bg-amber-500/10"
                : "border-transparent text-muted-foreground hover:text-foreground bg-muted/30"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} entries
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden max-h-[420px] overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            Waiting for activity...
          </div>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id}>
              <div
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                className={`flex items-center gap-3 px-4 py-2 text-xs cursor-pointer border-b border-border transition-colors hover:bg-muted/30 ${
                  !entry.allowed ? "bg-red-500/5" : ""
                }`}
              >
                <span className="text-muted-foreground w-16 shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
                <span className="flex-1 font-medium font-mono truncate">
                  {entry.tool}
                </span>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                    entry.allowed
                      ? "text-green-500 bg-green-500/10"
                      : "text-red-500 bg-red-500/10"
                  }`}
                >
                  {entry.allowed ? "ALLOWED" : "DENIED"}
                </span>
                <span className="text-muted-foreground/60 w-16 text-right font-mono text-[10px] truncate">
                  {entry.hash ? entry.hash.slice(0, 10) + "..." : ""}
                </span>
              </div>
              {expandedId === entry.id && (
                <div className="px-4 py-3 bg-muted/20 border-b border-border">
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Consensus Tab ──

function ConsensusTab() {
  const queryClient = useQueryClient();

  const { data: consensusData } = useQuery({
    queryKey: ["proxy", "consensus"],
    queryFn: () => proxyControlApi.getPendingConsensus(),
    refetchInterval: 5000,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string }) =>
      proxyControlApi.approveConsensus(id, agentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy", "consensus"] }),
  });

  const changesMutation = useMutation({
    mutationFn: ({ id, agentId, note }: { id: string; agentId: string; note: string }) =>
      proxyControlApi.requestChanges(id, agentId, note),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy", "consensus"] }),
  });

  const requests = consensusData?.requests ?? [];

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Pending Approvals
        </h3>
        <span className="text-xs text-muted-foreground">{requests.length} pending</span>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No pending consensus requests
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <ConsensusCard
              key={req.id}
              request={req}
              onApprove={(agentId) => approveMutation.mutate({ id: req.id, agentId })}
              onRequestChanges={(agentId, note) =>
                changesMutation.mutate({ id: req.id, agentId, note })
              }
              formatTime={formatTime}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConsensusCard({
  request,
  onApprove,
  onRequestChanges,
  formatTime,
}: {
  request: ConsensusRequest;
  onApprove: (agentId: string) => void;
  onRequestChanges: (agentId: string, note: string) => void;
  formatTime: (ts: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  const currentApprovals = request.approvals.filter((a) => a.version === request.version).length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{request.tool}</div>
          <div className="text-xs text-muted-foreground">
            by {request.agentId} at {formatTime(request.createdAt)} - v{request.version}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {currentApprovals}/{request.requiredApprovals}
          </span>
          <div className="flex -space-x-1">
            {Array.from({ length: request.requiredApprovals }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border border-card ${
                  i < currentApprovals ? "bg-green-500" : "bg-muted/50"
                }`}
              />
            ))}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
              Arguments
            </div>
            <pre className="text-xs text-muted-foreground bg-muted/20 rounded-md p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {JSON.stringify(request.args, null, 2)}
            </pre>
          </div>

          {request.history.length > 1 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                History
              </div>
              <div className="space-y-1">
                {request.history.map((evt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>{formatTime(evt.timestamp)}</span>
                    <span className="font-medium">{evt.agentId}</span>
                    <span className={
                      evt.type === "approved" ? "text-green-500" :
                      evt.type === "changes_requested" ? "text-amber-500" :
                      evt.type === "consensus_reached" ? "text-green-400 font-bold" :
                      ""
                    }>
                      {evt.type.replace(/_/g, " ")}
                    </span>
                    {evt.note && <span className="italic">- {evt.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-green-500/50 text-green-500 hover:bg-green-500/10"
              onClick={() => onApprove("board")}
            >
              <Check className="h-3 w-3 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              onClick={() => setShowChanges(!showChanges)}
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              Request Changes
            </Button>
          </div>

          {showChanges && (
            <div className="flex gap-2">
              <Input
                value={changesNote}
                onChange={(e) => setChangesNote(e.target.value)}
                placeholder="Describe required changes..."
                className="text-xs h-8"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  if (changesNote.trim()) {
                    onRequestChanges("board", changesNote.trim());
                    setChangesNote("");
                    setShowChanges(false);
                  }
                }}
              >
                Send
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab() {
  const queryClient = useQueryClient();

  const { data: signerData } = useQuery({
    queryKey: ["proxy", "signer"],
    queryFn: () => proxyControlApi.getSigner(),
  });

  const updateSigner = useMutation({
    mutationFn: (config: { mode: string; teeUrl?: string }) =>
      proxyControlApi.updateSigner(config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy", "signer"] }),
  });

  const [selectedMode, setSelectedMode] = useState<string>("local");
  const [teeUrl, setTeeUrl] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (signerData) {
      setSelectedMode(signerData.mode);
      if (signerData.teeUrl) setTeeUrl(signerData.teeUrl);
    }
  }, [signerData]);

  function saveSigner() {
    const config: { mode: string; teeUrl?: string } = { mode: selectedMode };
    if (selectedMode === "custom-tee") config.teeUrl = teeUrl;
    updateSigner.mutate(config, {
      onSuccess: () => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      },
    });
  }

  const modes = [
    {
      id: "occ-cloud",
      title: "OCC Cloud",
      badge: "Hardware-attested",
      badgeClass: "text-green-500 bg-green-500/10",
      description: "Hardware-attested signing via OCC's Nitro Enclave. Most secure.",
    },
    {
      id: "custom-tee",
      title: "Your TEE",
      badge: "Enterprise",
      badgeClass: "text-amber-500 bg-amber-500/10",
      description: "Bring your own Trusted Execution Environment. For enterprises.",
    },
    {
      id: "local",
      title: "Local",
      badge: "Offline",
      badgeClass: "text-muted-foreground bg-muted/30",
      description: "Ed25519 signing on your machine. Fully offline, no external dependencies.",
    },
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Signer Backend</h3>
        <div className="space-y-2">
          {modes.map((mode) => (
            <label
              key={mode.id}
              className={`block rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                selectedMode === mode.id
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-border hover:border-border/80"
              }`}
              onClick={() => setSelectedMode(mode.id)}
            >
              <input
                type="radio"
                name="signerMode"
                value={mode.id}
                checked={selectedMode === mode.id}
                onChange={() => setSelectedMode(mode.id)}
                className="sr-only"
              />
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">{mode.title}</span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${mode.badgeClass}`}>
                  {mode.badge}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{mode.description}</p>

              {mode.id === "custom-tee" && selectedMode === "custom-tee" && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">TEE Endpoint URL</Label>
                  <Input
                    type="url"
                    value={teeUrl}
                    onChange={(e) => setTeeUrl(e.target.value)}
                    placeholder="https://your-enclave.example.com/commit"
                    className="mt-1 text-xs h-8"
                  />
                </div>
              )}

              {mode.id === "local" && selectedMode === "local" && signerData?.publicKey && (
                <div className="mt-3 px-3 py-2 bg-muted/20 rounded-md">
                  <span className="text-[11px] text-muted-foreground">Public Key: </span>
                  <code className="text-[11px] font-mono text-amber-500 break-all">
                    {signerData.publicKey}
                  </code>
                </div>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
          onClick={saveSigner}
        >
          Save Signer Settings
        </Button>
        {saved && (
          <span className="text-xs text-green-500">Saved</span>
        )}
      </div>
    </div>
  );
}

// ── Main Control Plane Page ──

export function ControlPlane() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Control Plane" }]);
  }, [setBreadcrumbs]);

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Control Plane</h1>

      <Tabs defaultValue="rules">
        <TabsList variant="line" className="mb-4 border-b border-border pb-0">
          <TabsTrigger value="rules" className="text-xs gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="feed" className="text-xs gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            Proof Feed
          </TabsTrigger>
          <TabsTrigger value="consensus" className="text-xs gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Consensus
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
        <TabsContent value="feed">
          <ProofFeedTab />
        </TabsContent>
        <TabsContent value="consensus">
          <ConsensusTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
