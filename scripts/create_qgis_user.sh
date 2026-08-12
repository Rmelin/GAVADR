#!/bin/sh
set -eu

role_name="${1:-qgis_editor}"
case "$role_name" in
  *[!a-zA-Z0-9_]*|'')
    printf 'Ugyldigt rollenavn. Brug kun bogstaver, tal og underscore.\n' >&2
    exit 1
    ;;
esac

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_dir="$(dirname "$script_dir")"

if docker info >/dev/null 2>&1; then
  docker_compose() {
    docker compose "$@"
  }
elif command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
  docker_compose() {
    sudo docker compose "$@"
  }
else
  printf 'Docker kan ikke tilgås. Kør som en bruger med Docker- eller sudo-adgang.\n' >&2
  exit 1
fi

if [ -f "$project_dir/.env" ]; then
  env_file="$project_dir/.env"
  compose_override=""
else
  env_file="$project_dir/.env.dev"
  compose_override="$project_dir/docker-compose.dev.yml"
fi

run_psql_noninteractive() {
  if [ -n "$compose_override" ]; then
    docker_compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" -f "$compose_override" \
      exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  else
    docker_compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" \
      exec -T db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  fi
}

run_psql_interactive() {
  if [ -n "$compose_override" ]; then
    docker_compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" -f "$compose_override" \
      exec db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  else
    docker_compose --project-directory "$project_dir" --env-file "$env_file" \
      -f "$project_dir/docker-compose.yml" \
      exec db sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
  fi
}

run_psql_noninteractive -v role_name="$role_name" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'role_name') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'role_name') \gexec
SELECT format('GRANT SELECT ON qgis_active_valves, qgis_active_pipes, qgis_incidents, qgis_map_corrections TO %I', :'role_name') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE ON addresses, valves, pipes, closure_areas, closure_area_addresses TO %I', :'role_name') \gexec
SELECT format('GRANT SELECT ON closure_scenarios, closure_scenario_areas, closure_scenario_valves, closure_area_scenarios, closure_area_scenario_valves, closure_area_valves TO %I', :'role_name') \gexec
SELECT format('REVOKE INSERT, UPDATE ON closure_scenarios, closure_scenario_areas, closure_scenario_valves, closure_area_scenarios, closure_area_scenario_valves, closure_area_valves FROM %I', :'role_name') \gexec
SQL

printf 'Vælg nu en unik adgangskode til PostgreSQL-rollen %s.\n' "$role_name"
run_psql_interactive -c "\\password $role_name"
printf 'QGIS-brugeren %s er klar. Se docs/admin-map-guide.md.\n' "$role_name"
