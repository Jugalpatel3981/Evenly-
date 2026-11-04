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
    if nullif(m->>'user', '') is not null then
      insert into public.group_members (group_id, user_id, name, email)
        select gid, u.id, trim(m->>'name'), lower(u.email) from auth.users u
         where u.id = (m->>'user')::uuid and u.email_confirmed_at is not null and u.id <> auth.uid()
        on conflict do nothing;
    else
      insert into public.group_members (group_id, name, email)
        values (gid, trim(m->>'name'), nullif(lower(trim(m->>'email')), ''));
    end if;
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
-- If you already have one with this person, that one is returned instead of a duplicate.
-- p_friend_user: optional account id of someone you already share a group with.
drop function if exists public.add_friend(text, text, text, text);
create or replace function public.add_friend(p_my_name text, p_name text, p_email text, p_currency text, p_friend_user uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  fid uuid;
  em text := nullif(lower(trim(p_email)), '');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_friend_user is not null then
    if p_friend_user = auth.uid() then raise exception 'That''s you. Pick a friend instead.'; end if;
    select u.id, lower(u.email) into fid, em from auth.users u where u.id = p_friend_user and u.email_confirmed_at is not null;
    if fid is null then raise exception 'That person can''t be found.'; end if;
  end if;
  if em is not null and em = lower(auth.email()) then raise exception 'That is your own email. Enter your friend''s email.'; end if;
  if em is not null and fid is null then
    select u.id into fid from auth.users u where lower(u.email) = em and u.email_confirmed_at is not null limit 1;
  end if;
  if em is not null or fid is not null then
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

-- Adds a person to a group you belong to: an account picked from search (p_user),
-- or a name with an optional email that links them when they have an account.
drop function if exists public.add_member(uuid, text, text);
create or replace function public.add_member(p_group uuid, p_name text, p_email text, p_user uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  uid uuid := p_user;
  em text := nullif(lower(trim(p_email)), '');
begin
  if not public.is_member(p_group) then raise exception 'Not a member of this group'; end if;
  if uid is not null then
    select lower(u.email) into em from auth.users u where u.id = uid and u.email_confirmed_at is not null;
    if em is null then raise exception 'That person can''t be found.'; end if;
    select id into mid from public.group_members where group_id = p_group and user_id = uid;
    if mid is not null then return mid; end if;
  elsif em is not null then
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
revoke all on function public.add_member(uuid, text, text, uuid) from public, anon;
revoke all on function public.add_friend(text, text, text, text, uuid) from public, anon;
revoke all on function public.claim_invites() from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_group(text, text, text, jsonb) to authenticated;
grant execute on function public.add_member(uuid, text, text, uuid) to authenticated;
grant execute on function public.add_friend(text, text, text, text, uuid) to authenticated;
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


-- =====================================================================
-- Phase 1 & 2: splitting and social features. Add-only: earlier app versions keep working.
-- =====================================================================

-- ---------- groups ----------
alter table public.groups add column if not exists type text not null default 'other';
alter table public.groups add column if not exists cover_url text;
alter table public.groups add column if not exists whiteboard text not null default '';
alter table public.groups add column if not exists whiteboard_by uuid;
alter table public.groups add column if not exists whiteboard_at timestamptz;
alter table public.groups add column if not exists simplify boolean not null default true;
alter table public.groups add column if not exists invite_code text;
update public.groups set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) where invite_code is null;
alter table public.groups alter column invite_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
alter table public.groups alter column invite_code set not null;
create unique index if not exists groups_invite_code_idx on public.groups (invite_code);
alter table public.groups drop constraint if exists groups_type_check;
alter table public.groups add constraint groups_type_check check (type in ('home', 'trip', 'couple', 'other'));
alter table public.groups drop constraint if exists groups_whiteboard_check;
alter table public.groups add constraint groups_whiteboard_check check (char_length(whiteboard) <= 5000);
-- Deleting your account must not delete groups your friends still use.
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint if exists groups_created_by_fkey;
alter table public.groups add constraint groups_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
grant update (name, currency, type, cover_url, whiteboard, simplify) on public.groups to authenticated;

create or replace function public.stamp_whiteboard()
returns trigger language plpgsql as $$
begin
  if new.whiteboard is distinct from old.whiteboard then
    new.whiteboard_by := auth.uid();
    new.whiteboard_at := now();
  end if;
  return new;
end $$;
drop trigger if exists groups_whiteboard on public.groups;
create trigger groups_whiteboard before update on public.groups for each row execute function public.stamp_whiteboard();

-- ---------- expenses ----------
-- payers: {"<member id>": amount} when several people paid; null means paid_by paid it all.
-- currency: null means the group's currency (rows from older app versions).
-- bill: for one bill split across several friends, {"total": 90000, "with": ["Rahul", "Priya"]}.
alter table public.expenses add column if not exists payers jsonb;
alter table public.expenses add column if not exists currency text;
alter table public.expenses add column if not exists notes text not null default '';
alter table public.expenses add column if not exists repeat text not null default 'never';
alter table public.expenses add column if not exists repeat_n integer not null default 0;
alter table public.expenses add column if not exists next_date date;
alter table public.expenses add column if not exists repeat_parent uuid references public.expenses(id) on delete set null;
alter table public.expenses add column if not exists bill jsonb;
alter table public.expenses drop constraint if exists expenses_split_mode_check;
alter table public.expenses add constraint expenses_split_mode_check check (split_mode in ('equal', 'exact', 'percent', 'shares', 'adjust', 'items'));
alter table public.expenses drop constraint if exists expenses_repeat_check;
alter table public.expenses add constraint expenses_repeat_check check (repeat in ('never', 'weekly', 'biweekly', 'monthly', 'yearly'));
alter table public.expenses drop constraint if exists expenses_payers_check;
alter table public.expenses add constraint expenses_payers_check check (payers is null or jsonb_typeof(payers) = 'object');
alter table public.expenses drop constraint if exists expenses_currency_check;
alter table public.expenses add constraint expenses_currency_check check (currency is null or char_length(currency) = 3);
alter table public.expenses drop constraint if exists expenses_notes_check;
alter table public.expenses add constraint expenses_notes_check check (char_length(notes) <= 1000);
create unique index if not exists expenses_recurring_idx on public.expenses (repeat_parent, date) where repeat_parent is not null;
create index if not exists expenses_due_idx on public.expenses (next_date) where repeat <> 'never';

-- The date of the k-th repeat after d.
create or replace function public.occurrence(d date, r text, k integer)
returns date language sql immutable as $$
  select case r
    when 'weekly'   then d + 7 * k
    when 'biweekly' then d + 14 * k
    when 'monthly'  then (d + make_interval(months => k))::date
    when 'yearly'   then (d + make_interval(years => k))::date
  end
$$;

-- Keeps next_date in step when an expense starts repeating or its date changes.
-- Only future repeats are created: nothing is back-filled.
create or replace function public.prep_recurring()
returns trigger language plpgsql as $$
declare k integer := 1;
begin
  if new.repeat = 'never' then
    new.next_date := null; new.repeat_n := 0;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.repeat = old.repeat and new.date = old.date and old.next_date is not null then
    return new;
  end if;
  while public.occurrence(new.date, new.repeat, k) <= current_date and k < 5000 loop k := k + 1; end loop;
  new.repeat_n := k - 1;
  new.next_date := public.occurrence(new.date, new.repeat, k);
  return new;
end $$;
drop trigger if exists expenses_recurring on public.expenses;
create trigger expenses_recurring before insert or update on public.expenses for each row execute function public.prep_recurring();

-- ---------- profiles ----------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  name              text not null default '' check (char_length(name) <= 40),
  avatar_url        text,
  default_currency  text not null default 'INR' check (char_length(default_currency) = 3),
  updated_at        timestamptz not null default now()
);

