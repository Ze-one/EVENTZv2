-- Run after the repair in the SAME Supabase project configured in Vercel.
-- Read-only: no accounts, events, registrations or pass designs are changed.
begin transaction read only;
do $$
declare required record; missing text; relation regclass; index_name text;
begin
  for required in select * from (values
    ('users', array['id','name','email','role','passwordHash','createdAt','profileImage','bio','savedEventIds','followedOrganizerIds']),
    ('events', array['id','eventName','eventDate','eventTime','venue','organizerName','description','passTitle','accessInstruction','footerNote','logoPath','primaryColor','accentColor','showPhone','showEmail','showCategory','showOrganization','createdAt','updatedAt','ownerId','publicationStatus','category','city','coverImage','locationType','timezone','gateOfficerIds','registrationEnabled','registrationMode','registrationDeadline','eventCapacity','waitlistEnabled','allowGuests','maxGuestsPerRegistration','customRegistrationFields','dashboardMediaUrl','dashboardMediaPath','dashboardMediaType','dashboardMediaName','dashboardMediaEnabled','dashboardMediaFit','dashboardMediaPosition','dashboardMediaOverlay','dashboardMediaAutoplay','dashboardMediaLoop']),
    ('participants', array['id','eventId','fullName','phone','email','organization','category','passId','status','checkedInAt','checkedInBy','createdAt','updatedAt','userId','lastEmailStatus','lastEmailError','rsvpToken','rsvpStatus','rsvpUpdatedAt','rsvpDeclinedAt','passCancelledByRsvp','registrationId','isGuest','guestOfParticipantId','passVersion','passRevokedAt','passRevokedBy','passRevocationReason','entryMode','allowedDays','presenceState','accessCount','lastAccessAt','lastAccessGate','lastExitAt','lastExitGate']),
    ('scanLogs', array['id','eventId','participantId','passId','scanResult','scannedBy','deviceInfo','ipAddress','createdAt','direction','offline','syncId','riskLevel','riskReason','qrVerified']),
    ('emailLogs', array['id','eventId','participantId','participantName','recipientEmail','subject','status','sentAt','errorMessage','createdAt']),
    ('passHistory', array['id','eventId','participantId','action','oldPassId','newPassId','passVersion','performedBy','reason','metadata','createdAt']),
    ('passSecurityAlerts', array['id','eventId','participantId','passId','type','severity','message','gates','scanLogIds','resolved','resolvedAt','resolvedBy','createdAt'])
  ) as expected(table_name, columns) loop
    relation := to_regclass(format('public.%I', required.table_name));
    if relation is null then raise exception 'EVENTZ check failed: missing table %', required.table_name; end if;
    select string_agg(column_name, ', ') into missing from unnest(required.columns) column_name
    where not exists(select 1 from pg_attribute where attrelid=relation and attname=column_name and not attisdropped);
    if missing is not null then raise exception 'EVENTZ check failed: %. Missing columns: %', required.table_name, missing; end if;
    if not (select relrowsecurity from pg_class where oid=relation) then
      raise exception 'EVENTZ check failed: row level security is disabled for %', required.table_name;
    end if;
    if not has_table_privilege('service_role', relation, 'SELECT')
      or not has_table_privilege('service_role', relation, 'INSERT')
      or not has_table_privilege('service_role', relation, 'UPDATE')
      or not has_table_privilege('service_role', relation, 'DELETE') then
      raise exception 'EVENTZ check failed: service_role cannot manage %', required.table_name;
    end if;
    if has_table_privilege('anon',relation,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated',relation,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'EVENTZ check failed: direct browser access is still granted on %', required.table_name;
    end if;
  end loop;
  for required in select * from (values
    ('users','savedEventIds','text[]'), ('users','followedOrganizerIds','text[]'),
    ('events','ownerId','text'), ('events','publicationStatus','text'),
    ('events','registrationEnabled','boolean'),
    ('events','eventCapacity','integer'), ('events','gateOfficerIds','text[]'),
    ('events','customRegistrationFields','jsonb'), ('events','logoPath','text'),
    ('participants','userId','text'), ('participants','passVersion','integer'),
    ('participants','accessCount','integer'), ('participants','allowedDays','text[]')
  ) as expected(table_name,column_name,type_name) loop
    if not exists(select 1 from pg_attribute
      where attrelid=to_regclass(format('public.%I',required.table_name))
      and attname=required.column_name and atttypid=to_regtype(required.type_name) and not attisdropped) then
      raise exception 'EVENTZ check failed: %.% must have type %', required.table_name,required.column_name,required.type_name;
    end if;
  end loop;
  -- The platform accepts ISO deadline strings through PostgREST. Older
  -- installations legitimately use native date or timestamp columns here.
  if not exists(select 1 from pg_attribute where attrelid='public.events'::regclass
    and attname='registrationDeadline' and not attisdropped
    and atttypid=any(array['text'::regtype,'character varying'::regtype,'date'::regtype,
      'timestamp without time zone'::regtype,'timestamp with time zone'::regtype])) then
    raise exception 'EVENTZ check failed: events.registrationDeadline must be text, date or timestamp';
  end if;
  if not has_schema_privilege('service_role','public','USAGE') then
    raise exception 'EVENTZ check failed: service_role needs public schema access';
  end if;
  if to_regprocedure('public.register_event(text,text)') is null then
    raise exception 'EVENTZ check failed: registration function is missing';
  end if;
  if not has_function_privilege('service_role','public.register_event(text,text)','EXECUTE')
    or has_function_privilege('anon','public.register_event(text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.register_event(text,text)','EXECUTE') then
    raise exception 'EVENTZ check failed: registration function permissions need repair';
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.participants'::regclass
    and tgname='event_capacity_guard' and tgenabled='O' and not tgisinternal) then
    raise exception 'EVENTZ check failed: event capacity trigger is missing or disabled';
  end if;
  foreach index_name in array array['users_email_case_insensitive','one_registration_per_account','scan_sync_deduplication'] loop
    if not exists(select 1 from pg_index where indexrelid=to_regclass(format('public.%I',index_name)) and indisunique and indisvalid) then
      raise exception 'EVENTZ check failed: required unique index % is missing or invalid', index_name;
    end if;
  end loop;
end $$;
select 'EVENTZ database checks passed' as result,
  (select count(*) from public.events where "ownerId" is null) as legacy_events_without_owner;
commit;
