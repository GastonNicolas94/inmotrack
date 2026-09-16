#!/usr/bin/env bash
set -euo pipefail

PROJECT="${VERCEL_PROJECT:-inmotrack}"
SINCE="${VERCEL_OBSERVABILITY_SINCE:-24h}"

if ! command -v vercel >/dev/null 2>&1; then
  echo "Vercel CLI no está instalado. Instalalo o ejecutá con npx vercel." >&2
  exit 1
fi

echo "== InmoTrack / Vercel observability =="
echo "project=${PROJECT} since=${SINCE} environment=production"
echo

echo "-- available response metrics --"
vercel metrics schema response --format json

echo
for percentile in p50 p95 p99; do
  echo "-- response_time ${percentile} by route --"
  vercel metrics response_time \
    --aggregation "${percentile}" \
    --group-by route \
    --since "${SINCE}" \
    --project "${PROJECT}" \
    --prod \
    --order-by value \
    --order desc \
    --limit 20
  echo
done

echo "-- production 5xx grouped by route --"
vercel logs \
  --environment production \
  --status-code 5xx \
  --since "${SINCE}" \
  --project "${PROJECT}" \
  --json
