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
    incrementAgentCalls(userId: string, agentId: string, allowed: boolean): Promise<void>;
    getActivePolicy(userId: string): Promise<any>;
    createPolicy(userId: string, policy: {
        name: string;
        allowedTools: string[];
        maxActions?: number;
        rateLimit?: string;
        policyDigest?: string;
    }): Promise<any>;
};
