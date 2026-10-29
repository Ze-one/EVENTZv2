#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
local_docker() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
container_id=''
cleanup() { if [ -n "$container_id" ]; then local_docker rm --force --volumes "$container_id" >/dev/null; fi; }
trap cleanup EXIT
container_id=$(local_docker run --detach --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b)
for attempt in $(seq 1 30); do
  if local_docker exec "$container_id" sh -c '[ "$(cat /proc/1/comm)" = "postgres" ] && pg_isready -U postgres' >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 30 ]; then echo 'The isolated test database did not start.' >&2; exit 1; fi
  sleep 1
done
pg_check() { local_docker exec -i --env 'PGOPTIONS=-c client_min_messages=warning' "$container_id" psql -q -U postgres -v ON_ERROR_STOP=1; }
pg_check <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
-- Match Supabase, where pgcrypto may be installed outside the public schema.
create extension pgcrypto with schema extensions;
SQL
pg_check < supabase-schema.sql
pg_check <<'SQL'
do $$ begin
  begin
    insert into public.events (id,"ownerId") values ('schema-check','schema-check');
    raise exception 'Expected the legacy schema to reject platform event creation';
  exception when undefined_column then null;
  end;
end $$;
SQL
pg_check < migrations/20261029_event_platform.sql
pg_check < tests/schema-publishing.sql
# A deployment administrator can safely rerun the manual migration.
pg_check < migrations/20261029_event_platform.sql
pg_check <<'SQL'
do $$ begin
  if (select count(*) from public.events where id='migration-event') <> 1 then raise exception 'Migration rerun changed the event'; end if;
  if (select count(*) from public.participants where "eventId"='migration-event') <> 2 then raise exception 'Migration rerun changed registrations'; end if;
end $$;
SQL
printf '%s\n' 'PASS PostgreSQL schema: legacy failure reproduced, publishing and registration work, capacity enforced, rerun preserves data'
