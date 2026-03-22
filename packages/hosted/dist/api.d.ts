import type { IncomingMessage, ServerResponse } from "node:http";
export declare function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void>;
