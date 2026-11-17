#!/usr/bin/env bash
# Live API lifecycle cycle for Target Logistics external API.
# Runs REAL requests (real DGR bookings, ledger entries). See README.md.
#
# Env: API_BASE (default https://api.target-kw.com/api)
#      ADMIN_KEY CARRIER_KEY DOMESTIC_KEY MANUAL_KEY CREDIT_KEY  (unset => profile skipped)
#      SLEEP_BETWEEN (seconds between requests, default 0.3), IS_TEST (default true)
set -u

API_BASE="${API_BASE:-https://api.target-kw.com/api}"
API_BASE="${API_BASE%/}"
SLEEP_BETWEEN="${SLEEP_BETWEEN:-1.1}" # Paced to avoid 60 req/min rate limit on a single key
IS_TEST="${IS_TEST:-true}"
RUN_ID="cycle-$(date +%Y%m%d%H%M%S)-$RANDOM"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for dep in curl jq; do
  command -v "$dep" >/dev/null 2>&1 || { echo "Missing dependency: $dep"; exit 2; }
done
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then echo "bash >= 4 required"; exit 2; fi

PASS=0; FAIL=0; WARN=0; SKIP=0
declare -a FAILED_STEPS=()
declare -A KEYS TRACKING PICKUPS
CREATED_ORDER=()
CUR_PROFILE="-"

mask() { local k="$1"; [ "${#k}" -le 8 ] && echo "****" || echo "${k:0:4}…${k: -3}"; }
pass() { PASS=$((PASS+1)); echo "  PASS [$CUR_PROFILE] $1"; }
fail() { FAIL=$((FAIL+1)); FAILED_STEPS+=("[$CUR_PROFILE] $1"); echo "  FAIL [$CUR_PROFILE] $1${2:+  -> $2}"; }
warn() { WARN=$((WARN+1)); echo "  WARN [$CUR_PROFILE] $1${2:+  -> $2}"; }
check() { # check "desc" cond(0=true) [detail]
  if [ "$2" -eq 0 ]; then pass "$1"; else fail "$1" "${3:-}"; fi
}
uuid() { if command -v uuidgen >/dev/null 2>&1; then uuidgen | tr 'A-Z' 'a-z'; else cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "$RUN_ID-$RANDOM-$RANDOM"; fi; }
snip() { head -c 200 "$1" 2>/dev/null | tr '\n\r' '  '; }

# req METHOD URL KEY [JSON_BODY] [IDEM_KEY]  -> sets STATUS, BODY (file), HDRS (file)
STATUS=0; BODY=""; HDRS=""
REQN=0
req() {
  local method="$1" url="$2" key="$3" data="${4:-}" idem="${5:-}"
  REQN=$((REQN+1))
  BODY="$TMP/body.$REQN"; HDRS="$TMP/hdr.$REQN"
  local cfg="header = \"Accept: application/json, application/pdf\""$'\n'
  [ -n "$key" ] && cfg+="header = \"x-api-key: $key\""$'\n'
  [ -n "$idem" ] && cfg+="header = \"Idempotency-Key: $idem\""$'\n'
  local args=(-sS -m 60 -X "$method" -o "$BODY" -D "$HDRS" -w '%{http_code}' -K - "$url")
  if [ -n "$data" ]; then args+=(-H 'Content-Type: application/json' --data-binary "$data"); fi
  STATUS="$(printf '%s' "$cfg" | curl "${args[@]}" 2>"$TMP/curlerr")" || { STATUS=0; echo "    curl error: $(cat "$TMP/curlerr")"; }
  sleep "$SLEEP_BETWEEN"
}
jqb() { jq -r "$1" "$BODY" 2>/dev/null; }
is_json() { jq -e . "$BODY" >/dev/null 2>&1; }

