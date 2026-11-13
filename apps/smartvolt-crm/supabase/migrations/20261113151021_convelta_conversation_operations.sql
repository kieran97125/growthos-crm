-- Product Learning Sync checked. Neutral company-owned operations; no fixtures.
alter table public.sv_meta_threads add column created_at timestamptz not null default now();
update public.sv_meta_threads t set created_at=coalesce((select min(m.created_at)from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id),t.updated_at);
create index sv_meta_threads_created on public.sv_meta_threads(company_id,created_at);
create table public.sv_ops_settings(
 company_id uuid primary key references public.sv_companies(id), revision bigint not null default 0 check(revision>=0),
 data jsonb not null, updated_at timestamptz not null default now()
);
create table public.sv_lifecycle_stages(
 company_id uuid not null references public.sv_companies(id), id text not null check(length(id) between 1 and 100),
 name text not null check(length(name) between 1 and 30), tone text not null check(tone in ('slate','blue','violet','amber','green','rose')),
 kind text not null check(kind in ('open','won','lost')), active boolean not null default true, position integer not null,
 primary key(company_id,id)
);
create table public.sv_customer_lifecycle(
 company_id uuid not null, customer_id text not null, brand_id text not null, stage_id text not null default 'new',
 revision bigint not null default 0 check(revision>=0), reason text not null default '' check(length(reason)<=500),
 updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,customer_id,brand_id),
 foreign key(company_id,customer_id,brand_id) references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,stage_id) references public.sv_lifecycle_stages(company_id,id),
 foreign key(company_id,updated_by) references public.sv_memberships(company_id,user_id)
);
create index sv_lifecycle_queue on public.sv_customer_lifecycle(company_id,brand_id,stage_id,updated_at desc,customer_id);
create index sv_lifecycle_stage on public.sv_customer_lifecycle(company_id,stage_id);
create index sv_lifecycle_actor on public.sv_customer_lifecycle(company_id,updated_by);
create table public.sv_agent_routing(
 company_id uuid not null, user_id uuid not null, team text not null default '' check(length(team)<=40),
 capacity integer not null default 20 check(capacity between 1 and 500), brand_ids jsonb not null default '[]',
 paused boolean not null default false, revision bigint not null default 0,
 presence text not null default 'offline' check(presence in ('online','away','offline')),
 seen_at timestamptz, last_assigned_at timestamptz,
 primary key(company_id,user_id), foreign key(company_id,user_id) references public.sv_memberships(company_id,user_id),
 check(jsonb_typeof(brand_ids)='array' and jsonb_array_length(brand_ids)<=100)
);
create table public.sv_followup_tasks(
 company_id uuid not null, id uuid not null default gen_random_uuid(), customer_id text not null, brand_id text not null,
 provider text not null check(provider in ('meta','whatsapp')), thread_id uuid not null, title text not null check(length(title) between 1 and 200),
 due_at timestamptz not null check(isfinite(due_at)), owner_id uuid, status text not null default 'open' check(status in ('open','done','cancelled')),
 revision bigint not null default 0 check(revision>=0), source_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(company_id,id), unique(company_id,source_key),
 foreign key(company_id,customer_id,brand_id) references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,provider,thread_id) references public.sv_customer_threads(company_id,provider,thread_id),
 foreign key(company_id,owner_id) references public.sv_memberships(company_id,user_id)
);
create table public.sv_routing_queue(
 company_id uuid not null,provider text not null,thread_id uuid not null,reason text not null,
 last_attempt_at timestamptz not null default now(),state text not null default 'queued'check(state in('queued','assigned')),
 primary key(company_id,provider,thread_id),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id)
);
create index sv_routing_queue_attempt on public.sv_routing_queue(company_id,last_attempt_at)where state='queued';
create index sv_followups_due on public.sv_followup_tasks(company_id,due_at,id)where status='open';
create index sv_followups_owner on public.sv_followup_tasks(company_id,owner_id,due_at)where status='open';
create index sv_followups_owner_fk on public.sv_followup_tasks(company_id,owner_id);
create index sv_followups_customer on public.sv_followup_tasks(company_id,customer_id,brand_id);
create index sv_followups_thread on public.sv_followup_tasks(company_id,provider,thread_id);
create table public.sv_ai_handoffs(
 company_id uuid not null, id uuid not null, request_id uuid not null, customer_id text not null, brand_id text not null,
 provider text not null, thread_id uuid not null, actor_id uuid not null, summary text not null,
 interest text not null check(interest in ('high','medium','low','unknown')), next_step text not null,
 created_at timestamptz not null default now(), primary key(company_id,id), unique(company_id,request_id),
 foreign key(company_id,request_id) references public.sv_ai_requests(company_id,request_id),
 foreign key(company_id,customer_id,brand_id) references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,provider,thread_id) references public.sv_customer_threads(company_id,provider,thread_id),
 foreign key(company_id,actor_id) references public.sv_memberships(company_id,user_id)
);
create index sv_ai_handoffs_customer on public.sv_ai_handoffs(company_id,customer_id,brand_id,created_at desc);
create index sv_ai_handoffs_thread on public.sv_ai_handoffs(company_id,provider,thread_id);
create index sv_ai_handoffs_actor on public.sv_ai_handoffs(company_id,actor_id);

create function smartvolt_private.ops_defaults()returns jsonb language sql immutable set search_path='' as $$
 select '{"routingEnabled":false,"rules":[],"followupsEnabled":false,"followupStageIds":["qualified"],"followupMinutes":120,"stages":[{"id":"new","name":"新查詢","tone":"slate","kind":"open","active":true},{"id":"qualified","name":"有意向","tone":"blue","kind":"open","active":true},{"id":"booking","name":"安排預約","tone":"violet","kind":"open","active":true},{"id":"customer","name":"已成交","tone":"green","kind":"won","active":true},{"id":"lost","name":"已流失","tone":"rose","kind":"lost","active":true}]}'::jsonb
$$;
create function smartvolt_private.ops_company_init()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sv_ops_settings(company_id,data)values(new.id,smartvolt_private.ops_defaults());
 insert into public.sv_lifecycle_stages(company_id,id,name,tone,kind,active,position)
 select new.id,x->>'id',x->>'name',x->>'tone',x->>'kind',(x->>'active')::boolean,n::integer
 from jsonb_array_elements(smartvolt_private.ops_defaults()->'stages')with ordinality a(x,n);
 return new;
