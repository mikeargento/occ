export declare const db: {
    init(): Promise<void>;
    getUserByToken(token: string): Promise<any>;
    getUserById(id: string): Promise<any>;
    upsertUser(user: {
        id: string;
        email: string;
        name: string;
        avatar: string;
        provider: string;
        providerId: string;
        mcpToken: string;
    }): Promise<void>;
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
    }): Promise<void>;
    deleteAgent(userId: string, agentId: string): Promise<void>;
    enableTool(userId: string, agentId: string, tool: string): Promise<void>;
    disableTool(userId: string, agentId: string, tool: string): Promise<void>;
    setAgentPaused(userId: string, agentId: string, paused: boolean): Promise<void>;
    updateAgentRules(userId: string, agentId: string, rules: string): Promise<void>;
    incrementAgentCalls(userId: string, agentId: string, allowed: boolean): Promise<void>;
    createPermissionRequest(userId: string, agentId: string, tool: string, clientName: string, args?: unknown): Promise<any>;
    getPendingPermissions(userId: string): Promise<any[]>;
    getPermissionHistory(userId: string, limit?: number, offset?: number): Promise<{
        entries: any[];
        total: number;
    }>;
    resolvePermission(userId: string, requestId: number, decision: "approved" | "denied", proofDigest: string, receipt: unknown): Promise<any>;
    revokePermission(userId: string, agentId: string, tool: string, proofDigest: string, receipt: unknown): Promise<void>;
    getActivePermissions(userId: string): Promise<any[]>;
    getActivePolicy(userId: string): Promise<any>;
    createPolicy(userId: string, policy: {
        name: string;
        allowedTools: string[];
        maxActions?: number;
        rateLimit?: string;
        policyDigest?: string;
    }): Promise<any>;
};
