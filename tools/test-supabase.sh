#!/bin/sh
# Runs the Supabase repository tests (libs/backend/supabase) against the local Supabase.
# Needs `npm run db:start`; reseeds first, since the tests expect the demo data.
set -e
cd "$(dirname "$0")/.."
npm run --silent db:seed
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx nx test backend-supabase --skip-nx-cache "$@"