end;$$;
create trigger sv_ops_company_init after insert on public.sv_companies for each row execute function smartvolt_private.ops_company_init();
insert into public.sv_ops_settings(company_id,data)select id,smartvolt_private.ops_defaults()from public.sv_companies;
insert into public.sv_lifecycle_stages(company_id,id,name,tone,kind,active,position)
 select c.id,x->>'id',x->>'name',x->>'tone',x->>'kind',(x->>'active')::boolean,n::integer from public.sv_companies c,
 jsonb_array_elements(smartvolt_private.ops_defaults()->'stages')with ordinality a(x,n);
create function smartvolt_private.ops_customer_init()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sv_customer_lifecycle(company_id,customer_id,brand_id)values(new.company_id,new.customer_id,new.brand_id)on conflict do nothing;
 return new;
end;$$;
create trigger sv_ops_customer_init after insert on public.sv_customer_brands for each row execute function smartvolt_private.ops_customer_init();
insert into public.sv_customer_lifecycle(company_id,customer_id,brand_id)select company_id,customer_id,brand_id from public.sv_customer_brands;

-- Full-dataset operational projection, no provider payload/credentials/click IDs.
create view smartvolt_private.ops_inquiries with(security_invoker=true)as
 select l.company_id,l.customer_id,l.brand_id,l.provider,l.thread_id,t.status,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.revision,t.created_at,t.updated_at,c.channel,t.last_inbound_at
 from public.sv_customer_threads l join public.sv_meta_threads t on t.company_id=l.company_id and t.id=l.thread_id
 join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where l.provider='meta'
 union all
 select l.company_id,l.customer_id,l.brand_id,l.provider,l.thread_id,t.status,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.revision,t.created_at,t.updated_at,'whatsapp',t.last_inbound_at
 from public.sv_customer_threads l join public.sv_wa_conversations t on t.company_id=l.company_id and t.id=l.thread_id where l.provider='whatsapp';

create function smartvolt_private.ops_wait(p_company uuid,p_provider text,p_thread uuid,p_reason text)returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sv_routing_queue(company_id,provider,thread_id,reason)values(p_company,p_provider,p_thread,p_reason)
 on conflict(company_id,provider,thread_id)do update set reason=excluded.reason,state='queued',last_attempt_at=clock_timestamp();
 return jsonb_build_object('saved',false,'queued',true,'reason',p_reason);
end;$$;
create function smartvolt_private.ops_assign(p_company uuid,p_provider text,p_thread uuid,p_actor uuid default null,p_expected bigint default null,p_force boolean default false)returns jsonb
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
 if not p_force and t.assignee_id is not null and exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=t.assignee_id and m.status='active'and m.role<>'viewer')then return jsonb_build_object('saved',true,'keptOwner',true);end if;
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
 where m.company_id=p_company and m.status='active' and m.role<>'viewer'
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
create or replace function public.sv_inquiry_auto_assign(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_expected bigint,p_command uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt public.sv_inquiry_commands;req jsonb;result jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_provider is null or p_provider not in('meta','whatsapp') or p_expected is null then raise exception 'ops_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 req=jsonb_build_object('kind','auto-assign','provider',p_provider,'thread',p_thread,'revision',p_expected);
 select * into receipt from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if receipt.actor_id<>p_actor or receipt.request<>req then raise exception 'ops_idempotency_conflict';end if;return receipt.result;end if;
 result=smartvolt_private.ops_assign(p_company,p_provider,p_thread,p_actor,p_expected,true);
 insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

create function smartvolt_private.ops_inbound()returns trigger language plpgsql security invoker set search_path='' as $$
declare p text;t uuid;
begin
 if tg_table_name='sv_meta_messages' then
  if new.direction<>'inbound' then return new;end if;p='meta';t=new.thread_id;
 else
  if new.direction<>'incoming' then return new;end if;p='whatsapp';t=new.conversation_id;
 end if;
 if exists(select 1 from public.sv_companies c join public.sv_company_products e on e.company_id=c.id where c.id=new.company_id and c.status='active' and e.product='crm' and e.status='active' and e.starts_at<=now()and(e.ends_at is null or e.ends_at>now()))then
  perform smartvolt_private.ops_assign(new.company_id,p,t);
 end if;return new;
end;$$;
create trigger sv_ops_meta_inbound after insert on public.sv_meta_messages for each row execute function smartvolt_private.ops_inbound();
create trigger sv_ops_wa_inbound after insert on public.sv_wa_messages for each row execute function smartvolt_private.ops_inbound();

create function smartvolt_private.ops_stage_event()returns trigger language plpgsql security invoker set search_path='' as $$
declare cfg jsonb;t record;kind text;retired integer:=0;
begin
 if old.stage_id=new.stage_id and old.reason=new.reason then return new;end if;
 select s.kind into strict kind from public.sv_lifecycle_stages s where s.company_id=new.company_id and s.id=new.stage_id;
 -- Retire pending reminders when the operational lifecycle closes.
 if old.stage_id is distinct from new.stage_id then
 if kind in('won','lost')then
  update public.sv_followup_tasks set status='cancelled',revision=revision+1,updated_at=now()where company_id=new.company_id and customer_id=new.customer_id and brand_id=new.brand_id and status='open';get diagnostics retired=row_count;
 else
  select data into strict cfg from public.sv_ops_settings where company_id=new.company_id;
  if(cfg->>'followupsEnabled')::boolean and cfg->'followupStageIds' ? new.stage_id then
   select * into t from smartvolt_private.ops_inquiries where company_id=new.company_id and customer_id=new.customer_id and brand_id=new.brand_id and status='open' order by updated_at desc,provider,thread_id limit 1;
   if found then
    insert into public.sv_followup_tasks(company_id,customer_id,brand_id,provider,thread_id,title,due_at,owner_id,source_key)
    values(new.company_id,new.customer_id,new.brand_id,t.provider,t.thread_id,'跟進客戶需要',now()+make_interval(mins=>(cfg->>'followupMinutes')::integer),t.assignee_id,'stage:'||new.customer_id||':'||new.brand_id||':'||new.revision)on conflict do nothing;
   end if;
  end if;
 end if;
 end if;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)
 values(new.company_id,new.customer_id,new.brand_id,'stage:'||new.customer_id||':'||new.brand_id||':'||new.revision,'lifecycle-changed',new.updated_by,jsonb_build_object('previousStage',old.stage_id,'stageId',new.stage_id,'reason',new.reason,'retiredFollowups',retired));
 return new;
end;$$;
create trigger sv_ops_stage_event after update of stage_id on public.sv_customer_lifecycle for each row execute function smartvolt_private.ops_stage_event();

