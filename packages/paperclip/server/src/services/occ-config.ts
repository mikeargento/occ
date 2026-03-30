/**
 * OCC Integration Configuration
 *
 * Controls the cryptographic authorization layer for agent execution.
 * When enabled, every agent run produces a proof on the OCC chain.
 * When disabled, Paperclip operates normally with zero overhead.
 */

export const OCC_ENABLED = process.env.OCC_ENABLED === "true";
export const OCC_TEE_URL = process.env.OCC_TEE_URL ?? "https://nitro.occproof.com";
export const OCC_EXPLORER_URL = process.env.OCC_EXPLORER_URL ?? "https://occ.wtf";
export const OCC_EXPLORER_API = `${OCC_EXPLORER_URL}/api/proofs`;
