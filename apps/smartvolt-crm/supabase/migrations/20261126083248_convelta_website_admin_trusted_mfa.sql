-- The public site owns the optional intake module. Its list and update RPCs
-- both call this predicate before touching enquiries.
do $migration$
begin
  if to_regprocedure('public.sv_website_admin_access()') is null then
    if to_regprocedure('public.sv_list_website_enquiries(timestamptz,uuid,text,text)') is not null
      or to_regprocedure('public.sv_update_website_enquiry(uuid,bigint,text,text)') is not null then
      raise exception 'Website intake is missing its administrative access predicate';
    end if;
    return;
  end if;

  execute $definition$
    create or replace function public.sv_website_admin_access()
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select case
        when auth.uid() is not null
          and auth.jwt()->>'role' = 'authenticated'
          and auth.jwt()->>'aal' = 'aal2'
          and pg_catalog.pg_input_is_valid(auth.jwt()->>'session_id', 'uuid')
        then public.sv_trusted_mfa_session(
          auth.uid(), (auth.jwt()->>'session_id')::uuid
        ) is true and exists (
          select 1
          from website_private.intake_settings s
          join public.sv_memberships m on m.company_id = s.company_id
          join public.sv_companies c on c.id = m.company_id
          where s.singleton and s.active and c.status = 'active'
            and m.user_id = auth.uid() and m.status = 'active'
            and m.role in ('owner', 'admin')
        )
        else false
      end
    $body$
  $definition$;

  revoke all on function public.sv_website_admin_access() from public, anon;
end
$migration$;
