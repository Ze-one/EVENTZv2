create extension if not exists "pgcrypto";

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null,
  "passwordHash" text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public.events (
  id text primary key,
  "eventName" text not null,
  "eventDate" text not null,
  "eventTime" text not null,
  venue text not null,
  "organizerName" text not null,
  description text not null,
  "passTitle" text not null,
  "accessInstruction" text not null,
  "footerNote" text not null,
  "logoPath" text not null,
  "primaryColor" text not null,
  "accentColor" text not null,
  "showPhone" boolean not null default true,
  "showEmail" boolean not null default true,
  "showCategory" boolean not null default true,
  "showOrganization" boolean not null default true,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public.participants (
  id text primary key,
  "eventId" text not null,
  "fullName" text not null,
  phone text not null default '',
  email text not null default '',
  organization text not null default '',
  category text not null default '',
  "passId" text not null unique,
  status text not null,
  "checkedInAt" timestamptz,
  "checkedInBy" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."scanLogs" (
  id text primary key,
  "eventId" text not null,
  "participantId" text,
  "passId" text not null,
  "scanResult" text not null,
  "scannedBy" text not null,
  "deviceInfo" text not null,
  "ipAddress" text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."emailLogs" (
  id text primary key,
  "eventId" text not null,
  "participantId" text not null,
  "participantName" text not null,
  "recipientEmail" text not null,
  subject text not null,
  status text not null,
  "sentAt" timestamptz,
  "errorMessage" text,
  "createdAt" timestamptz not null default now()
);
