-- Heitje voor een karweitje — hardening: kolommen voor cloud-sync + twee RLS-gaten dicht.
-- Additief, veilig opnieuw te draaien (idempotent) — raakt geen bestaande data.

alter table members add column if not exists archived boolean not null default false;
alter table chores  add column if not exists allocated boolean not null default false;

-- Klusjes die al vóór deze migratie waren goedgekeurd, zijn onder de oude code al
-- volledig afgehandeld (het bedrag stond toen al ergens terecht) — zonder deze
-- backfill zou de app ze na de migratie ineens allemaal opnieuw als "wacht op jouw
-- keuze" tonen, met het risico dat hetzelfde bedrag een tweede keer wordt bijgeschreven.
update chores set allocated = true where status = 'approved';

-- members: een gezinslid mocht voorheen ELKE auth_user_id aan een member-rij hangen —
-- dat omzeilt de hele uitnodigingscode-poort (iemand direct als volwaardige ouder
-- toevoegen zonder ooit een code te maken). Nu alleen null (geen eigen account, de
-- normale route voor kinderen/extra lokale ouders) of de eigen auth.uid() toegestaan.
drop policy if exists members_insert on members;
create policy members_insert on members for insert
  with check (is_family_member(family_id) and (auth_user_id is null or auth_user_id = auth.uid()));

drop policy if exists members_update on members;
create policy members_update on members for update using (is_family_member(family_id))
  with check (is_family_member(family_id) and (auth_user_id is null or auth_user_id = auth.uid()));

-- ledger_entries: een entry moest voorheen alleen bij HET GEZIN horen, niet bij een
-- echt bestaand lid VAN dat gezin — een member_id uit een ander gezin (of een
-- verzonnen uuid) werd niet geweigerd. Dit is de tabel die het saldo bepaalt
-- (member_balances telt hem op), dus deze check hoort er sowieso in te zitten.
drop policy if exists ledger_insert on ledger_entries;
create policy ledger_insert on ledger_entries for insert
  with check (
    is_family_member(family_id)
    and exists (select 1 from members m where m.id = member_id and m.family_id = ledger_entries.family_id)
  );