shipment_payload() { # mode(intl|dom) extra-json
  local mode="$1" extra="${2:-{\}}" rcountry rcity rpostal
  if [ "$mode" = intl ]; then rcountry=AE; rcity=Dubai; rpostal=00000; else rcountry=KW; rcity="Kuwait City"; rpostal=15300; fi
  jq -n --arg rc "$rcountry" --arg rcity "$rcity" --arg rp "$rpostal" --arg ref "$RUN_ID" --argjson extra "$extra" '{
    sender:   {company:"Target API Cycle", contactPerson:"API Cycle Sender", phone:"+96597691271", email:"dispatch@target-kw.com",
               streetLines:["Block 1, Street 1"], city:"Kuwait City", postalCode:"15300", countryCode:"KW"},
    receiver: {company:"API Cycle Receiver", contactPerson:"API Cycle Receiver", phone:"+96599999999", email:"receiver@example.com",
               streetLines:["Test Street 5"], city:$rcity, postalCode:$rp, countryCode:$rc},
    parcels:  [{weight:1, dimensions:{length:20,width:15,height:10}, description:"API cycle test parcel"}],
    items:    [{description:"Test goods", quantity:1, declaredValue:10, weight:1, hsCode:"851712", countryOfOrigin:"KW", currency:"USD"}],
    currency: "KWD",
    reference: $ref
  } + $extra'
}

# profile table: name|env|mode|expected carrier ("any" allowed)|extra
profile_mode()    { case "$1" in ADMIN) echo intl;; CARRIER) echo intl;; DOMESTIC) echo dom;; MANUAL) echo dom;; CREDIT) echo intl;; esac; }
profile_carrier() { case "$1" in ADMIN) echo any;; CARRIER) echo DGR;; DOMESTIC) echo INTERNAL;; MANUAL) echo MANUAL;; CREDIT) echo any;; esac; }

