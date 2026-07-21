-- Verwijdert een heel gezin. Cascade ruimt automatisch alle gezins-tabellen
-- (members, chores, goals, ledger_entries, feed_posts, family_invites, en de
-- latere tabellen homework_items/screentime_goals/chore_offers/neighbor_jobs).
-- Alleen een OUDER van dit gezin mag dit — gecheckt server-side. families zelf
-- heeft geen delete-RLS-policy, vandaar deze security-definer RPC.
create or replace function public.delete_family(p_family_id uuid)
returns void
language plpgsql security definer as $$
begin
  if auth.uid() is null then raise exception 'must_be_authenticated'; end if;
  if not exists (
    select 1 from members m
    where m.family_id = p_family_id and m.auth_user_id = auth.uid() and m.role = 'ouder'
  ) then raise exception 'not_family_parent'; end if;
  delete from families where id = p_family_id;
end; $$;
revoke execute on function public.delete_family(uuid) from public;
grant execute on function public.delete_family(uuid) to authenticated;
