insert into public.users (id,name,email,role,"passwordHash") values
  ('migration-user','Migration Check','migration@example.test','member','test-only-hash'),
  ('migration-second','Second Attendee','second@example.test','member','test-only-hash'),
  ('migration-third','Third Attendee','third@example.test','member','test-only-hash');
insert into public.events (id,"ownerId","publicationStatus","eventName","eventDate","eventTime",venue,"organizerName",description,"passTitle","accessInstruction","footerNote","logoPath","primaryColor","accentColor",city,category,timezone,"eventCapacity","coverImage")
values ('migration-event','migration-user','draft','Migration validation',(current_date+7)::text,'18:00','Test venue','Migration Check','Temporary database validation','Event Pass','','','','#0e1b3b','#f5aa0d','Douala','Community','Africa/Douala',2,'https://example.test/cover.webp');
update public.events set "registrationDeadline"=null where id='migration-event';
update public.events set "publicationStatus"='published', "updatedAt"=now() where id='migration-event';
set role service_role;
-- Exercise the original workspace's pass designer against actual PostgreSQL.
update public.events set "passTitle"='Community VIP', "logoPath"='{"templateId":"editorial","fontStyle":"classic"}',
  "primaryColor"='#123456', "accentColor"='#f5aa0d', "showPhone"=false,
  "dashboardMediaFit"='cover', "dashboardMediaOverlay"=0.25 where id='migration-event';
do $$
declare first_pass jsonb; retry_pass jsonb;
begin
  begin
    perform public.register_event('eventz-readiness-nonexistent','eventz-readiness');
    raise exception 'Expected readiness to stop before writing a registration';
  exception when raise_exception then
    if sqlerrm <> 'Registration is closed.' then raise; end if;
  end;
  if (select "logoPath"::jsonb->>'templateId' from public.events where id='migration-event') <> 'editorial'
    or (select "passTitle" from public.events where id='migration-event') <> 'Community VIP' then
    raise exception 'Pass design was not persisted';
  end if;
  first_pass := public.register_event('migration-event','migration-user');
  retry_pass := public.register_event('migration-event','migration-user');
  if first_pass->>'id' <> retry_pass->>'id' then raise exception 'Duplicate registration created a second pass'; end if;
  perform public.register_event('migration-event','migration-second');
  begin
    perform public.register_event('migration-event','migration-third');
    raise exception 'Expected a capacity denial';
  exception when raise_exception then
    if sqlerrm <> 'This event has reached capacity.' then raise; end if;
  end;
  -- Cancellation and re-registration must preserve the participant and revoke
  -- the earlier QR version, while opening and then occupying the capacity slot.
  update public.participants set status='Cancelled',"passRevokedAt"=now() where id=first_pass->>'id';
  retry_pass := public.register_event('migration-event','migration-user');
  if retry_pass->>'id' <> first_pass->>'id' or (retry_pass->>'passVersion')::integer <> 2
    or retry_pass->>'passRevokedAt' is not null then raise exception 'Pass reactivation failed'; end if;
  -- Manual participant imports must respect the same capacity limit.
  begin
    insert into public.participants(id,"eventId","fullName","passId",status)
    values ('over-capacity','migration-event','Manual attendee','OVER-CAPACITY','Not Used');
    raise exception 'Expected manual registration capacity denial';
  exception when raise_exception then
    if sqlerrm <> 'This event has reached capacity.' then raise; end if;
  end;
  insert into public."scanLogs"(id,"eventId","participantId","passId","scanResult","scannedBy","deviceInfo","ipAddress",direction,"syncId","qrVerified")
  values ('migration-scan','migration-event',first_pass->>'id',first_pass->>'passId','Valid','Test gate','Test device','127.0.0.1','entry','migration-sync',true);
  insert into public."emailLogs"(id,"eventId","participantId","participantName","recipientEmail",subject,status)
  values ('migration-mail','migration-event',first_pass->>'id','Test attendee','migration@example.test','Test only','Queued');
  insert into public."passHistory"(id,"eventId","participantId",action,"passVersion",metadata)
  values ('migration-history','migration-event',first_pass->>'id','reactivated',2,'{"test":true}');
  insert into public."passSecurityAlerts"(id,"eventId","participantId","passId",type,message,gates,"scanLogIds")
  values ('migration-alert','migration-event',first_pass->>'id',first_pass->>'passId','test','Temporary test',array['Test gate'],array['migration-scan']);
end $$;
reset role;