create or replace function public.shares_group(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = p_user);
$$;

alter table public.profiles enable row level security;
drop policy if exists "read own and co-member profiles" on public.profiles;
drop policy if exists "create own profile" on public.profiles;
drop policy if exists "edit own profile" on public.profiles;
create policy "read own and co-member profiles" on public.profiles for select using (id = auth.uid() or public.shares_group(id));
create policy "create own profile" on public.profiles for insert with check (id = auth.uid());
create policy "edit own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- comments ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses(id) on delete cascade,
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid default auth.uid() references auth.users(id) on delete set null,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_expense_idx on public.comments (expense_id);
alter table public.comments enable row level security;
drop policy if exists "members read comments" on public.comments;
drop policy if exists "members write comments" on public.comments;
drop policy if exists "authors delete comments" on public.comments;
create policy "members read comments" on public.comments for select using (public.is_member(group_id));
create policy "members write comments" on public.comments for insert with check (
  public.is_member(group_id) and user_id = auth.uid()
  and exists (select 1 from public.expenses e where e.id = expense_id and e.group_id = comments.group_id));
create policy "authors delete comments" on public.comments for delete using (user_id = auth.uid());
revoke update on public.comments from anon, authenticated;

-- ---------- activity: history of every change, for the feed and for restoring ----------
create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  group_id    uuid not null,
  expense_id  uuid,
  actor       uuid default auth.uid(),
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_group_idx on public.activity (group_id, created_at desc);
create index if not exists activity_expense_idx on public.activity (expense_id);
alter table public.activity enable row level security;
drop policy if exists "members read activity" on public.activity;
create policy "members read activity" on public.activity for select using (public.is_member(group_id));
revoke insert, update, delete on public.activity from anon, authenticated;