create function public.sv_ops_presence(p_company uuid,p_actor uuid,p_status text)returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_status is null or p_status not in('online','away','offline')then raise exception 'ops_invalid';end if;
 insert into public.sv_agent_routing(company_id,user_id,presence,seen_at)values(p_company,p_actor,p_status,now())
 on conflict(company_id,user_id)do update set presence=excluded.presence,seen_at=excluded.seen_at;
 return jsonb_build_object('status',p_status,'expiresAt',now()+interval '3 minutes');
end;$$;

create function public.sv_ops_action(p_company uuid,p_actor uuid,p_command uuid,p_action text,p_data jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare role text;req jsonb;r public.sv_inquiry_commands;result jsonb;cfg public.sv_ops_settings;x jsonb;n integer;item record;
 life public.sv_customer_lifecycle;link public.sv_customer_threads;ai public.sv_ai_requests;t record;task public.sv_followup_tasks;target uuid;brands jsonb;doc public.sv_workspaces;
begin
 role=public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_action is null or jsonb_typeof(p_data)is distinct from 'object' or octet_length(p_data::text)>40000 then raise exception 'ops_invalid';end if;
 req=jsonb_build_object('kind','operations','action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'ops_idempotency_conflict';end if;return r.result;end if;
 if p_action in('settings','agent')and role not in('owner','manager')then raise exception 'ops_access_denied';end if;
 if p_action='settings'then
  select * into strict cfg from public.sv_ops_settings where company_id=p_company for update;
  if cfg.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  x=p_data->'data';
  if jsonb_typeof(x)is distinct from'object' or jsonb_typeof(x->'stages')is distinct from'array' or jsonb_array_length(x->'stages')not between 2 and 20
  or jsonb_typeof(x->'rules')is distinct from'array' or jsonb_array_length(x->'rules')>20
  or jsonb_typeof(x->'routingEnabled')is distinct from'boolean' or jsonb_typeof(x->'followupsEnabled')is distinct from'boolean'
  or jsonb_typeof(x->'followupStageIds')is distinct from'array' or jsonb_array_length(x->'followupStageIds')>20
  or(x->>'followupMinutes')::integer not between 5 and 43200
  or x->>'followupMinutes'is null then raise exception 'ops_invalid';end if;
  if(select count(distinct s->>'id')from jsonb_array_elements(x->'stages')s)<>jsonb_array_length(x->'stages')
  or not exists(select 1 from jsonb_array_elements(x->'stages')s where s->>'id'='new' and s->>'kind'='open' and s->'active'='true')
  or exists(select 1 from public.sv_lifecycle_stages s where s.company_id=p_company and not exists(select 1 from jsonb_array_elements(x->'stages')v where v->>'id'=s.id))then raise exception 'ops_stages_invalid';end if;
  if exists(select 1 from public.sv_lifecycle_stages s join jsonb_array_elements(x->'stages')v on v->>'id'=s.id where s.company_id=p_company and v->>'kind'<>s.kind)then raise exception 'ops_stage_kind_invalid';end if;
  for item in select a.v,a.n from jsonb_array_elements(x->'stages')with ordinality a(v,n)loop
   if length(item.v->>'id')not between 1 and 100 or length(btrim(item.v->>'name'))not between 1 and 30 or jsonb_typeof(item.v->'active')is distinct from'boolean'then raise exception 'ops_stages_invalid';end if;
   insert into public.sv_lifecycle_stages values(p_company,item.v->>'id',btrim(item.v->>'name'),item.v->>'tone',item.v->>'kind',(item.v->>'active')::boolean,item.n)
   on conflict(company_id,id)do update set name=excluded.name,tone=excluded.tone,kind=excluded.kind,active=excluded.active,position=excluded.position;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(x->'followupStageIds')v where not exists(select 1 from public.sv_lifecycle_stages s where s.company_id=p_company and s.id=v and s.active and s.kind='open'))then raise exception 'ops_stages_invalid';end if;
  select payload#>'{scope,brands}'into strict brands from public.sv_workspaces where company_id=p_company;
  if(select count(distinct v->>'id')from jsonb_array_elements(x->'rules')v)<>jsonb_array_length(x->'rules')then raise exception 'ops_rules_invalid';end if;
  for item in select v from jsonb_array_elements(x->'rules')v loop
   if(item.v->>'id')::uuid is null or length(btrim(item.v->>'name'))not between 1 and 60 or item.v->>'method'not in('least_open','round_robin')
   or item.v->>'channel'not in('all','whatsapp','messenger','instagram')or(item.v->>'maxOpen')::integer not between 1 and 500
   or jsonb_typeof(item.v->'enabled')is distinct from'boolean'or jsonb_typeof(item.v->'onlineOnly')is distinct from'boolean'
   or jsonb_typeof(item.v->'tags')is distinct from'array'or jsonb_array_length(item.v->'tags')>10
   or length(item.v->>'team')>40 or item.v->>'maxOpen'is null or item.v->>'method'is null or item.v->>'channel'is null or item.v->>'name'is null or item.v->>'team'is null
   or(item.v->>'brandId'is not null and not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=item.v->>'brandId'))then raise exception 'ops_rules_invalid';end if;
   if exists(select 1 from jsonb_array_elements(item.v->'tags')v where jsonb_typeof(v)<>'string'or length(v#>>'{}')not between 1 and 40)then raise exception 'ops_rules_invalid';end if;
  end loop;
  update public.sv_ops_settings set data=x,revision=revision+1,updated_at=now()where company_id=p_company;
  result=jsonb_build_object('saved',true,'revision',cfg.revision+1);
 elsif p_action='agent'then
  target=(p_data->>'userId')::uuid;
  perform 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=target and m.status='active'and m.role<>'viewer'for share;
  if not found then raise exception 'ops_agent_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('agent:'||p_company::text||target::text,0));
  select payload#>'{scope,brands}'into strict brands from public.sv_workspaces where company_id=p_company;
  if length(p_data->>'team')>40 or p_data->>'team'is null or(p_data->>'capacity')::integer not between 1 and 500 or p_data->>'capacity'is null
  or jsonb_typeof(p_data->'paused')is distinct from'boolean'or jsonb_typeof(p_data->'brandIds')is distinct from'array'or jsonb_array_length(p_data->'brandIds')>100 then raise exception 'ops_invalid';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'brandIds')v where jsonb_typeof(v)<>'string'or not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=v#>>'{}'))then raise exception 'ops_brand_scope';end if;
  select coalesce((select revision from public.sv_agent_routing where company_id=p_company and user_id=target),0)into n;
  if n is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  insert into public.sv_agent_routing(company_id,user_id,team,capacity,brand_ids,paused,revision)
  values(p_company,target,btrim(p_data->>'team'),(p_data->>'capacity')::integer,p_data->'brandIds',(p_data->>'paused')::boolean,n+1)
  on conflict(company_id,user_id)do update set team=excluded.team,capacity=excluded.capacity,brand_ids=excluded.brand_ids,paused=excluded.paused,revision=excluded.revision;
  result=jsonb_build_object('saved',true);
 elsif p_action in('stage','handoff')then
  if p_action='handoff'then
   select * into strict ai from public.sv_ai_requests where company_id=p_company and request_id=(p_data->>'requestId')::uuid and actor_id=p_actor and status='completed'for share;
   if ai.product<>'crm'or ai.feature<>'reply'or ai.source not in('meta','whatsapp')or ai.source<>p_data->>'provider'or ai.source_id is distinct from p_data->>'threadId'then raise exception 'ops_ai_context_changed';end if;
   -- Use the saved, validated answer, never a client-supplied AI label/summary.
   select * into strict doc from public.sv_workspaces where company_id=p_company for share;
   if doc.revision<>ai.workspace_revision then raise exception 'ops_ai_context_changed';end if;
   if ai.source='meta'then perform 1 from public.sv_meta_threads where company_id=p_company and id=ai.source_id::uuid for share;
   else perform 1 from public.sv_wa_conversations where company_id=p_company and id=ai.source_id::uuid for share;end if;
   select * into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=ai.source and thread_id=ai.source_id::uuid;
   if t.revision<>ai.source_revision or t.revision is distinct from(p_data->>'revision')::bigint or t.brand_id<>ai.brand_id then raise exception 'ops_ai_context_changed';end if;
   select * into strict link from public.sv_customer_threads where company_id=p_company and provider=ai.source and thread_id=ai.source_id::uuid for share;
   if link.customer_id is distinct from p_data->>'customerId'or link.revision is distinct from(p_data->>'linkRevision')::bigint then raise exception 'ops_ai_context_changed';end if;
   select * into strict life from public.sv_customer_lifecycle where company_id=p_company and customer_id=link.customer_id and brand_id=link.brand_id for update;
   if p_data->>'stageId'is not null and life.revision is distinct from(p_data->>'lifecycleRevision')::bigint then raise exception 'ops_revision_conflict';end if;
   if length(ai.result->>'summary')not between 1 and 1200 or length(ai.result->>'nextStep')not between 1 and 300 or ai.result->>'interest'not in('high','medium','low','unknown')then raise exception 'ops_ai_invalid';end if;
   insert into public.sv_ai_handoffs(company_id,id,request_id,customer_id,brand_id,provider,thread_id,actor_id,summary,interest,next_step)
   values(p_company,p_command,ai.request_id,link.customer_id,link.brand_id,ai.source,ai.source_id::uuid,p_actor,ai.result->>'summary',ai.result->>'interest',ai.result->>'nextStep');
   insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,link.customer_id,link.brand_id,'ai-handoff:'||p_command,'ai-handoff',p_actor,jsonb_build_object('requestId',ai.request_id,'summary',ai.result->>'summary','interest',ai.result->>'interest','nextStep',ai.result->>'nextStep','reason',p_data->>'reason'));
  else
   select * into strict life from public.sv_customer_lifecycle where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=p_data->>'brandId'for update;
   if life.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  end if;
  if p_data->>'stageId'is not null then
   if length(btrim(p_data->>'reason'))not between 1 and 500 or p_data->>'reason'is null then raise exception 'ops_reason_required';end if;
   perform 1 from public.sv_lifecycle_stages where company_id=p_company and id=p_data->>'stageId'and active for share;
   if not found then raise exception 'ops_stage_invalid';end if;
   update public.sv_customer_lifecycle set stage_id=p_data->>'stageId',reason=btrim(p_data->>'reason'),updated_by=p_actor,revision=revision+1,updated_at=now()
   where company_id=p_company and customer_id=life.customer_id and brand_id=life.brand_id;
  elsif p_action='stage'then raise exception 'ops_stage_invalid';end if;
  result=jsonb_build_object('saved',true);
 elsif p_action='followup-create'then
  select * into strict link from public.sv_customer_threads where company_id=p_company and provider=p_data->>'provider'and thread_id=(p_data->>'threadId')::uuid for share;
  target=(p_data->>'ownerId')::uuid;
  if target is not null then
   perform 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=target and m.status='active'and m.role<>'viewer'for share;
   if not found then raise exception 'ops_agent_invalid';end if;
  end if;
  if length(btrim(p_data->>'title'))not between 1 and 200 or p_data->>'title'is null or p_data->>'dueAt'is null or not isfinite((p_data->>'dueAt')::timestamptz)
  or(p_data->>'dueAt')::timestamptz>now()+interval '366 days'then raise exception 'ops_invalid';end if;
  insert into public.sv_followup_tasks(company_id,id,customer_id,brand_id,provider,thread_id,title,due_at,owner_id,source_key)
  values(p_company,p_command,link.customer_id,link.brand_id,link.provider,link.thread_id,btrim(p_data->>'title'),(p_data->>'dueAt')::timestamptz,target,'manual:'||p_command);
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,link.customer_id,link.brand_id,'followup:'||p_command,'followup-created',p_actor,jsonb_build_object('taskId',p_command,'title',p_data->>'title','dueAt',p_data->>'dueAt','ownerId',target));
  result=jsonb_build_object('saved',true);
 elsif p_action='followup-update'then
  select * into strict task from public.sv_followup_tasks where company_id=p_company and id=(p_data->>'id')::uuid for update;
  if task.owner_id is not null and task.owner_id<>p_actor and role not in('owner','manager')and exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=task.owner_id and m.status='active'and m.role<>'viewer')then raise exception 'ops_access_denied';end if;
  if task.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  if p_data->>'status'is null or p_data->>'status'not in('open','done','cancelled')or(task.status<>'open'and p_data->>'status'='open')then raise exception 'ops_invalid';end if;
  if p_data->>'dueAt'is not null and(not isfinite((p_data->>'dueAt')::timestamptz)or(p_data->>'dueAt')::timestamptz>now()+interval '366 days')then raise exception 'ops_invalid';end if;
  update public.sv_followup_tasks set status=p_data->>'status',due_at=coalesce((p_data->>'dueAt')::timestamptz,due_at),owner_id=case when exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=task.owner_id and m.status='active'and m.role<>'viewer')then task.owner_id else p_actor end,revision=revision+1,updated_at=now()where company_id=p_company and id=task.id;
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,task.customer_id,task.brand_id,'followup:'||p_command,'followup-updated',p_actor,jsonb_build_object('taskId',task.id,'status',p_data->>'status','dueAt',p_data->>'dueAt'));
  result=jsonb_build_object('saved',true);
 else raise exception 'ops_invalid';end if;
 insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

