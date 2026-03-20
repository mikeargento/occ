# OCC Proof Verification GitHub Action

Verify OCC proof chains in CI/CD. Checks Ed25519 signatures, chain integrity (prevB64 hash linkage), and counter monotonicity. Fails the workflow if the proof chain is broken or unauthorized actions are detected.

## Setup

Add to your workflow:

```yaml
- name: Verify OCC proofs
  uses: mikeargento/occ/packages/integrations/github-actions@main
  with:
    proof-file: proof.jsonl
```

## Full workflow example

```yaml
name: Verify Agent Actions
on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Verify OCC proof chain
        uses: mikeargento/occ/packages/integrations/github-actions@main
        id: occ
        with:
          proof-file: proof.jsonl
          fail-on-denied: 'true'

      - name: Report
        if: always()
        run: |
          echo "Total proofs: ${{ steps.occ.outputs.total-proofs }}"
          echo "Allowed: ${{ steps.occ.outputs.allowed-count }}"
          echo "Denied: ${{ steps.occ.outputs.denied-count }}"
          echo "Chain intact: ${{ steps.occ.outputs.chain-intact }}"
          echo "Passed: ${{ steps.occ.outputs.verification-passed }}"
```

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `proof-file` | No | `proof.jsonl` | Path to the proof log |
| `fail-on-denied` | No | `true` | Fail if denied actions are found |
| `node-version` | No | `20` | Node.js version |

## Outputs

| Output | Description |
|---|---|
| `total-proofs` | Total proof entries |
| `allowed-count` | Allowed actions |
| `denied-count` | Denied actions |
| `chain-intact` | `true` if chain has no gaps |
| `verification-passed` | `true` if full verification passed |

## What it checks

1. **Ed25519 signatures** -- every proof entry with a receipt is cryptographically verified using the `occproof` verifier
2. **Chain integrity** -- `prevB64` hash linkage between consecutive proofs (SHA-256 of canonical form)
3. **Counter monotonicity** -- counters must strictly increase across the chain
4. **Action summary** -- reports allowed/denied counts in the GitHub Actions step summary

## How it works

```
GitHub Actions Workflow
  |
  +-- Checkout repo (includes proof.jsonl)
  |
  +-- OCC Verification Action
       |
       +-- Parse each line of proof.jsonl
       +-- Verify Ed25519 signature on each receipt (via occproof)
       +-- Check prevB64 chain linkage between proofs
       +-- Check counter monotonicity
       +-- Set outputs + write GITHUB_STEP_SUMMARY
       +-- Exit 1 if any check fails
```

## CLI usage

The verifier can also be run locally:

```bash
cd packages/integrations/github-actions
npm install && npm run build
node dist/index.js path/to/proof.jsonl
```
