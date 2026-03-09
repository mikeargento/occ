# OCC — Origin Controlled Computing

Portable cryptographic proof at finalization. Hardware TEE enforcement via AWS Nitro Enclaves.

The file never leaves your machine — only the SHA-256 digest is sent.

## Install

```
npm install occproof
```

## What It Does

OCC generates cryptographic proofs that a specific file existed at a specific time. The proof is signed inside a Trusted Execution Environment (TEE) using Ed25519 — the signing key never leaves the hardware boundary.

Each proof contains:
- **Artifact digest** — SHA-256 hash of the original file
- **Ed25519 signature** — created inside the TEE
- **Attestation** — hardware-vendor proof that the signature came from a measured enclave
- **Monotonic counter** — prevents replay and establishes ordering

## CLI

```bash
occ photo.jpg -o ./proofs -k my-api-key
occ *.png -o ./proofs -k my-api-key
```

Each file produces a `.proof.zip` containing the original file, `proof.json`, and `VERIFY.txt`.

## Verify

Visit [occproof.com/verify](https://occproof.com/verify) and drop the `.proof.zip`.

## Wire Format

All proofs carry `"version": "occ/1"`. See [docs/proof-v1.md](docs/proof-v1.md) for the full specification.

## Packages

| Package | Description |
|---------|-------------|
| `occproof` | Core library — types, verifier, constructor, canonical serialization |
| `packages/adapter-nitro` | AWS Nitro Enclave adapter |
| `packages/stub` | StubHost for development and testing |
| `server/commit-service` | Nitro enclave + parent HTTP server |
| `cli/` | CLI tool |

## Documentation

- [Wire Format Spec](docs/proof-v1.md) — `occ/1` proof schema, signed body, verification algorithm
- [Epoch Model](docs/epoch-model.md) — TEE lifecycle, counter continuity, verifier obligations
- [Trust Model](docs/trust-model.md) — threat analysis, enforcement tiers, assumptions

## License

Apache-2.0