-- All operational raw tables and invoker functions are server-only.
do $$declare t text;f record;begin
 foreach t in array array['sv_ops_settings','sv_lifecycle_stages','sv_customer_lifecycle','sv_agent_routing','sv_followup_tasks','sv_ai_handoffs','sv_routing_queue']loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert%s on public.%I to service_role',case when t='sv_ai_handoffs'then''else',update'end,t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='smartvolt_private'and p.proname like'ops_%')or(n.nspname='public'and p.proname in('sv_ops_action','sv_ops_presence','sv_inquiry_auto_assign'))loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
revoke all on smartvolt_private.ops_inquiries from public,anon,authenticated;
grant select on smartvolt_private.ops_inquiries to service_role;
create trigger sv_ai_handoffs_immutable before update or delete on public.sv_ai_handoffs for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_ai_handoffs_truncate before truncate on public.sv_ai_handoffs for each statement execute function smartvolt_private.wa_reject_rewrite();

create function public.sv_ops_read(p_company uuid,p_actor uuid,p_brand text default null,p_stage text default null,p_search text default '',p_before timestamptz default null,p_before_key text default null,p_from timestamptz default null,p_to timestamptz default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;settings public.sv_ops_settings;stages jsonb;rows jsonb;tasks jsonb;members jsonb;metrics jsonb;brands jsonb;pos boolean;actor_role text;task_count bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 if p_search is null or length(p_search)>100 or(p_before is null)<>(p_before_key is null)or length(p_before_key)>400
 or p_from is null or p_to is null or not isfinite(p_from)or not isfinite(p_to)or p_to<=p_from or p_to>p_from+interval '367 days'then raise exception 'ops_query_invalid';end if;
 select * into strict settings from public.sv_ops_settings where company_id=p_company;
 select payload#>'{scope,brands}'into strict brands from public.sv_workspaces where company_id=p_company;
 if p_brand is not null and not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=p_brand)then raise exception 'ops_brand_scope';end if;
 if p_stage is not null and not exists(select 1 from public.sv_lifecycle_stages where company_id=p_company and id=p_stage)then raise exception 'ops_query_invalid';end if;
 pos=exists(select 1 from public.sv_company_products where company_id=p_company and product='pos'and status='active'and starts_at<=now()and(ends_at is null or ends_at>now()));
 select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'tone',s.tone,'kind',s.kind,'active',s.active,'count',(
 select count(*)from public.sv_customer_lifecycle l join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
 where l.company_id=p_company and l.stage_id=s.id and(p_brand is null or l.brand_id=p_brand)and(p_search=''or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)))order by s.position,s.id)
 into stages from public.sv_lifecycle_stages s where s.company_id=p_company;
 select coalesce(jsonb_agg(v order by at desc,key),'[]'::jsonb)into rows from(
  select l.updated_at at,jsonb_build_array(l.customer_id,l.brand_id)::text key,
  jsonb_build_object('key',jsonb_build_array(l.customer_id,l.brand_id)::text,'customer_id',l.customer_id,'brand_id',l.brand_id,'name',c.name,'stage_id',l.stage_id,
  'revision',l.revision,'reason',l.reason,'updated_at',l.updated_at,'priority',coalesce(t.priority,'normal'),'owner_name',m.display_name,'follow_up_at',t.follow_up_at,
  'provider',t.provider,'thread_id',t.thread_id,'interest',h.interest,'summary',h.summary,'next_step',h.next_step)v
  from public.sv_customer_lifecycle l join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
  left join lateral(select i.*from smartvolt_private.ops_inquiries i where i.company_id=l.company_id and i.customer_id=l.customer_id and i.brand_id=l.brand_id order by(i.status='open')desc,i.updated_at desc,i.provider,i.thread_id limit 1)t on true
  left join public.sv_memberships m on m.company_id=l.company_id and m.user_id=t.assignee_id and m.status='active'and m.role<>'viewer'
  left join lateral(select a.*from public.sv_ai_handoffs a where a.company_id=l.company_id and a.customer_id=l.customer_id and a.brand_id=l.brand_id order by a.created_at desc,a.id desc limit 1)h on true
  where l.company_id=p_company and(p_brand is null or l.brand_id=p_brand)and(p_stage is null or l.stage_id=p_stage)
  and(p_search=''or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)
  and(p_before is null or l.updated_at<p_before or(l.updated_at=p_before and jsonb_build_array(l.customer_id,l.brand_id)::text>p_before_key))
  order by l.updated_at desc,key limit 51
 )q;
 select count(*)into task_count from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and(p_brand is null or f.brand_id=p_brand)and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'));
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v
  from public.sv_followup_tasks f join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id
  left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.status='open'and(p_brand is null or f.brand_id=p_brand)and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  order by f.due_at,f.id limit 50
 )q;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,'role',m.role,'team',coalesce(a.team,''),
 'capacity',coalesce(a.capacity,20),'brand_ids',coalesce(a.brand_ids,'[]'),'paused',coalesce(a.paused,false),'revision',coalesce(a.revision,0),
 'presence',case when a.seen_at>now()-interval '3 minutes'then a.presence else'offline'end,
 'open_count',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.assignee_id=m.user_id and i.status='open'))order by m.display_name,m.user_id),'[]'::jsonb)
 into members from public.sv_memberships m left join public.sv_agent_routing a on a.company_id=m.company_id and a.user_id=m.user_id
 where m.company_id=p_company and m.status='active'and m.role<>'viewer';
 select jsonb_build_object(
 'inquiries',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and(p_brand is null or i.brand_id=p_brand)and i.created_at>=p_from and i.created_at<p_to),
 'confirmedBookings',(select count(*)from(select coalesce(e.detail->>'requestId',e.detail->>'id')key,min(e.created_at)at from public.sv_customer_events e
 where e.company_id=p_company and(p_brand is null or e.brand_id=p_brand)and(e.kind='booking-confirm'or(pos and e.kind='pos-appointment'and e.detail->>'status'in('confirmed','checked_in','completed','no_show')))
 group by coalesce(e.detail->>'requestId',e.detail->>'id'))q where key is not null and at>=p_from and at<p_to),
 'attended',case when pos then(select count(*)from(select e.detail->>'id'key,min(e.created_at)at from public.sv_customer_events e where e.company_id=p_company and(p_brand is null or e.brand_id=p_brand)and e.kind='pos-appointment'and e.detail->>'status'in('checked_in','completed')group by e.detail->>'id')q where key is not null and at>=p_from and at<p_to)else 0 end,
 'unassigned',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and(p_brand is null or i.brand_id=p_brand)and i.status='open'and not exists(select 1 from public.sv_memberships m where m.company_id=i.company_id and m.user_id=i.assignee_id and m.status='active'and m.role<>'viewer')),
 'overdue',(select count(*)from(
  select provider,thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and(p_brand is null or i.brand_id=p_brand)and i.status='open'and i.follow_up_at<=now()
  union select provider,thread_id from public.sv_followup_tasks f where f.company_id=p_company and(p_brand is null or f.brand_id=p_brand)and f.status='open'and f.due_at<=now()
 )q),
 'receivedCents',case when pos then(select coalesce(sum(p.amount_cents),0)from public.sv_pos_payments p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
 where p.company_id=p_company and(p_brand is null or o.brand_id=p_brand)and p.occurred_at>=extract(epoch from p_from)*1000 and p.occurred_at<extract(epoch from p_to)*1000)else null end,
 'refundedCents',case when pos then(select coalesce(sum(p.amount_cents),0)from public.sv_pos_refunds p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
 where p.company_id=p_company and(p_brand is null or o.brand_id=p_brand)and p.occurred_at>=extract(epoch from p_from)*1000 and p.occurred_at<extract(epoch from p_to)*1000)else null end
 )into metrics;
 return jsonb_build_object('settings',settings.data,'revision',settings.revision,'stages',stages,'records',rows,'followups',tasks,'followupCount',task_count,
 'members',members,'metrics',metrics,'brands',brands,'checkedAt',now());
