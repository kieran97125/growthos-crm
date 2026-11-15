-- Resume from the first active company in the same tick after reaching the end.
-- An acknowledgement still advances only past actually processed companies.
create or replace function public.sv_execution_tenants()returns jsonb
language plpgsql security invoker set search_path=''as $$
declare cursor uuid;ids uuid[];begin
 insert into public.sv_execution_checkpoint(name)values('maintenance')on conflict do nothing;
 select after_company into cursor from public.sv_execution_checkpoint where name='maintenance'for update;
 select array_agg(id order by id)into ids from(select c.id from public.sv_companies c where c.status='active'and(cursor is null or c.id>cursor)order by c.id limit 50)q;
 if ids is null and cursor is not null then
  update public.sv_execution_checkpoint set after_company=null,updated_at=statement_timestamp()where name='maintenance';
  select array_agg(id order by id)into ids from(select c.id from public.sv_companies c where c.status='active'order by c.id limit 50)q;
 end if;
 return coalesce(to_jsonb(ids),'[]');
end;$$;
revoke all on function public.sv_execution_tenants()from public,anon,authenticated;
grant execute on function public.sv_execution_tenants()to service_role;
