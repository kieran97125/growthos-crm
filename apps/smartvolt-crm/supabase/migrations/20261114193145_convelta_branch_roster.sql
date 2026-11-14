-- Product Learning Sync checked: explicit branch identity, actual roster and shared atomic capacity.
create table public.sv_routing_branches(company_id uuid not null references public.sv_companies(id),id uuid not null,name text not null check(length(name)between 1 and 80),active boolean not null default true,revision bigint not null default 1,primary key(company_id,id));
create table public.sv_roster_profiles(company_id uuid not null,user_id uuid not null,branch_ids uuid[]not null default '{}',skills text[]not null default '{}',time_zone text not null default 'Asia/Hong_Kong',roster_enabled boolean not null default false,weekly jsonb not null default '[]',leave_periods jsonb not null default '[]',revision bigint not null default 1,primary key(company_id,user_id),foreign key(company_id,user_id)references public.sv_memberships(company_id,user_id));
create table public.sv_routing_requirements(company_id uuid not null,provider text not null,thread_id uuid not null,branch_id uuid,skills text[]not null default '{}',revision bigint not null default 1,primary key(company_id,provider,thread_id),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),foreign key(company_id,branch_id)references public.sv_routing_branches(company_id,id));
create function smartvolt_private.roster_eligible(p_company uuid,p_user uuid,p_provider text,p_thread uuid,p_at timestamptz default statement_timestamp())returns boolean language plpgsql stable security invoker set search_path=''as $$
declare r public.sv_roster_profiles;q public.sv_routing_requirements;local_at timestamp;begin
 select *into r from public.sv_roster_profiles where company_id=p_company and user_id=p_user;
 select *into q from public.sv_routing_requirements where company_id=p_company and provider=p_provider and thread_id=p_thread;
 if q.branch_id is not null and(not coalesce(q.branch_id=any(r.branch_ids),false)or not exists(select 1 from public.sv_routing_branches where company_id=p_company and id=q.branch_id and active))then return false;end if;
 if cardinality(q.skills)>0 and not coalesce(q.skills<@r.skills,false)then return false;end if;
 if r.user_id is null then return true;end if;
 if exists(select 1 from jsonb_array_elements(r.leave_periods)x where p_at>=(x->>'from')::timestamptz and p_at<(x->>'to')::timestamptz)then return false;end if;
 if not r.roster_enabled then return true;end if;
 local_at=p_at at time zone r.time_zone;
 return exists(select 1 from jsonb_array_elements(r.weekly)x where(x->>'day')::integer=extract(isodow from local_at)and extract(hour from local_at)*60+extract(minute from local_at)>=(x->>'start')::integer and extract(hour from local_at)*60+extract(minute from local_at)<(x->>'end')::integer);
end;$$;
create function public.sv_roster_read(p_company uuid,p_actor uuid,p_provider text default null,p_thread uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare company_admin boolean;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 company_admin=exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role in('owner','manager')and brand_ids is null);
 if p_thread is not null then perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);elsif not company_admin then raise exception 'access_denied';end if;
 return jsonb_build_object('canManage',company_admin,'branches',coalesce((select jsonb_agg(b order by b.name,b.id)from(select id,name,active,revision from public.sv_routing_branches where company_id=p_company)b),'[]'),
 'members',case when company_admin and p_thread is null then coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.display_name,'profile',jsonb_build_object('branchIds',coalesce(r.branch_ids,'{}'),'skills',coalesce(r.skills,'{}'),'timeZone',coalesce(r.time_zone,'Asia/Hong_Kong'),'rosterEnabled',coalesce(r.roster_enabled,false),'weekly',coalesce(r.weekly,'[]'),'leavePeriods',coalesce(r.leave_periods,'[]'),'revision',coalesce(r.revision,0)))order by m.display_name,m.user_id)from public.sv_memberships m left join public.sv_roster_profiles r on r.company_id=m.company_id and r.user_id=m.user_id where m.company_id=p_company and m.status='active'and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')),'[]')else '[]'::jsonb end,
 'requirement',coalesce((select jsonb_build_object('branchId',branch_id,'skills',skills,'revision',revision)from public.sv_routing_requirements where company_id=p_company and provider=p_provider and thread_id=p_thread),'{"branchId":null,"skills":[],"revision":0}'));
