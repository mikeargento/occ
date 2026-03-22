import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.js";
import { handleMcp } from "./mcp.js";
import { db } from "./db.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, "../dashboard");
const PORT = parseInt(process.env.PORT ?? "3100", 10);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function serveDashboard(pathname: string, res: ServerResponse): boolean {
  if (!existsSync(DASHBOARD_DIR)) return false;

  // Exact file match
  const exactPath = join(DASHBOARD_DIR, pathname);
  if (existsSync(exactPath) && statSync(exactPath).isFile()) {
    const ext = extname(exactPath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    const content = readFileSync(exactPath);
    const isAsset = pathname.includes("/_next/");
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length,
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-cache",
    });
    res.end(content);
    return true;
  }

  // Try .html extension (/agents → agents.html)
  if (!extname(pathname)) {
    const htmlPath = exactPath + ".html";
    if (existsSync(htmlPath)) {
      const content = readFileSync(htmlPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return true;
    }
  }

  // Dynamic route fallback: /section/anything → /section/__.html
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const fallbackPath = join(DASHBOARD_DIR, parts[0]!, "__.html");
    if (existsSync(fallbackPath)) {
      const content = readFileSync(fallbackPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return true;
    }
  }

  return false;
}

async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // MCP endpoint: /mcp/:token
  if (pathname.startsWith("/mcp/")) {
    await handleMcp(req, res, pathname);
    return;
  }

  // Auth endpoints
  if (pathname.startsWith("/auth/")) {
    await handleAuth(req, res, pathname);
    return;
  }

  // API endpoints
  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, url);
    return;
  }

  // Dashboard static files
  if (pathname === "/" || pathname === "") {
    // Serve index.html
    const indexPath = join(DASHBOARD_DIR, "index.html");
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
      res.end(content);
      return;
    }
  }

  if (serveDashboard(pathname, res)) return;

  // Fallback to index.html for SPA routing
  const indexPath = join(DASHBOARD_DIR, "index.html");
  if (existsSync(indexPath)) {
    const content = readFileSync(indexPath);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": content.length, "Cache-Control": "no-cache" });
    res.end(content);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

async function handleAuth(_req: IncomingMessage, res: ServerResponse, _pathname: string) {
  // TODO: Better Auth integration
  res.writeHead(501, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Auth not yet implemented" }));
}

async function main() {
  await db.init();

  const server = createServer(handler);
  server.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("  ┌─────────────────────────────────┐");
    console.log("  │         OCC Control Plane        │");
    console.log("  │   Control wtf your AI agents do  │");
    console.log("  └─────────────────────────────────┘");
    console.log("");
    console.log(`  Dashboard:  http://localhost:${PORT}`);
    console.log(`  API:        http://localhost:${PORT}/api`);
    console.log(`  MCP:        http://localhost:${PORT}/mcp/:token`);
    console.log("");
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
