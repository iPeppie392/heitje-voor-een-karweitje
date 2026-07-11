-- Heitje voor een karweitje — Fase 6b: gratis premium-codes
-- Voegt alleen NIEUWE dingen toe, raakt bestaande gezinnen/leden/klusjes niet aan.
-- Eenmalig te plakken in de Supabase SQL Editor, ná 001_init.sql.

alter table families add column if not exists premium_unlocked boolean not null default false;

drop table if exists promo_codes cascade;
create table promo_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  max_uses   int not null default 1,
  used_count int not null default 0,
  note       text,                 -- bijv. "voor tante Anja" — alleen voor jezelf als overzicht
  created_at timestamptz not null default now()
);
alter table promo_codes enable row level security;
-- Bewust geen enkele policy hier: alleen jij (via de Supabase Table Editor / SQL Editor,
-- dus met volledige toegang) kan codes aanmaken of bekijken. De app zelf kan alleen
-- de onderstaande functie aanroepen, die intern (security definer) de tabel mag lezen.

create or replace function public.redeem_promo_code(promo_code text)
returns boolean
language plpgsql security definer as $$
declare fam_id uuid; promo record;
begin
  if auth.uid() is null then raise exception 'must_be_authenticated'; end if;
  select family_id into fam_id from members where auth_user_id = auth.uid() and role = 'ouder' limit 1;
  if fam_id is null then raise exception 'no_family'; end if;

  select * into promo from promo_codes where code = promo_code for update;
  if promo is null or promo.used_count >= promo.max_uses then
    return false;
  end if;

  update promo_codes set used_count = used_count + 1 where id = promo.id;
  update families set premium_unlocked = true where id = fam_id;
  return true;
end; $$;
revoke execute on function public.redeem_promo_code(text) from public;
grant execute on function public.redeem_promo_code(text) to authenticated;

-- Voorbeeld — zo geef je zelf een code weg (pas het codewoord en de notitie aan):
-- insert into promo_codes (code, max_uses, note) values ('HEITJE-VRIENDEN', 1, 'voor een vriend');
