export declare const db: {
    init(): Promise<void>;
    getUserByToken(token: string): Promise<any>;
    getUserById(id: string): Promise<any>;
    getUserByEmail(email: string): Promise<any>;
    upsertUser(user: {
        id: string;
        email: string;
        name: string;
        avatar: string;
        provider: string;
        providerId: string;
        mcpToken: string;
    }): Promise<any>;
    addProof(userId: string, entry: {
        agentId: string;
        tool: string;
        allowed: boolean;
        args?: unknown;
        output?: unknown;
        reason?: string;
        proofDigest?: string;
        receipt?: unknown;
    }): Promise<void>;
    getProof(userId: string, proofId: string): Promise<any>;
    getProofs(userId: string, limit?: number, offset?: number): Promise<{
        entries: any[];
        total: number;
    }>;
    getAgents(userId: string): Promise<any[]>;
    getAgent(userId: string, agentId: string): Promise<any>;
    upsertAgent(userId: string, agent: {
        id: string;
        name: string;
        allowedTools?: string[];
        mcpToken?: string;
        proxyToken?: string;
    }): Promise<void>;
    getAgentByToken(token: string): Promise<any>;
    renameAgent(userId: string, agentId: string, name: string): Promise<void>;
    deleteAgent(userId: string, agentId: string): Promise<void>;
    enableTool(userId: string, agentId: string, tool: string): Promise<void>;
    disableTool(userId: string, agentId: string, tool: string): Promise<void>;
    unblockTool(userId: string, agentId: string, tool: string): Promise<void>;
    setAgentPaused(userId: string, agentId: string, paused: boolean): Promise<void>;
    updateAgentRules(userId: string, agentId: string, rules: string): Promise<void>;
    incrementAgentCalls(userId: string, agentId: string, allowed: boolean): Promise<void>;
    createPermissionRequest(userId: string, agentId: string, tool: string, clientName: string, args?: unknown, toolDescription?: string): Promise<any>;
    getPendingPermissions(userId: string): Promise<any[]>;
    getPermissionHistory(userId: string, limit?: number, offset?: number): Promise<{
        entries: any[];
        total: number;
    }>;
    resolvePermission(userId: string, requestId: number, decision: "approved" | "denied", proofDigest: string, receipt: unknown): Promise<any>;
    revokePermission(userId: string, agentId: string, tool: string, proofDigest: string, receipt: unknown): Promise<void>;
    getActivePermissions(userId: string): Promise<any[]>;
    /** Get ALL permissions (pending + resolved) with full context */
    getAllPermissions(userId: string): Promise<any[]>;
    storeAuthorization(userId: string, agentId: string, tool: string, type: string, proofDigest: string, proof: unknown, referencesDigest?: string, constraints?: unknown): Promise<void>;
    /** Find a valid authorization: latest auth with no subsequent revocation */
    getValidAuthorization(userId: string, agentId: string, tool: string): Promise<{
        proofDigest: string;
        proof: any;
        constraints: any;
    } | null>;
    /** Get the full authorization chain for a tool (authorizations, revocations) */
    getAuthorizationChain(userId: string, agentId: string, tool: string): Promise<any[]>;
    /** Get authorization by digest */
    getAuthorizationByDigest(digest: string): Promise<any>;
    getActivePolicy(userId: string): Promise<any>;
    getUnreadNotificationCount(userId: string): Promise<number>;
    markNotificationsRead(userId: string): Promise<void>;
    getPermissionRequest(requestId: number): Promise<any>;
    setAnthropicKey(userId: string, key: string): Promise<void>;
    getAnthropicKey(userId: string): Promise<string | null>;
    setPhone(userId: string, phone: string): Promise<void>;
    getUserByPhone(phone: string): Promise<any>;
    deleteAnthropicKey(userId: string): Promise<void>;
    getAgentByProxyToken(token: string): Promise<any>;
    v2CreateRequest(userId: string, req: {
        agentId: string;
        runId?: number;
        tool: string;
        capability?: string;
        label?: string;
        riskLane: string;
        summary?: string;
        originType: string;
        originClient?: string;
        requestArgs?: unknown;
    }): Promise<any>;
    v2GetRequests(userId: string, filters?: {
        status?: string;
        riskLane?: string;
        agentId?: string;
        runId?: number;
        limit?: number;
        offset?: number;
    }): Promise<{
        requests: any[];
        total: number;
    }>;
    v2GetRequest(requestId: number): Promise<any>;
    v2UpdateRequestStatus(requestId: number, status: string): Promise<void>;
    v2GetRequestStats(userId: string): Promise<any[]>;
    v2CreateDecision(req: {
        requestId: number;
        userId: string;
        decidedBy: string;
        decision: string;
        mode: string;
        reason?: string;
        proofDigest?: string;
        proof?: unknown;
    }): Promise<any>;
    v2CreateExecution(req: {
        requestId: number;
        decisionId: number;
        userId: string;
        agentId: string;
        tool: string;
        args?: unknown;
        output?: unknown;
        durationMs?: number;
        authDigest?: string;
        execDigest?: string;
        proof?: unknown;
        status?: string;
        error?: string;
    }): Promise<any>;
    v2CreateRun(userId: string, agentId: string, name?: string): Promise<any>;
    v2GetRuns(userId: string, filters?: {
        status?: string;
        agentId?: string;
        limit?: number;
        offset?: number;
    }): Promise<any[]>;
    v2GetRun(runId: number): Promise<any>;
    v2IncrementRunCount(runId: number): Promise<void>;
    v2GetRiskLanes(userId: string): Promise<any[]>;
    v2SetRiskLane(userId: string, lane: string, mode: string): Promise<void>;
    v2GetRiskLane(userId: string, lane: string): Promise<string>;
    v2GetOverview(userId: string): Promise<{
        pending: any;
        todayApproved: number;
        todayDenied: number;
        todayTotal: number;
        activeRuns: any;
        recentActivity: any[];
    }>;
    v2GetProofs(userId: string, filters?: {
        agentId?: string;
        tool?: string;
        digest?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        proofs: any[];
        total: number;
    }>;
    createPolicy(userId: string, policy: {
        name: string;
        allowedTools: string[];
        maxActions?: number;
        rateLimit?: string;
        policyDigest?: string;
        categories?: Record<string, boolean>;
        customRules?: string[];
    }): Promise<any>;
    v2WipeAll(userId: string): Promise<void>;
};
