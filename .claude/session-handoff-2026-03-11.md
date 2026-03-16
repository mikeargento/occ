# Session Handoff — March 11, 2026

## What Was Done This Session

### 1. Attribution Feature (Complete)
Human-readable attribution (name, title, message) sealed into proofs cryptographically.

**Files modified:**
- `src/constructor.ts` — added attribution to non-attestation proof assembly path
- `website/src/lib/occ.ts` — attribution param on `commitDigest()`, new `commitBatch()` function
- `server/commit-service/src/enclave/app.ts` — attribution in SignedBody + proof (both paths)
- `server/commit-service/src/mock/mock-enclave.ts` — same for mock
- `server/commit-service/src/parent/server.ts` — forwards attribution field
- `server/commit-service/src/parent/vsock-client.ts` — `CommitRequest.attribution` type

### 2. Authorization Model Update (Complete)
- WebAuthn `userVerification: "required"` enforces biometric per assertion
- Single biometric for entire batch (one WebAuthn assertion, metadata tracks `authorizationMode: "batch"`)
- Proof metadata: `userVerified`, `authMethod`, `deviceKey`
- UI copy: "Device identity registered. Biometric verification required when creating proofs."

### 3. Multi-File Batch Proofs (Complete)
- `website/src/components/file-drop.tsx` — rewritten for multi-file support (add/remove/clear)
- `website/src/app/studio/page.tsx` — `files[]`/`proofs[]` arrays, batch flow, "Download all"
- `website/src/lib/occ.ts` — `commitBatch()` sends all digests in one request

### 4. Destination Folder Picker (Complete)
- File System Access API (`showDirectoryPicker`) for Chrome/Edge
- Auto-saves `proof.zip` files to chosen folder after generation
- Feature detection with fallback to manual downloads
- Results show "Saved N files to FolderName" indicator
- Type fix: `zipped.buffer.slice()` cast to avoid `Uint8Array`/`ArrayBufferLike` TS error

### 5. Enclave Deploy (Complete)
- Ran `deploy.sh` on EC2 — new enclave running with latest `app.ts`
- PCR0: `250084a194df488e907d8a274246eec72ee9bcdee1394d8a4bec7c7fe8d524bfc6b4c72fe233dff802b5aae7e85864f1`
- Confirmed via `curl https://nitro.occproof.com/key | jq .`

### 6. EC2 Proxy Patches (Complete)
The old proxy at `/home/ec2-user/nsm-test/http-server.js` needed patches:

**a. DynamoDB counter reset:**
- Cleared stale counter from `occ-head` table (new epoch had lower counter)
- `aws dynamodb delete-item --table-name occ-head --key '{"pk":{"S":"head"}}' --region us-east-2`

**b. `/challenge` route added:**
- Forwards `{ action: "challenge" }` to enclave via vsock
- Returns `{ challenge: "<base64>" }` to client

**c. Batch commit patch (IN PROGRESS — testing now):**
- Replaced the per-digest loop (lines 392-442) with a single batch vsock request
- Old code sent individual `commitDigest` per file — enclave consumed the challenge on first proof, rest failed
- New code sends `{ action: "commit", digests: [...], agency, attribution, metadata }` as one request
- Enclave verifies agency once, returns all proofs
- Proxy then anchors each to DynamoDB and timestamps each

**Patch applied via:** `sudo node /tmp/patch-batch.js` (script saved at `/tmp/patch-batch.js` on EC2)

## Current State
- **Website**: deployed to Vercel (occ.wtf / proofstudio.wtf), commit `e3277e6`
- **Enclave**: running on EC2 with latest code
- **Old proxy**: patched with /challenge route + batch commit, restarted
- **Testing**: 39-file batch proof generation is being tested RIGHT NOW

## If Batch Test Fails
- Check EC2 logs: `cat /tmp/http-server.log | tail -50`
- Check enclave logs: `nitro-cli console --enclave-id $(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')`
- The batch vsock timeout is 120s — 39 proofs with TSA timestamps might be slow
- If timeout, increase `120000` in the patched `vsockRequest(cid, enclaveReq, 120000)` call

## Key Architecture Notes
- Old proxy (`http-server.js` port 8787/443) — handles HTTPS, DynamoDB anchoring, TSA timestamps
- New parent server (`server.ts` port 8080) — cleaner but not exposed via HTTPS yet
- Both talk to same enclave (CID 19) via vsock port 5000
- Website calls `nitro.occproof.com` which hits the old proxy
- Long-term: migrate fully to new parent server, retire old proxy
