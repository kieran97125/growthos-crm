-- First registration is authorized in the application by independent proof of mailbox control.
-- Keep the binding even if a factor is removed: replacement requires a verified recovery.
create table public.sv_trusted_mfa_factors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  factor_id uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.sv_trusted_mfa_factors enable row level security;
revoke all on public.sv_trusted_mfa_factors from public, anon, authenticated, service_role;
grant select, insert on public.sv_trusted_mfa_factors to service_role;

-- The application supplies subject/session from a verified access token. Read only
-- metadata about the matching session and factor; callers receive one boolean.
create function public.sv_trusted_mfa_session(p_user uuid, p_session uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
    from public.sv_trusted_mfa_factors binding
    join auth.sessions session
      on session.user_id = binding.user_id and session.factor_id = binding.factor_id
    join auth.mfa_factors factor
      on factor.user_id = binding.user_id and factor.id = binding.factor_id
    where binding.user_id = p_user and session.id = p_session
      and session.aal = 'aal2'
      and (session.not_after is null or session.not_after > statement_timestamp())
      and factor.factor_type = 'totp' and factor.status = 'verified'
  );
end;
$$;
revoke all on function public.sv_trusted_mfa_session(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.sv_trusted_mfa_session(uuid, uuid) to service_role;
