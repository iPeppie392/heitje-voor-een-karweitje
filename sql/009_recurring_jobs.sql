-- Heitje voor een karweitje — terugkerende buurtklusjes: het enige bewust uitgestelde
-- stuk van "Buurtklusjes v2.0" (zie sql/008). Bewust GEEN kalender/cron-planning (dat zou
-- een achtergrond-taak op de server vereisen, die deze client-app niet heeft) — simpeler
-- model: zodra een "terugkerend" klusje volledig is goedgekeurd, verschijnt er automatisch
-- een verse, opnieuw open versie van hetzelfde klusje. Additief, veilig opnieuw te draaien.

alter table neighbor_jobs add column if not exists recurring boolean not null default false;

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
    if j.recurring then
      insert into neighbor_jobs(family_id, child_id, host_id, title, cents, recurring)
        values (j.family_id, j.child_id, j.host_id, j.title, j.cents, true);
    end if;
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
    if j.recurring then
      insert into neighbor_jobs(family_id, child_id, host_id, title, cents, recurring)
        values (j.family_id, j.child_id, j.host_id, j.title, j.cents, true);
    end if;
  end if;
end;
$$;
revoke execute on function public.parent_approve_neighbor_job(uuid, text) from public;
grant execute on function public.parent_approve_neighbor_job(uuid, text) to authenticated;
