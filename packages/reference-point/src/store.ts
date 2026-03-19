// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Reference point storage layer.
 *
 * Keyed by artifact content hash (digestB64). Verification material is stored
 * once at publish time and retrieved by any verifier that knows the content hash.
 *
 * The store has NO enforcement role. Every proof retrieved from it must be
 * independently verified against trust anchors. An attacker who stores a
 * forged proof gains nothing — the verifier will reject it.
 *
 * Two implementations:
 *   MemoryStore   — ephemeral, zero-dependency, suitable for testing and
 *                   single-process deployments.
 *   FileStore     — persists to a JSON file on disk; survives restarts.
 */

import type { OCCProof } from "occproof";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ReferenceEntry {
  /** SHA-256 digest of the artifact (base64 standard encoding). */
  digestB64: string;
  /** The full proof produced at genesis. */
  proof: OCCProof;
  /** Unix ms when this entry was stored at this reference point. */
  storedAt: number;
}

export interface ReferenceStore {
  /** Store a proof, keyed by its artifact.digestB64. */
  put(proof: OCCProof): Promise<ReferenceEntry>;
  /** Retrieve a proof by artifact digest. Returns null if not found. */
  get(digestB64: string): Promise<ReferenceEntry | null>;
  /** Number of entries. */
  size(): Promise<number>;
}

// ---------------------------------------------------------------------------
// MemoryStore
// ---------------------------------------------------------------------------

export class MemoryStore implements ReferenceStore {
  private readonly entries = new Map<string, ReferenceEntry>();

  async put(proof: OCCProof): Promise<ReferenceEntry> {
    const entry: ReferenceEntry = {
      digestB64: proof.artifact.digestB64,
      proof,
      storedAt: Date.now(),
    };
    this.entries.set(proof.artifact.digestB64, entry);
    return entry;
  }

  async get(digestB64: string): Promise<ReferenceEntry | null> {
    return this.entries.get(digestB64) ?? null;
  }

  async size(): Promise<number> {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// FileStore
// ---------------------------------------------------------------------------

type PersistedData = Record<string, ReferenceEntry>;

export class FileStore implements ReferenceStore {
  private readonly path: string;
  private data: PersistedData;

  constructor(filePath: string) {
    this.path = filePath;
    this.data = this.load();
  }

  private load(): PersistedData {
    try {
      const raw = readFileSync(this.path, "utf8");
      return JSON.parse(raw) as PersistedData;
    } catch {
      return {};
    }
  }

  private flush(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 2), "utf8");
  }

  async put(proof: OCCProof): Promise<ReferenceEntry> {
    const entry: ReferenceEntry = {
      digestB64: proof.artifact.digestB64,
      proof,
      storedAt: Date.now(),
    };
    this.data[proof.artifact.digestB64] = entry;
    this.flush();
    return entry;
  }

  async get(digestB64: string): Promise<ReferenceEntry | null> {
    return this.data[digestB64] ?? null;
  }

  async size(): Promise<number> {
    return Object.keys(this.data).length;
  }
}
