-- Heitje voor een karweitje — "Buurtklusjes": een kind doet een klusje voor iemand
-- BUITEN het gezin (bv. de buurvrouw), met een eigen, streng afgeschermde "host"-rol,
-- in-/uitchecken via foto+tijdstempel (geen GPS), dubbele goedkeuring (host + ouder), en
-- een aparte "extern verdiend"-pot die een ouder bewust samenvoegt met het echte saldo.
-- Additief, veilig opnieuw te draaien.

-- 1) Nieuwe rol 'host' op members, plus de koppel-kolommen.
alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check check (role in ('ouder','kind','gast','host'));

alter table members drop constraint if exists kids_have_no_auth_identity;
alter table members add constraint kids_have_no_auth_identity
  check (role in ('ouder','gast','host') or auth_user_id is null);

-- Welk kind deze host mag zien/voor werken — alleen gezet bij role='host'. Cascade: als
-- dat kind uit het gezin verdwijnt, heeft de host-account geen doel meer.
alter table members add column if not exists host_child_id uuid references members(id) on delete cascade;

-- De "extern verdiend"-pot, apart van het echte saldo (ledger_entries) tot een ouder 'm
-- bewust samenvoegt — zelfde soort aparte-teller-patroon als members.screentime_minutes.
alter table members add column if not exists external_earned_cents int not null default 0
  check (external_earned_cents >= 0);

-- 2) family_invites: een host-uitnodiging is aan één specifiek kind gebonden (in
-- tegenstelling tot een ouder/gast-uitnodiging, die voor het hele gezin geldt).
alter table family_invites add column if not exists child_member_id uuid references members(id) on delete set null;
alter table family_invites drop constraint if exists family_invites_role_check;
alter table family_invites add constraint family_invites_role_check check (role in ('ouder','gast','host'));

-- redeem_invite (zelfde signatuur, dus geen drop nodig) zet nu ook host_child_id op de
-- nieuwe member-rij wanneer de uitnodiging een host-uitnodiging was.
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
  insert into members(family_id, auth_user_id, name, avatar, role, host_child_id)
    values (inv.family_id, auth.uid(), parent_name, parent_avatar, inv.role,
      case when inv.role = 'host' then inv.child_member_id else null end)
    returning id into mid;
  update family_invites set used_count = used_count + 1 where id = inv.id;
  return query select inv.family_id, mid, inv.role;
end;
$$;
revoke execute on function public.redeem_invite(text, text, text) from public;
grant execute on function public.redeem_invite(text, text, text) to authenticated;

-- 3) Toegangs-helpers. "core member" = ouder of kind (dus NIET gast/host) — nodig omdat
-- de bestaande blanko is_family_member-policies op chores/goals/feed/ledger/huiswerk/
-- schermtijd-doelen ELKE rol in het gezin doorlieten, inclusief gast. Dat was al een
-- (nooit door de UI blootgelegde, maar wel via een rechtstreekse API-call bereikbare)
-- gat voor gast, en zou voor een host — een echte buitenstaander — een harde schending
-- zijn van "nooit de familie-feed/saldo's/foto's" uit de opdracht. Hieronder dichtgezet
-- voor beide rollen tegelijk, niet alleen voor host.
create or replace function public.is_family_core_member(fid uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members m where m.family_id = fid and m.auth_user_id = auth.uid() and m.role in ('ouder','kind')
  );
$$;

-- security definer zodat de zelf-referentie naar members hier geen RLS-recursie geeft
-- (dezelfde reden waarom is_family_member/is_family_parent dat ook al zijn).
create or replace function public.is_my_hosted_child(p_member_id uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from members hm where hm.auth_user_id = auth.uid() and hm.host_child_id = p_member_id
  );
$$;

-- 4) Bestaande blanko-policies dichtzetten naar core-member-only (gast/host krijgen nu
-- terecht niets meer via deze tabellen — chore_offers/neighbor_jobs blijven hun eigen,
-- al wél correct scoped toegang houden).
drop policy if exists chores_all on chores;
create policy chores_all on chores for all using (is_family_core_member(family_id))
  with check (is_family_core_member(family_id));

drop policy if exists goals_all on goals;
create policy goals_all on goals for all using (is_family_core_member(family_id))
  with check (is_family_core_member(family_id));

drop policy if exists feed_all on feed_posts;
create policy feed_all on feed_posts for all using (is_family_core_member(family_id))
  with check (is_family_core_member(family_id));

drop policy if exists ledger_select on ledger_entries;
create policy ledger_select on ledger_entries for select using (is_family_core_member(family_id));
drop policy if exists ledger_insert on ledger_entries;
create policy ledger_insert on ledger_entries for insert with check (is_family_core_member(family_id));