end;$$;

create function public.sv_ops_context(p_company uuid,p_actor uuid,p_provider text,p_thread uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;life jsonb;stages jsonb;tasks jsonb;handoff jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,false,true);
 select * into strict l from public.sv_customer_threads where company_id=p_company and provider=p_provider and thread_id=p_thread;
 select to_jsonb(x)-array['company_id','created_at','updated_at','updated_by']into life from public.sv_customer_lifecycle x where company_id=p_company and customer_id=l.customer_id and brand_id=l.brand_id;
 select jsonb_agg(to_jsonb(s)-array['company_id','position']order by position,id)into stages from public.sv_lifecycle_stages s where company_id=p_company;
 select jsonb_build_object('summary',h.summary,'interest',h.interest,'next_step',h.next_step,'created_at',h.created_at)into handoff from public.sv_ai_handoffs h where company_id=p_company and customer_id=l.customer_id and brand_id=l.brand_id order by created_at desc,id desc limit 1;
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v from public.sv_followup_tasks f
  join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.customer_id=l.customer_id and f.brand_id=l.brand_id and f.status='open'order by f.due_at,f.id limit 20
 )q;
 return jsonb_build_object('lifecycle',life,'stages',stages,'followups',tasks,'handoff',handoff);
end;$$;

create function public.sv_ops_attention(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare role text;presence text;due bigint;
begin
 role=public.sv_customer_authorize(p_company,p_actor,false,true);
 select case when seen_at>now()-interval '3 minutes'then a.presence else'offline'end into presence from public.sv_agent_routing a where company_id=p_company and user_id=p_actor;
 select count(*)into due from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and f.due_at<=now()and(role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'));
 return jsonb_build_object('presence',coalesce(presence,'offline'),'due',due,'canEdit',role<>'viewer');
end;$$;
revoke all on function public.sv_ops_read(uuid,uuid,text,text,text,timestamptz,text,timestamptz,timestamptz),public.sv_ops_context(uuid,uuid,text,uuid),public.sv_ops_attention(uuid,uuid)from public,anon,authenticated;
grant execute on function public.sv_ops_read(uuid,uuid,text,text,text,timestamptz,text,timestamptz,timestamptz),public.sv_ops_context(uuid,uuid,text,uuid),public.sv_ops_attention(uuid,uuid)to service_role;

create function public.sv_ops_route_waiting(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare t record;result jsonb;assigned integer:=0;attempted integer:=0;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if not exists(select 1 from public.sv_ops_settings where company_id=p_company and(data->>'routingEnabled')::boolean)then return jsonb_build_object('assigned',0,'attempted',0);end if;
 for t in select i.provider,i.thread_id from smartvolt_private.ops_inquiries i
 left join public.sv_routing_queue q on q.company_id=i.company_id and q.provider=i.provider and q.thread_id=i.thread_id
 where i.company_id=p_company and i.status='open'and not exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=i.assignee_id and m.status='active'and m.role<>'viewer')
 order by q.last_attempt_at nulls first,i.created_at,i.provider,i.thread_id limit 20 loop
  result=smartvolt_private.ops_assign(p_company,t.provider,t.thread_id);
  attempted=attempted+1;if result->>'saved'='true'then assigned=assigned+1;end if;
 end loop;
 return jsonb_build_object('assigned',assigned,'attempted',attempted);
end;$$;
revoke all on function public.sv_ops_route_waiting(uuid,uuid)from public,anon,authenticated;
grant execute on function public.sv_ops_route_waiting(uuid,uuid)to service_role;

create function public.sv_ops_tasks(p_company uuid,p_actor uuid,p_brand text default null,p_after timestamptz default null,p_after_id uuid default null)returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_role text;tasks jsonb;total bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 if(p_after is null)<>(p_after_id is null)or(p_after is not null and not isfinite(p_after))then raise exception 'ops_query_invalid';end if;
 if p_brand is not null and not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=p_brand)then raise exception 'ops_brand_scope';end if;
 select count(*)into total from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and(p_brand is null or f.brand_id=p_brand)and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'));
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v
  from public.sv_followup_tasks f join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id
  left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.status='open'and(p_brand is null or f.brand_id=p_brand)and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  and(p_after is null or f.due_at>p_after or(f.due_at=p_after and f.id>p_after_id))order by f.due_at,f.id limit 51
 )q;
 return jsonb_build_object('tasks',tasks,'total',total);
