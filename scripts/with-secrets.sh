#!/bin/bash
# Runs a command with the admin worker's server settings taken from the box secrets file, without
# printing them. Usage: bash scripts/with-secrets.sh <command...>
set -euo pipefail
SECRETS=/home/box/.secrets/casevoya.env
export PATH=/home/box/.local/node-v22.23.3-linux-x64/bin:$PATH
export SUPABASE_URL=https://aqjtvqmojfamtspzyeqm.supabase.co
export SUPABASE_SECRET_KEY="$(env -i bash -c ". $SECRETS; printf %s \"\$CASEVOYA_SBSECRET\"")"
export CLOUDFLARE_API_TOKEN="$(env -i bash -c ". $SECRETS; printf %s \"\$CLOUDFLARE_API_TOKEN\"")"
exec "$@"
