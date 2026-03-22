// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 Mike Argento

export const PLUGIN_ID = "occ.enforcement";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  enforceCheck: "occ-enforce-check",
  verifyProofs: "occ-verify-proofs",
} as const;

export const JOB_KEYS = {
  pruneContexts: "prune-contexts",
} as const;

export const SLOT_IDS = {
  settingsPage: "occ-enforcement-settings",
  dashboardWidget: "occ-enforcement-widget",
} as const;

export const EXPORT_NAMES = {
  settingsPage: "OccEnforcementSettings",
  dashboardWidget: "OccEnforcementWidget",
} as const;
