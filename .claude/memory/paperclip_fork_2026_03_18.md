---
name: Paperclip Fork Setup
description: Paperclip cloned into packages/paperclip, running locally on port 3100 with embedded Postgres on 54329. MIT license, plan to integrate OCC proof layer.
type: project
---

Forked Paperclip (github.com/paperclipai/paperclip, MIT license) into `packages/paperclip/`.

**Why:** Building an OCC-proven AI company orchestrator. Paperclip provides agent orchestration, governance, cost control, audit trails — OCC replaces their database-only audit with cryptographic proofs.

**How to apply:**
- Local instance: `npx paperclipai run` → http://127.0.0.1:3100 (UI) + embedded Postgres on port 54329
- Config lives at `~/.paperclip/instances/default/`
- Key integration points: heartbeat.ts (execution), activity-log.ts (audit), cost_events (billing), approvals.ts (governance), plugin-tool-dispatcher.ts (tool calls)
- Plan: add OCC signing at each integration point, replace mutable DB logs with Ed25519-signed receipts
