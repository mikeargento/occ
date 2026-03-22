// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  PLUGIN_ID,
  PLUGIN_VERSION,
  TOOL_NAMES,
  JOB_KEYS,
  SLOT_IDS,
  EXPORT_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "OCC Enforcement",
  description:
    "Policy enforcement and cryptographic proofs for every Paperclip agent tool call. " +
    "Enforces per-agent OCC policies with Ed25519-signed proof chains.",
  author: "OCC / Mike Argento",
  categories: ["automation"],
  capabilities: [
    "agents.read",
    "agents.pause",
    "activity.log.write",
    "metrics.write",
    "plugin.state.read",
    "plugin.state.write",
    "events.subscribe",
    "events.emit",
    "jobs.schedule",
    "agent.tools.register",
    "instance.settings.register",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      defaultDenyUnknownTools: {
        type: "boolean",
        title: "Default Deny Unknown Tools",
        default: true,
      },
      proofLogMaxEntries: {
        type: "number",
        title: "Max Proof Log Entries Per Agent",
        default: 10000,
      },
      enableMetrics: {
        type: "boolean",
        title: "Emit Enforcement Metrics",
        default: true,
      },
    },
  },
  jobs: [
    {
      jobKey: JOB_KEYS.pruneContexts,
      displayName: "Prune Execution Contexts",
      description:
        "Periodically prunes stale rate-limit timestamps from agent execution contexts.",
      schedule: "0 * * * *",
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.enforceCheck,
      displayName: "OCC Policy Check",
      description:
        "Check whether a tool call would be allowed by the agent's OCC policy without executing it.",
      parametersSchema: {
        type: "object",
        properties: {
          toolName: { type: "string", description: "Tool name to check" },
          args: {
            type: "object",
            description: "Tool arguments to validate",
          },
        },
        required: ["toolName"],
      },
    },
    {
      name: TOOL_NAMES.verifyProofs,
      displayName: "OCC Verify Proof Chain",
      description: "Verify the OCC proof chain for the current agent.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "settingsPage",
        id: SLOT_IDS.settingsPage,
        displayName: "OCC Enforcement",
        exportName: EXPORT_NAMES.settingsPage,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "OCC Enforcement",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
    ],
  },
};

export default manifest;
