#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
local_docker() { env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
container_id=''
test_database=postgres
failure_output=$(mktemp)
cleanup() {
  rm -f "$failure_output"
  if [ -n "$container_id" ]; then local_docker rm --force --volumes "$container_id" >/dev/null; fi
}
trap cleanup EXIT
container_id=$(local_docker run --detach --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine@sha256:266d3c257594e195b309ae9d1805e54c788f1d7b375f56bf6c367aac6c917e7b)
for attempt in $(seq 1 30); do
  if local_docker exec "$container_id" sh -c '[ "$(cat /proc/1/comm)" = "postgres" ] && pg_isready -U postgres' >/dev/null 2>&1; then break; fi
  if [ "$attempt" -eq 30 ]; then echo 'The isolated test database did not start.' >&2; exit 1; fi
  sleep 1
done
pg_check() { local_docker exec -i --env 'PGOPTIONS=-c client_min_messages=warning' "$container_id" psql -q -U postgres --dbname="$test_database" -v ON_ERROR_STOP=1; }
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
pg_check < tests/schema-legacy.sql
pg_check < migrations/20261029_event_platform.sql
pg_check < scripts/verify-database.sql
pg_check < tests/schema-publishing.sql
# A deployment administrator can safely rerun the manual migration.
pg_check < migrations/20261029_event_platform.sql
pg_check <<'SQL'
do $$ begin
  if (select count(*) from public.events where id='migration-event') <> 1 then raise exception 'Migration rerun changed the event'; end if;
  if (select count(*) from public.participants where "eventId"='migration-event') <> 2 then raise exception 'Migration rerun changed registrations'; end if;
  if not exists(select 1 from public.events where id='event-1' and "ownerId"='user-admin'
    and "passTitle"='Original VIP pass' and "logoPath"::jsonb->>'templateId'='legacy-custom'
    and "primaryColor"='#102030' and "registrationEnabled" and "registrationDeadline" is null
    and "gateOfficerIds"=array['user-gate']) then raise exception 'Legacy event, ownership or pass design was not preserved'; end if;
  if not exists(select 1 from public.participants where id='legacy-participant' and "passId"='LEGACY-PASS'
    and "passVersion"=1 and "entryMode"='single' and "allowedDays"='{}') then raise exception 'Legacy pass defaults were not repaired'; end if;
end $$;
create database eventz_fresh;
create database eventz_partial;
create database eventz_conflict;
SQL
pg_check < scripts/verify-database.sql

# A new project needs only the complete repair, without the old baseline file.
test_database=eventz_fresh
pg_check < migrations/20261029_event_platform.sql
pg_check < scripts/verify-database.sql
pg_check < tests/schema-publishing.sql

# Recover a partially initialized project with an absent original table.
test_database=eventz_partial
pg_check < supabase-schema.sql
pg_check <<'SQL'
drop table public."emailLogs";
SQL
pg_check < migrations/20261029_event_platform.sql
pg_check < scripts/verify-database.sql
pg_check < tests/schema-publishing.sql

# A data conflict must explain the problem and roll back the WHOLE migration.
test_database=eventz_conflict
pg_check < supabase-schema.sql
pg_check <<'SQL'
insert into public.users(id,name,email,role,"passwordHash") values
  ('conflict-one','One','Conflict@example.test','member','test-only'),
  ('conflict-two','Two','conflict@example.test','member','test-only');
SQL
if pg_check < migrations/20261029_event_platform.sql >"$failure_output" 2>&1; then
  echo 'Expected the repair to reject conflicting account emails.' >&2; exit 1
fi
if ! grep -q 'duplicate account emails' "$failure_output"; then
  cat "$failure_output" >&2; exit 1
fi
pg_check <<'SQL'
do $$ begin
  if (select count(*) from public.users) <> 2 then raise exception 'The failed repair removed an account'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='profileImage') then
    raise exception 'The failed repair left a partial schema update';
  end if;
end $$;
SQL
printf '%s\n' 'PASS PostgreSQL: old/fresh/partial schemas repaired; drafts, publishing, pass design, registrations, capacity, lifecycle and permissions verified; reruns preserve data; conflicts roll back'