create or replace function public.log_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if current_setting('evenly.quiet', true) = '1' then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    k := case when current_setting('evenly.restoring', true) = '1' then 'expense_restored'
              when current_setting('evenly.recurring', true) = '1' then 'expense_recurring'
              else 'expense_added' end;
    insert into public.activity (group_id, expense_id, kind, data) values (new.group_id, new.id, k, jsonb_build_object('new', to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    -- Moving the next repeat date along is bookkeeping, not news.
    if (to_jsonb(new) - 'next_date' - 'repeat_n') = (to_jsonb(old) - 'next_date' - 'repeat_n') then return new; end if;
    insert into public.activity (group_id, expense_id, kind, data)
      values (new.group_id, new.id, 'expense_updated', jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)));
    return new;
  else
    -- A whole group being deleted: nobody can see its history any more.
    if not exists (select 1 from public.groups where id = old.group_id) then return old; end if;
    insert into public.activity (group_id, expense_id, kind, data) values (old.group_id, old.id, 'expense_deleted', jsonb_build_object('old', to_jsonb(old)));
    return old;
  end if;
end $$;
drop trigger if exists expenses_activity on public.expenses;
create trigger expenses_activity after insert or update or delete on public.expenses for each row execute function public.log_expense();

create or replace function public.log_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (group_id, expense_id, kind, data)
    select new.group_id, new.expense_id, 'comment', jsonb_build_object('body', left(new.body, 200), 'description', e.description)
      from public.expenses e where e.id = new.expense_id;
  return new;
end $$;
drop trigger if exists comments_activity on public.comments;
create trigger comments_activity after insert on public.comments for each row execute function public.log_comment();

create or replace function public.log_group()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (group_id, kind, data)
    values (new.id, case when new.is_direct then 'friend_added' else 'group_created' end, jsonb_build_object('name', new.name));
  return new;
end $$;
drop trigger if exists groups_activity on public.groups;
create trigger groups_activity after insert on public.groups for each row execute function public.log_group();

create or replace function public.log_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and new.user_id = (select created_by from public.groups where id = new.group_id) then return new; end if;
    insert into public.activity (group_id, kind, data)
      values (new.group_id, case when new.user_id is null then 'member_added' else 'member_joined' end,
              jsonb_build_object('name', new.name, 'member', new.id, 'user', new.user_id, 'email', new.email));
  elsif old.user_id is null and new.user_id is not null then
    insert into public.activity (group_id, actor, kind, data)
      values (new.group_id, coalesce(auth.uid(), new.user_id), 'member_joined', jsonb_build_object('name', new.name, 'member', new.id, 'user', new.user_id));
  elsif old.user_id is not null and new.user_id is null then
    insert into public.activity (group_id, actor, kind, data) values (new.group_id, old.user_id, 'member_left', jsonb_build_object('name', new.name, 'member', new.id));
  end if;
  return new;
end $$;
drop trigger if exists members_activity on public.group_members;
create trigger members_activity after insert or update on public.group_members for each row execute function public.log_member();

-- Expenses saved by older app versions have no currency of their own: give them the group's.
do $$
begin
  perform set_config('evenly.quiet', '1', true);
  update public.expenses e set currency = g.currency from public.groups g where g.id = e.group_id and e.currency is null;
  perform set_config('evenly.quiet', '', true);
end $$;

-- ---------- functions the app calls ----------

