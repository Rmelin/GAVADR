#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"
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

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
database_relative="backups/database/gavadr-${timestamp}.dump"
uploads_relative="backups/uploads/uploads-${timestamp}.tar.gz"
checksum_relative="backups/gavadr-${timestamp}.sha256"
manifest_relative="backups/gavadr-${timestamp}.manifest"
database_tmp="$project_dir/${database_relative}.partial"
uploads_tmp="$project_dir/${uploads_relative}.partial"
checksum_tmp="$project_dir/${checksum_relative}.partial"
manifest_tmp="$project_dir/${manifest_relative}.partial"

mkdir -p "$project_dir/backups/database" "$project_dir/backups/uploads"
trap 'rm -f "$database_tmp" "$uploads_tmp" "$checksum_tmp" "$manifest_tmp"' EXIT HUP INT TERM

compose exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' >"$database_tmp"
compose exec -T backend tar -czf - -C /data uploads >"$uploads_tmp"
[ -s "$database_tmp" ] && [ -s "$uploads_tmp" ]
mv "$database_tmp" "$project_dir/$database_relative"
mv "$uploads_tmp" "$project_dir/$uploads_relative"

(
  CDPATH= cd -- "$project_dir"
  shasum -a 256 "$database_relative" "$uploads_relative"
) >"$checksum_tmp"
mv "$checksum_tmp" "$project_dir/$checksum_relative"

migration="$(compose exec -T db sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT version_num FROM alembic_version"' | tr -d '\r\n')"
cat >"$manifest_tmp" <<EOF
created_at_utc=$timestamp
database_file=$database_relative
uploads_file=$uploads_relative
checksums_file=$checksum_relative
alembic_revision=$migration
database_bytes=$(wc -c <"$project_dir/$database_relative" | tr -d ' ')
uploads_bytes=$(wc -c <"$project_dir/$uploads_relative" | tr -d ' ')
EOF
mv "$manifest_tmp" "$project_dir/$manifest_relative"
trap - EXIT HUP INT TERM

printf 'Backup oprettet og verificerbar: %s\n' "$timestamp"
