-- Complete EVENTZ database repair for an existing OR a new Supabase project.
-- Run as the database owner. The application uses a server-only service-role key.
-- One transaction: failures roll back the repair without deleting existing data.
begin;
set local lock_timeout = '15s';
select pg_advisory_xact_lock(20261029, 1);

-- Include the original tables so a fresh or partially initialized project needs
-- only this file. Existing tables and their records are retained.
create table if not exists public.users (
  id text primary key, name text not null, email text not null unique,
  role text not null, "passwordHash" text not null,
  "createdAt" timestamptz not null default now()
);
create table if not exists public.events (
  id text primary key, "eventName" text not null, "eventDate" text not null,
  "eventTime" text not null, venue text not null, "organizerName" text not null,
  description text not null, "passTitle" text not null,
  "accessInstruction" text not null, "footerNote" text not null,
  "logoPath" text not null, "primaryColor" text not null, "accentColor" text not null,
  "showPhone" boolean not null default true, "showEmail" boolean not null default true,
  "showCategory" boolean not null default true, "showOrganization" boolean not null default true,
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create table if not exists public.participants (
  id text primary key, "eventId" text not null, "fullName" text not null,
  phone text not null default '', email text not null default '',
  organization text not null default '', category text not null default '',
  "passId" text not null unique, status text not null,
  "checkedInAt" timestamptz, "checkedInBy" text,
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create table if not exists public."scanLogs" (
  id text primary key, "eventId" text not null, "participantId" text,
  "passId" text not null, "scanResult" text not null, "scannedBy" text not null,
  "deviceInfo" text not null, "ipAddress" text not null,
  "createdAt" timestamptz not null default now()
);
create table if not exists public."emailLogs" (
  id text primary key, "eventId" text not null, "participantId" text not null,
  "participantName" text not null, "recipientEmail" text not null,
  subject text not null, status text not null, "sentAt" timestamptz,
  "errorMessage" text, "createdAt" timestamptz not null default now()
);
alter table public.users
  add column if not exists "profileImage" text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists "savedEventIds" text[] not null default '{}',
  add column if not exists "followedOrganizerIds" text[] not null default '{}';
-- Fail with an actionable error instead of silently dropping legacy accounts.
do $$ begin
  if exists(select 1 from public.users group by lower(email) having count(*) > 1) then
    raise exception 'EVENTZ repair stopped: duplicate account emails differ only by letter case. Resolve the duplicates and rerun. No accounts have been deleted.';
  end if;
end $$;
create unique index if not exists users_email_case_insensitive on public.users (lower(email));
alter table public.events
  add column if not exists "ownerId" text references public.users(id),
  add column if not exists "publicationStatus" text not null default 'draft' check ("publicationStatus" in ('draft','published','cancelled')),
  add column if not exists category text not null default 'Community',
  add column if not exists city text not null default '',
  add column if not exists "coverImage" text not null default '',
  add column if not exists "locationType" text not null default 'in_person',
  add column if not exists timezone text not null default 'UTC',
  add column if not exists "gateOfficerIds" text[] not null default '{}',
  add column if not exists "registrationEnabled" boolean not null default true,
  add column if not exists "registrationMode" text default 'public',
  add column if not exists "registrationDeadline" text,
  add column if not exists "eventCapacity" integer check ("eventCapacity" > 0),
  add column if not exists "waitlistEnabled" boolean default false,
  add column if not exists "allowGuests" boolean default false,
  add column if not exists "maxGuestsPerRegistration" integer default 0,
  add column if not exists "customRegistrationFields" jsonb default '[]',
  add column if not exists "dashboardMediaUrl" text,
  add column if not exists "dashboardMediaPath" text,
  add column if not exists "dashboardMediaType" text,
  add column if not exists "dashboardMediaName" text,
  add column if not exists "dashboardMediaEnabled" boolean default false,
  add column if not exists "dashboardMediaFit" text,
  add column if not exists "dashboardMediaPosition" text,
  add column if not exists "dashboardMediaOverlay" numeric,
  add column if not exists "dashboardMediaAutoplay" boolean,
  add column if not exists "dashboardMediaLoop" boolean;
-- Earlier releases allowed these columns to exist with NULL values. Merely
-- adding IF NOT EXISTS does not repair their defaults or registration behavior.
update public.users set "profileImage"=coalesce("profileImage",''), bio=coalesce(bio,''),
  "savedEventIds"=coalesce("savedEventIds",'{}'), "followedOrganizerIds"=coalesce("followedOrganizerIds",'{}')
where "profileImage" is null or bio is null or "savedEventIds" is null or "followedOrganizerIds" is null;
alter table public.users
  alter column "profileImage" set default '', alter column "profileImage" set not null,
  alter column bio set default '', alter column bio set not null,
  alter column "savedEventIds" set default '{}', alter column "savedEventIds" set not null,
  alter column "followedOrganizerIds" set default '{}', alter column "followedOrganizerIds" set not null;
update public.events set "publicationStatus"=coalesce("publicationStatus",'draft'),
  category=coalesce(category,'Community'), city=coalesce(city,''), "coverImage"=coalesce("coverImage",''),
  "locationType"=coalesce("locationType",'in_person'), timezone=coalesce(timezone,'UTC'),
  "gateOfficerIds"=coalesce("gateOfficerIds",'{}'), "registrationEnabled"=coalesce("registrationEnabled",true),
  "registrationDeadline"=nullif("registrationDeadline",'')
where "publicationStatus" is null or category is null or city is null or "coverImage" is null
  or "locationType" is null or timezone is null or "gateOfficerIds" is null
  or "registrationEnabled" is null or "registrationDeadline"='';
alter table public.events
  alter column "publicationStatus" set default 'draft', alter column "publicationStatus" set not null,
  alter column category set default 'Community', alter column category set not null,
  alter column city set default '', alter column city set not null,
  alter column "coverImage" set default '', alter column "coverImage" set not null,
  alter column "locationType" set default 'in_person', alter column "locationType" set not null,
  alter column timezone set default 'UTC', alter column timezone set not null,
  alter column "gateOfficerIds" set default '{}', alter column "gateOfficerIds" set not null,
  alter column "registrationEnabled" set default true, alter column "registrationEnabled" set not null;
-- Preserve the original workspace only where its legacy owner actually exists.
update public.events set "ownerId" = 'user-admin', "gateOfficerIds" = case when exists(select 1 from public.users where id='user-gate') then array['user-gate'] else '{}' end
where id='event-1' and "ownerId" is null and exists(select 1 from public.users where id='user-admin');
alter table public.participants
  add column if not exists "userId" text references public.users(id),
  add column if not exists "lastEmailStatus" text,
  add column if not exists "lastEmailError" text,
  add column if not exists "rsvpToken" text,
  add column if not exists "rsvpStatus" text,
  add column if not exists "rsvpUpdatedAt" timestamptz,
  add column if not exists "rsvpDeclinedAt" timestamptz,
  add column if not exists "passCancelledByRsvp" boolean,
  add column if not exists "registrationId" text,
  add column if not exists "isGuest" boolean,
  add column if not exists "guestOfParticipantId" text,
  add column if not exists "passVersion" integer not null default 1,
  add column if not exists "passRevokedAt" timestamptz,
  add column if not exists "passRevokedBy" text,
  add column if not exists "passRevocationReason" text,
  add column if not exists "entryMode" text not null default 'single',
  add column if not exists "allowedDays" text[] not null default '{}',
  add column if not exists "presenceState" text not null default 'outside',
  add column if not exists "accessCount" integer not null default 0,
  add column if not exists "lastAccessAt" timestamptz,
  add column if not exists "lastAccessGate" text,
  add column if not exists "lastExitAt" timestamptz,
  add column if not exists "lastExitGate" text;
-- Normalize older optional columns before using conditional gate updates.
update public.participants set "passVersion"=1 where "passVersion" is null;
update public.participants set "accessCount"=0 where "accessCount" is null;
update public.participants set "presenceState"='outside' where "presenceState" is null;
update public.participants set "entryMode"='single' where "entryMode" is null;
update public.participants set "allowedDays"='{}' where "allowedDays" is null;
alter table public.participants alter column "passVersion" set default 1, alter column "passVersion" set not null,
  alter column "accessCount" set default 0, alter column "accessCount" set not null,
  alter column "presenceState" set default 'outside', alter column "presenceState" set not null,
  alter column "entryMode" set default 'single', alter column "entryMode" set not null,
  alter column "allowedDays" set default '{}', alter column "allowedDays" set not null;
do $$ begin
  if exists(select 1 from public.participants where "userId" is not null group by "eventId","userId" having count(*) > 1) then
    raise exception 'EVENTZ repair stopped: an account has multiple registrations for one event. Resolve the duplicates and rerun. No registrations have been deleted.';
  end if;
end $$;
create unique index if not exists one_registration_per_account on public.participants ("eventId", "userId") where "userId" is not null;
create index if not exists platform_discovery on public.events ("publicationStatus", "eventDate");
create index if not exists participant_event on public.participants ("eventId");
alter table public."scanLogs"
  add column if not exists direction text,
  add column if not exists offline boolean,
  add column if not exists "syncId" text,
  add column if not exists "riskLevel" text,
  add column if not exists "riskReason" text,
  add column if not exists "qrVerified" boolean;
create unique index if not exists scan_sync_deduplication on public."scanLogs" ("eventId", "syncId") where "syncId" is not null;
create table if not exists public."passHistory" (
  id text primary key, "eventId" text not null, "participantId" text not null,
  action text not null, "oldPassId" text, "newPassId" text, "passVersion" integer,
  "performedBy" text, reason text, metadata jsonb, "createdAt" timestamptz not null default now()
);
create table if not exists public."passSecurityAlerts" (
  id text primary key, "eventId" text not null, "participantId" text,
  "passId" text, type text, severity text, message text, gates text[], "scanLogIds" text[],
  resolved boolean default false, "resolvedAt" timestamptz, "resolvedBy" text,
  "createdAt" timestamptz not null default now()
);
-- Enforce capacity for manual imports as well as public registrations.
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql set search_path = public as $$
declare capacity integer; occupied integer;
begin
  if new.status = 'Cancelled' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'Cancelled' and old."eventId" = new."eventId" then return new; end if;
  end if;
  select "eventCapacity" into capacity from public.events where id=new."eventId" for update;
  if capacity is not null then
    select count(*) into occupied from public.participants where "eventId"=new."eventId" and status <> 'Cancelled' and id<>new.id;
    if occupied >= capacity then raise exception 'This event has reached capacity.'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists event_capacity_guard on public.participants;
create trigger event_capacity_guard before insert or update of status,"eventId" on public.participants for each row execute function public.enforce_event_capacity();
-- Service-only registration transaction: serializes capacity checks across instances.
create or replace function public.register_event(event_id text, attendee_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  event_row public.events;
  attendee public.users;
  pass public.participants;
  occupied integer;
begin
  select * into event_row from public.events where id=event_id for update;
  if not found or event_row."publicationStatus" <> 'published' or not event_row."registrationEnabled"
    or event_row."eventDate" < current_date::text
    or (event_row."registrationDeadline" is not null and event_row."registrationDeadline" < current_date::text)
  then raise exception 'Registration is closed.'; end if;
  select * into attendee from public.users where id=attendee_id;
  if not found then raise exception 'Account not found.'; end if;
  select * into pass from public.participants where "eventId"=event_id and "userId"=attendee_id;
  if found and pass.status <> 'Cancelled' then return to_jsonb(pass); end if;
  select count(*) into occupied from public.participants where "eventId"=event_id and status <> 'Cancelled';
  if event_row."eventCapacity" is not null and occupied >= event_row."eventCapacity" then raise exception 'This event has reached capacity.'; end if;
  if pass.id is not null then
    update public.participants set status='Not Used', "passRevokedAt"=null, "passVersion"=coalesce("passVersion",1)+1, "updatedAt"=now() where id=pass.id returning * into pass;
  else
    insert into public.participants (id,"eventId","userId","fullName",email,phone,organization,category,"passId",status,"rsvpStatus")
    values ('part-'||gen_random_uuid()::text,event_id,attendee_id,attendee.name,attendee.email,'','','General admission','EVT-'||upper(replace(gen_random_uuid()::text,'-','')),'Not Used','yes') returning * into pass;
  end if;
  return to_jsonb(pass);
end;
$$;
revoke all on function public.register_event(text,text) from public, anon, authenticated;
grant execute on function public.register_event(text,text) to service_role;
grant usage on schema public to service_role;
-- Browsers use the authenticated Express gateway, never direct table access.
-- Revoke existing grants as well as enabling RLS, including legacy policies.
do $$
declare table_name text;
begin
  foreach table_name in array array['users','events','participants','scanLogs','emailLogs','passHistory','passSecurityAlerts'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;
commit;
-- Refresh PostgREST immediately after the schema change.
notify pgrst, 'reload schema';
select 'EVENTZ database repair completed' as result;
