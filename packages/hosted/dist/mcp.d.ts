import type { IncomingMessage, ServerResponse } from "node:http";
/**
 * Handle MCP protocol requests at /mcp/:token
 *
 * This is a Streamable HTTP MCP transport.
 * The token in the URL authenticates the user — no API keys needed.
 */
export declare function handleMcp(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void>;
