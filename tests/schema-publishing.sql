insert into public.users (id,name,email,role,"passwordHash") values
  ('migration-user','Migration Check','migration@example.test','member','test-only-hash'),
  ('migration-second','Second Attendee','second@example.test','member','test-only-hash'),
  ('migration-third','Third Attendee','third@example.test','member','test-only-hash');
insert into public.events (id,"ownerId","publicationStatus","eventName","eventDate","eventTime",venue,"organizerName",description,"passTitle","accessInstruction","footerNote","logoPath","primaryColor","accentColor",city,category,timezone,"eventCapacity","coverImage")
values ('migration-event','migration-user','draft','Migration validation',(current_date+7)::text,'18:00','Test venue','Migration Check','Temporary database validation','Event Pass','','','','#0e1b3b','#f5aa0d','Douala','Community','Africa/Douala',2,'https://example.test/cover.webp');
update public.events set "publicationStatus"='published', "updatedAt"=now() where id='migration-event';
set role service_role;
do $$
declare first_pass jsonb; retry_pass jsonb;
begin
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
end $$;
reset role;