-- screentime_goals/homework_items bestaan pas als sql/006/005 al gedraaid zijn — niet
-- elk project heeft die per se al gehad, dus dit mag het hele script niet laten falen.
do $$
begin
  if to_regclass('public.screentime_goals') is not null then
    execute 'drop policy if exists screentime_goals_all on screentime_goals';
    execute 'create policy screentime_goals_all on screentime_goals for all
      using (is_family_core_member(family_id)) with check (is_family_core_member(family_id))';
  end if;
  if to_regclass('public.homework_items') is not null then
    execute 'drop policy if exists homework_all on homework_items';
    execute 'create policy homework_all on homework_items for all
      using (is_family_core_member(family_id)) with check (is_family_core_member(family_id))';
  end if;
end $$;

-- members_select blijft breder dan de rest (een host moet tenminste zijn eigen rij en
-- die van zijn gekoppelde kind kunnen lezen, voor naam/avatar in de UI) — expliciet
-- opgebouwd uit drie los te volgen gevallen i.p.v. terug te vallen op de oude blanko regel.
drop policy if exists members_select on members;
create policy members_select on members for select using (
  is_family_core_member(family_id)
  or auth_user_id = auth.uid()
  or is_my_hosted_child(id)
);

-- 5) ledger_entries.kind krijgt een nieuwe soort voor het samenvoegen van de pot.
alter table ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table ledger_entries add constraint ledger_entries_kind_check
  check (kind in ('chore_reward','payout','manual_adjustment','legacy_import','homework_reward','external_earning'));

-- 6) De klusjes-tabel zelf. child_id/host_id zijn allebei gewone FK's naar members —
-- een host is zelf ook een members-rij (met role='host'), net als gast dat al is.
create table if not exists neighbor_jobs (
  id                 uuid primary key default gen_random_uuid(),
  family_id          uuid not null references families(id) on delete cascade,
  child_id           uuid not null references members(id) on delete cascade,
  host_id            uuid not null references members(id) on delete cascade,
  title              text not null,
  cents              int not null check (cents > 0),
  status             text not null default 'open'
                     check (status in ('open','in_progress','awaiting_approval','approved','declined')),
  check_in_uri       text,
  check_in_at        timestamptz,
  check_out_uri      text,
  check_out_at       timestamptz,
  host_approved_at   timestamptz,
  host_approved_by   uuid references members(id) on delete set null,
  parent_approved_at timestamptz,
  parent_approved_by uuid references members(id) on delete set null,
  created_at         timestamptz not null default now()
);
alter table neighbor_jobs enable row level security;

drop policy if exists neighbor_jobs_select on neighbor_jobs;
create policy neighbor_jobs_select on neighbor_jobs for select using (
  is_family_core_member(family_id)
  or host_id in (select id from members where auth_user_id = auth.uid())
);

drop policy if exists neighbor_jobs_insert on neighbor_jobs;
create policy neighbor_jobs_insert on neighbor_jobs for insert with check (
  exists (
    select 1 from members m
    where m.auth_user_id = auth.uid() and m.role = 'host' and m.id = host_id and m.host_child_id = child_id
  )
);

-- Bewust GEEN update-policy: elke statuswijziging (in-/uitchecken, host- en
-- ouder-goedkeuring, het crediteren van de pot) loopt verplicht via de RPC's hieronder,
-- nooit via een directe rij-update. Dat is de enige manier om "dubbele goedkeuring" ook
-- echt technisch af te dwingen i.p.v. alleen in de UI te suggereren — met een open
-- update-policy zou één kant de andere kunnen overslaan via een rechtstreekse API-call.

create or replace function public.checkin_neighbor_job(p_job_id uuid, p_photo_uri text)
returns void language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select * into j from neighbor_jobs where id = p_job_id for update;
  if j is null then raise exception 'job_not_found'; end if;
  if not is_family_core_member(j.family_id) then raise exception 'not_authorized'; end if;
  if j.status <> 'open' then raise exception 'job_not_open'; end if;
  update neighbor_jobs set status = 'in_progress', check_in_uri = p_photo_uri, check_in_at = now()
    where id = p_job_id;
end;
$$;
revoke execute on function public.checkin_neighbor_job(uuid, text) from public;
grant execute on function public.checkin_neighbor_job(uuid, text) to authenticated;

create or replace function public.checkout_neighbor_job(p_job_id uuid, p_photo_uri text)
returns void language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select * into j from neighbor_jobs where id = p_job_id for update;
  if j is null then raise exception 'job_not_found'; end if;
  if not is_family_core_member(j.family_id) then raise exception 'not_authorized'; end if;
  if j.status <> 'in_progress' then raise exception 'job_not_in_progress'; end if;
  update neighbor_jobs set status = 'awaiting_approval', check_out_uri = p_photo_uri, check_out_at = now()
    where id = p_job_id;
