// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import { sha256 } from "@noble/hashes/sha256";
import { signAsync } from "@noble/ed25519";
import { canonicalize } from "occproof";
import { Constructor } from "occproof";
import type { HostCapabilities, OCCProof, SignedBody } from "occproof";
import { StubHost } from "@occ/stub";
import type {
  EnclaveClient,
  EnclaveRequest,
  EnclaveResponse,
  CommitRequest,
  ConvertBWRequest,
} from "../parent/vsock-client.js";

export class MockEnclave implements EnclaveClient {
  #stub: StubHost;
  #ctor: Constructor;
  #publicKeyB64: string;
  #measurement: string;

  private constructor(stub: StubHost, ctor: Constructor, publicKeyB64: string, measurement: string) {
    this.#stub = stub;
    this.#ctor = ctor;
    this.#publicKeyB64 = publicKeyB64;
    this.#measurement = measurement;
  }

  static async create(): Promise<MockEnclave> {
    const stub = await StubHost.create({ enableCounter: true, enableTime: true });
    const ctor = await Constructor.initialize({ host: stub.host });
    const publicKeyB64 = Buffer.from(stub.publicKeyBytes).toString("base64");
    const measurement = await stub.host.getMeasurement();
    return new MockEnclave(stub, ctor, publicKeyB64, measurement);
  }

  get publicKeyB64(): string { return this.#publicKeyB64; }
  get measurement(): string { return this.#measurement; }

  async send(request: EnclaveRequest): Promise<EnclaveResponse> {
    try {
      switch (request.type) {
        case "commit": return await this.#handleCommit(request);
        case "convertBW": return await this.#handleConvertBW(request);
        case "key": return this.#handleKey();
        default:
          return { ok: false, error: `Unknown request type: ${(request as { type: string }).type}` };
      }
    } catch (err) {
      return { ok: false, error: `MockEnclave error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async #handleCommit(req: CommitRequest): Promise<EnclaveResponse> {
    const proofs: OCCProof[] = [];
    for (const { digestB64 } of req.digests) {
      const digestBytes = Buffer.from(digestB64, "base64");
      if (digestBytes.length !== 32) {
        return { ok: false, error: `Invalid SHA-256 digest length: ${digestBytes.length}` };
      }

      const counter = this.#stub.host.nextCounter ? await this.#stub.host.nextCounter() : undefined;
      const nonceBytes = await this.#stub.host.getFreshNonce();
      const time = this.#stub.host.secureTime ? await this.#stub.host.secureTime() : undefined;
      const publicKeyBytes = await this.#stub.host.getPublicKey();
      const measurement = await this.#stub.host.getMeasurement();
      const publicKeyB64 = Buffer.from(publicKeyBytes).toString("base64");

      const commitFields: OCCProof["commit"] = {
        nonceB64: Buffer.from(nonceBytes).toString("base64"),
      };
      if (counter !== undefined) commitFields.counter = counter;
      if (time !== undefined) commitFields.time = time;

      const signedBody: SignedBody = {
        version: "occ/1",
        artifact: { hashAlg: "sha256", digestB64 },
        commit: commitFields,
        publicKeyB64,
        enforcement: this.#stub.host.enforcementTier,
        measurement,
      };

      const canonicalBytes = canonicalize(signedBody);
      const signatureBytes = await this.#stub.host.sign(canonicalBytes);

      const proof: OCCProof = {
        version: "occ/1",
        artifact: signedBody.artifact,
        commit: signedBody.commit,
        signer: {
          publicKeyB64,
          signatureB64: Buffer.from(signatureBytes).toString("base64"),
        },
        environment: {
          enforcement: this.#stub.host.enforcementTier,
          measurement,
        },
      };

      if (req.metadata !== undefined) proof.metadata = req.metadata;
      proofs.push(proof);
    }

    return { ok: true, data: proofs };
  }

  async #handleConvertBW(req: ConvertBWRequest): Promise<EnclaveResponse> {
    const sharp = (await import("sharp")).default;
    const inputBuffer = Buffer.from(req.imageB64, "base64");

    // Convert to grayscale JPEG
    const bwBuffer = await sharp(inputBuffer)
      .grayscale()
      .jpeg({ quality: 90 })
      .toBuffer();

    // Hash the B&W output
    const digest = sha256(bwBuffer);
    const digestB64 = Buffer.from(digest).toString("base64");

    // Generate proof via existing commit handler
    const commitResult = await this.#handleCommit({
      type: "commit",
      digests: [{ digestB64, hashAlg: "sha256" }],
      metadata: { source: "occ-bw-demo", operation: "grayscale" },
    });

    if (!commitResult.ok) return commitResult;
    const proofs = commitResult.data as OCCProof[];

    return {
      ok: true,
      data: {
        imageB64: Buffer.from(bwBuffer).toString("base64"),
        proof: proofs[0],
        digestB64,
      },
    };
  }

  #handleKey(): EnclaveResponse {
    return {
      ok: true,
      data: {
        publicKeyB64: this.#publicKeyB64,
        measurement: this.#measurement,
        enforcement: this.#stub.host.enforcementTier,
      },
    };
  }

  close(): void {}
}
