-- Model an old deployment with nullable fields and permissive browser grants.
insert into public.users (id,name,email,role,"passwordHash") values
  ('user-admin','Legacy Organizer','legacy@example.test','admin','legacy-test-hash'),
  ('user-gate','Legacy Gate','gate@example.test','gate_officer','legacy-test-hash');
insert into public.events (id,"eventName","eventDate","eventTime",venue,"organizerName",description,"passTitle","accessInstruction","footerNote","logoPath","primaryColor","accentColor")
values ('event-1','Existing event',(current_date+7)::text,'18:00','Existing venue','Legacy Organizer','Keep this event','Original VIP pass','Original instructions','Original footer','{"templateId":"legacy-custom","fontStyle":"classic"}','#102030','#aabbcc');
insert into public.participants (id,"eventId","fullName","passId",status)
values ('legacy-participant','event-1','Existing Attendee','LEGACY-PASS','Not Used');
alter table public.users add column bio text, add column "savedEventIds" text[];
alter table public.events add column "publicationStatus" text, add column "registrationEnabled" boolean, add column "registrationDeadline" text;
update public.events set "registrationDeadline"='';
alter table public.participants add column "passVersion" integer, add column "entryMode" text, add column "allowedDays" text[];
grant all on all tables in schema public to public;
