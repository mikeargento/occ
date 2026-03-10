// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { connect, type Socket } from "node:net";

export interface CommitRequest {
  type: "commit";
  digests: Array<{ digestB64: string; hashAlg: "sha256" }>;
  metadata?: Record<string, unknown>;
  prevProofId?: string;
}

export interface KeyRequest {
  type: "key";
}

export type EnclaveRequest = CommitRequest | KeyRequest;

export interface EnclaveResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface EnclaveClient {
  send(request: EnclaveRequest): Promise<EnclaveResponse>;
  close(): void;
}

/**
 * Connects to the enclave via a local socat TCP bridge.
 *
 * Node.js `net` doesn't support AF_VSOCK natively, so we rely on a
 * socat process on the parent that bridges a local TCP port to the
 * enclave's vsock CID:port.
 *
 *   socat TCP-LISTEN:<bridgePort>,fork,reuseaddr VSOCK-CONNECT:<cid>:5000
 *
 * The VsockClient then connects to localhost:<bridgePort> via plain TCP.
 */
const DEFAULT_BRIDGE_PORT = 9000;

export class VsockClient implements EnclaveClient {
  readonly #host: string;
  readonly #port: number;

  constructor(opts?: { host?: string; port?: number }) {
    this.#host = opts?.host
      ?? process.env["VSOCK_BRIDGE_HOST"]
      ?? "127.0.0.1";
    this.#port = opts?.port
      ?? Number(process.env["VSOCK_BRIDGE_PORT"] || DEFAULT_BRIDGE_PORT);
  }

  async send(request: EnclaveRequest): Promise<EnclaveResponse> {
    return new Promise((resolve, reject) => {
      const sock: Socket = connect({ host: this.#host, port: this.#port }, () => {
        const payload = Buffer.from(JSON.stringify(request), "utf8");
        const header = Buffer.alloc(4);
        header.writeUInt32BE(payload.length, 0);
        sock.write(Buffer.concat([header, payload]));
      });

      const chunks: Buffer[] = [];
      sock.on("data", (chunk: Buffer) => chunks.push(chunk));
      sock.on("end", () => {
        try {
          const buf = Buffer.concat(chunks);
          const jsonBuf = buf.length > 4 ? buf.subarray(4) : buf;
          const resp = JSON.parse(jsonBuf.toString("utf8")) as EnclaveResponse;
          resolve(resp);
        } catch (err) {
          reject(new Error(`VsockClient: failed to parse response: ${err}`));
        }
      });
      sock.on("error", (err) => reject(new Error(`VsockClient: ${err.message}`)));
      sock.setTimeout(30_000, () => {
        sock.destroy();
        reject(new Error("VsockClient: request timed out"));
      });
    });
  }

  close(): void {}
}
