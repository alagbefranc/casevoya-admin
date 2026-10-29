#!/bin/bash
# Deploys casevoya-admin from the box. Modeled on the main app's deploy script:
# no .env*.local may reach the build, no placeholder values may be inlined, and the build output is
# scanned for secret patterns and for every secret value in the local secrets file before upload.
# Usage: bash scripts/deploy.sh <repo-dir>
set -euo pipefail
cd "$1"
SECRETS=/home/box/.secrets/casevoya.env
rm -f .env.local .env*.local
export PATH=/home/box/.local/node-v22.23.3-linux-x64/bin:$PATH NODE_OPTIONS=--max-old-space-size=6144
export CLOUDFLARE_API_TOKEN="$(env -i bash -c ". $SECRETS; printf %s \"\$CLOUDFLARE_API_TOKEN\"")"
export CLOUDFLARE_ACCOUNT_ID=c8010438fc56280e3ea5747a123e818a
node -v; git log --oneline -1
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean, abort"; exit 1; }
pnpm install --frozen-lockfile
if ls -a | grep -qE "^\.env"; then echo ".env file present, abort"; exit 1; fi
pnpm check:boundaries
pnpm run build:workers
ph=$( { grep -rlE "example\.supabase\.co|sb_publishable_ci_placeholder|test-only" .open-next/worker.js .open-next/assets 2>/dev/null || true; } | wc -l); echo "placeholder hits: $ph"; [ "$ph" = 0 ] || { echo "PLACEHOLDER INLINED, abort"; exit 1; }
pat='sk_live_[A-Za-z0-9]{8,}|sk_test_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
d=.open-next; n=$( { grep -rEoh "$pat" "$d" || true; } | wc -l)
v=$(env -i bash -c "set -a; . $SECRETS; env" | grep -vE '^(PWD|SHLVL|_)=' | grep -v '^CASEVOYA_PUBKEY=' | cut -d= -f2- | awk 'length($0)>=16')
m=0; while IFS= read -r s; do if [ -n "$s" ] && grep -rqF -- "$s" "$d"; then m=$((m+1)); fi; done <<< "$v"
echo "scan $d: pattern hits $n, secret value hits $m (of $(printf '%s\n' "$v" | grep -c .))"
[ "$n" = 0 ] && [ "$m" = 0 ] || { echo "SCAN FAILED"; exit 1; }
pnpm exec opennextjs-cloudflare deploy
