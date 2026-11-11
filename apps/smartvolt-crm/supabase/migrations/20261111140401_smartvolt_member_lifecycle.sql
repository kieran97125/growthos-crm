-- Dedicated SmartVolt project only. Atomic owner-managed membership changes.
create table public.sv_member_events (
 company_id uuid not null references public.sv_companies(id), command_id uuid not null,
 actor_id uuid not null references auth.users(id),target_id uuid not null references auth.users(id),
 previous jsonb not null,current jsonb not null,created_at timestamptz not null default now(),
 primary key(company_id,command_id)
);
alter table public.sv_member_events enable row level security;
revoke all on public.sv_member_events from public,anon,authenticated;
grant select,insert on public.sv_member_events to service_role;
create index sv_member_events_recent on public.sv_member_events(company_id,created_at desc);
create function public.sv_update_member(p_company uuid,p_actor uuid,p_target uuid,
 p_expected bigint,p_command_id uuid,p_role text,p_status text,p_name text)
returns bigint language plpgsql security invoker set search_path='' as $$
declare doc public.sv_workspaces; target public.sv_memberships; team jsonb;
begin
 perform 1 from public.sv_companies where id=p_company and status='active' for update;
 if not found then raise exception 'access_denied';end if;
 perform 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner' and status='active' for update;
 if not found then raise exception 'owner_required';end if;
 select * into target from public.sv_memberships where company_id=p_company and user_id=p_target for update;
 if not found then raise exception 'member_missing';end if;
 if target.role='owner' or p_target=p_actor then raise exception 'owner_protected';end if;
 if p_role is null or p_role not in ('manager','agent','viewer') or p_status is null or p_status not in ('active','suspended','removed') or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then raise exception 'invalid_member';end if;
 select * into doc from public.sv_workspaces where company_id=p_company for update;
 if not found then raise exception 'workspace_missing';end if;
 if exists(select 1 from public.sv_commands where company_id=p_company and command_id=p_command_id and actor_id=p_actor and kind='member:update') then return doc.revision;end if;
 if doc.revision<>p_expected then raise exception 'revision_conflict';end if;
 if p_status='active' and target.status<>'active' and (select count(*) from public.sv_memberships where company_id=p_company and status in ('active','invited')) >= (select seat_limit from public.sv_companies where id=p_company) then raise exception 'seat_limit';end if;
 update public.sv_memberships set role=p_role,status=p_status,display_name=btrim(p_name) where company_id=p_company and user_id=p_target;
 insert into public.sv_member_events(company_id,command_id,actor_id,target_id,previous,current) values(p_company,p_command_id,p_actor,p_target,jsonb_build_object('role',target.role,'status',target.status,'display_name',target.display_name),jsonb_build_object('role',p_role,'status',p_status,'display_name',btrim(p_name)));
 select jsonb_agg(jsonb_build_object('id',user_id::text,'name',display_name,'initials',left(display_name,2)) order by created_at,user_id) into team from public.sv_memberships where company_id=p_company and status='active';
 insert into public.sv_workspace_versions(company_id,revision,payload) values(p_company,doc.revision,doc.payload);
 update public.sv_workspaces set payload=jsonb_set(payload,'{scope,team}',team),revision=revision+1,updated_at=now() where company_id=p_company returning * into doc;
 insert into public.sv_commands(company_id,command_id,actor_id,kind,revision) values(p_company,p_command_id,p_actor,'member:update',doc.revision);
 delete from public.sv_workspace_versions where company_id=p_company and revision<doc.revision-30;
 return doc.revision;
end;$$;
revoke all on function public.sv_update_member(uuid,uuid,uuid,bigint,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.sv_update_member(uuid,uuid,uuid,bigint,uuid,text,text,text) to service_role;
