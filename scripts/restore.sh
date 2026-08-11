#!/bin/sh
set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  printf 'Brug: %s backups/database/<fil>.dump [backups/uploads/<fil>.tar.gz|--database-only]\n' "$0" >&2
  exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"
case "$1" in
  /*) database_file="$1" ;;
  *) database_file="$project_dir/$1" ;;
esac
[ -f "$database_file" ] || { printf 'Backupfil findes ikke: %s\n' "$database_file" >&2; exit 1; }

if [ -f "$project_dir/.env" ]; then
  env_file="$project_dir/.env"
  compose_override=""
else
  env_file="$project_dir/.env.dev"
  compose_override="$project_dir/docker-compose.dev.yml"
fi

compose() {
  if [ -n "$compose_override" ]; then
    docker compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" -f "$compose_override" "$@"
  else
    docker compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" "$@"
  fi
}

basename="$(basename "$database_file")"
timestamp="${basename#gavadr-}"
timestamp="${timestamp%.dump}"
uploads_file="$project_dir/backups/uploads/uploads-${timestamp}.tar.gz"
if [ "${2:-}" = "--database-only" ]; then
  uploads_file=""
elif [ -n "${2:-}" ]; then
  case "$2" in
    /*) uploads_file="$2" ;;
    *) uploads_file="$project_dir/$2" ;;
  esac
fi
[ -z "$uploads_file" ] || [ -f "$uploads_file" ] || {
  printf 'Uploadarkiv findes ikke: %s (brug --database-only for bevidst at undlade det)\n' "$uploads_file" >&2
  exit 1
}

checksum_file="$project_dir/backups/gavadr-${timestamp}.sha256"
if [ -f "$checksum_file" ]; then
  (CDPATH= cd -- "$project_dir" && shasum -a 256 -c "backups/gavadr-${timestamp}.sha256")
else
  printf 'ADVARSEL: Ingen checksum-sidecar fundet; dette er en ældre eller ekstern backup.\n' >&2
fi

if [ -n "$uploads_file" ]; then
  tar -tzf "$uploads_file" | while IFS= read -r entry; do
    case "$entry" in
      uploads|uploads/*) ;;
      *) printf 'Usikker sti i uploadarkiv: %s\n' "$entry" >&2; exit 1 ;;
    esac
  done
fi

printf 'Dette erstatter databasen%s. Skriv RESTORE for at fortsætte: ' "$(if [ -n "$uploads_file" ]; then printf ' og uploads'; fi)"
read -r confirmation
[ "$confirmation" = "RESTORE" ] || exit 1

backend_stopped=1
restart_backend() {
  if [ "$backend_stopped" -eq 1 ]; then
    compose up -d backend >/dev/null 2>&1 || true
  fi
}
trap restart_backend EXIT HUP INT TERM

compose stop backend
compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '\''$POSTGRES_DB'\'' AND pid <> pg_backend_pid()"'
compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS postgis"'
compose exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner' <"$database_file"

if [ -n "$uploads_file" ]; then
  compose run --rm --no-deps --entrypoint /bin/sh restore-tools -c \
    'rm -rf /data/uploads/* /data/uploads/.[!.]* /data/uploads/..?*; tar -xzf - -C /data' <"$uploads_file"
fi

compose run --rm --no-deps backend alembic upgrade head
compose up -d backend
backend_stopped=0
trap - EXIT HUP INT TERM

attempt=0
until compose exec -T backend python -c \
  "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { printf 'Restore færdig, men healthcheck fejlede. Kontrollér docker compose logs backend.\n' >&2; exit 1; }
  sleep 2
done
printf 'Database, migrations og healthcheck er verificeret%s.\n' "$(if [ -n "$uploads_file" ]; then printf ', inklusive uploads'; fi)"
