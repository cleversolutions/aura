#!/bin/sh
# Runs the Supabase repository tests (libs/backend/supabase) against the local Supabase.
# Needs `npm run db:start`. The tests seed their own throwaway clubs and delete them afterwards, so
# the demo clubs and anything made by hand are left alone.
set -e
cd "$(dirname "$0")/.."
eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx nx test backend-supabase --skip-nx-cache "$@"
