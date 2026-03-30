#!/bin/bash
# ──────────────────────────────────────────────────────────────
# OCC-Powered Paperclip — Single Command Launcher
#
# Usage: ./start-occ.sh
#
# Starts Paperclip with:
#   - OCC authorization on every agent action
#   - Embedded PostgreSQL (no external DB needed)
#   - Proofs posted to occ.wtf public chain
#   - TEE signing at nitro.occproof.com
# ──────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ──
GREEN='\033[0;32m'
BLUE='\033[0;34m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${BLUE}┌─────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│  OCC — Origin Controlled Computing      │${NC}"
echo -e "${BLUE}│  Every agent action produces a proof.    │${NC}"
echo -e "${BLUE}└─────────────────────────────────────────┘${NC}"
echo ""

# ── Check dependencies ──
if ! command -v pnpm &>/dev/null; then
  echo "pnpm not found. Install: npm install -g pnpm"
  exit 1
fi

if ! command -v node &>/dev/null; then
  echo "node not found. Install Node.js 20+."
  exit 1
fi

# ── Install if needed ──
if [ ! -d "node_modules" ]; then
  echo -e "${GRAY}Installing dependencies...${NC}"
  pnpm install
fi

# ── Set OCC environment ──
export OCC_ENABLED=true
export OCC_TEE_URL="${OCC_TEE_URL:-https://nitro.occproof.com}"
export OCC_EXPLORER_URL="${OCC_EXPLORER_URL:-https://occ.wtf}"
export PAPERCLIP_DEPLOYMENT_MODE=local_trusted
export PAPERCLIP_PORT="${PAPERCLIP_PORT:-4000}"
export PAPERCLIP_HOST=localhost
export SERVE_UI=true

echo -e "${GREEN}✓${NC} OCC Authorization: ${GREEN}ENABLED${NC}"
echo -e "  TEE:      ${GRAY}${OCC_TEE_URL}${NC}"
echo -e "  Explorer: ${GRAY}${OCC_EXPLORER_URL}${NC}"
echo -e "  Database: ${GRAY}Embedded PostgreSQL${NC}"
echo ""
echo -e "  Dashboard: ${BLUE}http://localhost:${PAPERCLIP_PORT}${NC}"
echo -e "  Proofs:    ${BLUE}https://occ.wtf${NC}"
echo ""
echo -e "${GRAY}Starting Paperclip...${NC}"
echo ""

# ── Start ──
exec pnpm dev
