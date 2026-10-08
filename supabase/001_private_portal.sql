-- Run once in this project's SQL Editor. No client data is embedded here.
-- Authorization lives in PostgreSQL, never in the browser or user_metadata.
begin;
create schema if not exists gtfs_private;
revoke all on schema gtfs_private from public, anon, authenticated;

create table if not exists gtfs_private.members (
  email text primary key check (email = lower(trim(email))),
  role text not null check (role in ('admin','viewer')),
  enabled boolean not null default true,
  changed_at timestamptz not null default now()
);
create table if not exists gtfs_private.access_log (
  id bigint generated always as identity primary key,
  actor uuid not null,
  member_email text not null,
  enabled boolean not null,
  changed_at timestamptz not null default now()
);
alter table gtfs_private.members enable row level security;
alter table gtfs_private.access_log enable row level security;
revoke all on all tables in schema gtfs_private from public, anon, authenticated;
-- Does NOT create an Auth account or verify ownership of this address.
insert into gtfs_private.members(email,role) values ('romainrenaux@me.com','admin')
on conflict (email) do nothing;

create or replace function public.gtfs_portal_role()
returns text language sql stable security definer set search_path = '' as $$
  select m.role from gtfs_private.members m
  join auth.users u on lower(u.email) = m.email
  where u.id = auth.uid() and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until < now()) and m.enabled
$$;

create or replace function public.gtfs_portal_members()
returns table(email text, role text, enabled boolean, changed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if public.gtfs_portal_role() is distinct from 'admin' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  return query select m.email,m.role,m.enabled,m.changed_at
    from gtfs_private.members m order by m.email;
end $$;

create or replace function public.gtfs_portal_set_member(member_email text, allow_access boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target text := lower(trim(member_email));
begin
  if public.gtfs_portal_role() is distinct from 'admin' then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if target is null or length(target)>254 or target !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or allow_access is null then
    raise exception 'Invalid email or access value';
  end if;
  if exists(select 1 from gtfs_private.members where email=target and role='admin') then
    raise exception 'Administrator access is managed in the SQL console only';
  end if;
  insert into gtfs_private.members(email,role,enabled) values(target,'viewer',allow_access)
  on conflict(email) do update set enabled=excluded.enabled,changed_at=now();
  insert into gtfs_private.access_log(actor,member_email,enabled) values(auth.uid(),target,allow_access);
end $$;

revoke all on function public.gtfs_portal_role() from public, anon;
revoke all on function public.gtfs_portal_members() from public, anon;
revoke all on function public.gtfs_portal_set_member(text,boolean) from public, anon;
-- Anonymous callers only receive NULL (auth.uid() is NULL).
grant execute on function public.gtfs_portal_role() to anon, authenticated;
grant execute on function public.gtfs_portal_members() to authenticated;
grant execute on function public.gtfs_portal_set_member(text,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit)
values('gtfs-private','gtfs-private',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

-- Restrictive gates prevent another permissive policy from exposing this bucket.
-- Outside this bucket these policies do not grant any access.
drop policy if exists gtfs_private_read_gate on storage.objects;
create policy gtfs_private_read_gate on storage.objects as restrictive for select to anon,authenticated
using (bucket_id <> 'gtfs-private' or (select public.gtfs_portal_role()) in ('admin','viewer'));
drop policy if exists gtfs_private_insert_gate on storage.objects;
create policy gtfs_private_insert_gate on storage.objects as restrictive for insert to anon,authenticated
with check (bucket_id <> 'gtfs-private' or (select public.gtfs_portal_role()) = 'admin');
drop policy if exists gtfs_private_update_gate on storage.objects;
create policy gtfs_private_update_gate on storage.objects as restrictive for update to anon,authenticated
using (bucket_id <> 'gtfs-private' or (select public.gtfs_portal_role()) = 'admin')
with check (bucket_id <> 'gtfs-private' or (select public.gtfs_portal_role()) = 'admin');
drop policy if exists gtfs_private_delete_gate on storage.objects;
create policy gtfs_private_delete_gate on storage.objects as restrictive for delete to anon,authenticated
using (bucket_id <> 'gtfs-private' or (select public.gtfs_portal_role()) = 'admin');
drop policy if exists gtfs_private_read on storage.objects;
create policy gtfs_private_read on storage.objects for select to authenticated
using (bucket_id='gtfs-private' and (select public.gtfs_portal_role()) in ('admin','viewer'));
drop policy if exists gtfs_private_insert on storage.objects;
create policy gtfs_private_insert on storage.objects for insert to authenticated
with check (bucket_id='gtfs-private' and (select public.gtfs_portal_role())='admin');
drop policy if exists gtfs_private_delete on storage.objects;
create policy gtfs_private_delete on storage.objects for delete to authenticated
using (bucket_id='gtfs-private' and (select public.gtfs_portal_role())='admin');
-- No UPDATE grant: portal uploads never replace an existing object.
commit;
