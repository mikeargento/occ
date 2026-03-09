// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

/**
 * @occ/stub — StubHost
 *
 * An in-process implementation of HostCapabilities for development and
 * testing.  All TEE-specific operations are performed in software using
 * Node.js built-ins and @noble/ed25519.
 *
 * SECURITY WARNING: This implementation provides NO security guarantees.
 * DO NOT use StubHost in production or in any security-sensitive context.
 */

import { getPublicKeyAsync, signAsync, utils } from "@noble/ed25519";
import { randomBytes } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { HostCapabilities } from "occproof";

// ---------------------------------------------------------------------------
// StubHost options
// ---------------------------------------------------------------------------

export interface StubHostOptions {
  privateKey?: Uint8Array;
  measurement?: string;
  initialCounter?: bigint;
  enableTime?: boolean;
  enableCounter?: boolean;
}

export interface PersistentStubHostOptions {
  statePath: string;
  measurement?: string;
  enableTime?: boolean;
  enableCounter?: boolean;
}

// ---------------------------------------------------------------------------
// Persisted state shape
// ---------------------------------------------------------------------------

interface PersistedState {
  privateKeyB64: string;
  counter: string;
  lastProofHashB64?: string;
}

// ---------------------------------------------------------------------------
// StubHost
// ---------------------------------------------------------------------------

export class StubHost {
  readonly #host: HostCapabilities;
  readonly #privateKey: Uint8Array;
  readonly #publicKey: Uint8Array;
  readonly #measurement: string;
  #counter: bigint;
  readonly #statePath: string | undefined;

  private constructor(
    privateKey: Uint8Array,
    publicKey: Uint8Array,
    opts: Required<StubHostOptions>,
    statePath?: string
  ) {
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
    this.#measurement = opts.measurement;
    this.#counter = opts.initialCounter;
    this.#statePath = statePath;

    const base: HostCapabilities = {
      enforcementTier: "stub",
      getMeasurement: async () => this.#measurement,
      getFreshNonce: async () => new Uint8Array(randomBytes(32)),
      sign: async (data: Uint8Array) => signAsync(data, this.#privateKey),
      getPublicKey: async () => this.#publicKey,
    };

    if (opts.enableCounter) {
      base.nextCounter = async (): Promise<string> => {
        this.#counter += 1n;
        if (this.#statePath !== undefined) {
          this.#persistState();
        }
        return String(this.#counter);
      };
    }

    if (opts.enableTime) {
      base.secureTime = async (): Promise<number> => Date.now();
    }

    this.#host = base;
  }

  #persistState(): void {
    if (this.#statePath === undefined) return;
    const state: PersistedState = {
      privateKeyB64: Buffer.from(this.#privateKey).toString("base64"),
      counter: String(this.#counter),
    };
    writeFileSync(this.#statePath, JSON.stringify(state, null, 2), "utf8");
  }

  setLastProofHash(hashB64: string): void {
    if (this.#statePath === undefined) return;
    let existing: PersistedState;
    try {
      existing = JSON.parse(readFileSync(this.#statePath, "utf8")) as PersistedState;
    } catch {
      existing = {
        privateKeyB64: Buffer.from(this.#privateKey).toString("base64"),
        counter: String(this.#counter),
      };
    }
    existing.lastProofHashB64 = hashB64;
    writeFileSync(this.#statePath, JSON.stringify(existing, null, 2), "utf8");
  }

  getLastProofHash(): string | undefined {
    if (this.#statePath === undefined) return undefined;
    try {
      const raw = JSON.parse(readFileSync(this.#statePath, "utf8")) as PersistedState;
      return raw.lastProofHashB64;
    } catch {
      return undefined;
    }
  }

  static async create(opts: StubHostOptions = {}): Promise<StubHost> {
    const privateKey = opts.privateKey ?? utils.randomPrivateKey();
    if (privateKey.length !== 32) {
      throw new RangeError("StubHost: privateKey must be 32 bytes");
    }
    const publicKey = await getPublicKeyAsync(privateKey);

    const resolved: Required<StubHostOptions> = {
      privateKey,
      measurement: opts.measurement ?? "stub:measurement:not-a-real-tee",
      initialCounter: opts.initialCounter ?? 0n,
      enableTime: opts.enableTime ?? true,
      enableCounter: opts.enableCounter ?? true,
    };

    return new StubHost(privateKey, publicKey, resolved);
  }

  static async createPersistent(opts: PersistentStubHostOptions): Promise<StubHost> {
    const { statePath, measurement, enableTime, enableCounter } = opts;

    let privateKey: Uint8Array;
    let initialCounter: bigint;

    let existingState: PersistedState | undefined;
    try {
      existingState = JSON.parse(readFileSync(statePath, "utf8")) as PersistedState;
    } catch {
      // File doesn't exist or is corrupt — start fresh
    }

    if (existingState !== undefined) {
      privateKey = new Uint8Array(Buffer.from(existingState.privateKeyB64, "base64"));
      initialCounter = BigInt(existingState.counter);
    } else {
      privateKey = utils.randomPrivateKey();
      initialCounter = 0n;
      mkdirSync(dirname(statePath), { recursive: true });
      const initialState: PersistedState = {
        privateKeyB64: Buffer.from(privateKey).toString("base64"),
        counter: String(initialCounter),
      };
      writeFileSync(statePath, JSON.stringify(initialState, null, 2), "utf8");
    }

    if (privateKey.length !== 32) {
      throw new RangeError("StubHost.createPersistent: loaded key is not 32 bytes");
    }

    const publicKey = await getPublicKeyAsync(privateKey);

    const resolved: Required<StubHostOptions> = {
      privateKey,
      measurement: measurement ?? "stub:measurement:not-a-real-tee",
      initialCounter,
      enableTime: enableTime ?? true,
      enableCounter: enableCounter ?? true,
    };

    return new StubHost(privateKey, publicKey, resolved, statePath);
  }

  get host(): HostCapabilities {
    return this.#host;
  }

  get privateKeyBytes(): Uint8Array {
    return this.#privateKey;
  }

  get publicKeyBytes(): Uint8Array {
    return this.#publicKey;
  }

  get currentCounter(): bigint {
    return this.#counter;
  }
}
