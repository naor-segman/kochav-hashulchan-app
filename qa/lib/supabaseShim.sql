-- A Supabase stand-in for local Postgres harnesses: the roles, auth.uid(),
-- a storage schema with foldername(), and Supabase's default grants. Enough to
-- load supabase/setup_full.sql and drive RLS / storage policies as anon or a
-- signed-in user (request.jwt.claim.sub). Not the real Storage API.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[], owner uuid, created_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid default auth.uid(), metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), last_accessed_at timestamptz);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $$;
create or replace function storage.filename(name text) returns text language plpgsql immutable as $$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[array_length(_parts,1)]; end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create publication supabase_realtime;
