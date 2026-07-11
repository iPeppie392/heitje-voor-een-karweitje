-- Heitje voor een karweitje — Fase 1 backend schema
-- Eenmalig te plakken in de Supabase SQL Editor (project moet in regio Frankfurt staan).
-- Dit script mag veilig meerdere keren gedraaid worden — het begint elke keer met een schone lei.
create extension if not exists pgcrypto;

-- ───────────────────────── Opschonen (idempotent) ─────────────────────────
drop table if exists family_invites cascade;
drop table if exists feed_posts cascade;
drop table if exists ledger_entries cascade;
drop table if exists goals cascade;
drop table if exists chores cascade;
drop table if exists members cascade;
drop table if exists families cascade;
drop view if exists member_balances;
drop function if exists public.create_family(text, text, text, text);
drop function if exists public.redeem_invite(text, text, text);
drop function if exists public.is_family_member(uuid);
drop function if exists public.is_family_parent(uuid);

-- ───────────────────────── Tables ─────────────────────────
create table families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   text not null default '€',
  created_at timestamptz not null default now()
);

create table members (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  auth_user_id  uuid unique references auth.users(id) on delete set null,
  name          text not null,
  avatar        text not null default '🙂',
  age           int,
  role          text not null check (role in ('ouder','kind')),
  streak        int not null default 0,
  color         text not null default '#7C3AED',
  created_at    timestamptz not null default now(),
  -- hard productregel: een kind-rij mag NOOIT aan een Supabase-auth-identiteit hangen
  constraint kids_have_no_auth_identity check (role = 'ouder' or auth_user_id is null)
);

create table chores (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families(id) on delete cascade,
  title          text not null,
  room           text,
  emoji          text,
  cents          int not null check (cents > 0),
  status         text not null default 'open'
                 check (status in ('open','claimed','before','waiting','approved','rejected')),
  claimed_by     uuid references members(id) on delete set null,
  conditions     jsonb,   -- { note, checklist[], photoRequired, deadline }
  checked        jsonb,   -- boolean[] naast checklist
  before_uri     text,
  after_uri      text,
  reject_reason  text,
  created_by     uuid references members(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table goals (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  kid_id     uuid not null references members(id) on delete cascade,
  name       text not null,
  emoji      text,
  image_uri  text,
  target     int not null check (target > 0),
  saved      int not null default 0 check (saved >= 0),
  link       text,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- Append-only audit-ledger — saldo wordt hieruit afgeleid, nooit direct overschreven.
create table ledger_entries (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  cents      int not null,               -- teken: +beloning, -uitbetaling
  kind       text not null check (kind in ('chore_reward','payout','manual_adjustment','legacy_import')),
  chore_id   uuid references chores(id) on delete set null,
  note       text,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table feed_posts (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  who        uuid references members(id) on delete set null,
  title      text,
  cents      int,
  before_uri text,
  after_uri  text,
  badge      text,
  rx         jsonb not null default '{"👏":0,"🔥":0,"❤️":0}',
  created_at timestamptz not null default now()
);

create table family_invites (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  code       text not null unique,          -- korte, intypbare code, bv "K7QX2P"
  created_by uuid references members(id) on delete set null,
  max_uses   int not null default 1,
  used_count int not null default 0,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Afgeleid, controleerbaar saldo — security_invoker zodat het de RLS van de aanroeper respecteert.
create view member_balances with (security_invoker = true) as
  select family_id, member_id, coalesce(sum(cents), 0) as balance_cents
  from ledger_entries
  group by family_id, member_id;

-- ───────────────────── RLS helper-functies ─────────────────────
create or replace function public.is_family_member(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m where m.family_id = fid and m.auth_user_id = auth.uid()
  );
$$;

create or replace function public.is_family_parent(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m
    where m.family_id = fid and m.auth_user_id = auth.uid() and m.role = 'ouder'
  );
$$;

-- Bootstrap: gezin + eerste ouder atomisch aanmaken (families heeft GEEN eigen insert-policy).
create or replace function public.create_family(family_name text, currency text default '€',
  parent_name text default 'Ouder', parent_avatar text default '😎')
returns table(family_id uuid, member_id uuid)
language plpgsql security definer as $$
declare fid uuid; mid uuid;
begin
  if auth.uid() is null then raise exception 'must_be_authenticated'; end if;
  insert into families(name, currency) values (family_name, currency) returning id into fid;
  insert into members(family_id, auth_user_id, name, avatar, role)
    values (fid, auth.uid(), parent_name, parent_avatar, 'ouder') returning id into mid;
  return query select fid, mid;
end; $$;
-- Nieuwe functies zijn in Postgres standaard uitvoerbaar door iedereen (ook anoniem) —
-- dat moet expliciet weer ingetrokken worden, anders werkt de "authenticated"-grant niet echt.
revoke execute on function public.create_family(text, text, text, text) from public;
grant execute on function public.create_family(text, text, text, text) to authenticated;

-- Tweede ouder wisselt een QR/code-uitnodiging in — atomisch, negeert bewust de invites-RLS.
create or replace function public.redeem_invite(invite_code text, parent_name text,
  parent_avatar text default '😎')
returns table(family_id uuid, member_id uuid)
language plpgsql security definer as $$
declare inv record; mid uuid;
begin
  if auth.uid() is null then raise exception 'must_be_authenticated'; end if;
  select * into inv from family_invites
    where code = invite_code and not revoked and used_count < max_uses and expires_at > now()
    for update;
  if inv is null then raise exception 'invite_invalid_or_expired'; end if;
  insert into members(family_id, auth_user_id, name, avatar, role)
    values (inv.family_id, auth.uid(), parent_name, parent_avatar, 'ouder') returning id into mid;
  update family_invites set used_count = used_count + 1 where id = inv.id;
  return query select inv.family_id, mid;
end; $$;
revoke execute on function public.redeem_invite(text, text, text) from public;
grant execute on function public.redeem_invite(text, text, text) to authenticated;

-- ───────────────────────── RLS ─────────────────────────
alter table families        enable row level security;
alter table members         enable row level security;
alter table chores          enable row level security;
alter table goals           enable row level security;
alter table ledger_entries  enable row level security;
alter table feed_posts      enable row level security;
alter table family_invites  enable row level security;

create policy families_select on families for select using (is_family_member(id));
-- Geen insert/update/delete-policy op families → alleen create_family() kan er een aanmaken.

create policy members_select on members for select using (is_family_member(family_id));
create policy members_insert on members for insert with check (is_family_member(family_id));
create policy members_update on members for update using (is_family_member(family_id))
  with check (is_family_member(family_id));
create policy members_delete on members for delete using (is_family_parent(family_id));

create policy chores_all on chores for all using (is_family_member(family_id))
  with check (is_family_member(family_id));

create policy goals_all on goals for all using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- Ledger is append-only: alleen select + insert, bewust GEEN update/delete-policy.
create policy ledger_select on ledger_entries for select using (is_family_member(family_id));
create policy ledger_insert on ledger_entries for insert with check (is_family_member(family_id));

create policy feed_all on feed_posts for all using (is_family_member(family_id))
  with check (is_family_member(family_id));

create policy invites_select on family_invites for select using (is_family_parent(family_id));
create policy invites_insert on family_invites for insert with check (is_family_parent(family_id));
create policy invites_update on family_invites for update using (is_family_parent(family_id))
  with check (is_family_parent(family_id));
