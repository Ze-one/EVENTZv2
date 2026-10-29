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
pg_check < tests/schema-deadlines.sql
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
create database eventz_timestamptz;
create database eventz_timestamp;
create database eventz_date;
SQL
pg_check < scripts/verify-database.sql

# A new project needs only the complete repair, without the old baseline file.
test_database=eventz_fresh
pg_check < migrations/20261029_event_platform.sql
pg_check < scripts/verify-database.sql
pg_check < tests/schema-publishing.sql
pg_check < tests/schema-deadlines.sql

# Recover a partially initialized project with an absent original table.
test_database=eventz_partial
pg_check < supabase-schema.sql
pg_check <<'SQL'
drop table public."emailLogs";
SQL
pg_check < migrations/20261029_event_platform.sql
pg_check < scripts/verify-database.sql
pg_check < tests/schema-publishing.sql
pg_check < tests/schema-deadlines.sql

# Reproduce SQLSTATE 22007 from the real deployment, then verify the complete
# repair against native deadline types, preserving values and column defaults.
for native_type in timestamptz timestamp date; do
  test_database="eventz_$native_type"
  pg_check < supabase-schema.sql
  pg_check < tests/schema-legacy.sql
  pg_check <<SQL
alter table public.events alter column "registrationDeadline" type $native_type using nullif("registrationDeadline",'')::$native_type;
alter table public.events alter column "registrationDeadline" set default '2031-06-05 23:15:30.123456-07';
update public.events set "registrationDeadline"='2030-06-05 23:15:30.123456-07' where id='event-1';
create table public.deadline_test_snapshot as
select "registrationDeadline"::text as value, pg_typeof("registrationDeadline")::text as type,
  (select pg_get_expr(adbin,adrelid) from pg_attrdef where adrelid='public.events'::regclass
    and adnum=(select attnum from pg_attribute where attrelid='public.events'::regclass and attname='registrationDeadline')) as default_value
from public.events where id='event-1';
SQL
  pg_check <<'SQL'
do $$ begin
  begin
    perform 1 from public.events where "registrationDeadline"='';
    raise exception 'Expected the earlier repair to reject a timestamp/empty-string comparison';
  exception when invalid_datetime_format then null;
  end;
end $$;
SQL
  pg_check < migrations/20261029_event_platform.sql
  pg_check < scripts/verify-database.sql
  # Clear the fixture's future default only for the synthetic workflow event.
  # The real legacy event and its original default must remain intact.
  pg_check < tests/schema-publishing.sql
  pg_check < tests/schema-deadlines.sql
  pg_check < migrations/20261029_event_platform.sql
  pg_check <<'SQL'
do $$ begin
  if not exists(select 1 from public.events e cross join public.deadline_test_snapshot s where e.id='event-1'
    and e."registrationDeadline"::text=s.value and pg_typeof(e."registrationDeadline")::text=s.type
    and s.default_value=(select pg_get_expr(adbin,adrelid) from pg_attrdef where adrelid='public.events'::regclass
      and adnum=(select attnum from pg_attribute where attrelid='public.events'::regclass and attname='registrationDeadline')))
  then raise exception 'The repair changed the native deadline value, type or default'; end if;
end $$;
SQL
done

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
printf '%s\n' 'PASS PostgreSQL: old/fresh/partial schemas and native deadline types repaired; drafts, publishing, pass design, registrations, capacity, lifecycle and permissions verified; reruns preserve data; conflicts roll back'
