// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * @occ/reference-point — Reference point service for OCC (§9.5)
 *
 * Implements content-hash to verification material lookup, enabling
 * hybrid verification: portable proof when available, reference fallback
 * when metadata is stripped.
 *
 * Exports:
 *   - Storage layer (MemoryStore, FileStore)
 *   - HTTP server factory (createHandler)
 *   - HTTP client (ReferencePointClient)
 *   - Hybrid verifier (verifyWithReference)
 */

// Storage
export { MemoryStore, FileStore } from "./store.js";
export type { ReferenceEntry, ReferenceStore } from "./store.js";

// HTTP server
export { createHandler } from "./server.js";

// HTTP client
export { ReferencePointClient } from "./client.js";
export type { ReferencePointClientOptions } from "./client.js";

// Hybrid verifier
export { verifyWithReference } from "./verify.js";
export type { VerifyWithReferenceOpts, ReferenceVerifyResult } from "./verify.js";
