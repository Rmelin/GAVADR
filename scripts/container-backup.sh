#!/bin/sh
set -eu

mkdir -p /backups/database /backups/uploads

while true; do
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  database="database/gavadr-${timestamp}.dump"
  uploads="uploads/uploads-${timestamp}.tar.gz"

  pg_dump --format=custom --file="/backups/${database}.partial"
  tar -czf "/backups/${uploads}.partial" -C /data uploads
  test -s "/backups/${database}.partial"
  test -s "/backups/${uploads}.partial"
  mv "/backups/${database}.partial" "/backups/$database"
  mv "/backups/${uploads}.partial" "/backups/$uploads"

  (
    cd /
    sha256sum "backups/$database" "backups/$uploads"
  ) >"/backups/gavadr-${timestamp}.sha256.partial"
  mv "/backups/gavadr-${timestamp}.sha256.partial" "/backups/gavadr-${timestamp}.sha256"

  migration="$(psql -At -c 'SELECT version_num FROM alembic_version' | tr -d '\r\n')"
  cat >"/backups/gavadr-${timestamp}.manifest.partial" <<EOF
created_at_utc=$timestamp
database_file=backups/$database
uploads_file=backups/$uploads
checksums_file=backups/gavadr-${timestamp}.sha256
alembic_revision=$migration
database_bytes=$(wc -c <"/backups/$database" | tr -d ' ')
uploads_bytes=$(wc -c <"/backups/$uploads" | tr -d ' ')
EOF
  mv "/backups/gavadr-${timestamp}.manifest.partial" "/backups/gavadr-${timestamp}.manifest"

  find /backups -type f -mtime "+${BACKUP_RETENTION_DAYS}" -delete
  sleep "${BACKUP_INTERVAL_SECONDS}"
done