end;$$;
create function public.sv_roster_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare r jsonb;ident uuid;current_revision bigint;weekly jsonb;leave_periods jsonb;branches uuid[];skills text[];begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,p_kind<>'requirement');
 if p_kind='requirement'then perform public.sv_thread_scope(p_company,p_actor,p_data->>'provider',(p_data->>'threadId')::uuid);
 elsif exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and brand_ids is not null)then raise exception 'brand_scope';end if;
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'roster:'||p_kind,p_data);if r is not null then return r;end if;
 perform pg_advisory_xact_lock(hashtextextended('assignment:'||p_company::text,0));
 if p_kind='branch'then
  ident=(p_data->>'id')::uuid;select revision into current_revision from public.sv_routing_branches where company_id=p_company and id=ident for update;
  if coalesce(current_revision,0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  insert into public.sv_routing_branches(company_id,id,name,active)values(p_company,ident,btrim(p_data->>'name'),(p_data->>'active')::boolean)on conflict(company_id,id)do update set name=excluded.name,active=excluded.active,revision=sv_routing_branches.revision+1;
 elsif p_kind='member'then
  ident=(p_data->>'userId')::uuid;if not smartvolt_private.member_has_product(p_company,ident,'crm')then raise exception 'access_denied';end if;
  branches=array(select jsonb_array_elements_text(p_data->'branchIds')::uuid);skills=array(select jsonb_array_elements_text(p_data->'skills'));
  if cardinality(branches)>50 or cardinality(skills)>30 or exists(select 1 from unnest(branches)x where not exists(select 1 from public.sv_routing_branches where company_id=p_company and id=x))then raise exception 'invalid_branches';end if;
  if exists(select 1 from unnest(skills)x where length(btrim(x))not between 1 and 40)then raise exception 'invalid_skills';end if;
  if not exists(select 1 from pg_timezone_names where name=p_data->>'timeZone')then raise exception 'invalid_timezone';end if;
  weekly=p_data->'weekly';leave_periods=p_data->'leavePeriods';
  if jsonb_array_length(weekly)>21 or((p_data->>'rosterEnabled')::boolean and jsonb_array_length(weekly)=0)or jsonb_array_length(leave_periods)>100 then raise exception 'invalid_roster';end if;
  if exists(select 1 from jsonb_array_elements(weekly)x where(x->>'day')::integer not between 1 and 7 or(x->>'start')::integer not between 0 and 1439 or(x->>'end')::integer not between 1 and 1440 or(x->>'start')::integer>=(x->>'end')::integer)then raise exception 'invalid_roster';end if;
  if exists(select 1 from jsonb_array_elements(leave_periods)x where not isfinite((x->>'from')::timestamptz)or not isfinite((x->>'to')::timestamptz)or(x->>'from')::timestamptz>=(x->>'to')::timestamptz)then raise exception 'invalid_leave';end if;
  select revision into current_revision from public.sv_roster_profiles where company_id=p_company and user_id=ident for update;
  if coalesce(current_revision,0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  insert into public.sv_roster_profiles(company_id,user_id,branch_ids,skills,time_zone,roster_enabled,weekly,leave_periods)values(p_company,ident,branches,skills,p_data->>'timeZone',(p_data->>'rosterEnabled')::boolean,weekly,leave_periods)
  on conflict(company_id,user_id)do update set branch_ids=excluded.branch_ids,skills=excluded.skills,time_zone=excluded.time_zone,roster_enabled=excluded.roster_enabled,weekly=excluded.weekly,leave_periods=excluded.leave_periods,revision=sv_roster_profiles.revision+1;
 elsif p_kind='requirement'then
  ident=(p_data->>'threadId')::uuid;skills=array(select jsonb_array_elements_text(p_data->'skills'));
  if cardinality(skills)>30 or exists(select 1 from unnest(skills)x where length(btrim(x))not between 1 and 40)then raise exception 'invalid_skills';end if;
  if p_data->>'branchId'is not null and not exists(select 1 from public.sv_routing_branches where company_id=p_company and id=(p_data->>'branchId')::uuid and active)then raise exception 'invalid_branch';end if;
  select revision into current_revision from public.sv_routing_requirements where company_id=p_company and provider=p_data->>'provider'and thread_id=ident for update;
  if coalesce(current_revision,0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  insert into public.sv_routing_requirements(company_id,provider,thread_id,branch_id,skills)values(p_company,p_data->>'provider',ident,(p_data->>'branchId')::uuid,skills)on conflict(company_id,provider,thread_id)do update set branch_id=excluded.branch_id,skills=excluded.skills,revision=sv_routing_requirements.revision+1;
 else raise exception 'invalid_action';end if;
 r='{"saved":true}';insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'roster:'||p_kind,p_data,r);return r;
end;$$;
do $$declare t text;f record;begin
 foreach t in array array['sv_routing_branches','sv_roster_profiles','sv_routing_requirements']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('roster_eligible','sv_roster_read','sv_roster_action')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;

create or replace function smartvolt_private.ops_assign(p_company uuid,p_provider text,p_thread uuid,p_actor uuid default null,p_expected bigint default null,p_force boolean default false)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t record;settings jsonb;rule jsonb;target uuid;event uuid:=gen_random_uuid();work bigint;
begin
 -- Ingestion already owns its thread. Other callers skip a busy thread instead
 -- of inverting thread/company locks against an incoming provider transaction.
 if p_provider='meta'then perform 1 from public.sv_meta_threads where company_id=p_company and id=p_thread for update skip locked;
 elsif p_provider='whatsapp'then perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_thread for update skip locked;
 else raise exception 'ops_invalid';end if;
 if not found then return jsonb_build_object('saved',false,'queued',true,'reason','busy');end if;
 perform pg_advisory_xact_lock(hashtextextended('assignment:'||p_company::text,0));
 select * into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=p_provider and thread_id=p_thread;
 if p_expected is not null and t.revision<>p_expected then raise exception 'ops_revision_conflict';end if;
 if t.status<>'open' then return jsonb_build_object('saved',false,'queued',false,'reason','resolved');end if;
 if not p_force and t.assignee_id is not null and exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=t.assignee_id and m.status='active'and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id))then return jsonb_build_object('saved',true,'keptOwner',true);end if;
 select data into strict settings from public.sv_ops_settings where company_id=p_company;
 if (settings->>'routingEnabled')::boolean then
  select x into rule from jsonb_array_elements(settings->'rules')with ordinality a(x,n)
  where(x->>'enabled')::boolean and(x->>'brandId' is null or x->>'brandId'=t.brand_id)
  and(x->>'channel'='all' or x->>'channel'=t.channel)
  and not exists(select 1 from jsonb_array_elements_text(x->'tags')tag where not exists(select 1 from public.sv_customers cu where cu.company_id=p_company and cu.id=t.customer_id and cu.tags ? tag))
  order by n limit 1;
  if rule is null then return smartvolt_private.ops_wait(p_company,p_provider,p_thread,'no_rule');end if;
 else
  if not p_force then return jsonb_build_object('saved',false,'queued',true,'reason','disabled');end if;
  rule='{"id":"manual-workload","team":"","onlineOnly":false,"maxOpen":500,"method":"least_open"}'::jsonb;
 end if;
 select m.user_id,load.n into target,work from public.sv_memberships m
 left join public.sv_agent_routing a on a.company_id=m.company_id and a.user_id=m.user_id
 cross join lateral(select count(*)n from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.assignee_id=m.user_id and i.status='open')load
 where m.company_id=p_company and m.status='active' and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id)
 and smartvolt_private.roster_eligible(p_company,m.user_id,p_provider,p_thread)
 and not coalesce(a.paused,false) and (rule->>'team'='' or a.team=rule->>'team')
 and (coalesce(jsonb_array_length(a.brand_ids),0)=0 or a.brand_ids ? t.brand_id)
 and (not(rule->>'onlineOnly')::boolean or(a.presence='online' and a.seen_at>now()-interval '3 minutes'))
 and load.n<least((rule->>'maxOpen')::integer,coalesce(a.capacity,20))
 order by case when rule->>'method'='least_open' then load.n else 0 end,
 a.last_assigned_at nulls first,m.user_id limit 1 for share of m;
 if target is null then return smartvolt_private.ops_wait(p_company,p_provider,p_thread,'no_eligible_agent');end if;
 -- No intervening manual assignment can be silently overwritten.
 if p_provider='meta' then
  update public.sv_meta_threads set assignee_id=target,revision=revision+1,updated_at=now()where company_id=p_company and id=p_thread and revision=t.revision;
 else
  update public.sv_wa_conversations set assignee_id=target,revision=revision+1,updated_at=now()where company_id=p_company and id=p_thread and revision=t.revision;
 end if;
 if not found then raise exception 'ops_revision_conflict';end if;
 insert into public.sv_agent_routing(company_id,user_id,last_assigned_at)values(p_company,target,clock_timestamp())
 on conflict(company_id,user_id)do update set last_assigned_at=excluded.last_assigned_at;
 update public.sv_routing_queue set state='assigned',last_attempt_at=clock_timestamp()where company_id=p_company and provider=p_provider and thread_id=p_thread;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)
 values(p_company,t.customer_id,t.brand_id,'routing:'||event,'routing-assigned',p_actor,
 jsonb_build_object('provider',p_provider,'threadId',p_thread,'previousOwner',t.assignee_id,'ownerId',target,'ruleId',rule->>'id','method',rule->>'method','openBefore',work));
 return jsonb_build_object('saved',true,'ownerId',target,'queued',false);
end;$$;
