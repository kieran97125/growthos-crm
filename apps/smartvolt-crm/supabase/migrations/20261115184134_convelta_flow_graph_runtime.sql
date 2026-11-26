-- Product Learning Sync checked: 07-17 regression,07-26 governed sends,
-- 07-29 readiness,08-10 scoped sources,10-06 concise operational feedback.
-- Original arbitrary-graph execution. No provider POST or model call in SQL.
create table public.sv_flow_definitions(
 company_id uuid not null references public.sv_companies(id),flow_id text not null,
 brand_id text not null,name text not null,trigger_kind text not null check(trigger_kind in('manual','unanswered','appointment','completed')),
 provider text not null check(provider in('whatsapp','meta')),connection_id uuid not null,
 purpose text not null check(purpose in('service','marketing')),enabled boolean not null default false,
 revision bigint not null,published_version integer not null,created_by uuid not null,
 published_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,flow_id)
);
create table public.sv_flow_versions(
 company_id uuid not null,flow_id text not null,version integer not null,graph jsonb not null,deliveries jsonb not null default '{}',settings jsonb not null,
 created_by uuid not null,created_at timestamptz not null default now(),primary key(company_id,flow_id,version),
 foreign key(company_id,flow_id)references public.sv_flow_definitions(company_id,flow_id)
);
create table public.sv_flow_runs(
 company_id uuid not null,id uuid not null default gen_random_uuid(),flow_id text not null,version integer not null,
 source_key text not null,source_version text not null,source_product text not null check(source_product in('crm','pos')),
 customer_id text not null,brand_id text not null,provider text not null,thread_id uuid not null,anchor_inbound text,
 node_id text not null,state text not null default 'active' check(state in('active','waiting','review','form','delivery','completed','stopped','handoff')),
 context jsonb not null default '{}',reason text,due_at timestamptz not null default now(),job_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,id),
 unique(company_id,flow_id,version,source_key,source_version),foreign key(company_id,flow_id,version)references public.sv_flow_versions(company_id,flow_id,version),
 foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id)
);
create index sv_flow_due on public.sv_flow_runs(company_id,due_at,id)where state in('active','waiting','delivery');
create index sv_flow_thread on public.sv_flow_runs(company_id,provider,thread_id)where state in('active','waiting','review','form','delivery');
create index sv_flow_source on public.sv_flow_runs(company_id,source_key,source_version);
create table public.sv_flow_steps(
 company_id uuid not null,id uuid not null default gen_random_uuid(),run_id uuid not null,node_id text not null,
 kind text not null,state text not null,detail jsonb not null default '{}',created_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,run_id,node_id,state),foreign key(company_id,run_id)references public.sv_flow_runs(company_id,id)
);
create index sv_flow_history on public.sv_flow_steps(company_id,run_id,created_at,id);
create table public.sv_flow_forms(
 company_id uuid not null,run_id uuid not null,node_id text not null,actor_id uuid not null,fields jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,run_id,node_id),
 foreign key(company_id,run_id)references public.sv_flow_runs(company_id,id)
);
alter table public.sv_delivery_jobs drop constraint sv_delivery_jobs_origin_check;
alter table public.sv_delivery_jobs add constraint sv_delivery_jobs_origin_check check(origin in('manual','campaign','journey','flow'));

