// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { ToolDefinition } from "../types.js";

/**
 * Input for the fetch_url tool.
 */
export interface FetchUrlInput {
  url: string;
  method?: string | undefined;
  headers?: Record<string, string> | undefined;
}

/**
 * Normalized output from the fetch_url tool.
 */
export interface FetchUrlOutput {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  contentLength: number;
  fetchedAt: number;
}

/**
 * fetch_url tool definition.
 *
 * Fetches a URL and returns a deterministic output structure.
 * Headers are sorted alphabetically for determinism.
 */
export const fetchUrlTool: ToolDefinition<FetchUrlInput, FetchUrlOutput> = {
  name: "fetch_url",
  version: "1.0.0",

  async execute(input: FetchUrlInput): Promise<FetchUrlOutput> {
    const fetchInit: RequestInit = {
      method: input.method ?? "GET",
    };
    if (input.headers) {
      fetchInit.headers = input.headers;
    }
    const response = await fetch(input.url, fetchInit);

    const body = await response.text();

    // Collect and sort response headers for determinism
    const headers: Record<string, string> = {};
    const sortedKeys: string[] = [];
    response.headers.forEach((_value, key) => {
      sortedKeys.push(key);
    });
    sortedKeys.sort();
    for (const key of sortedKeys) {
      const val = response.headers.get(key);
      if (val !== null) {
        headers[key] = val;
      }
    }

    return {
      url: input.url,
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      contentType: response.headers.get("content-type") ?? "",
      contentLength: body.length,
      fetchedAt: Date.now(),
    };
  },

  normalizeInput(input: FetchUrlInput): unknown {
    // Deterministic input: URL and method only (headers sorted if present)
    const normalized: Record<string, unknown> = {
      url: input.url,
      method: input.method ?? "GET",
    };
    if (input.headers) {
      const sortedHeaders: Record<string, string> = {};
      for (const key of Object.keys(input.headers).sort()) {
        const val = input.headers[key];
        if (val !== undefined) {
          sortedHeaders[key] = val;
        }
      }
      normalized["headers"] = sortedHeaders;
    }
    return normalized;
  },

  normalizeOutput(output: FetchUrlOutput): unknown {
    // Include everything except fetchedAt (non-deterministic)
    return {
      url: output.url,
      status: output.status,
      statusText: output.statusText,
      headers: output.headers,
      body: output.body,
      contentType: output.contentType,
      contentLength: output.contentLength,
    };
  },
};