end;$$;
revoke all on function public.sv_ops_tasks(uuid,uuid,text,timestamptz,uuid)from public,anon,authenticated;
grant execute on function public.sv_ops_tasks(uuid,uuid,text,timestamptz,uuid)to service_role;

-- Named tasks and legacy handover times share the same due conversation queue.
create or replace function public.sv_inbox_list(p_company uuid,p_actor uuid,p_queue text default 'all',p_channel text default 'all',p_search text default '',p_before timestamptz default null,p_before_key text default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,false,true);
 if p_queue is null or p_queue not in ('all','mine','unassigned','overdue','priority','unread','resolved') or p_channel is null or p_channel not in ('all','whatsapp','messenger','instagram') or p_search is null or length(p_search)>100 or(p_before is null)<>(p_before_key is null)then raise exception 'customer_query_invalid';end if;
 with channel_rows as(
  select 'meta:'||t.id key,'meta' provider,t.id,c.channel,c.brand_id,t.revision,t.customer_name,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.status,t.last_inbound_at,t.updated_at,
   (select count(*)::integer from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound' and m.seq>t.read_seq)unread_count,
   coalesce((select left(m.body,180) from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction<>'note' order by seq desc limit 1),'')preview
  from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where t.company_id=p_company
  union all
  select 'whatsapp:'||t.id,'whatsapp',t.id,'whatsapp',t.brand_id,t.revision,t.customer_name,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.status,t.last_inbound_at,t.updated_at,t.unread_count,
   coalesce((select left(m.body,180) from public.sv_wa_messages m where m.company_id=t.company_id and m.conversation_id=t.id and m.direction<>'note' order by seq desc limit 1),'')
  from public.sv_wa_conversations t where t.company_id=p_company
 ), scoped as materialized(
  select r.*,l.customer_id,l.revision link_revision,c.name,coalesce(a.status='active' and a.role<>'viewer',false) assignee_active from channel_rows r
  join public.sv_customer_threads l on l.company_id=p_company and l.provider=r.provider and l.thread_id=r.id
  join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
  left join public.sv_memberships a on a.company_id=p_company and a.user_id=r.assignee_id
  where (p_channel='all' or r.channel=p_channel)and(p_search='' or strpos(lower(c.name||' '||c.phone||' '||r.customer_name),lower(p_search))>0)
 ), filtered as(
 select * from scoped where case p_queue when 'mine' then status='open' and assignee_id=p_actor when 'unassigned' then status='open' and not assignee_active when 'overdue' then status='open' and (follow_up_at<=now()or exists(select 1 from public.sv_followup_tasks f where f.company_id=p_company and f.provider=scoped.provider and f.thread_id=scoped.id and f.status='open'and f.due_at<=now())) when 'priority' then status='open' and priority in ('high','urgent') when 'unread' then status='open' and unread_count>0 when 'resolved' then status='resolved' else status='open' end
 ), page as(select * from filtered where p_before is null or(updated_at,key)<(p_before,p_before_key)order by updated_at desc,key desc limit 51)
 select jsonb_build_object('threads',coalesce((select jsonb_agg(to_jsonb(p) order by updated_at desc,key desc)from page p),'[]'::jsonb),'counts',(select jsonb_build_object('all',count(*)filter(where status='open'),'mine',count(*)filter(where status='open' and assignee_id=p_actor),'unassigned',count(*)filter(where status='open' and not assignee_active),'overdue',count(*)filter(where status='open' and (follow_up_at<=now()or exists(select 1 from public.sv_followup_tasks f where f.company_id=p_company and f.provider=scoped.provider and f.thread_id=scoped.id and f.status='open'and f.due_at<=now()))),'priority',count(*)filter(where status='open' and priority in ('high','urgent')),'unread',count(*)filter(where status='open' and unread_count>0),'resolved',count(*)filter(where status='resolved'))from scoped))into result;return result;
end;$$;

create or replace function public.sv_ops_attention(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_role text;presence text;due bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 select case when seen_at>now()-interval '3 minutes'then a.presence else'offline'end into presence from public.sv_agent_routing a where company_id=p_company and user_id=p_actor;
 select count(*)into due from(
  select f.provider,f.thread_id from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and f.due_at<=now()and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  union select i.provider,i.thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.status='open'and i.follow_up_at<=now()and(actor_role in('owner','manager')or i.assignee_id=p_actor or i.assignee_id is null)
 )q;
 return jsonb_build_object('presence',coalesce(presence,'offline'),'due',due,'canEdit',actor_role<>'viewer');
end;$$;

-- C reads the same due-work authority; stages remain operational labels.
create or replace function public.sv_copilot_snapshot(p_company uuid,p_actor uuid,p_product text,p_brand text default null,p_customer text default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare doc public.sv_workspaces;result jsonb;customer jsonb:=null;cutoff timestamptz:=now()-interval '90 days';has_crm boolean;has_pos boolean;
begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 has_crm=exists(select 1 from public.sv_company_products p where p.company_id=p_company and p.product='crm'and p.status='active'and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now()));
 has_pos=exists(select 1 from public.sv_company_products p where p.company_id=p_company and p.product='pos'and p.status='active'and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now()));
 select * into strict doc from public.sv_workspaces where company_id=p_company;
 if p_brand is not null and not exists(select 1 from jsonb_array_elements(doc.payload#>'{scope,brands}')b where b->>'id'=p_brand)then raise exception 'copilot_brand_scope';end if;
 if p_customer is not null then
  select jsonb_build_object('id',c.id,'tags',c.tags,'revision',c.revision,'lastMessage','','lastMessageAt',null,
   'booked',exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=c.id and (p_brand is null or r.brand_id=p_brand)and((r.status='confirmed'and r.desired_at>=now())or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000)))))
  into customer from public.sv_customers c where c.company_id=p_company and c.id=p_customer and exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and(p_brand is null or b.brand_id=p_brand));
  if customer is null then raise exception 'copilot_customer_scope';end if;
  if p_product='crm' then
   customer=customer||coalesce((select jsonb_build_object('lastMessage',left(m.body,1200),'lastMessageAt',m.stamp)from(
    select m.body,floor(extract(epoch from m.created_at)*1000)::bigint stamp from public.sv_meta_messages m join public.sv_customer_threads l on l.company_id=m.company_id and l.thread_id=m.thread_id and l.provider='meta'
     where m.company_id=p_company and l.customer_id=p_customer and(p_brand is null or l.brand_id=p_brand)and m.direction='inbound' and m.state='received'
    union all select m.body,floor(extract(epoch from m.created_at)*1000)::bigint from public.sv_wa_messages m join public.sv_customer_threads l on l.company_id=m.company_id and l.thread_id=m.conversation_id and l.provider='whatsapp'
     where m.company_id=p_company and l.customer_id=p_customer and(p_brand is null or l.brand_id=p_brand)and m.direction='incoming' and m.state in('accepted','sent','delivered','read')
   )m order by stamp desc limit 1),'{}'::jsonb);
  else customer=customer||jsonb_build_object('booked',exists(select 1 from public.sv_pos_appointments a where a.company_id=p_company and a.contact_id=p_customer and(p_brand is null or a.brand_id=p_brand)and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000));end if;
 end if;
 with native as(
  select l.customer_id,l.brand_id,c.channel,(select min(m.created_at)from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound'and m.state='received')created_at,t.last_inbound_at,t.status,t.follow_up_at from public.sv_customer_threads l
   join public.sv_meta_threads t on t.company_id=l.company_id and t.id=l.thread_id join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id
   where p_product='crm'and l.company_id=p_company and l.provider='meta'and(p_brand is null or l.brand_id=p_brand)
  union all select l.customer_id,l.brand_id,'whatsapp',(select min(m.created_at)from public.sv_wa_messages m where m.company_id=t.company_id and m.conversation_id=t.id and m.direction='incoming'and m.state in('accepted','sent','delivered','read')),t.last_inbound_at,t.status,t.follow_up_at from public.sv_customer_threads l
   join public.sv_wa_conversations t on t.company_id=l.company_id and t.id=l.thread_id
   where p_product='crm'and l.company_id=p_company and l.provider='whatsapp'and(p_brand is null or l.brand_id=p_brand)
 ),first_inquiry as(
  select customer_id,min(created_at)first_at,max(last_inbound_at)last_at from native group by customer_id
 ), people as(
  select n.*,exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=n.customer_id and(p_brand is null or r.brand_id=p_brand)and(r.status='confirmed'or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status<>'cancelled')))and r.created_at>=n.first_at and r.created_at<=now())booked
   from first_inquiry n
 ),cohort as(select * from people where first_at>=cutoff),groups as(
  select 'tag:'||tag key,tag label,count(distinct p.customer_id)leads,count(distinct p.customer_id)filter(where p.booked)booked
   from cohort p join public.sv_customers c on c.company_id=p_company and c.id=p.customer_id cross join lateral jsonb_array_elements_text(c.tags)tag group by tag
  union all select 'channel:'||n.channel,n.channel,count(distinct p.customer_id),count(distinct p.customer_id)filter(where p.booked)
   from cohort p join native n on n.customer_id=p.customer_id group by n.channel
 ),scoped_customers as(select c.* from public.sv_customers c where c.company_id=p_company and exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and(p_brand is null or b.brand_id=p_brand)))
 select jsonb_build_object('at',now(),'from',cutoff,'product',p_product,'brandId',p_brand,'revision',doc.revision,
  'brands',doc.payload#>'{scope,brands}','customer',customer,
  'customers',(select count(*)from scoped_customers),
  'inquiries',(select count(*)from cohort),'confirmed',(select count(*)from cohort where booked),
  'overdue',(select count(*)from native where status='open'and follow_up_at<now()),
  'dormant',(select count(*)from people n where last_at<extract(epoch from now()-interval '14 days')*1000 and not exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=n.customer_id and(p_brand is null or r.brand_id=p_brand)and((r.status='confirmed'and r.desired_at>=now())or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000))))),
  'untagged',(select count(*)from scoped_customers where tags='[]'::jsonb),
  'segments',coalesce((select jsonb_agg(to_jsonb(g))from(select * from groups order by leads desc,key limit 50)g),'[]'::jsonb),
  'pos',case when p_product='pos'or exists(select 1 from public.sv_company_products e where e.company_id=p_company and e.product='pos'and e.status='active'and e.starts_at<=now()and(e.ends_at is null or e.ends_at>now()))then
    jsonb_build_object('appointments',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(p_brand is null or a.brand_id=p_brand)and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'completed',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(p_brand is null or a.brand_id=p_brand)and a.status='completed'and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'noShow',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(p_brand is null or a.brand_id=p_brand)and a.status='no_show'and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'revenueCents',(select coalesce(sum(p.amount_cents),0)from public.sv_pos_payments p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id where p.company_id=p_company and(p_brand is null or o.brand_id=p_brand)and p.occurred_at>=extract(epoch from cutoff)*1000 and p.occurred_at<=extract(epoch from now())*1000)
      -(select coalesce(sum(p.amount_cents),0)from public.sv_pos_refunds p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id where p.company_id=p_company and(p_brand is null or o.brand_id=p_brand)and p.occurred_at>=extract(epoch from cutoff)*1000 and p.occurred_at<=extract(epoch from now())*1000))else null end,
  'knowledge',coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','brandId',a->>'brandId','title',a->>'title','content',a->>'content','source',a->>'source','revision',(a->>'revision')::integer))from jsonb_array_elements(doc.payload#>'{studio,articles}')a where has_crm and a->>'status'='approved'and(a->>'validUntil')::date>=(now()at time zone'Asia/Hong_Kong')::date and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('id','pos-service:'||(a->>'id'),'brandId',a->>'brandId','title',a->>'name','content','POS目錄服務：'||(a->>'name')||'；目錄收費 HK$'||round((a->>'priceCents')::numeric/100,2)::text||'；時長 '||(a->>'durationMinutes')||' 分鐘。目錄不代表已確認空位。','source','公司 POS 服務設定','revision',doc.revision))from jsonb_array_elements(doc.payload#>'{pos,catalog}')a where has_pos and coalesce((a->>'active')::boolean,false)and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb),
  'channels',jsonb_build_object('connected',case when p_product='crm'then(select count(*)from public.sv_meta_connections where company_id=p_company and enabled and(p_brand is null or brand_id=p_brand))+(select count(*)from public.sv_wa_connections where company_id=p_company and state='active'and(p_brand is null or brand_id=p_brand))else 0 end),
  'lastBroadcastAt',null,'broadcastCoverage','unavailable') into result;
 if p_product='crm'then
  result=result||jsonb_build_object('overdue',(select count(*)from(
   select provider,thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and(p_brand is null or i.brand_id=p_brand)and i.status='open'and i.follow_up_at<=now()
   union select f.provider,f.thread_id from public.sv_followup_tasks f join smartvolt_private.ops_inquiries i on i.company_id=f.company_id and i.provider=f.provider and i.thread_id=f.thread_id where f.company_id=p_company and(p_brand is null or f.brand_id=p_brand)and f.status='open'and f.due_at<=now()and i.status='open'
  )q),'followupTasks',(select count(*)from public.sv_followup_tasks f where f.company_id=p_company and(p_brand is null or f.brand_id=p_brand)and f.status='open'),
  'lifecycleStages',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'count',(select count(*)from public.sv_customer_lifecycle l where l.company_id=p_company and l.stage_id=s.id and(p_brand is null or l.brand_id=p_brand)))order by s.position,s.id)from public.sv_lifecycle_stages s where s.company_id=p_company),'[]'::jsonb));
 end if;
 return result;
end;$$;