create function smartvolt_private.flow_graph_check(g jsonb)returns void language plpgsql security invoker set search_path=''as $$
declare v_node jsonb;v_edge jsonb;h text[];allowed text[];seen text[]:='{}';front text[];current text;count_nodes integer;begin
 if jsonb_typeof(g)is distinct from'object'or octet_length(g::text)>140000 or jsonb_typeof(g->'nodes')is distinct from'array'or jsonb_typeof(g->'edges')is distinct from'array'
 or jsonb_array_length(g->'nodes')not between 2 and 60 or jsonb_array_length(g->'edges')not between 1 and 100 then raise exception 'flow_graph_invalid';end if;
 count_nodes=jsonb_array_length(g->'nodes');
 if(select count(distinct x->>'id')from jsonb_array_elements(g->'nodes')x)<>count_nodes or(select count(*)from jsonb_array_elements(g->'nodes')x where x->>'kind'='trigger')<>1
 or(select count(distinct x->>'id')from jsonb_array_elements(g->'edges')x)<>jsonb_array_length(g->'edges')then raise exception 'flow_graph_invalid';end if;
 for v_edge in select value from jsonb_array_elements(g->'edges')loop
  if not exists(select 1 from jsonb_array_elements(g->'nodes')x where x->>'id'=v_edge->>'source')or not exists(select 1 from jsonb_array_elements(g->'nodes')x where x->>'id'=v_edge->>'target')then raise exception 'flow_graph_reference_invalid';end if;
 end loop;
 for v_node in select value from jsonb_array_elements(g->'nodes')loop
  if length(v_node->>'id')not between 1 and 100 or length(v_node->>'title')not between 1 and 60 or v_node->>'kind'not in('trigger','intent','condition','answer','form','followup','review','reminder','handoff','message','delay','end')then raise exception 'flow_node_invalid';end if;
  allowed=case v_node->>'kind'when'intent'then array['faq','booking','handoff']when'condition'then array['new','existing']when'answer'then array[]::text[]when'reminder'then array[]::text[]when'handoff'then array[]::text[]when'end'then array[]::text[]else array['next']end;
  select coalesce(array_agg(coalesce(x->>'sourceHandle','next')),'{}')into h from jsonb_array_elements(g->'edges')x where x->>'source'=v_node->>'id';
  if cardinality(h)<>cardinality(allowed)or exists(select 1 from unnest(h)x where not(x=any(allowed)))or(select count(distinct x)from unnest(h)x)<>cardinality(h)then raise exception 'flow_graph_branches_invalid';end if;
  if v_node->>'kind'='trigger'and exists(select 1 from jsonb_array_elements(g->'edges')x where x->>'target'=v_node->>'id')then raise exception 'flow_graph_trigger_invalid';end if;
  if v_node->>'kind'='delay'and((v_node#>>'{config,waitHours}')::integer not between 1 and 168)then raise exception 'flow_delay_invalid';end if;
  if v_node->>'kind'='message'and length(btrim(v_node#>>'{config,message}'))not between 1 and 2000 then raise exception 'flow_message_invalid';end if;
 end loop;
 -- Kahn admission is O(nodes*edges); do not enumerate exponentially many DAG paths.
 while cardinality(seen)<count_nodes loop
  select n->>'id' into current from jsonb_array_elements(g->'nodes')n
  where not(n->>'id'=any(seen))and not exists(select 1 from jsonb_array_elements(g->'edges')e where e->>'target'=n->>'id'and not(e->>'source'=any(seen)))limit 1;
  if current is null then raise exception 'flow_graph_cycle_invalid';end if;
  seen=array_append(seen,current);
 end loop;
 seen='{}';
 select array[x->>'id']into front from jsonb_array_elements(g->'nodes')x where x->>'kind'='trigger';
 while cardinality(front)>0 loop current=front[1];front=front[2:];if current=any(seen)then continue;end if;seen=array_append(seen,current);
  select front||coalesce(array_agg(x->>'target'),'{}')into front from jsonb_array_elements(g->'edges')x where x->>'source'=current;
 end loop;
 if cardinality(seen)<>count_nodes then raise exception 'flow_graph_unreachable_invalid';end if;
end;$$;
create function smartvolt_private.flow_inbound(p_company uuid,p_provider text,p_thread uuid)returns text language sql stable security invoker set search_path=''as $$
 select id::text from(
 select id,created_at from public.sv_wa_messages where p_provider='whatsapp'and company_id=p_company and conversation_id=p_thread and direction='incoming'
 union all select id,created_at from public.sv_meta_messages where p_provider='meta'and company_id=p_company and thread_id=p_thread and direction='inbound'
 )q order by created_at desc,id desc limit 1
$$;
create function smartvolt_private.flow_event(p_company uuid,p_run uuid,p_node text,p_kind text,p_state text,p_detail jsonb default '{}')returns void language sql volatile security invoker set search_path=''as $$
 insert into public.sv_flow_steps(company_id,run_id,node_id,kind,state,detail)values(p_company,p_run,p_node,p_kind,p_state,p_detail)on conflict do nothing
$$;
create function smartvolt_private.flow_stop(p_company uuid,p_run uuid,p_reason text)returns void language plpgsql security invoker set search_path=''as $$declare r public.sv_flow_runs;begin
 select *into r from public.sv_flow_runs where company_id=p_company and id=p_run;
 update public.sv_delivery_jobs set state='cancelled',reason=p_reason,updated_at=now()where company_id=p_company and origin='flow'and source_id=p_run and state='scheduled';
 update public.sv_flow_runs set state='stopped',reason=p_reason,updated_at=now()where company_id=p_company and id=p_run and state not in('completed','stopped','handoff');
 if found then perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'control','stopped',jsonb_build_object('reason',p_reason));end if;
end;$$;
create function smartvolt_private.flow_guard(r public.sv_flow_runs)returns text language plpgsql security invoker set search_path=''as $$declare d public.sv_flow_definitions;version_row public.sv_flow_versions;begin
 select *into d from public.sv_flow_definitions where company_id=r.company_id and flow_id=r.flow_id;
 select *into version_row from public.sv_flow_versions where company_id=r.company_id and flow_id=r.flow_id and version=r.version;
 if d.flow_id is null or not d.enabled or version_row.flow_id is null then return 'flow_changed';end if;
 if not exists(select 1 from public.sv_memberships where company_id=r.company_id and user_id=version_row.created_by and status='active'and role in('owner','manager'))or not smartvolt_private.member_has_product(r.company_id,version_row.created_by,'crm')or not smartvolt_private.member_brand_allowed(r.company_id,version_row.created_by,r.brand_id)
 or(r.source_product='pos'and not smartvolt_private.member_has_product(r.company_id,version_row.created_by,'pos'))then return 'authority_changed';end if;
 if not exists(select 1 from public.sv_customer_threads where company_id=r.company_id and provider=r.provider and thread_id=r.thread_id and customer_id=r.customer_id and brand_id=r.brand_id)then return 'customer_changed';end if;
 if smartvolt_private.flow_inbound(r.company_id,r.provider,r.thread_id)is distinct from r.anchor_inbound then return 'customer_replied';end if;
 if r.source_key not like'manual:%'and not exists(select 1 from public.sv_journey_sources where company_id=r.company_id and source_key=r.source_key and source_version=r.source_version and active)then return 'source_changed';end if;
 if r.context->>'bookingId'is not null and not exists(select 1 from public.sv_booking_requests b where b.company_id=r.company_id and b.id=(r.context->>'bookingId')::uuid and b.customer_id=r.customer_id and b.brand_id=r.brand_id and b.provider=r.provider and b.thread_id=r.thread_id and b.status='confirmed'and b.revision=(r.context->>'bookingRevision')::bigint)then return 'booking_changed';end if;
 return null;end;$$;
create function smartvolt_private.flow_enroll(p_company uuid,p_flow text,p_source text,p_version text,p_customer text,p_brand text,p_provider text,p_thread uuid,p_product text default'crm',p_context jsonb default'{}')returns uuid language plpgsql security invoker set search_path=''as $$
declare d public.sv_flow_definitions;g jsonb;run_id uuid;begin
 select *into d from public.sv_flow_definitions where company_id=p_company and flow_id=p_flow and enabled;if not found or d.brand_id<>p_brand or d.provider<>p_provider then return null;end if;
 if not smartvolt_private.member_has_product(p_company,d.created_by,'crm')or not smartvolt_private.member_brand_allowed(p_company,d.created_by,p_brand)or(p_product='pos'and not smartvolt_private.member_has_product(p_company,d.created_by,'pos'))then return null;end if;
 if p_provider='whatsapp'and not exists(select 1 from public.sv_wa_conversations c where c.company_id=p_company and c.id=p_thread and c.connection_id=d.connection_id)then return null;
 elsif p_provider='meta'and not exists(select 1 from public.sv_meta_threads c where c.company_id=p_company and c.id=p_thread and c.connection_id=d.connection_id)then return null;end if;
 select graph into strict g from public.sv_flow_versions where company_id=p_company and flow_id=p_flow and version=d.published_version;
 insert into public.sv_flow_runs(company_id,flow_id,version,source_key,source_version,source_product,customer_id,brand_id,provider,thread_id,anchor_inbound,node_id,context)
 select p_company,p_flow,d.published_version,p_source,p_version,p_product,p_customer,p_brand,p_provider,p_thread,smartvolt_private.flow_inbound(p_company,p_provider,p_thread),n->>'id',p_context
 from jsonb_array_elements(g->'nodes')n where n->>'kind'='trigger'on conflict do nothing returning id into run_id;
 if run_id is null then select id into run_id from public.sv_flow_runs where company_id=p_company and flow_id=p_flow and version=d.published_version and source_key=p_source and source_version=p_version;end if;
 return run_id;end;$$;
-- Only source evidence created after publication can start a new automatic run.
create function smartvolt_private.flow_source_event()returns trigger language plpgsql security invoker set search_path=''as $$declare d public.sv_flow_definitions;t record;r record;begin
 if tg_op='UPDATE'and(old.source_version,old.active)=(new.source_version,new.active)then return new;end if;
 for r in select id from public.sv_flow_runs where company_id=new.company_id and source_key=new.source_key and(source_version<>new.source_version or not new.active)and state not in('completed','stopped','handoff')loop perform smartvolt_private.flow_stop(new.company_id,r.id,'source_changed');end loop;
 if not new.active then return new;end if;
 for d in select *from public.sv_flow_definitions where company_id=new.company_id and brand_id=new.brand_id and trigger_kind=new.recipe and enabled and published_at<=statement_timestamp()loop
  select i.provider,i.thread_id into t from smartvolt_private.ops_inquiries i where i.company_id=new.company_id and i.customer_id=new.customer_id and i.brand_id=new.brand_id and i.provider=d.provider and(new.thread_id is null or i.thread_id=new.thread_id)
   and((d.provider='whatsapp'and exists(select 1 from public.sv_wa_conversations c where c.company_id=i.company_id and c.id=i.thread_id and c.connection_id=d.connection_id))or(d.provider='meta'and exists(select 1 from public.sv_meta_threads c where c.company_id=i.company_id and c.id=i.thread_id and c.connection_id=d.connection_id)))order by i.updated_at desc,i.thread_id limit 1;
  if found then perform smartvolt_private.flow_enroll(new.company_id,d.flow_id,new.source_key,new.source_version,new.customer_id,new.brand_id,t.provider,t.thread_id,new.product,new.context);end if;
 end loop;return new;end;$$;
create trigger sv_flow_source after insert or update on public.sv_journey_sources for each row execute function smartvolt_private.flow_source_event();
create function smartvolt_private.flow_step(p_company uuid,p_run uuid)returns boolean language plpgsql security invoker set search_path=''as $$
declare r public.sv_flow_runs;d public.sv_flow_definitions;v public.sv_flow_versions;n jsonb;e jsonb;next_id text;branch text;why text;v_body text;last_text text;
 definition jsonb;rendered jsonb;article jsonb;ctx jsonb;task uuid;owner_id uuid;reminder_due timestamptz;job public.sv_delivery_jobs;t record;b public.sv_booking_requests;begin
 select *into r from public.sv_flow_runs where company_id=p_company and id=p_run for update skip locked;
 if not found or r.state not in('active','waiting','delivery')or r.due_at>statement_timestamp()then return false;end if;
 why=smartvolt_private.flow_guard(r);if why is not null then perform smartvolt_private.flow_stop(p_company,p_run,why);return true;end if;
 select *into strict d from public.sv_flow_definitions where company_id=p_company and flow_id=r.flow_id;
 select *into strict v from public.sv_flow_versions where company_id=p_company and flow_id=r.flow_id and version=r.version;
 d=jsonb_populate_record(d,v.settings);
 select value into strict n from jsonb_array_elements(v.graph->'nodes')where value->>'id'=r.node_id;
 if exists(select 1 from public.sv_delivery_policies where company_id=p_company and automations_paused)then
  update public.sv_flow_runs set due_at=now()+interval'15 minutes',reason='execution_paused',updated_at=now()where company_id=p_company and id=p_run;return false;
 end if;
 if r.state='delivery'then
  select *into job from public.sv_delivery_jobs where company_id=p_company and id=r.job_id;
  if job.state in('scheduled','dispatching')then update public.sv_flow_runs set due_at=now()+interval'1 minute'where company_id=p_company and id=p_run;return false;end if;
  if job.state not in('accepted','sent','delivered','read')then perform smartvolt_private.flow_stop(p_company,p_run,coalesce(job.reason,'delivery_pending'));return true;end if;
  perform smartvolt_private.flow_event(p_company,p_run,r.node_id,n->>'kind','completed',jsonb_build_object('jobId',job.id,'deliveryState',job.state));
 elsif r.state='waiting'and n->>'kind'='delay'then
  perform smartvolt_private.flow_event(p_company,p_run,r.node_id,n->>'kind','completed');
 else
  ctx=r.context;
  select body into last_text from(
   select body,created_at,id from public.sv_wa_messages where r.provider='whatsapp'and company_id=p_company and id::text=r.anchor_inbound
   union all select body,created_at,id from public.sv_meta_messages where r.provider='meta'and company_id=p_company and id::text=r.anchor_inbound
  )q limit 1;
  if n->>'kind'='intent'then
   select case when count(*)=1 then min(key)else'handoff'end into branch
    from jsonb_each(coalesce(n#>'{config,routing}','{}'))x
    where x.key in('faq','booking','handoff')and exists(select 1 from jsonb_array_elements_text(x.value)word where length(word)>0 and strpos(lower(coalesce(last_text,'')),lower(word))>0);
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'intent','completed',jsonb_build_object('branch',branch,'method','keyword_route'));
  elsif n->>'kind'='condition'then
   branch=case when exists(select 1 from public.sv_booking_requests where company_id=p_company and customer_id=r.customer_id and brand_id=r.brand_id and status in('confirmed','linked'))then'existing'else'new'end;
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'condition','completed',jsonb_build_object('branch',branch,'source','confirmed_crm_booking'));
  elsif n->>'kind'='delay'then
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'delay','waiting',jsonb_build_object('hours',(n#>>'{config,waitHours}')::integer));
   update public.sv_flow_runs set state='waiting',due_at=now()+make_interval(hours=>(n#>>'{config,waitHours}')::integer),updated_at=now(),reason=null where company_id=p_company and id=p_run;return true;
  elsif n->>'kind'='review'then
   -- Review never turns a stage or supplied form into a confirmed appointment.
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'review','review',jsonb_build_object('requires','exact_confirmed_booking'));
   update public.sv_flow_runs set state='review',reason='awaiting_confirmed_booking',updated_at=now()where company_id=p_company and id=p_run;return true;
  elsif n->>'kind'='form'then
   task=md5(p_run::text||':'||r.node_id||':task')::uuid;
   perform public.sv_ops_action(p_company,d.created_by,task,'followup-create',jsonb_build_object('provider',r.provider,'threadId',r.thread_id,'title','Flow｜收集預約意向：'||left(n->>'title',160),'dueAt',now(),'ownerId',null));
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'form','form',jsonb_build_object('taskId',task,'requires','staff_source_intake'));
   update public.sv_flow_runs set state='form',reason='awaiting_intake',updated_at=now()where company_id=p_company and id=p_run;return true;
  elsif n->>'kind'in('followup','handoff')then
   owner_id=case when n->>'kind'='handoff'then(n#>>'{config,owner}')::uuid else null end;
   if owner_id is not null and(not smartvolt_private.member_has_product(p_company,owner_id,'crm')or not smartvolt_private.member_brand_allowed(p_company,owner_id,r.brand_id))then perform smartvolt_private.flow_stop(p_company,p_run,'assignee_changed');return true;end if;
   task=md5(p_run::text||':'||r.node_id||':task')::uuid;
   perform public.sv_ops_action(p_company,d.created_by,task,'followup-create',jsonb_build_object('provider',r.provider,'threadId',r.thread_id,'title','Flow｜'||left(n->>'title',190),'dueAt',now(),'ownerId',owner_id));
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,n->>'kind','completed',jsonb_build_object('taskId',task));
   if n->>'kind'='handoff'then
    -- Move the run to its terminal state before the ordinary thread-handoff audit trigger.
    update public.sv_flow_runs set state='handoff',reason='human_takeover',updated_at=now()where company_id=p_company and id=p_run;
    select *into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=r.provider and thread_id=r.thread_id;
    if r.provider='whatsapp'then
     perform public.sv_wa_manage_thread(p_company,d.created_by,r.thread_id,md5(p_run::text||':'||r.node_id||':handoff')::uuid,t.revision,
      jsonb_build_object('customer_name',(select customer_name from public.sv_wa_conversations where company_id=p_company and id=r.thread_id),'assignee_id',owner_id,'priority',t.priority,'follow_up_at',now(),'next_step','Flow 真人交接：'||left(n->>'title',400),'status','open'));
    else
     perform public.sv_meta_manage_thread(p_company,d.created_by,r.thread_id,md5(p_run::text||':'||r.node_id||':handoff')::uuid,t.revision,
      jsonb_build_object('customer_name',(select customer_name from public.sv_meta_threads where company_id=p_company and id=r.thread_id),'assignee_id',owner_id,'priority',t.priority,'follow_up_at',now(),'next_step','Flow 真人交接：'||left(n->>'title',400),'status','open'));
    end if;return true;
   end if;
  elsif n->>'kind'in('message','reminder','answer')then
   if n->>'kind'='reminder'then
    if r.context->>'bookingId'is null then perform smartvolt_private.flow_stop(p_company,p_run,'confirmed_booking_required');return true;end if;
    select *into strict b from public.sv_booking_requests where company_id=p_company and id=(r.context->>'bookingId')::uuid;
    if b.desired_at<=now()then perform smartvolt_private.flow_stop(p_company,p_run,'appointment_expired');return true;end if;
    reminder_due=((date_trunc('day',b.desired_at at time zone'Asia/Hong_Kong')-interval'1 day')+make_interval(hours=>(n#>>'{config,reminderHour}')::integer))at time zone'Asia/Hong_Kong';
    if reminder_due>now()then
     perform smartvolt_private.flow_event(p_company,p_run,r.node_id,'reminder','waiting',jsonb_build_object('dueAt',reminder_due));
     update public.sv_flow_runs set state='waiting',due_at=reminder_due,reason='reminder_due',updated_at=now()where company_id=p_company and id=p_run;return true;
    end if;
   end if;
   if n->>'kind'='answer'then
    select a into article from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,articles}')a
     where w.company_id=p_company and a->>'brandId'=r.brand_id and a->>'status'='approved'and(a->>'validUntil')::date>=(now()at time zone'Asia/Hong_Kong')::date
     and(a#>>'{coaching,kind}')is distinct from'pattern'and exists(select 1 from jsonb_array_elements_text(a->'keywords')k where length(k)>0 and strpos(lower(coalesce(last_text,'')),lower(k))>0)
     order by(a->>'revision')::integer desc,a->>'id'limit 1;
    if article is null then perform smartvolt_private.flow_stop(p_company,p_run,'knowledge_missing');return true;end if;
    v_body=article->>'content';ctx=ctx||jsonb_build_object('knowledgeId',article->>'id','knowledgeRevision',article->'revision','knowledgeHash',md5(article::text));
    definition=jsonb_build_object('kind','text','body',v_body,'values','[]'::jsonb);
   elsif v.deliveries ? r.node_id then definition=v.deliveries->r.node_id;
   elsif n->>'kind'='reminder'then
    if r.context->>'bookingId'is null then perform smartvolt_private.flow_stop(p_company,p_run,'confirmed_booking_required');return true;end if;
    definition=jsonb_build_object('kind','text','body',n#>>'{config,template}','values','[]'::jsonb);
   else definition=jsonb_build_object('kind','text','body',n#>>'{config,message}','values','[]'::jsonb);end if;
   select ctx||jsonb_build_object('brand',brand_item->>'name')into ctx from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')brand_item where w.company_id=p_company and brand_item->>'id'=r.brand_id;
   rendered=smartvolt_private.delivery_render(definition,(select name from public.sv_customers where company_id=p_company and id=r.customer_id),ctx);
   if rendered is null or length(rendered->>'body')>(case when r.provider='meta'then 1000 else 4096 end) then perform smartvolt_private.flow_stop(p_company,p_run,'source_details_missing');return true;end if;
   select *into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=r.provider and thread_id=r.thread_id;
   insert into public.sv_delivery_jobs(company_id,brand_id,customer_id,provider,channel,connection_id,thread_id,purpose,origin,source_id,source_key,actor_id,payload,due_at)
    values(p_company,r.brand_id,r.customer_id,r.provider,t.channel,d.connection_id,r.thread_id,d.purpose,'flow',p_run,'flow:'||p_run||':'||r.node_id,d.created_by,rendered,now())on conflict(company_id,source_key)do nothing returning *into job;
   if job.id is null then select *into strict job from public.sv_delivery_jobs where company_id=p_company and source_key='flow:'||p_run||':'||r.node_id;end if;
   perform smartvolt_private.flow_event(p_company,p_run,r.node_id,n->>'kind','queued',jsonb_build_object('jobId',job.id,'knowledgeId',ctx->>'knowledgeId','knowledgeRevision',ctx->'knowledgeRevision'));
   update public.sv_flow_runs set state='delivery',context=ctx,job_id=job.id,due_at=now(),reason=null,updated_at=now()where company_id=p_company and id=p_run;return true;
  else perform smartvolt_private.flow_event(p_company,p_run,r.node_id,n->>'kind','completed');end if;
 end if;
 select x->>'target'into next_id from jsonb_array_elements(v.graph->'edges')x where x->>'source'=r.node_id and coalesce(x->>'sourceHandle','next')=coalesce(branch,'next');
 update public.sv_flow_runs set node_id=coalesce(next_id,r.node_id),state=case when next_id is null then'completed'else'active'end,job_id=null,due_at=now(),reason=null,updated_at=now()where company_id=p_company and id=p_run;
 return true;
end;$$;
create function public.sv_flow_catchup(p_company uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare r record;n integer:=0;i integer;begin
 -- Fair bounded selection; row locks are short and every side effect is in this transaction.
 for r in select id from public.sv_flow_runs where company_id=p_company and state in('active','waiting','delivery')and due_at<=now()order by due_at,id limit 40 loop
  for i in 1..12 loop if not smartvolt_private.flow_step(p_company,r.id)then exit;end if;n=n+1;end loop;
 end loop;return jsonb_build_object('advanced',n);end;$$;
create function smartvolt_private.flow_delivery_admit(j public.sv_delivery_jobs)returns text language plpgsql security invoker set search_path=''as $$declare r public.sv_flow_runs;a jsonb;why text;begin
 if j.origin<>'flow'then return null;end if;
 select *into r from public.sv_flow_runs where company_id=j.company_id and id=j.source_id;
 if r.id is null or r.state<>'delivery'or r.job_id is distinct from j.id then return 'flow_changed';end if;
 why=smartvolt_private.flow_guard(r);if why is not null then return why;end if;
 if r.context->>'knowledgeId'is not null then
  select x into a from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,articles}')x where w.company_id=j.company_id and x->>'id'=r.context->>'knowledgeId';
  if a is null or a->>'status'<>'approved'or(a->>'validUntil')::date<(now()at time zone'Asia/Hong_Kong')::date or md5(a::text)<>r.context->>'knowledgeHash'then return 'knowledge_changed';end if;
 end if;return null;end;$$;
-- Extend the existing admission hook without replacing consent/template/lease/quiet-hour gates.
do $$declare definition text;begin
 definition=pg_get_functiondef('smartvolt_private.delivery_editor_admit(public.sv_delivery_jobs)'::regprocedure);
 execute replace(definition,'FUNCTION smartvolt_private.delivery_editor_admit(', 'FUNCTION smartvolt_private.flow_existing_editor_admit(');
end;$$;
create or replace function smartvolt_private.delivery_editor_admit(p_job public.sv_delivery_jobs)returns text language plpgsql volatile security invoker set search_path=''as $$declare why text;begin
 why=smartvolt_private.flow_existing_editor_admit(p_job);if why is not null then return why;end if;return smartvolt_private.flow_delivery_admit(p_job);end;$$;
create function public.sv_flow_receipt(p_company uuid,p_actor uuid,p_command uuid,p_request jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$declare f text;brand text;begin
 f=coalesce(p_request#>>'{flow,id}',p_request->>'flowId');
 select brand_id into brand from public.sv_flow_definitions where company_id=p_company and flow_id=f;
 perform public.sv_authorize(p_company,p_actor,'crm',true,false,coalesce(brand,p_request#>>'{flow,brandId}'));
 return smartvolt_private.action_replay(p_company,p_actor,p_command,'flow:'||(p_request->>'action'),p_request);
end;$$;
create function public.sv_flow_action(p_company uuid,p_actor uuid,p_command uuid,p_action text,p_data jsonb,p_request jsonb default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare d public.sv_flow_definitions;f text:=coalesce(p_data#>>'{flow,id}',p_data->>'flowId');g jsonb;actual jsonb;r public.sv_flow_runs;result jsonb;brand text;v integer;t record;why text;
 requested jsonb:=coalesce(p_request,p_data);b public.sv_booking_requests;ctx jsonb;node jsonb;next_id text;run_id uuid;owner_id uuid;del jsonb;entry record;begin
 if p_command is null or p_action not in('publish','toggle','enroll','cancel','continue')or length(f)not between 1 and 100 or octet_length(requested::text)>150000 then raise exception 'flow_action_invalid';end if;
 select *into d from public.sv_flow_definitions where company_id=p_company and flow_id=f;
 brand=coalesce(d.brand_id,p_data#>>'{flow,brandId}');perform public.sv_authorize(p_company,p_actor,'crm',true,p_action in('publish','toggle'),brand);
 perform pg_advisory_xact_lock(hashtextextended('flow:'||p_company||':'||f,0));
 result=smartvolt_private.action_replay(p_company,p_actor,p_command,'flow:'||p_action,requested);if result is not null then return result;end if;
 select *into d from public.sv_flow_definitions where company_id=p_company and flow_id=f for update;
 if p_action='publish'then
  g=p_data->'flow';perform smartvolt_private.flow_graph_check(g);
  select x into actual from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,flows}')x where w.company_id=p_company and x->>'id'=f;
  if actual is null or actual is distinct from g or g->>'clientId'<>p_company::text or(d.flow_id is not null and d.brand_id<>g->>'brandId')then raise exception 'flow_draft_changed';end if;
  if coalesce(d.revision,0)is distinct from(p_data->>'revision')::bigint then raise exception 'flow_revision_conflict';end if;
  if p_data->>'trigger'not in('manual','unanswered','appointment','completed')or p_data->>'provider'not in('whatsapp','meta')or p_data->>'purpose'not in('service','marketing')or jsonb_typeof(p_data->'enabled')is distinct from'boolean'then raise exception 'flow_publication_invalid';end if;
  if p_data->>'trigger'='completed'and not smartvolt_private.member_has_product(p_company,p_actor,'pos')then raise exception 'product_required';end if;
  if not exists(select 1 from public.sv_wa_connections where p_data->>'provider'='whatsapp'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=brand
   union all select 1 from public.sv_meta_connections where p_data->>'provider'='meta'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=brand)then raise exception 'brand_scope';end if;
  for node in select value from jsonb_array_elements(g->'nodes')where value->>'kind'='handoff'loop
   owner_id=(node#>>'{config,owner}')::uuid;
   if owner_id is null or not smartvolt_private.member_has_product(p_company,owner_id,'crm')or not smartvolt_private.member_brand_allowed(p_company,owner_id,brand)or not exists(select 1 from public.sv_memberships where company_id=p_company and user_id=owner_id and status='active'and role<>'viewer')then raise exception 'flow_assignee_invalid';end if;
  end loop;
  if jsonb_typeof(p_data->'deliveries')is distinct from'object'or(select count(*)from jsonb_object_keys(p_data->'deliveries'))>60 then raise exception 'flow_delivery_invalid';end if;
  for entry in select key,value from jsonb_each(p_data->'deliveries')loop
   del=entry.value;
   if not exists(select 1 from jsonb_array_elements(g->'nodes')n where n->>'id'=entry.key and n->>'kind'in('message','reminder'))or jsonb_typeof(del)is distinct from'object'or del->>'kind'not in('text','template')or length(del->>'body')not between 1 and 4096 or jsonb_typeof(del->'values')is distinct from'array'or jsonb_array_length(del->'values')>40 or(del->>'kind'='template'and(del->>'fingerprint'!~'^[a-f0-9]{64}$'or del->>'name'is null or del->>'locale'is null))
    or(p_data->>'provider'='meta'and(del->>'kind'<>'text'or length(del->>'body')>1000))then raise exception 'flow_delivery_invalid';end if;
  end loop;
  insert into public.sv_delivery_policies(company_id)values(p_company)on conflict(company_id)do nothing;
  v=coalesce(d.published_version,0)+1;
  insert into public.sv_flow_definitions(company_id,flow_id,brand_id,name,trigger_kind,provider,connection_id,purpose,enabled,revision,published_version,created_by)
   values(p_company,f,brand,g->>'name',p_data->>'trigger',p_data->>'provider',(p_data->>'connectionId')::uuid,p_data->>'purpose',(p_data->>'enabled')::boolean,coalesce(d.revision,0)+1,v,p_actor)
   on conflict(company_id,flow_id)do update set name=excluded.name,trigger_kind=excluded.trigger_kind,provider=excluded.provider,connection_id=excluded.connection_id,purpose=excluded.purpose,enabled=excluded.enabled,revision=excluded.revision,published_version=excluded.published_version,created_by=p_actor,published_at=now(),updated_at=now();
  insert into public.sv_flow_versions(company_id,flow_id,version,graph,deliveries,settings,created_by)values(p_company,f,v,g,p_data->'deliveries',jsonb_build_object('provider',p_data->>'provider','connection_id',p_data->>'connectionId','purpose',p_data->>'purpose','created_by',p_actor,'brand_id',brand),p_actor);
  if not(p_data->>'enabled')::boolean then for t in select id from public.sv_flow_runs where company_id=p_company and flow_id=f and state not in('completed','stopped','handoff')order by id loop perform smartvolt_private.flow_stop(p_company,t.id,'flow_paused');end loop;end if;
  result=jsonb_build_object('saved',true,'version',v);
 elsif p_action='toggle'then
  if d.flow_id is null then raise exception 'flow_missing';end if;
  if d.revision is distinct from(p_data->>'revision')::bigint then raise exception 'flow_revision_conflict';end if;
  if jsonb_typeof(p_data->'enabled')is distinct from'boolean'then raise exception 'flow_invalid';end if;
  update public.sv_flow_definitions set enabled=(p_data->>'enabled')::boolean,revision=revision+1,updated_at=now()where company_id=p_company and flow_id=f;
  for t in select id from public.sv_flow_runs where company_id=p_company and flow_id=f and state not in('completed','stopped','handoff')order by id loop perform smartvolt_private.flow_stop(p_company,t.id,'flow_paused');end loop;
  result=jsonb_build_object('saved',true);
 elsif p_action='enroll'then
  if d.flow_id is null or not d.enabled then raise exception 'flow_not_ready';end if;
  perform public.sv_thread_scope(p_company,p_actor,d.provider,(p_data->>'threadId')::uuid);
  select *into strict t from public.sv_customer_threads where company_id=p_company and provider=d.provider and thread_id=(p_data->>'threadId')::uuid and brand_id=d.brand_id;
  run_id=smartvolt_private.flow_enroll(p_company,f,'manual:'||t.provider||':'||t.thread_id,coalesce(smartvolt_private.flow_inbound(p_company,t.provider,t.thread_id),'no-inbound'),t.customer_id,t.brand_id,t.provider,t.thread_id);
  if run_id is null then raise exception 'flow_thread_invalid';end if;result=jsonb_build_object('saved',true,'runId',run_id);
 else
  select *into strict r from public.sv_flow_runs where company_id=p_company and id=(p_data->>'runId')::uuid and flow_id=f for update;
  perform public.sv_thread_scope(p_company,p_actor,r.provider,r.thread_id);
  if r.source_product='pos'and not smartvolt_private.member_has_product(p_company,p_actor,'pos')then raise exception 'product_required';end if;
  if p_action='cancel'then perform smartvolt_private.flow_stop(p_company,r.id,'staff_cancelled');result=jsonb_build_object('saved',true);
  else
   why=smartvolt_private.flow_guard(r);if why is not null then raise exception 'flow_source_changed';end if;
   if r.node_id is distinct from p_data->>'nodeId'or r.state not in('review','form')then raise exception 'flow_review_changed';end if;
   if r.state='review'then
    select *into strict b from public.sv_booking_requests where company_id=p_company and id=(p_data->>'bookingId')::uuid and customer_id=r.customer_id and brand_id=r.brand_id and provider=r.provider and thread_id=r.thread_id and status='confirmed'
     and(created_at>=r.created_at or r.source_key='crm-booking:'||id);
    ctx=r.context||jsonb_build_object('bookingId',b.id,'bookingRevision',b.revision,'service',b.service,'date',to_char(b.desired_at at time zone'Asia/Hong_Kong','YYYY-MM-DD'),'time',to_char(b.desired_at at time zone'Asia/Hong_Kong','HH24:MI'));
   else
    if length(btrim(p_data#>>'{fields,service}'))not between 1 and 100 or(p_data#>>'{fields,desiredAt}')::timestamptz is null or not isfinite((p_data#>>'{fields,desiredAt}')::timestamptz)or length(p_data#>>'{fields,note}')>1000 then raise exception 'flow_intake_invalid';end if;
    insert into public.sv_flow_forms(company_id,run_id,node_id,actor_id,fields)values(p_company,r.id,r.node_id,p_actor,p_data->'fields');
    ctx=r.context||jsonb_build_object('intakeId',r.id,'requestedService',p_data#>>'{fields,service}','requestedAt',p_data#>>'{fields,desiredAt}');
   end if;
   perform smartvolt_private.flow_event(p_company,r.id,r.node_id,r.state,'completed',jsonb_build_object('actorId',p_actor,'bookingId',ctx->>'bookingId'));
   select e->>'target'into next_id from public.sv_flow_versions v,jsonb_array_elements(v.graph->'edges')e where v.company_id=p_company and v.flow_id=f and v.version=r.version and e->>'source'=r.node_id and e->>'sourceHandle'is null;
   if next_id is null then raise exception 'flow_graph_invalid';end if;
   update public.sv_flow_runs set context=ctx,node_id=next_id,state='active',due_at=now(),reason=null,updated_at=now()where company_id=p_company and id=r.id;
   result=jsonb_build_object('saved',true);
  end if;
 end if;
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'flow:'||p_action,requested,result);return result;
end;$$;
create function public.sv_flow_read(p_company uuid,p_actor uuid,p_flow text,p_before timestamptz default null,p_before_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$declare d public.sv_flow_definitions;brand text;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 select *into d from public.sv_flow_definitions where company_id=p_company and flow_id=p_flow;
 brand=d.brand_id;
 if brand is null then select x->>'brandId'into brand from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,flows}')x where w.company_id=p_company and x->>'id'=p_flow;end if;
 perform public.sv_member_scope(p_company,p_actor,brand,'crm');
 if(p_before is null)<>(p_before_id is null)then raise exception 'flow_cursor_invalid';end if;
 return jsonb_build_object('publication',case when d.flow_id is null then null else(
  select to_jsonb(d)-array['company_id','created_by','published_at']||jsonb_build_object('graph',v.graph,'deliveries',v.deliveries,
   'active',(select count(*)from public.sv_flow_runs r where r.company_id=p_company and r.flow_id=p_flow and r.state not in('completed','stopped','handoff')and(r.source_product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))))
  from public.sv_flow_versions v where v.company_id=p_company and v.flow_id=p_flow and v.version=d.published_version)end,
  'runs',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(
   select r.id,r.flow_id,r.version,r.provider,r.thread_id,c.name customer_name,r.node_id,r.state,r.reason,r.due_at,r.created_at,r.updated_at,
   (select n->>'title'from public.sv_flow_versions v,jsonb_array_elements(v.graph->'nodes')n where v.company_id=r.company_id and v.flow_id=r.flow_id and v.version=r.version and n->>'id'=r.node_id)node_title,
   coalesce((select jsonb_agg(jsonb_build_object('node_id',s.node_id,'kind',s.kind,'state',s.state,'detail',s.detail,'created_at',s.created_at)order by s.created_at,s.id)from public.sv_flow_steps s where s.company_id=r.company_id and s.run_id=r.id),'[]')steps,
   coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'service',b.service,'desiredAt',b.desired_at))from public.sv_booking_requests b where b.company_id=r.company_id and b.customer_id=r.customer_id and b.brand_id=r.brand_id and b.provider=r.provider and b.thread_id=r.thread_id and b.status='confirmed'and(b.created_at>=r.created_at or r.source_key='crm-booking:'||b.id)),'[]')bookings
   from public.sv_flow_runs r join public.sv_customers c on c.company_id=r.company_id and c.id=r.customer_id
   where r.company_id=p_company and r.flow_id=p_flow and(r.source_product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))
    and(p_before is null or(r.created_at,r.id)<(p_before,p_before_id))order by r.created_at desc,r.id desc limit 21
  )q),'[]'),
  'threads',coalesce((select jsonb_agg(q order by q.updated_at desc,q.id)from(
   select i.thread_id id,i.provider,c.name,i.channel,i.brand_id,case when i.provider='whatsapp'then wc.connection_id else mt.connection_id end connection_id,i.updated_at
   from smartvolt_private.ops_inquiries i join public.sv_customers c on c.company_id=i.company_id and c.id=i.customer_id
   left join public.sv_wa_conversations wc on i.provider='whatsapp'and wc.company_id=i.company_id and wc.id=i.thread_id
   left join public.sv_meta_threads mt on i.provider='meta'and mt.company_id=i.company_id and mt.id=i.thread_id
   where i.company_id=p_company and i.brand_id=brand and i.status='open'order by i.updated_at desc,i.thread_id limit 50
  )q),'[]'));
end;$$;
create function smartvolt_private.flow_message_changed()returns trigger language plpgsql security invoker set search_path=''as $$declare v_provider text;thread uuid;r record;begin
 v_provider=case when tg_table_name='sv_wa_messages'then'whatsapp'else'meta'end;
 thread=coalesce(to_jsonb(new)->>'conversation_id',to_jsonb(new)->>'thread_id')::uuid;
 if new.direction='note'then return new;end if;
 if exists(select 1 from public.sv_delivery_jobs where company_id=new.company_id and id=new.client_id)then return new;end if;
 for r in select id from public.sv_flow_runs where company_id=new.company_id and sv_flow_runs.provider=v_provider and thread_id=thread and state not in('completed','stopped','handoff')order by id loop
  perform smartvolt_private.flow_stop(new.company_id,r.id,case when new.direction in('incoming','inbound')then'customer_replied'else'human_replied'end);
 end loop;return new;end;$$;
create trigger sv_flow_wa_message after insert on public.sv_wa_messages for each row execute function smartvolt_private.flow_message_changed();
create trigger sv_flow_meta_message after insert on public.sv_meta_messages for each row execute function smartvolt_private.flow_message_changed();
create function smartvolt_private.flow_handoff_changed()returns trigger language plpgsql security invoker set search_path=''as $$declare v_provider text;r record;begin
 if new.previous->'assignee_id'is not distinct from new.next->'assignee_id'and new.next->>'status'<>'resolved'then return new;end if;
 v_provider=case when tg_table_name='sv_wa_thread_activity'then'whatsapp'else'meta'end;
 for r in select id from public.sv_flow_runs where company_id=new.company_id and sv_flow_runs.provider=v_provider and thread_id=new.thread_id and state not in('completed','stopped','handoff')order by id loop perform smartvolt_private.flow_stop(new.company_id,r.id,'human_takeover');end loop;return new;end;$$;
create trigger sv_flow_wa_handoff after insert on public.sv_wa_thread_activity for each row execute function smartvolt_private.flow_handoff_changed();
create trigger sv_flow_meta_handoff after insert on public.sv_meta_thread_activity for each row execute function smartvolt_private.flow_handoff_changed();

do $$declare t text;f record;begin
 foreach t in array array['sv_flow_definitions','sv_flow_versions','sv_flow_runs','sv_flow_steps','sv_flow_forms']loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on public.%I to service_role',t);
 end loop;
 grant update on public.sv_flow_definitions,public.sv_flow_runs to service_role;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='smartvolt_private'and(p.proname like'flow_%'or p.proname='delivery_editor_admit'))or(n.nspname='public'and p.proname like'sv_flow_%')loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end;$$;
create trigger sv_flow_versions_immutable before update or delete on public.sv_flow_versions for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_flow_steps_immutable before update or delete on public.sv_flow_steps for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_flow_forms_immutable before update or delete on public.sv_flow_forms for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_flow_versions_no_truncate before truncate on public.sv_flow_versions for each statement execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_flow_steps_no_truncate before truncate on public.sv_flow_steps for each statement execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_flow_forms_no_truncate before truncate on public.sv_flow_forms for each statement execute function smartvolt_private.wa_reject_rewrite();
-- Provider receipt wakes the next graph node without delaying until the periodic catch-up.
create function smartvolt_private.flow_delivery_changed()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if new.origin='flow'and new.state not in('scheduled','dispatching')then
  update public.sv_flow_runs set due_at=now()where company_id=new.company_id and id=new.source_id and job_id=new.id and state='delivery';
 end if;return new;end;$$;
revoke all on function smartvolt_private.flow_delivery_changed()from public,anon,authenticated;
grant execute on function smartvolt_private.flow_delivery_changed()to service_role;
create trigger sv_flow_delivery_changed after update of state on public.sv_delivery_jobs for each row execute function smartvolt_private.flow_delivery_changed();
