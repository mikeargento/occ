#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Deploy OCC enclave to a Nitro-enabled EC2 instance.
#
# Run this ON the EC2 parent instance after pulling the latest code.
#
# Prerequisites:
#   - EC2 instance with Nitro Enclave support enabled
#   - Docker installed
#   - nitro-cli installed (amazon-linux: yum install aws-nitro-enclaves-cli)
#   - Enclave allocator configured (/etc/nitro_enclaves/allocator.yaml)
#
# Usage:
#   cd occ/server/commit-service
#   ./deploy.sh
#
# Environment variables:
#   ENCLAVE_CPU    — vCPUs for enclave (default: 2)
#   ENCLAVE_MEM    — Memory in MB for enclave (default: 512)
#   API_KEYS       — Comma-separated API keys for the parent HTTP server
#   PORT           — Parent HTTP server port (default: 443)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ENCLAVE_CPU="${ENCLAVE_CPU:-2}"
ENCLAVE_MEM="${ENCLAVE_MEM:-1024}"
EIF_PATH="$SCRIPT_DIR/enclave.eif"

echo "=== OCC Enclave Deploy ==="
echo "Repo root: $REPO_ROOT"
echo "Enclave CPU: $ENCLAVE_CPU, Memory: ${ENCLAVE_MEM}MB"
echo ""

# Step 1: Build Docker image (context is the monorepo root)
echo "[1/5] Building Docker image..."
docker build \
  -f "$SCRIPT_DIR/Dockerfile.enclave" \
  -t occ-enclave \
  "$REPO_ROOT"

# Step 2: Build EIF
echo "[2/5] Building enclave image (EIF)..."
nitro-cli build-enclave \
  --docker-uri occ-enclave \
  --output-file "$EIF_PATH"

echo ""
echo "EIF built: $EIF_PATH"
echo "PCR0 (measurement) from build output above — save this for your verifier policy."
echo ""

# Step 3: Terminate any running enclave
echo "[3/5] Stopping existing enclave (if any)..."
EXISTING=$(nitro-cli describe-enclaves | python3 -c "
import sys, json
enclaves = json.load(sys.stdin)
for e in enclaves:
    if e.get('State') == 'RUNNING':
        print(e['EnclaveID'])
" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "  Terminating enclave: $EXISTING"
  nitro-cli terminate-enclave --enclave-id "$EXISTING" || echo "  (terminate returned non-zero — enclave may already be stopped)"
else
  echo "  No running enclave found."
fi

# Step 4: Launch new enclave
echo "[4/5] Launching enclave..."
nitro-cli run-enclave \
  --eif-path "$EIF_PATH" \
  --cpu-count "$ENCLAVE_CPU" \
  --memory "$ENCLAVE_MEM"

echo ""
nitro-cli describe-enclaves
echo ""

# Step 5: Start parent HTTP server
echo "[5/5] Starting parent HTTP server..."

# Kill existing parent server if running
pkill -f "node.*dist/parent/server.js" 2>/dev/null || true
sleep 1

# Build parent server TypeScript
echo "  Building commit-service..."
cd "$SCRIPT_DIR"
npm run build

# Start parent server in background
echo "  Starting server on port ${PORT:-443}..."
nohup node dist/parent/server.js > /var/log/occ-parent.log 2>&1 &
echo "  Parent PID: $!"

echo ""
echo "=== Deploy complete ==="
echo "  Enclave: running (vsock CID 16, port 5000)"
echo "  Parent:  http://0.0.0.0:${PORT:-443}"
echo "  Logs:    /var/log/occ-parent.log"
echo "           nitro-cli console --enclave-id \$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')"
