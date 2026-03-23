import type { IncomingMessage, ServerResponse } from "node:http";
export declare function getSessionUserId(req: IncomingMessage): string | null;
export declare function handleAuth(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void>;