-- Creates any repeats that have come due in your groups. The app calls it when it opens.
create or replace function public.process_recurring()
returns integer language plpgsql security definer set search_path = public as $$
declare
  e record;
  n integer := 0;
  k integer;
  d date;
begin
  if auth.uid() is null then return 0; end if;
  for e in
    select x.* from public.expenses x
     where x.repeat <> 'never' and x.next_date <= current_date
       and exists (select 1 from public.group_members m where m.group_id = x.group_id and m.user_id = auth.uid())
     for update skip locked
  loop
    k := e.repeat_n + 1;
    d := e.next_date;
    perform set_config('evenly.recurring', '1', true);
    while d <= current_date and k < 5000 loop
      insert into public.expenses (group_id, kind, description, amount, paid_by, payers, split, split_mode, split_input,
                                   category, date, currency, notes, repeat, repeat_parent, created_by)
        values (e.group_id, e.kind, e.description, e.amount, e.paid_by, e.payers, e.split, e.split_mode, e.split_input,
                e.category, d, e.currency, e.notes, 'never', e.id, e.created_by)
        on conflict do nothing;
      n := n + 1;
      k := k + 1;
      d := public.occurrence(e.date, e.repeat, k);
    end loop;
    perform set_config('evenly.recurring', '', true);
    update public.expenses set repeat_n = k - 1, next_date = d where id = e.id;
  end loop;
  return n;
end $$;

-- Brings back a deleted expense from its history entry.
create or replace function public.restore_expense(p_activity bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  a public.activity;
  eid uuid;
begin
  select * into a from public.activity where id = p_activity and kind = 'expense_deleted';
  if not found or not public.is_member(a.group_id) then raise exception 'There is nothing to restore here.'; end if;
  eid := (a.data->'old'->>'id')::uuid;
  if exists (select 1 from public.expenses where id = eid) then return eid; end if;
  if not exists (select 1 from public.group_members where id = (a.data->'old'->>'paid_by')::uuid) then
    raise exception 'Someone in this expense has been removed from the group, so it can''t be restored.';
  end if;
  perform set_config('evenly.restoring', '1', true);
  insert into public.expenses select * from jsonb_populate_record(null::public.expenses, a.data->'old');
  perform set_config('evenly.restoring', '', true);
  return eid;
end $$;

-- Leave a group or friend ledger. Your past expenses stay, under your name.
create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.group_members set user_id = null, email = null where group_id = p_group and user_id = auth.uid();
end $$;

-- What an invite link points to, so the join screen can show it before joining.
create or replace function public.invite_info(p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.groups where invite_code = p_code;
  if not found then return null; end if;
  return jsonb_build_object(
    'group_id', g.id, 'name', g.name, 'type', g.type, 'is_direct', g.is_direct, 'currency', g.currency,
    'already_member', exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()),
    'inviter', (select name from public.group_members where group_id = g.id and user_id = g.created_by limit 1),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'joined', user_id is not null) order by created_at), '[]'::jsonb)
                  from public.group_members where group_id = g.id));
end $$;

