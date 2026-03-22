import path from "node:path";
import fs from "node:fs";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { readConfigFile } from "../config-file.js";
import { resolveDefaultLogsDir, resolveHomeAwarePath } from "../home-paths.js";

function resolveServerLogDir(): string {
  const envOverride = process.env.PAPERCLIP_LOG_DIR?.trim();
  if (envOverride) return resolveHomeAwarePath(envOverride);

  const fileLogDir = readConfigFile()?.logging.logDir?.trim();
  if (fileLogDir) return resolveHomeAwarePath(fileLogDir);

  return resolveDefaultLogsDir();
}

const logDir = resolveServerLogDir();
fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "server.log");

const sharedOpts = {
  translateTime: "HH:MM:ss",
  ignore: "pid,hostname",
  singleLine: true,
};

export const logger = pino({
  level: "debug",
}, pino.transport({
  targets: [
    {
      target: "pino-pretty",
      options: { ...sharedOpts, ignore: "pid,hostname,req,res,responseTime", colorize: true, destination: 1 },
      level: "info",
    },
    {
      target: "pino-pretty",
      options: { ...sharedOpts, colorize: false, destination: logFile, mkdir: true },
      level: "debug",
    },
  ],
}));

/**
 * Recursively redact values that look like secrets (API keys, tokens, passwords)
 * from request bodies before they are written to logs.
 */
function redactSecrets(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (typeof obj !== "object") return obj;

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    // Redact any key that looks like it holds a secret value
    const lk = key.toLowerCase();
    if (
      lk.includes("secret") ||
      lk.includes("password") ||
      lk.includes("token") ||
      lk.includes("api_key") ||
      lk.includes("apikey") ||
      lk === "authorization"
    ) {
      result[key] = "[REDACTED]";
      continue;
    }
    // Redact string values that look like API keys
    if (typeof val === "string" && /^(sk-|sk-ant-|key-|ghp_|gho_|glpat-)/i.test(val)) {
      result[key] = "[REDACTED]";
      continue;
    }
    // Redact env binding objects that contain plain secret values
    if (
      typeof val === "object" &&
      val !== null &&
      "type" in val &&
      (val as Record<string, unknown>).type === "plain" &&
      "value" in val &&
      typeof (val as Record<string, unknown>).value === "string"
    ) {
      const strVal = (val as Record<string, unknown>).value as string;
      if (/^(sk-|sk-ant-|key-|ghp_|gho_|glpat-)/i.test(strVal)) {
        result[key] = { type: "plain", value: "[REDACTED]" };
        continue;
      }
    }
    result[key] = redactSecrets(val);
  }
  return result;
}

export const httpLogger = pinoHttp({
  logger,
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage(req, res, err) {
    const ctx = (res as any).__errorContext;
    const errMsg = ctx?.error?.message || err?.message || (res as any).err?.message || "unknown error";
    return `${req.method} ${req.url} ${res.statusCode} — ${errMsg}`;
  },
  customProps(req, res) {
    if (res.statusCode >= 400) {
      const ctx = (res as any).__errorContext;
      if (ctx) {
        return {
          errorContext: ctx.error,
          reqBody: redactSecrets(ctx.reqBody),
          reqParams: ctx.reqParams,
          reqQuery: ctx.reqQuery,
        };
      }
      const props: Record<string, unknown> = {};
      const { body, params, query } = req as any;
      if (body && typeof body === "object" && Object.keys(body).length > 0) {
        props.reqBody = redactSecrets(body);
      }
      if (params && typeof params === "object" && Object.keys(params).length > 0) {
        props.reqParams = params;
      }
      if (query && typeof query === "object" && Object.keys(query).length > 0) {
        props.reqQuery = query;
      }
      if ((req as any).route?.path) {
        props.routePath = (req as any).route.path;
      }
      return props;
    }
    return {};
  },
});
