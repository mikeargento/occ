// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * Reference point client.
 *
 * Fetches verification material from a running reference point service.
 * The client itself does NOT verify proofs — that remains the caller's
 * responsibility via the core occproof verifier.
 *
 * Trust model: retrieving from a reference point is equivalent to
 * receiving a proof over any untrusted channel. The proof must be
 * independently verified against known trust anchors before it is trusted.
 */

import type { OCCProof } from "occproof";
import type { ReferenceEntry } from "./store.js";

export interface ReferencePointClientOptions {
  /** Base URL of the reference point service (e.g. "https://ref.example.com"). */
  baseUrl: string;
  /**
   * Optional Bearer token for write operations.
   * Not required for reads (reference points are open for verification).
   */
  writeToken?: string;
}

export class ReferencePointClient {
  private readonly baseUrl: string;
  private readonly writeToken: string | undefined;

  constructor(opts: ReferencePointClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.writeToken = opts.writeToken;
  }

  /**
   * Publish a proof to the reference point.
   * The reference point indexes it by artifact.digestB64.
   *
   * @throws if the server returns an error or is unreachable.
   */
  async publish(proof: OCCProof): Promise<{ digestB64: string; storedAt: number }> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.writeToken !== undefined) {
      headers["Authorization"] = `Bearer ${this.writeToken}`;
    }

    const res = await fetch(`${this.baseUrl}/v1/proofs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ proof }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`reference point publish failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<{ digestB64: string; storedAt: number }>;
  }

  /**
   * Fetch a proof by artifact content hash.
   * Returns null if no proof is stored for this digest.
   *
   * @param digestB64 - Base64 SHA-256 digest of the artifact bytes.
   * @throws if the server returns an unexpected error or is unreachable.
   */
  async fetch(digestB64: string): Promise<ReferenceEntry | null> {
    // URL-safe encode the digest for safe path transport
    const encoded = encodeURIComponent(
      digestB64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""),
    );

    const res = await fetch(`${this.baseUrl}/v1/proofs/${encoded}`);

    if (res.status === 404) return null;

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`reference point fetch failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<ReferenceEntry>;
  }

  /** Check if the reference point service is reachable. */
  async health(): Promise<{ ok: boolean; entries: number }> {
    const res = await fetch(`${this.baseUrl}/v1/health`);
    return res.json() as Promise<{ ok: boolean; entries: number }>;
  }
}
