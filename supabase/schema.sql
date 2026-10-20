-- Evenly: database schema for Supabase.
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to re-run: it drops and recreates the functions and policies.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  currency    text not null default 'INR' check (char_length(currency) = 3),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- One-to-one friend ledgers are groups of two with is_direct = true.
alter table public.groups add column if not exists is_direct boolean not null default false;

-- A member is a person in a group. user_id links them to a login account;
-- it is null for people who have not signed up (yet). email is the invite:
-- when someone signs in with that confirmed email, they are linked.
create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  name        text not null check (char_length(name) between 1 and 40),
  email       text check (email is null or position('@' in email) > 1),
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists group_members_user_idx  on public.group_members (user_id);
create index if not exists group_members_email_idx on public.group_members (lower(email));
create index if not exists group_members_group_idx on public.group_members (group_id);

-- Amounts are stored in the smallest unit (paise, cents) to avoid rounding errors.
-- split maps member id -> amount owed, e.g. {"<member uuid>": 25000}.
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  kind         text not null default 'expense' check (kind in ('expense', 'payment')),
  description  text not null check (char_length(description) between 1 and 80),
  amount       bigint not null check (amount > 0),
  paid_by      uuid not null references public.group_members(id),
  split        jsonb not null check (jsonb_typeof(split) = 'object'),
  split_mode   text not null default 'equal' check (split_mode in ('equal', 'exact', 'percent', 'shares')),
  split_input  jsonb not null default '{}'::jsonb,
  category     text not null default 'other',
  date         date not null default current_date,
  created_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists expenses_group_idx on public.expenses (group_id);

-- ---------- helpers ----------

-- security definer so policies can check membership without recursing into RLS.
create or replace function public.is_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid());
$$;

-- Creates a group with you as the first member, plus the people you list.
-- p_members: [{"name": "Asha", "email": "asha@example.com"}, {"name": "Ravi"}]
create or replace function public.create_group(p_name text, p_currency text, p_my_name text, p_members jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  m jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.groups (name, currency, created_by) values (trim(p_name), p_currency, auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id, name, email)
    values (gid, auth.uid(), trim(p_my_name), lower(auth.email()));
  for m in select * from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) loop
    insert into public.group_members (group_id, name, email)
      values (gid, trim(m->>'name'), nullif(lower(trim(m->>'email')), ''));
  end loop;
  -- Anyone you invited who already has an account is linked straight away.
  update public.group_members gm set user_id = u.id
    from auth.users u
   where gm.group_id = gid and gm.user_id is null and gm.email is not null
     and lower(u.email) = gm.email and u.email_confirmed_at is not null
     and not exists (select 1 from public.group_members x where x.group_id = gid and x.user_id = u.id);
  return gid;
end $$;

-- Starts (or reopens) a one-to-one ledger with a friend.
-- If you already have one with this email, that one is returned instead of a duplicate.
create or replace function public.add_friend(p_my_name text, p_name text, p_email text, p_currency text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  fid uuid;
  em text := nullif(lower(trim(p_email)), '');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if em is not null and em = lower(auth.email()) then raise exception 'That is your own email. Enter your friend''s email.'; end if;
  if em is not null then
    select u.id into fid from auth.users u where lower(u.email) = em and u.email_confirmed_at is not null limit 1;
    select g.id into gid
      from public.groups g
      join public.group_members me on me.group_id = g.id and me.user_id = auth.uid()
      join public.group_members f  on f.group_id = g.id and f.id <> me.id
     where g.is_direct and (f.email = em or (fid is not null and f.user_id = fid))
     limit 1;
    if gid is not null then return gid; end if;
  end if;
  insert into public.groups (name, currency, created_by, is_direct)
    values ('Friends', coalesce(nullif(p_currency, ''), 'INR'), auth.uid(), true) returning id into gid;
  insert into public.group_members (group_id, user_id, name, email)
    values (gid, auth.uid(), trim(p_my_name), lower(auth.email()));
  insert into public.group_members (group_id, user_id, name, email)
    values (gid, fid, trim(p_name), em);
  return gid;
end $$;

-- Adds a person to a group you belong to, linking them if they already have an account.
create or replace function public.add_member(p_group uuid, p_name text, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  uid uuid;
  em text := nullif(lower(trim(p_email)), '');
begin
  if not public.is_member(p_group) then raise exception 'Not a member of this group'; end if;
  if em is not null then
    select u.id into uid from auth.users u
     where lower(u.email) = em and u.email_confirmed_at is not null
       and not exists (select 1 from public.group_members x where x.group_id = p_group and x.user_id = u.id)
     limit 1;
  end if;
  insert into public.group_members (group_id, user_id, name, email)
    values (p_group, uid, trim(p_name), em) returning id into mid;
  return mid;
end $$;

-- Called after every sign-in: links you to groups that invited your (confirmed) email.
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    return 0;
  end if;
  update public.group_members gm set user_id = auth.uid()
   where gm.user_id is null and gm.email is not null and gm.email = lower(auth.email())
     and not exists (select 1 from public.group_members x where x.group_id = gm.group_id and x.user_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.create_group(text, text, text, jsonb) from public, anon;
revoke all on function public.add_member(uuid, text, text) from public, anon;
revoke all on function public.add_friend(text, text, text, text) from public, anon;
revoke all on function public.claim_invites() from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_group(text, text, text, jsonb) to authenticated;
grant execute on function public.add_member(uuid, text, text) to authenticated;
grant execute on function public.add_friend(text, text, text, text) to authenticated;
grant execute on function public.claim_invites() to authenticated;

-- ---------- row level security: you only ever see groups you belong to ----------

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;

drop policy if exists "members read groups"    on public.groups;
drop policy if exists "members update groups"  on public.groups;
drop policy if exists "creator deletes groups" on public.groups;
create policy "members read groups"    on public.groups for select using (public.is_member(id));
create policy "members update groups"  on public.groups for update using (public.is_member(id)) with check (public.is_member(id));
create policy "creator deletes groups" on public.groups for delete using (created_by = auth.uid());
-- No insert policy: groups are created through create_group().

drop policy if exists "members read members"   on public.group_members;
drop policy if exists "members edit members"   on public.group_members;
drop policy if exists "members remove members" on public.group_members;
create policy "members read members"   on public.group_members for select using (public.is_member(group_id));
create policy "members edit members"   on public.group_members for update using (public.is_member(group_id)) with check (public.is_member(group_id));
create policy "members remove members" on public.group_members for delete using (public.is_member(group_id) and user_id is null);
-- Members are added through add_member(). Nobody can rewrite who a member is linked to:
revoke insert, update on public.group_members from anon, authenticated;
grant update (name, email) on public.group_members to authenticated;
revoke insert on public.groups from anon, authenticated;
revoke update on public.groups from anon, authenticated;
grant update (name, currency) on public.groups to authenticated;

drop policy if exists "members manage expenses" on public.expenses;
create policy "members manage expenses" on public.expenses for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));

-- ---------- live updates ----------
do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'expenses'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
