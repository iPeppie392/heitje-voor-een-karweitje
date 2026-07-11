-- Heitje voor een karweitje — schermtijd-minuten als tweede beloningsvorm voor huiswerk,
-- standaard aan. Additief, veilig opnieuw te draaien.

alter table families add column if not exists homework_enabled boolean not null default true;
alter table families add column if not exists homework_reward_mode text not null default 'minutes'
  check (homework_reward_mode in ('minutes', 'money'));

-- Gezinnen die zakgeld al expliciet aan hadden staan, blijven op 'money' — hun keuze mag
-- niet stilzwijgend terugveranderen naar de nieuwe standaard ('minutes').
update families set homework_reward_mode = 'money' where homework_rewards_enabled = true;
alter table families drop column if exists homework_rewards_enabled;

alter table homework_items add column if not exists minutes int; -- null = geen minuten-beloning

alter table members add column if not exists screentime_minutes int not null default 0
  check (screentime_minutes >= 0);

create table if not exists screentime_goals (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families(id) on delete cascade,
  kid_id         uuid not null references members(id) on delete cascade,
  name           text not null,
  emoji          text,
  image_uri      text,
  target_minutes int not null check (target_minutes > 0),
  saved_minutes  int not null default 0 check (saved_minutes >= 0),
  link           text,
  approved       boolean not null default false,
  created_at     timestamptz not null default now()
);
alter table screentime_goals enable row level security;
drop policy if exists screentime_goals_all on screentime_goals;
create policy screentime_goals_all on screentime_goals for all
  using (is_family_member(family_id)) with check (is_family_member(family_id));

-- Atomische delta i.p.v. client-side "lees oud getal, schrijf nieuw absoluut getal" —
-- dat laatste gaf bij geld precies het lost-update-probleem dat de ledger nodig maakte.
-- Voor minuten volstaat één atomaire UPDATE (geen aparte ledger/view nodig, lagere inzet
-- en frequentie dan geld).
create or replace function public.adjust_screentime(p_member_id uuid, p_delta int)
returns int
language plpgsql security definer
set search_path = public
as $$
declare v_new int;
begin
  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'unknown member';
  end if;
  update members set screentime_minutes = greatest(0, screentime_minutes + p_delta)
    where id = p_member_id
    returning screentime_minutes into v_new;
  return v_new;
end;
$$;
revoke execute on function public.adjust_screentime(uuid, int) from public;
grant execute on function public.adjust_screentime(uuid, int) to authenticated;
