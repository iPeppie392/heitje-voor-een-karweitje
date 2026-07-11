-- Heitje voor een karweitje — klusjes van buitenaf: geverifieerde gasten (opa/oma/
-- ooms/tantes/vrienden) die een klusje mogen voorstellen, pas zichtbaar voor kinderen
-- na goedkeuring door een ouder. Additief, veilig opnieuw te draaien.

-- 1) Nieuwe rol 'gast' op members. De bestaande role-check is een ongenaamde inline
-- kolom-check — veilig opzoeken via pg_constraint in plaats van een naam te gokken.
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.members'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%ouder%kind%';
  if c is not null then
    execute format('alter table members drop constraint %I', c);
  end if;
end $$;
alter table members add constraint members_role_check check (role in ('ouder','kind','gast'));

-- kids_have_no_auth_identity is wel expliciet genaamd — een gast heeft, net als een
-- ouder, een eigen auth_user_id nodig (logt zelfstandig in vanaf een eigen toestel).
alter table members drop constraint if exists kids_have_no_auth_identity;
alter table members add constraint kids_have_no_auth_identity
  check (role in ('ouder','gast') or auth_user_id is null);

-- 2) family_invites krijgt een rol-kolom, zodat dezelfde uitnodig-/QR-/inwissel-code
-- zowel een tweede ouder als een gast kan uitnodigen.
alter table family_invites add column if not exists role text not null default 'ouder'
  check (role in ('ouder','gast'));

-- Postgres staat geen create-or-replace toe die het OUT-parameter-type wijzigt (hier:
-- er komt een derde kolom "role" bij) — eerst de oude versie expliciet weggooien.
drop function if exists public.redeem_invite(text, text, text);

create or replace function public.redeem_invite(invite_code text, parent_name text,
  parent_avatar text default '😎')
returns table(family_id uuid, member_id uuid, role text)
language plpgsql security definer as $$
declare inv record; mid uuid;
begin
  if auth.uid() is null then raise exception 'must_be_authenticated'; end if;
  select * into inv from family_invites
    where code = invite_code and not revoked and used_count < max_uses and expires_at > now()
    for update;
  if inv is null then raise exception 'invite_invalid_or_expired'; end if;
  insert into members(family_id, auth_user_id, name, avatar, role)
    values (inv.family_id, auth.uid(), parent_name, parent_avatar, inv.role) returning id into mid;
  update family_invites set used_count = used_count + 1 where id = inv.id;
  return query select inv.family_id, mid, inv.role;
end;
$$;
revoke execute on function public.redeem_invite(text, text, text) from public;
grant execute on function public.redeem_invite(text, text, text) to authenticated;

-- 3) Helper-functie, zelfde stijl als is_family_member/is_family_parent.
create or replace function public.is_family_guest(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m where m.family_id = fid and m.auth_user_id = auth.uid() and m.role = 'gast'
  );
$$;

-- 4) chore_offers — het eigenlijke veiligheidshek. Een gast krijgt NOOIT direct
-- schrijftoegang tot de echte chores-tabel (die heeft een blanco is_family_member-policy);
-- voorstellen landen hier eerst, onzichtbaar voor kinderen, tot een ouder ze omzet.
create table if not exists chore_offers (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  offered_by  uuid not null references members(id) on delete cascade,
  title       text not null,
  room        text,
  emoji       text,
  cents       int not null check (cents > 0),
  note        text,
  status      text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table chore_offers enable row level security;

drop policy if exists chore_offers_select on chore_offers;
create policy chore_offers_select on chore_offers for select using (
  is_family_parent(family_id)
  or offered_by in (select id from members where auth_user_id = auth.uid())
);

drop policy if exists chore_offers_insert on chore_offers;
create policy chore_offers_insert on chore_offers for insert with check (
  is_family_guest(family_id)
  and offered_by in (select id from members where auth_user_id = auth.uid())
);

drop policy if exists chore_offers_update on chore_offers;
create policy chore_offers_update on chore_offers for update
  using (is_family_parent(family_id)) with check (is_family_parent(family_id));

-- 5) Herkomst-kolom op chores voor de "Aangeboden door {naam}"-badge — gewone FK naar
-- members, zelfde patroon als claimed_by/created_by. Elk gezinslid mag via de bestaande
-- blanco members_select-policy toch al elke members-rij lezen, dus geen nieuwe RLS nodig.
alter table chores add column if not exists offered_by uuid references members(id) on delete set null;

-- 6) Atomaire goedkeurings-RPC: zet in één transactie een voorstel om in een echt klusje.
-- Controleert is_family_parent nogmaals binnenin (verdediging in de diepte, zelfde
-- patroon als redeem_promo_code) — RLS alleen is hier niet genoeg omdat dit twee
-- tabellen in één keer moet muteren.
create or replace function public.approve_chore_offer(p_offer_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare o record; approver_id uuid;
begin
  if p_decision not in ('approved','declined') then raise exception 'invalid_decision'; end if;
  select * into o from chore_offers where id = p_offer_id for update;
  if o is null then raise exception 'offer_not_found'; end if;
  if not is_family_parent(o.family_id) then raise exception 'not_authorized'; end if;
  if o.status <> 'pending' then raise exception 'offer_already_decided'; end if;
  select id into approver_id from members
    where family_id = o.family_id and auth_user_id = auth.uid() and role = 'ouder';
  if p_decision = 'approved' then
    insert into chores(family_id, title, room, emoji, cents, status, created_by, offered_by)
      values (o.family_id, o.title, o.room, o.emoji, o.cents, 'open', approver_id, o.offered_by);
  end if;
  update chore_offers set status = p_decision, decided_by = approver_id where id = p_offer_id;
end;
$$;
revoke execute on function public.approve_chore_offer(uuid, text) from public;
grant execute on function public.approve_chore_offer(uuid, text) to authenticated;
