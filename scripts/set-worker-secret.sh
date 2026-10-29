#!/bin/bash
# Sets SUPABASE_SECRET_KEY on the casevoya-admin Worker from the box's secrets file, without
# printing it. Run once (and again after a key rotation). Usage: bash scripts/set-worker-secret.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SECRETS=/home/box/.secrets/casevoya.env
export PATH=/home/box/.local/node-v22.23.3-linux-x64/bin:$PATH
export CLOUDFLARE_API_TOKEN="$(env -i bash -c ". $SECRETS; printf %s \"\$CLOUDFLARE_API_TOKEN\"")"
export CLOUDFLARE_ACCOUNT_ID=c8010438fc56280e3ea5747a123e818a
env -i bash -c ". $SECRETS; printf %s \"\$CASEVOYA_SBSECRET\"" | pnpm exec wrangler secret put SUPABASE_SECRET_KEY --name casevoya-admin >/dev/null
echo "SUPABASE_SECRET_KEY set on casevoya-admin."