end;
$$;
revoke execute on function public.checkout_neighbor_job(uuid, text) from public;
grant execute on function public.checkout_neighbor_job(uuid, text) to authenticated;

-- Dubbele goedkeuring: host en ouder keuren onafhankelijk goed. Zodra de TWEEDE van de
-- twee "approved" geeft, wordt het bedrag meteen in de externe pot bijgeschreven — geen
-- losse crediteer-stap, en dus geen moment waarop een goedkeuring "kwijt" kan raken.
-- Afwijzen door één van beide is meteen definitief (geen reden om op de ander te wachten).
create or replace function public.host_approve_neighbor_job(p_job_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare j record; approver_id uuid;
begin
  if p_decision not in ('approved','declined') then raise exception 'invalid_decision'; end if;
  select * into j from neighbor_jobs where id = p_job_id for update;
  if j is null then raise exception 'job_not_found'; end if;
  select id into approver_id from members where id = j.host_id and auth_user_id = auth.uid();
  if approver_id is null then raise exception 'not_authorized'; end if;
  if j.status <> 'awaiting_approval' then raise exception 'job_not_awaiting_approval'; end if;
  if p_decision = 'declined' then
    update neighbor_jobs set status = 'declined', host_approved_by = approver_id where id = p_job_id;
    return;
  end if;
  update neighbor_jobs set host_approved_at = now(), host_approved_by = approver_id where id = p_job_id;
  if j.parent_approved_at is not null then
    update neighbor_jobs set status = 'approved' where id = p_job_id;
    update members set external_earned_cents = external_earned_cents + j.cents where id = j.child_id;
  end if;
end;
$$;
revoke execute on function public.host_approve_neighbor_job(uuid, text) from public;
grant execute on function public.host_approve_neighbor_job(uuid, text) to authenticated;

create or replace function public.parent_approve_neighbor_job(p_job_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
declare j record; approver_id uuid;
begin
  if p_decision not in ('approved','declined') then raise exception 'invalid_decision'; end if;
  select * into j from neighbor_jobs where id = p_job_id for update;
  if j is null then raise exception 'job_not_found'; end if;
  if not is_family_parent(j.family_id) then raise exception 'not_authorized'; end if;
  if j.status <> 'awaiting_approval' then raise exception 'job_not_awaiting_approval'; end if;
  select id into approver_id from members where family_id = j.family_id and auth_user_id = auth.uid() and role = 'ouder';
  if p_decision = 'declined' then
    update neighbor_jobs set status = 'declined', parent_approved_by = approver_id where id = p_job_id;
    return;
  end if;
  update neighbor_jobs set parent_approved_at = now(), parent_approved_by = approver_id where id = p_job_id;
  if j.host_approved_at is not null then
    update neighbor_jobs set status = 'approved' where id = p_job_id;
    update members set external_earned_cents = external_earned_cents + j.cents where id = j.child_id;
  end if;
end;
$$;
revoke execute on function public.parent_approve_neighbor_job(uuid, text) from public;
grant execute on function public.parent_approve_neighbor_job(uuid, text) to authenticated;

-- 7) Pot samenvoegen met het echte saldo — bewust een aparte, expliciet
-- ouder-gerechtigde RPC (in plaats van een generieke adjust-functie zoals
-- adjust_screentime): die laatste heeft van zichzelf geen interne rol-check en zou, nu
-- er met "host" voor het eerst een structureel minder vertrouwde geauthenticeerde rol
-- bestaat, een tweede, ongewenste manier openen om de pot te vullen.
create or replace function public.merge_external_earnings(p_child_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_family_id uuid; v_pot int; v_parent_id uuid;
begin
  select family_id, external_earned_cents into v_family_id, v_pot from members where id = p_child_id for update;
  if v_family_id is null then raise exception 'unknown_child'; end if;
  if not is_family_parent(v_family_id) then raise exception 'not_authorized'; end if;
  if v_pot <= 0 then return 0; end if;
  select id into v_parent_id from members where family_id = v_family_id and auth_user_id = auth.uid() and role = 'ouder';
  insert into ledger_entries(family_id, member_id, cents, kind) values (v_family_id, p_child_id, v_pot, 'external_earning');
  update members set external_earned_cents = 0 where id = p_child_id;
  return v_pot;
end;
$$;
revoke execute on function public.merge_external_earnings(uuid) from public;
grant execute on function public.merge_external_earnings(uuid) to authenticated;
