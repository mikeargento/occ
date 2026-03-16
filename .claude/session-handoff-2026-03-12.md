# Session Handoff — March 12, 2026

## What Was Done This Session

### 1. Fixed Batch Proxy Restart (Complete)
- Old proxy (PID 200091) was running pre-patch code — the restart had failed with EADDRINUSE
- Killed old process, restarted with patched `http-server.js`
- Batch proof generation (39 files) now works end-to-end

### 2. Fixed Agency Artifact Binding for Batch Proofs (Complete)
Batch proofs share one agency envelope where the P-256 signature binds to the first file's digest. Non-first proofs failed verification because `authorization.artifactHash` didn't match their `proof.artifact.digestB64`.

**Fix:** Enclave now includes `agency.batchContext` on batch proofs:
```json
{
  "batchSize": 39,
  "batchIndex": 5,
  "batchDigests": ["<digest1>", "<digest2>", ...]
}
```

**Files modified:**
- `src/types.ts` — added `batchContext` to `AgencyEnvelope` interface
- `src/verifier.ts` — accepts batch binding when digest is in `batchContext.batchDigests`
- `server/commit-service/src/enclave/app.ts` — adds `batchContext` to agency for batch proofs
- `website/src/lib/occ.ts` — added `batchContext` to website's `AgencyEnvelope` type
- `website/src/app/studio/page.tsx` — verification handles batch context, shows "Batch proof N/M"

### 3. Enclave Redeployed (Complete)
- New PCR0: `97fabb84a84f7fe8e1eb3f645dfee4a2a8117a7766726a503c7b3548dcd0102ec6e82c7ecc7a03e2c31fa5e75920608e`
- Enclave CID: 21
- DynamoDB counter cleared for new epoch
- Old proxy restarted to pick up new CID

### 4. Batch ZIP Download (Complete)
- "Download all" now bundles all proof.zips into a single `batch-YYYY-MM-DD.zip`
- Contains a folder with all individual `filename.proof.zip` files
- One download instead of N separate downloads
- Works on all browsers (Safari, Chrome, Edge)

## Current State
- **Website**: deployed to Vercel, commit `299527f`
- **Enclave**: CID 21, PCR0 `97fabb8...`, running on EC2
- **Old proxy**: running on port 8787 with batch + challenge support
- **Everything tested and working**: batch proofs, agency verification, batch ZIP download

## Key Architecture Notes
- Old proxy (`http-server.js` port 8787/443) — handles HTTPS, DynamoDB anchoring, TSA timestamps
- New parent server (`server.ts` port 8080) — cleaner but not exposed via HTTPS yet
- Both talk to enclave (CID 21) via vsock port 5000
- Website calls `nitro.occproof.com` which hits the old proxy
- Folder picker (`showDirectoryPicker`) only works on Chrome/Edge, not Safari
- Long-term: migrate fully to new parent server, retire old proxy
