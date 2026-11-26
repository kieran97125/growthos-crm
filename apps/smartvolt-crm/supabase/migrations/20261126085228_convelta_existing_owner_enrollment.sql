-- Preserve the existing owner's access while they register their own first device.
-- Only this migration can add entries. New privileged users start with MFA required.
create table smartvolt_private.initial_owner_mfa_enrollment (
  user_id uuid not null,
  company_id uuid not null,
  primary key (user_id, company_id),
  foreign key (company_id, user_id) references public.sv_memberships(company_id, user_id) on delete cascade
);
alter table smartvolt_private.initial_owner_mfa_enrollment enable row level security;
revoke all on smartvolt_private.initial_owner_mfa_enrollment from public, anon, authenticated, service_role;
insert into smartvolt_private.initial_owner_mfa_enrollment (user_id, company_id)
select m.user_id, m.company_id
from public.sv_memberships m
join public.sv_companies c on c.id = m.company_id
where m.role = 'owner' and m.status = 'active' and c.status = 'active'
  and not exists (select 1 from public.sv_trusted_mfa_factors b where b.user_id = m.user_id);

create function public.sv_mfa_enrollment_pending(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from smartvolt_private.initial_owner_mfa_enrollment e
    join public.sv_memberships m on m.user_id = e.user_id and m.company_id = e.company_id
    join public.sv_companies c on c.id = m.company_id
    where e.user_id = p_user and m.role = 'owner' and m.status = 'active' and c.status = 'active'
  ) and not exists (
    select 1 from public.sv_trusted_mfa_factors b where b.user_id = p_user
  ) and not exists (
    -- An additional privileged membership must never inherit the old enrollment window.
    select 1 from public.sv_memberships m join public.sv_companies c on c.id = m.company_id
    where m.user_id = p_user and m.status = 'active' and c.status = 'active' and m.role in ('owner','manager')
      and not exists (select 1 from smartvolt_private.initial_owner_mfa_enrollment e
                      where e.user_id = p_user and e.company_id = m.company_id)
  )
$$;
revoke all on function public.sv_mfa_enrollment_pending(uuid) from public, anon, authenticated, service_role;
grant execute on function public.sv_mfa_enrollment_pending(uuid) to service_role;

create function smartvolt_private.consume_initial_mfa_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from smartvolt_private.initial_owner_mfa_enrollment where user_id = new.user_id;
  return null;
end;
$$;
revoke all on function smartvolt_private.consume_initial_mfa_enrollment() from public, anon, authenticated, service_role;
create trigger consume_initial_mfa_enrollment after insert on public.sv_trusted_mfa_factors
for each row execute function smartvolt_private.consume_initial_mfa_enrollment();

create function smartvolt_private.retire_initial_owner_enrollment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from smartvolt_private.initial_owner_mfa_enrollment
  where user_id = old.user_id and company_id = old.company_id;
  return null;
end;
$$;
revoke all on function smartvolt_private.retire_initial_owner_enrollment() from public, anon, authenticated, service_role;
create trigger retire_initial_owner_enrollment after update of role, status on public.sv_memberships
for each row when (new.role <> 'owner' or new.status <> 'active')
execute function smartvolt_private.retire_initial_owner_enrollment();
