#!/bin/sh
# Runs the edge function tests (supabase/functions/tests) in Deno against the local Supabase.
# Needs `npm run db:start`. Deno runs in Docker, so no local install is required.
set -e
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
exec docker run --rm \
  -v "$PWD/supabase/functions:/functions" -w /functions \
  -v aura-deno-cache:/deno-dir \
  --add-host=host.docker.internal:host-gateway \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_ANON_KEY="$ANON_KEY" \
  -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  --entrypoint sh denoland/deno:2.9.7 -c \
  'deno check */index.ts && deno test --allow-net --allow-env --allow-read "$@" tests/' -- "$@"
