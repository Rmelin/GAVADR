#!/bin/sh
set -eu

base_url="${1:-http://127.0.0.1:${WEB_PORT:-8080}}"
health="$(curl --fail --silent --show-error "$base_url/api/health")"
printf '%s' "$health" | grep -q '"status":"ok"' || {
  printf 'Backend-health er ikke ok: %s\n' "$health" >&2
  exit 1
}

public_api="$(curl --fail --silent --show-error "$base_url/api/public/driftsstatus")"
printf '%s' "$public_api" | grep -q '"items"' || {
  printf 'Offentligt API returnerede ikke et feed.\n' >&2
  exit 1
}

headers="$(curl --fail --silent --show-error --head "$base_url/healthz")"
printf '%s' "$headers" | grep -qi '^X-Content-Type-Options: nosniff' || {
  printf 'Nginx mangler X-Content-Type-Options.\n' >&2
  exit 1
}

printf 'Health, offentligt API og sikkerhedsheaders er ok på %s\n' "$base_url"
public_json="$(curl --fail --silent --show-error "$base_url/public/driftsstatus.json")"
printf '%s' "$public_json" | grep -q '"items"' || {
  printf 'Den kompatible JSON-adresse returnerede ikke et feed.\n' >&2
  exit 1
}
printf 'Den dynamiske JSON-adresse til offentlig status er tilgængelig.\n'
