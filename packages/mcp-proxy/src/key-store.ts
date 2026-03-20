// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import { hostname, userInfo } from "node:os";

/** Stored key record (persisted to disk). */
export interface StoredKey {
  id: string;
  name: string;
  maskedValue: string;
  encryptedValue: string;
  iv: string;
  salt: string;
  authTag: string;
  createdAt: number;
  updatedAt: number;
}

/** Static pepper mixed into the machine-derived key. */
const PEPPER = "occ-key-store-v1-pepper";

/** Derive an AES-256 key from machine identity + salt. */
function deriveKey(salt: Buffer): Buffer {
  const machineIdentity = `${hostname()}:${userInfo().username}:${PEPPER}`;
  return scryptSync(machineIdentity, salt, 32);
}

/** Mask a value, showing only the last 4 characters. */
function maskValue(value: string): string {
  if (value.length <= 4) return "\u2022".repeat(8) + value;
  return "\u2022".repeat(8) + value.slice(-4);
}

/** Encrypt a plaintext value using AES-256-GCM. */
function encrypt(value: string): { encryptedValue: string; iv: string; salt: string; authTag: string } {
  const salt = randomBytes(16);
  const key = deriveKey(salt);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(value, "utf-8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  return {
    encryptedValue: encrypted,
    iv: iv.toString("base64"),
    salt: salt.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

/** Decrypt an encrypted value. */
function decrypt(encryptedValue: string, ivB64: string, saltB64: string, authTagB64: string): string {
  const salt = Buffer.from(saltB64, "base64");
  const key = deriveKey(salt);
  const iv = Buffer.from(ivB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  let decrypted = decipher.update(encryptedValue, "base64", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

/**
 * Encrypted key storage for orchestrator API keys.
 * Keys are encrypted at rest using AES-256-GCM with a machine-derived key.
 */
export class KeyStore {
  #storePath: string;
  #keys: Map<string, StoredKey> = new Map();

  constructor(storePath?: string) {
    this.#storePath = storePath ?? ".occ/keys.json";
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#storePath)) return;
    try {
      const raw = readFileSync(this.#storePath, "utf-8");
      const data = JSON.parse(raw) as StoredKey[];
      for (const key of data) {
        this.#keys.set(key.id, key);
      }
    } catch {
      // Corrupted file — start fresh
      this.#keys.clear();
    }
  }

  #save(): void {
    const dir = dirname(this.#storePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data = Array.from(this.#keys.values());
    writeFileSync(this.#storePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /** Store or update a key. Returns the stored key (masked). */
  async setKey(id: string, name: string, value: string): Promise<StoredKey> {
    const { encryptedValue, iv, salt, authTag } = encrypt(value);
    const now = Date.now();
    const existing = this.#keys.get(id);
    const stored: StoredKey = {
      id,
      name,
      maskedValue: maskValue(value),
      encryptedValue,
      iv,
      salt,
      authTag,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.#keys.set(id, stored);
    this.#save();
    return stored;
  }

  /** Get the decrypted key value. Internal use only — never expose over API. */
  async getKey(id: string): Promise<string | null> {
    const stored = this.#keys.get(id);
    if (!stored) return null;
    try {
      return decrypt(stored.encryptedValue, stored.iv, stored.salt, stored.authTag);
    } catch {
      return null;
    }
  }

  /** List all stored keys with masked values only. */
  async listKeys(): Promise<StoredKey[]> {
    return Array.from(this.#keys.values()).map((k) => ({
      id: k.id,
      name: k.name,
      maskedValue: k.maskedValue,
      encryptedValue: "[redacted]",
      iv: "[redacted]",
      salt: "[redacted]",
      authTag: "[redacted]",
      createdAt: k.createdAt,
      updatedAt: k.updatedAt,
    }));
  }

  /** Delete a stored key. */
  async deleteKey(id: string): Promise<boolean> {
    const deleted = this.#keys.delete(id);
    if (deleted) this.#save();
    return deleted;
  }
}
