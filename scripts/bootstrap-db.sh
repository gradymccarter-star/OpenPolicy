#!/usr/bin/env bash
# One-time database bootstrap for a fresh Supabase project.
#
# Required in .env.local:
#   DATABASE_URL          — Supabase Postgres connection string (Dashboard → Connect)
#   SUPABASE_URL          — https://<project-ref>.supabase.co
#   SUPABASE_SERVICE_KEY  — service_role key (Dashboard → Settings → API keys)
# Optional:
#   LEGISCAN_API_KEY      — sitting PA House members + votes/sponsorships (legiscan.com, free)
#   ANTHROPIC_API_KEY     — LLM donor classification + statement analysis
#
# Usage: bash scripts/bootstrap-db.sh [--with-evidence]
#   --with-evidence also pulls votes, sponsorships, and news/press evidence,
#   then runs LLM analysis (slower; needs LEGISCAN_API_KEY + ANTHROPIC_API_KEY).

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
RUN="node --env-file=$ENV_FILE"

need() {
  grep -qE "^$1=..*" "$ENV_FILE" || { echo "❌ $1 missing from $ENV_FILE"; exit 1; }
}
has() { grep -qE "^$1=..*" "$ENV_FILE"; }

need DATABASE_URL
need SUPABASE_URL
need SUPABASE_SERVICE_KEY

echo "==> 1/6 Base schema"
$RUN scripts/migrate.js

echo "==> 2/6 Migrations (campaign finance, candidacy status, contact info, election history)"
$RUN scripts/run-migrations.js

if has LEGISCAN_API_KEY; then
  echo "==> 3/6 Sitting PA House members (LegiScan)"
  $RUN scripts/jobs/fetch-politicians.js
else
  echo "==> 3/6 SKIPPED sitting members — no LEGISCAN_API_KEY (challengers from Ballotpedia will still load)"
fi

echo "==> 4/6 All 2026 declared candidates, 203 districts (Ballotpedia, ~7 min)"
$RUN scripts/jobs/fetch-candidates.js

echo "==> 5/6 Campaign finance — PA Dept. of State full export (2026 cycle)"
$RUN scripts/jobs/fetch-campaign-finance-padeos.js
if has ANTHROPIC_API_KEY; then
  $RUN scripts/jobs/llm-classify-donors.js
fi

if [[ "${1:-}" == "--with-evidence" ]]; then
  echo "==> 5b Evidence pipeline (votes, sponsorships, news, press releases)"
  has LEGISCAN_API_KEY && $RUN scripts/jobs/fetch-voting-records.js
  has LEGISCAN_API_KEY && $RUN scripts/jobs/fetch-sponsorships.js
  $RUN scripts/jobs/fetch-pa-news.js
  $RUN scripts/jobs/fetch-press-releases.js
  has ANTHROPIC_API_KEY && $RUN scripts/jobs/analyze-statements.js
fi

echo "==> 6/6 Deterministic score calculation"
$RUN scripts/jobs/calculate-scores.js

echo "✅ Bootstrap complete — restart the dev server and reload the app."