run_profile() {
  local P="$1" key="${KEYS[$1]}" mode exp_carrier
  CUR_PROFILE="$P"; mode="$(profile_mode "$P")"; exp_carrier="$(profile_carrier "$P")"
  echo; echo "=== Profile $P  key=$(mask "$key")  mode=$mode  expected carrier=$exp_carrier ==="

  local base; base="$(shipment_payload "$mode")"

  # --- Quote
  req POST "$API_BASE/v1/quotes" "$key" "$base"
  check "POST /v1/quotes -> 200" $([ "$STATUS" = 200 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  [ "$STATUS" = 200 ] || { warn "quote failed, skipping rest of profile"; return; }
  local q_carrier q_service q_price
  q_carrier="$(jqb '.data[0].carrier // empty')"; q_service="$(jqb '.data[0].serviceCode // empty')"; q_price="$(jqb '.data[0].totalPrice // empty')"
  check "quote returns at least one rate" $([ -n "$q_carrier" ] && echo 0 || echo 1) "$(snip "$BODY")"
  echo "    quote: carrier=$q_carrier service=${q_service:-null} price=${q_price:-null}"
  [ "$exp_carrier" != any ] && check "quote carrier == $exp_carrier" $([ "$q_carrier" = "$exp_carrier" ] && echo 0 || echo 1) "got $q_carrier"
  case "$P" in
    MANUAL) check "manual quote price == 0" $([ "$q_price" = 0 ] && echo 0 || echo 1) "got $q_price";;
    DOMESTIC) check "domestic quote serviceCode == DOM" $([ "$q_service" = DOM ] && echo 0 || echo 1) "got $q_service";;
  esac

  # --- Create
  local extra='{}'
  [ -n "$q_carrier" ] && [ "$q_carrier" != MANUAL ] && [ "$q_carrier" != INTERNAL ] && extra="$(jq -n --arg c "$q_carrier" --arg s "$q_service" --argjson t "$IS_TEST" '{carrierCode:$c, serviceCode:$s, isTest:$t}')"
  local payload; payload="$(shipment_payload "$mode" "$extra")"
  local idem; idem="$(uuid)"
  req POST "$API_BASE/v1/shipments" "$key" "$payload" "$idem"
  check "POST /v1/shipments -> 201" $([ "$STATUS" = 201 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  [ "$STATUS" = 201 ] || { warn "create failed, skipping rest of profile"; return; }
  cp "$BODY" "$TMP/create.$P.json"
  local tn c_carrier c_status c_price
  tn="$(jqb '.data.trackingNumber // empty')"; c_carrier="$(jqb '.data.carrier // empty')"
  c_status="$(jqb '.data.status // empty')"; c_price="$(jqb '.data.price // empty')"
  check "create returns trackingNumber" $([ -n "$tn" ] && echo 0 || echo 1)
  [ -n "$tn" ] || return
  TRACKING[$P]="$tn"; CREATED_ORDER+=("$P")
  echo "    created: tracking=$tn carrier=$c_carrier status=$c_status price=$c_price"
  [ "$exp_carrier" != any ] && check "created carrier == $exp_carrier" $([ "$c_carrier" = "$exp_carrier" ] && echo 0 || echo 1) "got $c_carrier"
  case "$P" in
    MANUAL) check "manual: status == draft" $([ "$c_status" = draft ] && echo 0 || echo 1) "got $c_status"
            check "manual: price == 0" $([ "$c_price" = 0 ] && echo 0 || echo 1) "got $c_price";;
    DOMESTIC) check "domestic: serviceCode DOM or null (INTERNAL)" $([ "$(jqb '.data.serviceCode // "null"')" != "null" ] || [ "$c_carrier" = INTERNAL ] && echo 0 || echo 1);;
    CREDIT) check "credit: status == ready_for_pickup (no autoBook)" $([ "$c_status" = ready_for_pickup ] && echo 0 || echo 1) "got $c_status";;
  esac

  # --- Idempotent replay
  req POST "$API_BASE/v1/shipments" "$key" "$payload" "$idem"
  if [ "$STATUS" = 409 ]; then sleep 1; req POST "$API_BASE/v1/shipments" "$key" "$payload" "$idem"; fi
  local same_status=1 same_body=1
  [ "$STATUS" = 201 ] && same_status=0
  local replay_tn; replay_tn="$(jqb '.data.trackingNumber // empty')"
  if [ -n "$replay_tn" ] && [ "$replay_tn" = "$tn" ]; then
    same_body=0
  fi
  check "idempotent replay -> same status 201" $same_status "HTTP $STATUS $(snip "$BODY")"
  check "idempotent replay -> identical trackingNumber (no duplicate booking)" $same_body "replay=$replay_tn original=$tn"

  # --- Label
  req GET "$API_BASE/v1/shipments/$tn/label" "$key"
  local ctype; ctype="$(grep -i '^content-type:' "$HDRS" | tail -1 | tr -d '\r' | tr 'A-Z' 'a-z')"
  if [ "$STATUS" = 200 ] && [[ "$ctype" == *application/pdf* ]] && [ "$(head -c 4 "$BODY")" = "%PDF" ]; then
    pass "GET label -> application/pdf (%PDF, $(wc -c <"$BODY") bytes)"
  elif [[ "$STATUS" =~ ^30[0-9]$ ]]; then
    pass "GET label -> redirect to carrier document ($(grep -i '^location:' "$HDRS" | tr -d '\r' | cut -c1-80))"
  elif is_json && [ "$(jqb '.success')" = false ]; then
    warn "GET label -> JSON error envelope" "HTTP $STATUS $(snip "$BODY")"
  else
    fail "GET label -> pdf or JSON error envelope" "HTTP $STATUS ctype=$ctype"
  fi

  # --- Update
  local upd; upd="$(jq -n --arg r "API cycle remarks $RUN_ID" '{remarks:$r, receiver:{contactPerson:"API Cycle Receiver Updated"}}')"
  req PUT "$API_BASE/v1/shipments/$tn" "$key" "$upd"
  if [ "$STATUS" = 200 ]; then pass "PUT /v1/shipments/:n -> 200"
  elif [ "$STATUS" = 400 ] && grep -q 'Cannot update' "$BODY"; then warn "PUT /v1/shipments/:n -> 400 status not editable (expected for some booked states)" "$(snip "$BODY")"
  else fail "PUT /v1/shipments/:n -> 200" "HTTP $STATUS $(snip "$BODY")"; fi

  # --- Tracking v1
  req GET "$API_BASE/v1/tracking/$tn" "$key"
  check "GET /v1/tracking/:n -> 200 w/ trackingNumber" $([ "$STATUS" = 200 ] && [ "$(jqb '.data.trackingNumber')" = "$tn" ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"

  # --- Client routes
  req GET "$API_BASE/client/shipments/$tn" "$key"
  check "GET /client/shipments/:n -> 200" $([ "$STATUS" = 200 ] && [ "$(jqb '.data.trackingNumber')" = "$tn" ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  req GET "$API_BASE/client/shipments/$tn/tracking" "$key"
  check "GET /client/shipments/:n/tracking -> 200" $([ "$STATUS" = 200 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"

  # --- Public (no auth)
  req GET "$API_BASE/public/shipments/$tn" ""
  check "GET /public/shipments/:n (no key) -> 200" $([ "$STATUS" = 200 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  if [ "$STATUS" = 200 ] && grep -qiE 'costPrice|apiKey|passwordHash' "$BODY"; then fail "public shipment leaks internal fields" "$(grep -oiE 'costPrice|apiKey|passwordHash' "$BODY" | sort -u | tr '\n' ' ')"; fi

  # --- Pickups
  local pk; pk="$(jq -n --argjson s "$(jq .sender <<<"$base")" --argjson r "$(jq .receiver <<<"$base")" --argjson p "$(jq .parcels <<<"$base")" \
    --arg d "$(date -u -d '+1 day' +%Y-%m-%dT09:00:00Z 2>/dev/null || date -u -v+1d +%Y-%m-%dT09:00:00Z)" --arg n "API cycle pickup $RUN_ID" \
    '{sender:$s, receiver:$r, parcels:$p, requestedPickupDate:$d, pickupInstructions:$n}')"
  req POST "$API_BASE/client/pickups" "$key" "$pk" "$(uuid)"
  check "POST /client/pickups -> 201" $([ "$STATUS" = 201 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  local pid; pid="$(jqb '.data.id // empty')"
  if [ -n "$pid" ]; then
    PICKUPS[$P]="$pid"
    req GET "$API_BASE/client/pickups/$pid" "$key"
    check "GET /client/pickups/:id -> 200 status REQUESTED" $([ "$STATUS" = 200 ] && [ "$(jqb '.data.id')" = "$pid" ] && [ "$(jqb '.data.status')" = REQUESTED ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  fi

  # --- Addresses
  local lbl="api-cycle-$RUN_ID" addr
  addr="$(jq -n --arg l "$lbl" '{label:$l, company:"API Cycle Co", contactPerson:"Cycle", phone:"+96597691271", email:"cycle@example.com", streetLines:["Cycle St"], city:"Kuwait City", postalCode:"15300", countryCode:"KW"}')"
  req POST "$API_BASE/v1/addresses" "$key" "$addr"
  check "POST /v1/addresses -> 201" $([ "$STATUS" = 201 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  local aid; aid="$(jqb '.data.id // empty')"
  req GET "$API_BASE/v1/addresses" "$key"
  check "GET /v1/addresses lists new address" $([ "$STATUS" = 200 ] && [ -n "$aid" ] && jq -e --arg id "$aid" '.data|map(.id)|index($id)!=null' "$BODY" >/dev/null 2>&1 && echo 0 || echo 1) "HTTP $STATUS"
  if [ -n "$aid" ]; then
    req PUT "$API_BASE/v1/addresses/$aid" "$key" '{"city":"Hawally"}'
    check "PUT /v1/addresses/:id -> 200 city updated" $([ "$STATUS" = 200 ] && [ "$(jqb '.data.city')" = Hawally ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  fi
}

negative_checks() {
  CUR_PROFILE="NEG"
  echo; echo "=== Negative checks (auth / idempotency) ==="
  local any_key="" p; for p in ADMIN CARRIER DOMESTIC MANUAL CREDIT; do [ -n "${KEYS[$p]:-}" ] && { any_key="${KEYS[$p]}"; CUR_PROFILE="NEG($p)"; break; }; done
  [ -n "$any_key" ] || { warn "no keys available for negative checks"; return; }
  local ep
  for ep in "GET v1/addresses" "POST v1/quotes" "GET client/pickups/x" "GET client/shipments/x"; do
    set -- $ep
    req "$1" "$API_BASE/$2" "" "$([ "$1" = POST ] && echo '{}')"
    check "no key: $1 /$2 -> 401" $([ "$STATUS" = 401 ] && echo 0 || echo 1) "HTTP $STATUS"
    req "$1" "$API_BASE/$2" "bad.0123456789abcdef" "$([ "$1" = POST ] && echo '{}')"
    check "bad key: $1 /$2 -> 401" $([ "$STATUS" = 401 ] && echo 0 || echo 1) "HTTP $STATUS"
  done
  req GET "$API_BASE/v1/addresses" "malformed-no-dot"
  check "malformed key -> 401" $([ "$STATUS" = 401 ] && echo 0 || echo 1) "HTTP $STATUS"
  # Missing Idempotency-Key on create (rejected by middleware before any booking)
  req POST "$API_BASE/v1/shipments" "$any_key" "$(shipment_payload dom)"
  check "create without Idempotency-Key -> 400" $([ "$STATUS" = 400 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  if [ "$STATUS" = 400 ]; then check "error mentions Idempotency-Key" $(grep -qi 'idempotency' "$BODY" && echo 0 || echo 1); fi
  req GET "$API_BASE/public/shipments/DOES-NOT-EXIST-$RUN_ID" ""
  check "public unknown tracking -> 404" $([ "$STATUS" = 404 ] && echo 0 || echo 1) "HTTP $STATUS"
}

cross_account_checks() {
  CUR_PROFILE="XACCT"
  echo; echo "=== Cross-account checks ==="
  local victim attacker
  for victim in "${CREATED_ORDER[@]:-}"; do
    [ -n "$victim" ] || continue
    for attacker in CARRIER DOMESTIC MANUAL CREDIT; do
      [ "$attacker" = "$victim" ] && continue
      [ -n "${KEYS[$attacker]:-}" ] || continue
      if [ "${KEYS[$attacker]}" = "${KEYS[$victim]}" ]; then
        warn "Attacker ($attacker) and victim ($victim) keys are identical; skipping cross-account check"
        continue
      fi
      CUR_PROFILE="XACCT $attacker->$victim"
      local tn="${TRACKING[$victim]}"
      req GET "$API_BASE/v1/tracking/$tn" "${KEYS[$attacker]}"
      check "GET /v1/tracking/:n -> 404" $([ "$STATUS" = 404 ] && echo 0 || echo 1) "HTTP $STATUS"
      req GET "$API_BASE/client/shipments/$tn" "${KEYS[$attacker]}"
      check "GET /client/shipments/:n -> 404" $([ "$STATUS" = 404 ] && echo 0 || echo 1) "HTTP $STATUS"
      req PUT "$API_BASE/v1/shipments/$tn" "${KEYS[$attacker]}" '{"remarks":"cross-account attempt"}'
      check "PUT /v1/shipments/:n -> 404" $([ "$STATUS" = 404 ] && echo 0 || echo 1) "HTTP $STATUS"
      req GET "$API_BASE/v1/shipments/$tn/label" "${KEYS[$attacker]}"
      if [ "$STATUS" = 403 ] || [ "$STATUS" = 404 ]; then pass "GET label -> $STATUS"
      else warn "GET label -> HTTP $STATUS (200 is expected only if same organization / staff role)"; fi
      break  # one attacker per victim is enough
    done
  done
}

carrier_restriction_checks() {
  CUR_PROFILE="CARRIER-RESTRICT"
  [ -n "${KEYS[CARRIER]:-}" ] || return
  echo; echo "=== Carrier key requesting another carrier ==="
  local key="${KEYS[CARRIER]}" assigned other
  assigned="$(jq -r '.data.carrier // empty' "$TMP/create.CARRIER.json" 2>/dev/null)"
  [ -n "$assigned" ] || { warn "carrier key create did not run; skipping carrier restriction checks"; return; }
  for other in OTE SMSA ARAMEX; do [ "$other" != "$assigned" ] && break; done
  local body; body="$(shipment_payload intl "$(jq -n --arg c "$other" '{carrierCode:$c, serviceCode:"P"}')")"
  req POST "$API_BASE/v1/quotes" "$key" "$body"
  check "quote with carrierCode=$other -> 403" $([ "$STATUS" = 403 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
  # Only attempt create if the quote was 403 (proves enforcement; a staff/admin key would bypass and really book)
  [ "$STATUS" = 403 ] || { warn "quote not 403 (CARRIER_KEY may be staff/admin); skipping create restriction check to avoid a real booking"; return; }
  req POST "$API_BASE/v1/shipments" "$key" "$(jq '. + {isTest:true}' <<<"$body")" "$(uuid)"
  check "create with carrierCode=$other -> 403 (no booking)" $([ "$STATUS" = 403 ] && echo 0 || echo 1) "HTTP $STATUS $(snip "$BODY")"
}

cleanup_report() {
  CUR_PROFILE="CLEANUP"
  echo; echo "=== Cleanup / created resources ==="
  echo "No public API cancel endpoint exists for API-key accounts. Void these in the admin UI:"
  local p
  for p in "${CREATED_ORDER[@]:-}"; do
    [ -n "$p" ] || continue
    local tn="${TRACKING[$p]}" key="${KEYS[$p]}"
    req GET "$API_BASE/client/shipments/$tn" "$key"
    printf '  %-9s %-22s status=%s%s\n' "$p" "$tn" "$(jqb '.data.status // "?"')" "$([ -n "${PICKUPS[$p]:-}" ] && echo "  pickup=${PICKUPS[$p]}")"
  done
  echo "  Addresses labelled: api-cycle-$RUN_ID (no delete endpoint; remove via admin UI)"
  echo "  Run id / reference on shipments: $RUN_ID"
}

# ---------------- main ----------------
echo "API cycle $RUN_ID against $API_BASE  (isTest=$IS_TEST)"
for p in ADMIN CARRIER DOMESTIC MANUAL CREDIT; do
  v="${p}_KEY"
  if [ -n "${!v:-}" ]; then KEYS[$p]="${!v}"; echo "  $p key: $(mask "${!v}")"
  else SKIP=$((SKIP+1)); echo "  $p key: not set -> SKIPPED"; fi
done
[ "${#KEYS[@]}" -gt 0 ] || { echo "No keys set."; exit 2; }

negative_checks
for p in ADMIN CARRIER DOMESTIC MANUAL CREDIT; do [ -n "${KEYS[$p]:-}" ] && run_profile "$p"; done
cross_account_checks
carrier_restriction_checks
cleanup_report

echo; echo "=================== SUMMARY ==================="
echo "PASS=$PASS FAIL=$FAIL WARN=$WARN SKIPPED_PROFILES=$SKIP"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed steps:"; printf '  - %s\n' "${FAILED_STEPS[@]}"
  exit 1
fi
echo "ALL CHECKS PASSED"
exit 0