-- Join through an invite link, either as a new member or as one of the names already in the group.
create or replace function public.join_group(p_code text, p_member uuid, p_my_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into g from public.groups where invite_code = p_code;
  if not found then raise exception 'This invite link isn''t valid any more. Ask for a new one.'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then return g.id; end if;
  if p_member is not null then
    update public.group_members set user_id = auth.uid(), email = lower(auth.email())
     where id = p_member and group_id = g.id and user_id is null;
    if not found then raise exception 'Someone has already joined as that person.'; end if;
  elsif g.is_direct then
    raise exception 'This invite has already been used.';
  else
    insert into public.group_members (group_id, user_id, name, email) values (g.id, auth.uid(), trim(p_my_name), lower(auth.email()));
  end if;
  return g.id;
end $$;

-- Makes old invite links stop working.
create or replace function public.reset_invite(p_group uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if not public.is_member(p_group) then raise exception 'Not a member of this group'; end if;
  update public.groups set invite_code = c where id = p_group;
  return c;
end $$;

-- Changes your name everywhere: your profile and every group you are in.
create or replace function public.update_my_name(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'Enter a name up to 40 characters.'; end if;
  insert into public.profiles (id, name) values (auth.uid(), trim(p_name))
    on conflict (id) do update set name = excluded.name, updated_at = now();
  update public.group_members set name = trim(p_name) where user_id = auth.uid();
end $$;

-- Deletes your login. Groups and expenses stay for your friends, under your name.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update public.group_members set user_id = null, email = null where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.shares_group(uuid)', 'public.process_recurring()', 'public.restore_expense(bigint)',
    'public.leave_group(uuid)', 'public.invite_info(text)', 'public.join_group(text, uuid, text)',
    'public.reset_invite(uuid)', 'public.update_my_name(text)', 'public.delete_my_account()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- photo storage: profile photos and group covers ----------
-- Files sit in public buckets under unguessable paths; only you (or group members) can change them.
create or replace function public.is_member_text(p_group text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id::text = p_group and user_id = auth.uid());
$$;
revoke all on function public.is_member_text(text) from public, anon;
grant execute on function public.is_member_text(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
  insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict (id) do nothing;

  execute 'drop policy if exists "evenly avatars" on storage.objects';
  execute 'drop policy if exists "evenly covers" on storage.objects';
  execute $p$create policy "evenly avatars" on storage.objects for all to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  execute $p$create policy "evenly covers" on storage.objects for all to authenticated
    using (bucket_id = 'covers' and public.is_member_text((storage.foldername(name))[1]))
    with check (bucket_id = 'covers' and public.is_member_text((storage.foldername(name))[1]))$p$;
end $$;

-- =====================================================================
-- Phase 3: notifications, reminders, receipts and payment details.
-- =====================================================================

-- ---------- profile: notification choices and how friends can pay you ----------
alter table public.profiles add column if not exists notify_push boolean not null default true;
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.profiles add column if not exists upi_id text;
alter table public.profiles add column if not exists paypal_me text;
alter table public.profiles add column if not exists venmo text;
alter table public.profiles drop constraint if exists profiles_upi_check;
alter table public.profiles add constraint profiles_upi_check check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,64}@[A-Za-z0-9.-]{2,64}$');
alter table public.profiles drop constraint if exists profiles_paypal_check;
alter table public.profiles add constraint profiles_paypal_check check (paypal_me is null or paypal_me ~ '^[A-Za-z0-9]{1,40}$');
alter table public.profiles drop constraint if exists profiles_venmo_check;
alter table public.profiles add constraint profiles_venmo_check check (venmo is null or venmo ~ '^[A-Za-z0-9_-]{1,40}$');

-- ---------- receipts: a private photo per expense ----------
alter table public.expenses add column if not exists receipt_path text;

-- ---------- phone notification subscriptions, one per device ----------
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- notifications: one row per person to tell ----------
-- user_id for people with accounts; email (and no user_id) for invited people who haven't signed up.
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  email         text,
  kind          text not null,
  group_id      uuid,
  expense_id    uuid,
  actor         uuid,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  delivered_at  timestamptz,
  constraint notifications_recipient_check check (user_id is not null or email is not null)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "read own notifications" on public.notifications;
drop policy if exists "mark own notifications read" on public.notifications;
create policy "read own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.display_name(p_group uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select name from public.profiles where id = p_user), ''),
                  (select name from public.group_members where group_id = p_group and user_id = p_user limit 1),
                  'Someone');
$$;

-- Turns each activity entry into notifications for the people it involves, never the person who did it.
create or replace function public.queue_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g public.groups;
  e jsonb;
  ex jsonb;
  pay jsonb;
  spl jsonb;
  old_ids jsonb := '{}'::jsonb;
  who text;
  m record;
begin
  select * into g from public.groups where id = new.group_id;
  if not found then return new; end if;
  who := public.display_name(new.group_id, new.actor);

  if new.kind in ('expense_added', 'expense_updated', 'expense_deleted', 'expense_restored', 'comment') then
    e := coalesce(new.data->'new', new.data->'old');
    if new.kind = 'comment' then select to_jsonb(x) into e from public.expenses x where x.id = new.expense_id; end if;
    if e is null then return new; end if;
    pay := case when jsonb_typeof(e->'payers') = 'object' then e->'payers' else jsonb_build_object(e->>'paid_by', (e->>'amount')::bigint) end;
    spl := coalesce(e->'split', '{}'::jsonb);
    -- People taken off an edited expense hear about it too.
    if new.kind = 'expense_updated' then
      old_ids := coalesce(new.data->'old'->'split', '{}'::jsonb)
              || case when jsonb_typeof(new.data->'old'->'payers') = 'object' then new.data->'old'->'payers' else jsonb_build_object(new.data->'old'->>'paid_by', 0) end;
    end if;
    for m in
      select gm.* from public.group_members gm
       where gm.group_id = new.group_id
         and (pay ? gm.id::text or spl ? gm.id::text or old_ids ? gm.id::text)
         and gm.user_id is distinct from new.actor
         -- Invited people without an account only get an email for new expenses.
         and (gm.user_id is not null or (gm.email is not null and new.kind = 'expense_added'))
    loop
      insert into public.notifications (user_id, email, kind, group_id, expense_id, actor, data)
      values (m.user_id, case when m.user_id is null then m.email end, new.kind, new.group_id, new.expense_id, new.actor,
        jsonb_build_object('actor', who, 'group', g.name, 'is_direct', g.is_direct, 'description', e->>'description',
          'expense_kind', e->>'kind', 'amount', (e->>'amount')::bigint, 'currency', coalesce(e->>'currency', g.currency),
          'net', coalesce((pay->>m.id::text)::bigint, 0) - coalesce((spl->>m.id::text)::bigint, 0),
          'removed', not (pay ? m.id::text or spl ? m.id::text),
          'body', new.data->>'body', 'name', m.name));
    end loop;

  elsif new.kind = 'member_joined' and (new.data->>'user') is not null and (new.data->>'user')::uuid is distinct from new.actor then
    -- Someone added a person who already has an account.
    insert into public.notifications (user_id, kind, group_id, actor, data)
      values ((new.data->>'user')::uuid, 'added_to_group', new.group_id, new.actor,
              jsonb_build_object('actor', who, 'group', g.name, 'is_direct', g.is_direct));

  elsif new.kind = 'member_added' and (new.data->>'email') is not null
        and not exists (select 1 from auth.users u where lower(u.email) = lower(new.data->>'email') and u.email_confirmed_at is not null) then
    -- An invite email for someone not on Evenly yet.
    insert into public.notifications (email, kind, group_id, actor, data)
      values (new.data->>'email', 'invited', new.group_id, new.actor,
              jsonb_build_object('actor', who, 'group', g.name, 'is_direct', g.is_direct, 'name', new.data->>'name'));
  end if;
  return new;
end $$;
drop trigger if exists activity_notifications on public.activity;
create trigger activity_notifications after insert on public.activity for each row execute function public.queue_notifications();

-- Nudge someone who owes you. At most one reminder per person per group per day.
create or replace function public.send_reminder(p_group uuid, p_member uuid, p_amount bigint, p_currency text)
returns void language plpgsql security definer set search_path = public as $$
declare
  m public.group_members;
  g public.groups;
begin
  if not public.is_member(p_group) then raise exception 'Not a member of this group'; end if;
  select * into m from public.group_members where id = p_member and group_id = p_group;
  select * into g from public.groups where id = p_group;
  if m.id is null then raise exception 'That person isn''t in this group.'; end if;
  if m.user_id = auth.uid() then raise exception 'You can''t remind yourself.'; end if;
  if m.user_id is null and m.email is null then raise exception 'Add an email for this person first, so Evenly can reach them.'; end if;
  if exists (select 1 from public.notifications where kind = 'reminder' and group_id = p_group and actor = auth.uid()
             and (data->>'member')::uuid = p_member and created_at > now() - interval '20 hours') then
    raise exception 'You already reminded them today. Try again tomorrow.';
  end if;
  insert into public.notifications (user_id, email, kind, group_id, actor, data)
    values (m.user_id, case when m.user_id is null then m.email end, 'reminder', p_group, auth.uid(),
            jsonb_build_object('actor', public.display_name(p_group, auth.uid()), 'group', g.name, 'is_direct', g.is_direct,
                               'amount', p_amount, 'currency', p_currency, 'member', p_member, 'name', m.name));
end $$;
revoke all on function public.send_reminder(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.send_reminder(uuid, uuid, bigint, text) to authenticated;
revoke all on function public.display_name(uuid, uuid) from public, anon;

-- ---------- delivery: each new notification is handed to the "notify" Edge Function ----------
do $$ begin
  create extension if not exists pg_net;
exception when others then raise notice 'pg_net is not available here; notifications stay in the app only.';
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (key text primary key, value text not null);
-- Only the database itself reads this (as its owner); nobody else can, even through the API.
alter table private.settings enable row level security;
-- The address of your notify Edge Function. Change the project id if you copy Evenly to another Supabase project.
insert into private.settings (key, value) values ('notify_url', 'https://kdikawdhbwpqdcialyky.supabase.co/functions/v1/notify')
  on conflict (key) do update set value = excluded.value;

create or replace function public.deliver_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare url text;
begin
  if to_regproc('net.http_post') is null then return new; end if;
  select value into url from private.settings where key = 'notify_url';
  if url is null then return new; end if;
  perform net.http_post(url := url, body := jsonb_build_object('id', new.id), headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
exception when others then
  -- Never block saving an expense because a notification couldn't be sent.
  return new;
end $$;
drop trigger if exists notifications_deliver on public.notifications;
create trigger notifications_deliver after insert on public.notifications for each row execute function public.deliver_notification();

-- ---------- receipts bucket: private, only group members can see or change ----------
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
  execute 'drop policy if exists "evenly receipts" on storage.objects';
  execute $p$create policy "evenly receipts" on storage.objects for all to authenticated
    using (bucket_id = 'receipts' and public.is_member_text((storage.foldername(name))[1]))
    with check (bucket_id = 'receipts' and public.is_member_text((storage.foldername(name))[1]))$p$;
end $$;

-- =====================================================================
-- Friends connect by email.
-- =====================================================================

-- Anyone added with the email of an existing (confirmed) account is linked to it at once,
-- whether the email is given when they're added or filled in later.
create or replace function public.autolink_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare found_user uuid;
begin
  if new.user_id is null and new.email is not null and (tg_op = 'INSERT' or new.email is distinct from old.email) then
    select u.id into found_user from auth.users u
     where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null
       and not exists (select 1 from public.group_members x where x.group_id = new.group_id and x.user_id = u.id and x.id <> new.id)
     limit 1;
    new.user_id := found_user;
  end if;
  return new;
end $$;
drop trigger if exists members_autolink on public.group_members;
create trigger members_autolink before insert or update on public.group_members for each row execute function public.autolink_member();

-- Rewrites member ids used as keys, e.g. in an expense's split.
create or replace function public.remap_keys(j jsonb, m jsonb)
returns jsonb language sql immutable as $$
  select case when j is null or jsonb_typeof(j) <> 'object' then j
              else coalesce((select jsonb_object_agg(coalesce(m->>key, key), value) from jsonb_each(j)), '{}'::jsonb) end
$$;

-- Two people should have one friend ledger. If linking created a second one, fold it into the older.
create or replace function public.merge_direct_ledgers(p_a uuid, p_b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  keep uuid;
  dup uuid;
  m jsonb;
begin
  select g.id into keep from public.groups g
   where g.is_direct
     and exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = p_a)
     and exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = p_b)
   order by g.created_at limit 1;
  if keep is null then return; end if;
  for dup in
    select g.id from public.groups g
     where g.is_direct and g.id <> keep
       and exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = p_a)
       and exists (select 1 from public.group_members x where x.group_id = g.id and x.user_id = p_b)
  loop
    select jsonb_object_agg(d.id::text, k.id::text) into m
      from public.group_members d join public.group_members k on k.group_id = keep and k.user_id = d.user_id
     where d.group_id = dup;
    perform set_config('evenly.quiet', '1', true);
    update public.expenses set
        group_id = keep,
        paid_by = coalesce((m->>paid_by::text)::uuid, paid_by),
        payers = public.remap_keys(payers, m),
        split = public.remap_keys(split, m),
        split_input = public.remap_keys(split_input, m)
      where group_id = dup;
    update public.comments set group_id = keep where group_id = dup;
    update public.activity set group_id = keep where group_id = dup;
    update public.notifications set group_id = keep where group_id = dup;
    delete from public.groups where id = dup;
    perform set_config('evenly.quiet', '', true);
  end loop;
end $$;
revoke all on function public.merge_direct_ledgers(uuid, uuid) from public, anon, authenticated;

create or replace function public.merge_after_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  if new.user_id is not null and (tg_op = 'INSERT' or old.user_id is null)
     and exists (select 1 from public.groups where id = new.group_id and is_direct) then
    select user_id into other from public.group_members where group_id = new.group_id and id <> new.id and user_id is not null limit 1;
    if other is not null then perform public.merge_direct_ledgers(new.user_id, other); end if;
  end if;
  return null;
end $$;
drop trigger if exists members_merge on public.group_members;
-- No column list: user_id is often set by members_autolink, not by the UPDATE itself.
create trigger members_merge after insert or update on public.group_members for each row execute function public.merge_after_link();

-- Merge any duplicates that already exist.
do $$
declare r record;
begin
  for r in
    select distinct least(a.user_id, b.user_id) as x, greatest(a.user_id, b.user_id) as y
      from public.groups g
      join public.group_members a on a.group_id = g.id and a.user_id is not null
      join public.group_members b on b.group_id = g.id and b.user_id is not null and b.user_id <> a.user_id
     where g.is_direct
  loop
    perform public.merge_direct_ledgers(r.x, r.y);
  end loop;
end $$;

-- =====================================================================
-- Find friends by name.
-- =====================================================================

-- Everyone gets a profile with the name they signed up with, so friends can find them.
create or replace function public.profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Google sign-in gives full_name and a photo; email sign-up gives the name typed in.
  insert into public.profiles (id, name, avatar_url)
    values (new.id,
            left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)), 40),
            nullif(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), ''))
    on conflict (id) do nothing;
  return new;
