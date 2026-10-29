-- Exercise date-only JSON writes against text and native deadline columns,
-- matching the conversion PostgREST applies to a submitted event payload.
begin;
set local role service_role;
do $$
declare pass jsonb; saved public.events;
begin
  update public.events set "registrationDeadline"=(jsonb_populate_record(null::public.events,
    jsonb_build_object('registrationDeadline',(current_date-1)::text)))."registrationDeadline"
  where id='migration-event';
  begin
    perform public.register_event('migration-event','migration-user');
    raise exception 'Expected a deadline denial';
  exception when raise_exception then
    if sqlerrm <> 'Registration is closed.' then raise; end if;
  end;
  update public.events set "registrationDeadline"=(jsonb_populate_record(null::public.events,
    jsonb_build_object('registrationDeadline',(current_date+1)::text)))."registrationDeadline"
  where id='migration-event' returning * into saved;
  if left(saved."registrationDeadline"::text,10) <> (current_date+1)::text then
    raise exception 'Date-only deadline JSON write failed';
  end if;
  pass := public.register_event('migration-event','migration-user');
  if pass->>'userId' <> 'migration-user' then raise exception 'Future deadline prevented registration'; end if;
  update public.events set "registrationDeadline"=null where id='migration-event';
  perform public.register_event('migration-event','migration-user');
end $$;
rollback;
