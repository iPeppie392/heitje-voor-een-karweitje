-- Heitje voor een karweitje — huiswerkplanner, met optionele (standaard uit)
-- zakgeld-beloning per taak. Additief, veilig opnieuw te draaien.

alter table families add column if not exists homework_rewards_enabled boolean not null default false;

create table if not exists homework_items (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references families(id) on delete cascade,
  member_id        uuid not null references members(id) on delete cascade,
  title            text not null,
  subject          text,
  due_date         date not null,
  done             boolean not null default false,
  cents            int,                     -- null = geen beloning aan dit item gekoppeld
  reward_approved  boolean not null default false,
  created_by       uuid references members(id) on delete set null,
  created_at       timestamptz not null default now()
);
alter table homework_items enable row level security;
drop policy if exists homework_all on homework_items;
create policy homework_all on homework_items for all
  using (is_family_member(family_id)) with check (is_family_member(family_id));

-- `families` had helemaal geen schrijf-policy — alleen create_family()/redeem_invite()
-- (security definer) konden een rij aanmaken. Daardoor faalde de bestaande valuta-wissel
-- stilzwijgend op elk cloud-verbonden gezin. Nodig voor de nieuwe schakelaar hieronder,
-- en repareert de valuta-wissel gratis mee.
drop policy if exists families_update on families;
create policy families_update on families for update
  using (is_family_parent(id)) with check (is_family_parent(id));

alter table ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table ledger_entries add constraint ledger_entries_kind_check
  check (kind in ('chore_reward','payout','manual_adjustment','legacy_import','homework_reward'));
