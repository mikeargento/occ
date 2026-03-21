// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Self-contained demo page for OCC policy enforcement.
 * Served at /demo by the management API, or opened directly as demo.html.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** Returns the demo HTML string, reading from the sibling demo.html file. */
export function getDemoPageHtml(): string {
  try {
    return readFileSync(resolve(__dirname, "../demo.html"), "utf-8");
  } catch {
    // Fallback: inline minimal version if file not found
    return `<!DOCTYPE html><html><head><title>OCC Demo</title></head><body style="background:#0a0a0f;color:#e0e0e0;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh"><p>demo.html not found — run from the package root.</p></body></html>`;
  }
}
