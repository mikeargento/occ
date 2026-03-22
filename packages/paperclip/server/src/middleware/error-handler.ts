import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";

export interface ErrorContext {
  error: { message: string; stack?: string; name?: string; details?: unknown; raw?: unknown };
  method: string;
  url: string;
  reqBody?: unknown;
  reqParams?: unknown;
  reqQuery?: unknown;
}

/** Strip values from env bindings that may contain secrets */
function redactBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const obj = body as Record<string, unknown>;
  if (!obj.adapterConfig || typeof obj.adapterConfig !== "object") return body;
  const ac = obj.adapterConfig as Record<string, unknown>;
  if (!ac.env || typeof ac.env !== "object") return body;
  const redactedEnv: Record<string, unknown> = {};
  for (const [key, binding] of Object.entries(ac.env as Record<string, unknown>)) {
    if (typeof binding === "object" && binding !== null && "value" in binding) {
      redactedEnv[key] = { ...(binding as Record<string, unknown>), value: "[REDACTED]" };
    } else {
      redactedEnv[key] = binding;
    }
  }
  return { ...obj, adapterConfig: { ...ac, env: redactedEnv } };
}

function attachErrorContext(
  req: Request,
  res: Response,
  payload: ErrorContext["error"],
  rawError?: Error,
) {
  (res as any).__errorContext = {
    error: payload,
    method: req.method,
    url: req.originalUrl,
    reqBody: redactBody(req.body),
    reqParams: req.params,
    reqQuery: req.query,
  } satisfies ErrorContext;
  if (rawError) {
    (res as any).err = rawError;
  }
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    if (err.status >= 500) {
      attachErrorContext(
        req,
        res,
        { message: err.message, stack: err.stack, name: err.name, details: err.details },
        err,
      );
    }
    res.status(err.status).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation error", details: err.errors });
    return;
  }

  const rootError = err instanceof Error ? err : new Error(String(err));
  attachErrorContext(
    req,
    res,
    err instanceof Error
      ? { message: err.message, stack: err.stack, name: err.name }
      : { message: String(err), raw: err, stack: rootError.stack, name: rootError.name },
    rootError,
  );

  res.status(500).json({ error: "Internal server error" });
}
