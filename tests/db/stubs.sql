-- Minimal stand-ins for what Supabase provides, so schema.sql can run on plain PostgreSQL.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema public, auth, storage to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'owner@example.com');

-- stand-in for Supabase's pg_net: records the requests instead of sending them
create schema net;
create table net.sent (id bigserial primary key, url text, body jsonb);
create table net._http_response (id bigint primary key, status_code int, error_msg text, timed_out boolean, content text);
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ declare i bigint; begin
  insert into net.sent (url, body) values (url, body) returning id into i;
  insert into net._http_response values (i, 200, null, false, '{"ok":true}');
  return i; end $$;
create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$ declare i bigint; begin
  insert into net.sent (url, body) values (url, null) returning id into i;
  insert into net._http_response values (i, 200, null, false, '{"ok":true}');
  return i; end $$;
grant usage on schema net to anon, authenticated;
