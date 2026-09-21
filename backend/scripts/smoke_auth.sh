#!/usr/bin/env bash
# Smoke test for the backend's authentication rules.
#
# Usage:
#   BASE_URL=http://localhost:8000 backend/scripts/smoke_auth.sh
#
# Optional environment (each enables more checks):
#   ADMIN_TOKEN     a Supabase access token of an admin user
#   AUTOMATION_KEY  the value of AUTOMATION_SHARED_SECRET
#   METRICS_TOKEN   the value of METRICS_TOKEN
#   RUN_SCAN=1      also trigger a real dead-stock scan with the automation key
#                   (may send one Pushover message; a deal scan is never triggered)
#
# Expected results (any mismatch makes the script exit 1):
#   no credentials .................. every /api/v1 endpoint -> 401
#   wrong automation key ............ scan endpoints -> 401
#   automation key on admin routes .. 401 (only scan endpoints accept it)
#   admin token ..................... GET /expenses/ -> 200, POST /chat/ "/help" -> 200
#   /metrics ........................ 401 without the token, 200 with it
#   /healthz, /readyz ............... public: 200 with a reachable database (readyz 503 otherwise)
#   / ............................... 404 (the old public status message is gone)
#   /docs, /openapi.json ............ 404 in production (run with EXPECT_PRODUCTION=1)

set -u

BASE_URL="${BASE_URL:-http://localhost:8000}"
API="$BASE_URL/api/v1"
ID="11111111-1111-1111-1111-111111111111"
failures=0

# check LABEL EXPECTED_CODE METHOD URL [curl args...]
check() {
  local label="$1" expected="$2" method="$3" url="$4"
  shift 4
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X "$method" "$url" "$@")
  if [ "$code" = "$expected" ]; then
    echo "PASS  $label ($code)"
  else
    echo "FAIL  $label: got $code, expected $expected"
    failures=$((failures + 1))
  fi
}

JSON=(-H 'Content-Type: application/json')

echo "== No credentials: every /api/v1 endpoint must answer 401"
check "PATCH deals/{id}/status"   401 PATCH  "$API/deals/$ID/status"     "${JSON[@]}" -d '{"status":"listed"}'
check "POST  deals/manual"        401 POST   "$API/deals/manual"         "${JSON[@]}" -d '{}'
check "PUT   deals/{id}/manual"   401 PUT    "$API/deals/$ID/manual"     "${JSON[@]}" -d '{}'
check "DELETE deals/{id}"         401 DELETE "$API/deals/$ID"
check "POST  deals/scan"          401 POST   "$API/deals/scan"           "${JSON[@]}" -d '{"asin":"B09Y2MYL5C"}'
check "POST  deals/dead-stock/scan" 401 POST "$API/deals/dead-stock/scan"
check "POST  chat/"               401 POST   "$API/chat/"                "${JSON[@]}" -d '{"message":"/help"}'
check "GET   expenses/"           401 GET    "$API/expenses/"
check "POST  expenses/"           401 POST   "$API/expenses/"            "${JSON[@]}" -d '{}'
check "PUT   expenses/{id}"       401 PUT    "$API/expenses/$ID"         "${JSON[@]}" -d '{}'
check "DELETE expenses/{id}"      401 DELETE "$API/expenses/$ID"
check "garbage bearer token"      401 GET    "$API/expenses/" -H 'Authorization: Bearer not-a-jwt'
check "metrics without token"     401 GET    "$BASE_URL/metrics"

echo "== Public probes"
check "healthz"                   200 GET    "$BASE_URL/healthz"
check "readyz"                    200 GET    "$BASE_URL/readyz"
check "root has no public message" 404 GET   "$BASE_URL/"

echo "== Wrong automation key"
check "scan, wrong key"           401 POST   "$API/deals/scan" "${JSON[@]}" -H 'X-Vindera-Key: wrong' -d '{"asin":"B09Y2MYL5C"}'

if [ -n "${AUTOMATION_KEY:-}" ]; then
  echo "== Automation key: only the scan endpoints accept it"
  check "GET   expenses/ with key"   401 GET    "$API/expenses/"   -H "X-Vindera-Key: $AUTOMATION_KEY"
  check "POST  chat/ with key"       401 POST   "$API/chat/"       "${JSON[@]}" -H "X-Vindera-Key: $AUTOMATION_KEY" -d '{"message":"/help"}'
  check "DELETE deals/{id} with key" 401 DELETE "$API/deals/$ID"   -H "X-Vindera-Key: $AUTOMATION_KEY"
  check "scan, invalid ASIN with key" 422 POST  "$API/deals/scan"  "${JSON[@]}" -H "X-Vindera-Key: $AUTOMATION_KEY" -d '{"asin":"bad"}'
  if [ "${RUN_SCAN:-}" = "1" ]; then
    check "dead-stock scan with key" 202 POST "$API/deals/dead-stock/scan" -H "X-Vindera-Key: $AUTOMATION_KEY"
  fi
fi

if [ -n "${ADMIN_TOKEN:-}" ]; then
  echo "== Admin token"
  check "GET  expenses/"            200 GET  "$API/expenses/" -H "Authorization: Bearer $ADMIN_TOKEN"
  check "POST chat/ /help"          200 POST "$API/chat/" "${JSON[@]}" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"message":"/help"}'
  check "POST chat/ /delete is gone (still 200, unknown command)" 200 POST "$API/chat/" "${JSON[@]}" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"message":"/delete B09Y2MYL5C"}'
  check "PATCH invalid status"      422 PATCH "$API/deals/$ID/status" "${JSON[@]}" -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"hacked"}'
fi

if [ -n "${METRICS_TOKEN:-}" ]; then
  echo "== Metrics token"
  check "metrics with token"        200 GET "$BASE_URL/metrics" -H "Authorization: Bearer $METRICS_TOKEN"
fi

if [ "${EXPECT_PRODUCTION:-}" = "1" ]; then
  echo "== Production: API docs must be off"
  check "/docs"          404 GET "$BASE_URL/docs"
  check "/redoc"         404 GET "$BASE_URL/redoc"
  check "/openapi.json"  404 GET "$BASE_URL/openapi.json"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed."
else
  echo "$failures check(s) failed."
  exit 1
fi