exception when others then
  return new;   -- never block a sign-up
end $$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'raw_user_meta_data') then
    execute 'drop trigger if exists evenly_new_user on auth.users';
    execute 'create trigger evenly_new_user after insert on auth.users for each row execute function public.profile_for_new_user()';
    -- People who signed up before this existed.
    execute $q$insert into public.profiles (id, name)
      select u.id, left(coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1)), 40) from auth.users u
      on conflict (id) do nothing$q$;
  end if;
end $$;

-- Up to 8 people whose name matches, or whose email is exactly what was typed.
-- Emails are never shown, only a hint like j•••••@gmail.com to tell people with the same name apart.
create or replace function public.search_people(p_q text)
returns table (id uuid, name text, avatar_url text, hint text, shared boolean)
language sql stable security definer set search_path = public as $$
  with q as (select trim(p_q) as t,
                    '%' || replace(replace(replace(trim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat)
  select p.id, p.name, p.avatar_url,
         left(u.email, 1) || repeat('•', least(greatest(length(split_part(u.email, '@', 1)) - 1, 3), 6)) || '@' || split_part(u.email, '@', 2),
         public.shares_group(p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    cross join q
   where auth.uid() is not null and p.id <> auth.uid() and u.email_confirmed_at is not null
     and char_length(q.t) >= 2
     and (p.name ilike q.pat or lower(u.email) = lower(q.t))
   order by public.shares_group(p.id) desc, (lower(p.name) like lower(q.t) || '%') desc, p.name
   limit 8
$$;
revoke all on function public.search_people(text) from public, anon;
grant execute on function public.search_people(text) to authenticated;

-- =====================================================================
-- Phase 4: split by items, saved default splits, budgets.
-- =====================================================================
alter table public.expenses drop constraint if exists expenses_split_mode_check;
alter table public.expenses add constraint expenses_split_mode_check check (split_mode in ('equal', 'exact', 'percent', 'shares', 'adjust', 'items'));

-- A group's usual split, e.g. rent 40/30/30: {"mode": "percent", "input": {...}, "inc": [...]}.
alter table public.groups add column if not exists default_split jsonb;
alter table public.groups drop constraint if exists groups_default_split_check;
alter table public.groups add constraint groups_default_split_check check (default_split is null or jsonb_typeof(default_split) = 'object');
grant update (name, currency, type, cover_url, whiteboard, simplify, default_split) on public.groups to authenticated;

-- Monthly budgets per category group, in your default currency's smallest unit: {"food": 500000}.
alter table public.profiles add column if not exists budgets jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_budgets_check;
alter table public.profiles add constraint profiles_budgets_check check (jsonb_typeof(budgets) = 'object');

-- ============================================================================
-- The Android and iPhone app: one Expo push token per phone, so the notify function can reach it.
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token       text not null unique,
  platform    text,
  created_at  timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.push_tokens to authenticated;

-- ---------- live updates ----------
do $$
declare t text;
begin
  foreach t in array array['groups', 'group_members', 'expenses', 'comments', 'activity', 'profiles', 'notifications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
