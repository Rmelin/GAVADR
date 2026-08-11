#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  printf 'Brug: %s <e-mail> "<navn>"\n' "$0" >&2
  exit 1
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"

if [ -f "$project_dir/.env" ]; then
  docker compose \
    --project-directory "$project_dir" \
    --env-file "$project_dir/.env" \
    -f "$project_dir/docker-compose.yml" \
    exec backend python -m app.cli create-admin "$1" "$2"
else
  docker compose \
    --project-directory "$project_dir" \
    --env-file "$project_dir/.env.dev" \
    -f "$project_dir/docker-compose.yml" \
    -f "$project_dir/docker-compose.dev.yml" \
    exec backend python -m app.cli create-admin "$1" "$2"
fi
