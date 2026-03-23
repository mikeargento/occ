import type { IncomingMessage, ServerResponse } from "node:http";
interface ActiveConnection {
    id: string;
    clientName: string;
    connectedAt: Date;
    lastSeen: Date;
    userAgent: string;
    agentId: string | null;
    toolCalls: number;
}
/** Get all active connections (for the dashboard) */
export declare function getActiveConnections(): ActiveConnection[];
export declare function commitProof(tool: string, args: unknown, agentId: string, allowed: boolean): Promise<{
    proof: any;
    digestB64: string;
}>;
/**
 * Handle MCP protocol requests at /mcp/:token
 *
 * This is a Streamable HTTP MCP transport.
 * The token in the URL authenticates the user — no API keys needed.
 */
export declare function handleMcp(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void>;
export {};
