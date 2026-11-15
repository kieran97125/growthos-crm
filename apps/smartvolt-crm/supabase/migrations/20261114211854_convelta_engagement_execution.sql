-- Product Learning Sync checked: 2026-07-26 broadcast execution boundary,
-- 2026-07-29 connector readiness, 2026-08-10 permission-aware brand scope.
-- An outbox claim, not a workflow retry, authorizes the single external attempt.
create table public.sv_delivery_policies(
 company_id uuid primary key references public.sv_companies(id),
 marketing_enabled boolean not null default false,automations_paused boolean not null default false,quiet_start integer not null default 21 check(quiet_start between 0 and 23),
 quiet_end integer not null default 9 check(quiet_end between 0 and 23),frequency_hours integer not null default 72 check(frequency_hours between 1 and 720),
 daily_limit integer not null default 200 check(daily_limit between 1 and 10000),minute_limit integer not null default 10 check(minute_limit between 1 and 100),revision bigint not null default 0
);
create table public.sv_contact_preferences(
 company_id uuid not null,customer_id text not null,brand_id text not null,channel text not null check(channel in('whatsapp','messenger','instagram')),
 purpose text not null check(purpose in('marketing','service')),allowed boolean not null,source text not null check(length(source) between 1 and 500),
 revision bigint not null default 1,updated_at timestamptz not null default now(),primary key(company_id,customer_id,brand_id,channel,purpose),
 foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create table public.sv_preference_events(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id text not null,brand_id text not null,channel text not null,purpose text not null,
 allowed boolean not null,source text not null,actor_id uuid,command_id uuid not null,created_at timestamptz not null default now(),unique(company_id,command_id)
);
create table public.sv_wa_template_inventory(
 company_id uuid not null,connection_id uuid not null,templates jsonb not null check(jsonb_typeof(templates)='array'),checked_at timestamptz not null default now(),
 primary key(company_id,connection_id),foreign key(company_id,connection_id)references public.sv_wa_connections(company_id,id)
);
create table public.sv_campaigns(
 company_id uuid not null references public.sv_companies(id),id uuid not null,brand_id text not null,connection_id uuid not null,provider text not null check(provider in('whatsapp','meta')),
 channel text not null check(channel in('whatsapp','messenger','instagram')),name text not null check(length(name) between 1 and 100),purpose text not null check(purpose in('marketing','service')),
 definition jsonb not null,audience jsonb not null,due_at timestamptz not null,created_by uuid not null,status text not null default 'scheduled'check(status in('scheduled','cancelled')),
 created_at timestamptz not null default now(),primary key(company_id,id)
);
create table public.sv_delivery_jobs(
 company_id uuid not null references public.sv_companies(id),id uuid not null default gen_random_uuid(),brand_id text not null,customer_id text not null,
 provider text not null check(provider in('whatsapp','meta')),channel text not null,connection_id uuid not null,thread_id uuid not null,
 purpose text not null check(purpose in('marketing','service')),origin text not null check(origin in('campaign','journey','manual')),
 source_id uuid not null,source_key text not null,actor_id uuid not null,payload jsonb not null,due_at timestamptz not null,
 state text not null default 'scheduled'check(state in('scheduled','dispatching','accepted','sent','delivered','read','failed','unknown','skipped','cancelled')),
 reason text,attempted_at timestamptz,message_id uuid,provider_id text,editor_token uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,source_key),foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create index sv_delivery_due on public.sv_delivery_jobs(company_id,due_at,id)where state='scheduled';
create index sv_delivery_source on public.sv_delivery_jobs(company_id,source_id,id);
create index sv_delivery_contact on public.sv_delivery_jobs(company_id,customer_id,attempted_at desc)where attempted_at is not null;
create table public.sv_delivery_events(
 seq bigint generated always as identity primary key,company_id uuid not null,job_id uuid not null,kind text not null,detail jsonb not null default '{}',created_at timestamptz not null default now(),
 foreign key(company_id,job_id)references public.sv_delivery_jobs(company_id,id)
);
create index sv_delivery_events_job on public.sv_delivery_events(company_id,job_id,seq);
create table public.sv_delivery_schedulers(
 company_id uuid primary key references public.sv_companies(id),generation bigint not null default 0,run_id text,token uuid,lease_until timestamptz not null default now(),next_at timestamptz
);

create function smartvolt_private.delivery_event()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if tg_op='INSERT'or new.state is distinct from old.state or new.reason is distinct from old.reason then
  insert into public.sv_delivery_events(company_id,job_id,kind,detail)values(new.company_id,new.id,new.state,jsonb_build_object('reason',new.reason));
 end if;return new;end;$$;
create trigger sv_delivery_event after insert or update on public.sv_delivery_jobs for each row execute function smartvolt_private.delivery_event();
create trigger sv_preference_events_immutable before update or delete on public.sv_preference_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_delivery_events_immutable before update or delete on public.sv_delivery_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_preference_events_no_truncate before truncate on public.sv_preference_events for each statement execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_delivery_events_no_truncate before truncate on public.sv_delivery_events for each statement execute function smartvolt_private.wa_reject_rewrite();

create function smartvolt_private.delivery_audience(p_company uuid,p_actor uuid,p_brand text,p_provider text,p_connection uuid,p_filter jsonb)
returns table(customer_id text,customer_name text,thread_id uuid,channel text,last_inbound_at bigint)language sql stable security invoker set search_path=''as $$
 select distinct on(i.customer_id)i.customer_id,c.name,i.thread_id,i.channel,i.last_inbound_at
 from smartvolt_private.ops_inquiries i join public.sv_customers c on c.company_id=i.company_id and c.id=i.customer_id
 where i.company_id=p_company and i.brand_id=p_brand and i.provider=p_provider
 and smartvolt_private.member_has_product(p_company,p_actor,'crm')and smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)
 and((p_provider='whatsapp'and exists(select 1 from public.sv_wa_conversations t where t.company_id=p_company and t.id=i.thread_id and t.connection_id=p_connection))
 or(p_provider='meta'and exists(select 1 from public.sv_meta_threads t where t.company_id=p_company and t.id=i.thread_id and t.connection_id=p_connection)))
 and(coalesce(p_filter->>'thread','')=''or i.thread_id::text=p_filter->>'thread')
 and(coalesce(p_filter->>'tag','')=''or c.tags ? (p_filter->>'tag'))
 and(coalesce(p_filter->>'stage','')=''or exists(select 1 from public.sv_customer_lifecycle l where l.company_id=p_company and l.customer_id=c.id and l.brand_id=p_brand and l.stage_id=p_filter->>'stage'))
 and(coalesce(p_filter->>'customer','')=''or c.id=p_filter->>'customer')
 order by i.customer_id,i.last_inbound_at desc nulls last,i.thread_id
$$;
create function smartvolt_private.delivery_text(p_text text,p_context jsonb)returns text language plpgsql immutable security invoker set search_path=''as $$
declare rest text:=p_text;result text:='';m text[];at integer;begin
 loop
  m=regexp_match(rest,'{{([^{}]+)}}');if m is null then return result||rest;end if;
  if nullif(p_context->>m[1],'')is null then return null;end if;
  at=strpos(rest,'{{'||m[1]||'}}');result=result||substr(rest,1,at-1)||(p_context->>m[1]);rest=substr(rest,at+length(m[1])+4);
 end loop;end;$$;
create function smartvolt_private.delivery_render(p_definition jsonb,p_name text,p_context jsonb default '{}')returns jsonb language plpgsql immutable security invoker set search_path=''as $$
declare result jsonb:=p_definition;vals jsonb:='[]';v jsonb;body text;field text;ctx jsonb:=p_context||jsonb_build_object('name',p_name);begin
 body=smartvolt_private.delivery_text(coalesce(result->>'body',''),ctx);if body is null then return null;end if;
 for v in select value from jsonb_array_elements(coalesce(result->'values','[]'))loop
  field=smartvolt_private.delivery_text(v->>'value',ctx);if field is null then return null;end if;
  vals=vals||jsonb_build_array(jsonb_set(v,'{value}',to_jsonb(field)));
 end loop;
 return jsonb_set(jsonb_set(result,'{body}',to_jsonb(body)),'{values}',vals);end;$$;

create function public.sv_engagement_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb,p_request jsonb default null)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare r jsonb;brand text:=p_data->>'brandId';c public.sv_campaigns;counted bigint;v_channel text;v_provider text;conn uuid;ident uuid;
begin
 p_request=coalesce(p_request,p_data);
 perform public.sv_authorize(p_company,p_actor,'crm',true,p_kind not in('preference','manual'),brand);
 if p_kind='policy'and exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and brand_ids is not null)then raise exception 'brand_scope';end if;
 if p_kind='preference'then
  perform public.sv_customer_scope(p_company,p_actor,p_data->>'customerId');
  if not exists(select 1 from public.sv_customer_brands where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=brand)then raise exception 'brand_scope';end if;
 end if;
 if p_kind='cancel'then
  select * into strict c from public.sv_campaigns where company_id=p_company and id=(p_data->>'id')::uuid;
  perform public.sv_member_scope(p_company,p_actor,c.brand_id);
 end if;
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'engagement:'||p_kind,coalesce(p_request,p_data));if r is not null then return r;end if;
 insert into public.sv_delivery_policies(company_id)values(p_company)on conflict do nothing;
 perform 1 from public.sv_delivery_policies where company_id=p_company for update;
 if p_kind='policy'then
  update public.sv_delivery_policies set marketing_enabled=(p_data->>'marketingEnabled')::boolean,automations_paused=coalesce((p_data->>'executionPaused')::boolean,false),quiet_start=(p_data->>'quietStart')::integer,
  quiet_end=(p_data->>'quietEnd')::integer,frequency_hours=(p_data->>'frequencyHours')::integer,daily_limit=(p_data->>'dailyLimit')::integer,minute_limit=(p_data->>'minuteLimit')::integer,revision=revision+1
  where company_id=p_company and revision=(p_data->>'revision')::bigint;if not found then raise exception 'revision_conflict';end if;
  if coalesce((p_data->>'executionPaused')::boolean,false)then update public.sv_delivery_jobs set state='cancelled',reason='execution_paused',updated_at=statement_timestamp()where company_id=p_company and state='scheduled'and origin<>'manual';end if;
  r='{"saved":true}';
 elsif p_kind='preference'then
  if length(btrim(p_data->>'source'))not between 1 and 500 then raise exception 'evidence_required';end if;
  perform pg_advisory_xact_lock(hashtextextended('delivery-contact:'||p_company::text||':'||(p_data->>'customerId'),0));
  if coalesce((select revision from public.sv_contact_preferences where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=brand and channel=p_data->>'channel'and purpose=p_data->>'purpose'),0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  insert into public.sv_contact_preferences(company_id,customer_id,brand_id,channel,purpose,allowed,source)
  values(p_company,p_data->>'customerId',brand,p_data->>'channel',p_data->>'purpose',(p_data->>'allowed')::boolean,p_data->>'source')
  on conflict(company_id,customer_id,brand_id,channel,purpose)do update set allowed=excluded.allowed,source=excluded.source,revision=sv_contact_preferences.revision+1,updated_at=now();
  insert into public.sv_preference_events(company_id,customer_id,brand_id,channel,purpose,allowed,source,actor_id,command_id)
  values(p_company,p_data->>'customerId',brand,p_data->>'channel',p_data->>'purpose',(p_data->>'allowed')::boolean,p_data->>'source',p_actor,p_command);
  if not(p_data->>'allowed')::boolean then update public.sv_delivery_jobs set state='cancelled',reason='consent_withdrawn',updated_at=now()where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=brand and channel=p_data->>'channel'and purpose=p_data->>'purpose'and state='scheduled';end if;
  r='{"saved":true}';
 elsif p_kind in('campaign','manual')then
  if p_kind='campaign'and(select automations_paused from public.sv_delivery_policies where company_id=p_company)then raise exception 'execution_paused';end if;
  ident=(p_data->>'id')::uuid;v_provider=p_data->>'provider';conn=(p_data->>'connectionId')::uuid;
  if v_provider='whatsapp'then select 'whatsapp'into v_channel from public.sv_wa_connections where company_id=p_company and id=conn and brand_id=brand and state<>'disabled';
  elsif v_provider='meta'then select cn.channel into v_channel from public.sv_meta_connections cn where company_id=p_company and id=conn and brand_id=brand and enabled;end if;
  if v_channel is null then raise exception 'connection_not_ready';end if;
  if p_kind='manual'then
   if p_data->>'threadId'is null then raise exception 'thread_required';end if;
   p_data=jsonb_set(p_data,'{audience}',(p_data->'audience')||jsonb_build_object('thread',p_data->>'threadId'));
  end if;
  if p_data#>>'{definition,kind}'='text'and p_data#>>'{definition,body}'~'{{(date|time|service)}}'or exists(select 1 from jsonb_array_elements(p_data#>'{definition,values}')v where v->>'value'~'{{(date|time|service)}}')then raise exception 'source_details_required';end if;
  if p_kind='manual'and(p_data->>'purpose'<>'service'or p_data#>>'{definition,kind}'<>'template'or v_provider<>'whatsapp'or coalesce(p_data#>>'{audience,customer}','')='')then raise exception 'invalid_manual';end if;
  if not isfinite((p_data->>'dueAt')::timestamptz)or(p_data->>'dueAt')::timestamptz<now()-interval '5 minutes'or(p_data->>'dueAt')::timestamptz>now()+interval '366 days'then raise exception 'invalid_schedule';end if;
  select count(*)into counted from smartvolt_private.delivery_audience(p_company,p_actor,brand,v_provider,conn,p_data->'audience');
  if counted=0 or counted>10000 or(p_kind='manual'and counted<>1)then raise exception 'invalid_audience';end if;
  insert into public.sv_campaigns(company_id,id,brand_id,connection_id,provider,channel,name,purpose,definition,audience,due_at,created_by)
  values(p_company,ident,brand,conn,v_provider,v_channel,p_data->>'name',p_data->>'purpose',p_data->'definition',p_data->'audience',(p_data->>'dueAt')::timestamptz,p_actor);
  insert into public.sv_delivery_jobs(company_id,brand_id,customer_id,provider,channel,connection_id,thread_id,purpose,origin,source_id,source_key,actor_id,payload,due_at,editor_token)
  select p_company,brand,a.customer_id,v_provider,v_channel,conn,a.thread_id,p_data->>'purpose',case when p_kind='manual'then 'manual'else 'campaign'end,ident,'campaign:'||ident||':'||a.customer_id,p_actor,
  smartvolt_private.delivery_render(p_data->'definition',a.customer_name,jsonb_build_object('brand',(select b->>'name'from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=brand))),(p_data->>'dueAt')::timestamptz,case when p_kind='manual'then(p_data->>'editorToken')::uuid end from smartvolt_private.delivery_audience(p_company,p_actor,brand,v_provider,conn,p_data->'audience')a;
  r=jsonb_build_object('saved',true,'id',ident,'recipients',counted);
 elsif p_kind='cancel'then
  update public.sv_campaigns set status='cancelled'where company_id=p_company and id=c.id;
  update public.sv_delivery_jobs set state='cancelled',reason='campaign_cancelled',updated_at=now()where company_id=p_company and source_id=c.id and state='scheduled';
  r='{"saved":true}';
 else raise exception 'invalid_action';end if;
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'engagement:'||p_kind,coalesce(p_request,p_data),r);return r;
end;$$;

-- Optional domain admission is explicitly overridden by the editor module.
create function smartvolt_private.delivery_editor_admit(p_job public.sv_delivery_jobs)returns text language sql volatile security invoker set search_path=''as $$select null::text$$;
create function public.sv_delivery_claim(p_company uuid,p_id uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
declare j public.sv_delivery_jobs;p public.sv_delivery_policies;cv public.sv_wa_conversations;mc public.sv_meta_connections;mt public.sv_meta_threads;
 wc public.sv_wa_connections;why text;message uuid;ms bigint:=floor(extract(epoch from now())*1000);hour integer:=extract(hour from now()at time zone 'Asia/Hong_Kong');
begin
 select * into j from public.sv_delivery_jobs where company_id=p_company and id=p_id;
 if not found or j.state<>'scheduled'or j.due_at>now()then return jsonb_build_object('dispatch',false);end if;
 -- Same membership/product -> connection -> thread -> contact -> job order as manual sends.
 begin perform public.sv_authorize(p_company,j.actor_id,'crm',true,j.origin<>'manual',j.brand_id);exception when others then why='authority_changed';end;
 select * into strict p from public.sv_delivery_policies where company_id=p_company for update;
 if j.provider='whatsapp'then
  select * into wc from public.sv_wa_connections where company_id=p_company and id=j.connection_id for update;
  select * into cv from public.sv_wa_conversations where company_id=p_company and id=j.thread_id for update;
 else
  select * into mc from public.sv_meta_connections where company_id=p_company and id=j.connection_id for update;
  select * into mt from public.sv_meta_threads where company_id=p_company and id=j.thread_id for update;
 end if;
 if why is null then why=smartvolt_private.delivery_editor_admit(j);end if;
 perform pg_advisory_xact_lock(hashtextextended('delivery-contact:'||p_company::text||':'||j.customer_id,0));
 select * into strict j from public.sv_delivery_jobs where company_id=p_company and id=p_id for update;
 if j.state<>'scheduled'or j.due_at>now()then return jsonb_build_object('dispatch',false);end if;
 -- A replay never authorizes a second POST. All mutable eligibility is checked now.
 if why is null and not exists(select 1 from public.sv_customer_threads where company_id=p_company and customer_id=j.customer_id and brand_id=j.brand_id and provider=j.provider and thread_id=j.thread_id)then why='customer_changed';end if;
 if why is null and j.origin='campaign'and not exists(select 1 from public.sv_campaigns where company_id=p_company and id=j.source_id and status='scheduled')then why='campaign_cancelled';end if;
 if why is null and j.origin='journey'then why=smartvolt_private.journey_admit(j);end if;
 if why is null and j.origin<>'manual'and p.automations_paused then why='execution_paused';end if;
 if why is null and(j.purpose='marketing'and not p.marketing_enabled)then why='marketing_disabled';end if;
 if why is null and not exists(select 1 from public.sv_contact_preferences where company_id=p_company and customer_id=j.customer_id and brand_id=j.brand_id and channel=j.channel and purpose=j.purpose and allowed)then why='consent_missing';end if;
 if why is null and j.provider='whatsapp'and(wc.id is null or cv.id is null or cv.connection_id<>wc.id or wc.brand_id<>j.brand_id or wc.state<>'active'or wc.webhook_verified_at is null)then why='connection_not_ready';end if;
 if why is null and j.provider='meta'and(mc.id is null or mt.id is null or mt.connection_id<>mc.id or mc.brand_id<>j.brand_id or not mc.enabled)then why='connection_not_ready';end if;
 if why is null and j.payload->>'kind'='text'and coalesce(case when j.provider='whatsapp'then cv.last_inbound_at else mt.last_inbound_at end,0)<=ms-86400000 then why='window_closed';end if;
 if why is null and j.payload->>'kind'='template'and(j.provider<>'whatsapp'or not exists(
  select 1 from public.sv_wa_template_inventory inv,jsonb_array_elements(inv.templates)t where inv.company_id=p_company and inv.connection_id=j.connection_id and inv.checked_at>now()-interval '60 seconds'
  and t->>'fingerprint'=j.payload->>'fingerprint'and t->>'name'=j.payload->>'name'and t->>'language'=j.payload->>'locale'and t->>'status'='APPROVED'and(t->>'supported')::boolean
  and((j.purpose='marketing'and t->>'category'='MARKETING')or(j.purpose='service'and t->>'category'='UTILITY'))))then why='template_changed';end if;
 if why is not null then update public.sv_delivery_jobs set state='skipped',reason=why,updated_at=now()where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'reason',why);end if;
 if j.origin<>'manual'and p.quiet_start<>p.quiet_end and((p.quiet_start<p.quiet_end and hour>=p.quiet_start and hour<p.quiet_end)or(p.quiet_start>p.quiet_end and(hour>=p.quiet_start or hour<p.quiet_end)))then
  update public.sv_delivery_jobs set due_at=(date_trunc('day',now()at time zone 'Asia/Hong_Kong')+make_interval(hours=>p.quiet_end)+(case when p.quiet_start>p.quiet_end and hour>=p.quiet_start then interval '1 day'else interval '0'end))at time zone 'Asia/Hong_Kong',reason='quiet_hours',updated_at=now()where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'deferred',true);end if;
 if j.origin<>'manual'and exists(select 1 from public.sv_delivery_jobs k where k.company_id=p_company and k.customer_id=j.customer_id and k.brand_id=j.brand_id and k.purpose=j.purpose and k.attempted_at>now()-make_interval(hours=>p.frequency_hours))then
  update public.sv_delivery_jobs set state='skipped',reason='frequency_limit',updated_at=now()where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'reason','frequency_limit');end if;
 if(select count(*)from public.sv_delivery_jobs k where k.company_id=p_company and k.attempted_at>=date_trunc('day',now()at time zone 'Asia/Hong_Kong')at time zone 'Asia/Hong_Kong')>=p.daily_limit then
  update public.sv_delivery_jobs set due_at=(date_trunc('day',now()at time zone 'Asia/Hong_Kong')+interval '1 day')at time zone 'Asia/Hong_Kong',reason='daily_limit'where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'deferred',true);end if;
 if(select count(*)from public.sv_delivery_jobs k where k.company_id=p_company and k.attempted_at>now()-interval '1 minute')>=p.minute_limit then
  update public.sv_delivery_jobs set due_at=now()+interval '1 minute',reason='minute_limit'where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'deferred',true);end if;
 if j.provider='whatsapp'and exists(select 1 from public.sv_wa_messages m where m.company_id=p_company and m.conversation_id=j.thread_id and m.direction='outgoing'and m.state in('dispatching','unknown'))then update public.sv_delivery_jobs set state='skipped',reason='send_unresolved'where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false,'reason','send_unresolved');end if;
 if j.provider='whatsapp'then
  insert into public.sv_wa_messages(company_id,connection_id,conversation_id,client_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,state)
  values(p_company,j.connection_id,j.thread_id,j.id,encode(sha256(convert_to(j.payload::text,'UTF8')),'hex'),'outgoing',j.payload->>'body',j.payload->>'kind',ms,j.actor_id,case when j.origin='manual'then '同事'else '自動跟進'end,'dispatching')returning id into message;
  update public.sv_wa_conversations set revision=revision+1,last_message_at=greatest(last_message_at,ms),updated_at=now()where company_id=p_company and id=j.thread_id;
 else
  if exists(select 1 from public.sv_meta_messages where company_id=p_company and thread_id=j.thread_id and direction='outbound'and state in('sending','uncertain'))then
   update public.sv_delivery_jobs set state='skipped',reason='send_unresolved'where company_id=p_company and id=p_id;return jsonb_build_object('dispatch',false);end if;
  insert into public.sv_meta_messages(company_id,thread_id,direction,body,state,actor_id,client_id)values(p_company,j.thread_id,'outbound',j.payload->>'body','sending',j.actor_id,j.id)returning id into message;
  update public.sv_meta_threads set revision=revision+1,updated_at=now()where company_id=p_company and id=j.thread_id;
 end if;
 update public.sv_delivery_jobs set state='dispatching',reason=null,attempted_at=now(),message_id=message,updated_at=now()where company_id=p_company and id=p_id;
 return jsonb_build_object('dispatch',true,'job',to_jsonb(j),'messageId',message,'remoteId',case when j.provider='whatsapp'then cv.remote_id else mt.peer_id end,'remoteKind',cv.remote_kind);
end;$$;

create function public.sv_delivery_finish(p_company uuid,p_job uuid,p_disposition text,p_provider_id text,p_error text)returns void language plpgsql security invoker set search_path=''as $$
declare j public.sv_delivery_jobs;begin
 select * into strict j from public.sv_delivery_jobs where company_id=p_company and id=p_job;
 if j.provider='whatsapp'then
  perform 1 from public.sv_wa_connections where company_id=p_company and id=j.connection_id for update;
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=j.thread_id for update;
 else
  perform 1 from public.sv_meta_connections where company_id=p_company and id=j.connection_id for update;
  perform 1 from public.sv_meta_threads where company_id=p_company and id=j.thread_id for update;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('delivery-contact:'||p_company::text||':'||j.customer_id,0));
 select * into strict j from public.sv_delivery_jobs where company_id=p_company and id=p_job for update;
 if j.state not in('dispatching','unknown')then return;end if;
 if p_disposition not in('accepted','definitive','ambiguous')then raise exception 'invalid_outcome';end if;
 if j.provider='whatsapp'then perform public.sv_wa_finish_send(p_company,j.message_id,p_disposition,p_provider_id,p_error);
 else perform public.sv_meta_finish(p_company,j.message_id,case when p_disposition='accepted'then 'accepted'when p_disposition='definitive'then 'failed'else 'uncertain'end,p_provider_id,p_error);end if;
 update public.sv_delivery_jobs set state=case when p_disposition='accepted'then 'accepted'when p_disposition='definitive'then 'failed'else 'unknown'end,provider_id=p_provider_id,reason=p_error,updated_at=now()where company_id=p_company and id=p_job and state in('dispatching','unknown');
end;$$;

create function public.sv_engagement_read(p_company uuid,p_actor uuid,p_query jsonb default '{}')returns jsonb language plpgsql security invoker set search_path=''as $$
declare r jsonb;brand text:=p_query->>'brand';campaign uuid:=(p_query->>'campaign')::uuid;begin
 perform public.sv_authorize(p_company,p_actor,'crm',false,false,brand);
 if campaign is not null then perform public.sv_member_scope(p_company,p_actor,(select brand_id from public.sv_campaigns where company_id=p_company and id=campaign));end if;
 if p_query->>'customer'is not null then perform public.sv_customer_scope(p_company,p_actor,p_query->>'customer');end if;
 select jsonb_build_object(
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'policy',coalesce((select to_jsonb(p)-'company_id'from public.sv_delivery_policies p where p.company_id=p_company),'{"marketing_enabled":false,"quiet_start":21,"quiet_end":9,"frequency_hours":72,"daily_limit":200,"minute_limit":10,"revision":0}'::jsonb),
 'connections',coalesce((select jsonb_agg(q order by q.label,q.id)from(
 select c.id,c.brand_id,'whatsapp'provider,'whatsapp'channel,coalesce(c.display_phone,'WhatsApp')label,(c.state='active'and c.webhook_verified_at is not null)ready,c.last_inbound_at is not null inbound,
 exists(select 1 from public.sv_wa_messages m where m.company_id=p_company and m.connection_id=c.id and m.direction='outgoing'and m.state in('accepted','sent','delivered','read'))accepted,
 exists(select 1 from public.sv_wa_messages m where m.company_id=p_company and m.connection_id=c.id and m.direction='outgoing'and m.state in('delivered','read'))delivered
 from public.sv_wa_connections c where c.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)
 union all select c.id,c.brand_id,'meta',c.channel,c.label,c.enabled,c.last_inbound_at is not null,
 exists(select 1 from public.sv_meta_messages m join public.sv_meta_threads t on t.id=m.thread_id and t.company_id=m.company_id where m.company_id=p_company and t.connection_id=c.id and m.direction='outbound'and m.state in('accepted','sent','delivered','read')),
 exists(select 1 from public.sv_meta_messages m join public.sv_meta_threads t on t.id=m.thread_id and t.company_id=m.company_id where m.company_id=p_company and t.connection_id=c.id and m.direction='outbound'and m.state in('delivered','read'))
 from public.sv_meta_connections c where c.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id))q),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('connection_id',i.connection_id,'checked_at',i.checked_at,'templates',i.templates))from public.sv_wa_template_inventory i join public.sv_wa_connections c on c.company_id=i.company_id and c.id=i.connection_id where i.company_id=p_company and i.connection_id::text=p_query->>'connection'and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)),'[]'),
 'campaigns',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(select c.id,c.name,c.brand_id,c.channel,c.purpose,c.status,c.due_at,c.created_at,
 (select count(*)from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=c.id)total,
 coalesce((select jsonb_object_agg(x.state,x.n)from(select j.state,count(*)n from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=c.id group by j.state)x),'{}')counts
 from public.sv_campaigns c where c.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)and(brand is null or c.brand_id=brand)
 and(p_query->>'before'is null or(c.created_at,c.id)<((p_query->>'before')::timestamptz,(p_query->>'beforeId')::uuid))order by c.created_at desc,c.id desc limit 31)q),'[]'),
 'results',coalesce((select jsonb_agg(q order by q.id)from(select j.id,j.customer_id,c.name customer_name,j.state,j.reason,j.due_at,j.updated_at from public.sv_delivery_jobs j join public.sv_customers c on c.company_id=j.company_id and c.id=j.customer_id
 where j.company_id=p_company and j.source_id=campaign and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)and(p_query->>'after'is null or j.id>(p_query->>'after')::uuid)order by j.id limit 51)q),'[]'),
 'resultTotal',(select count(*)from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=campaign and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)),
 'resultCounts',coalesce((select jsonb_object_agg(x.state,x.n)from(select j.state,count(*)n from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=campaign and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)group by j.state)x),'{}'),
 'preferences',coalesce((select jsonb_agg(to_jsonb(pr)-'company_id'-'updated_at')from public.sv_contact_preferences pr where pr.company_id=p_company and pr.customer_id=p_query->>'customer'and smartvolt_private.member_brand_allowed(p_company,p_actor,pr.brand_id)),'[]'),
 'audience',case when p_query->>'connection'is null or brand is null then null else(
 select jsonb_build_object('total',count(*),'consented',count(*)filter(where exists(select 1 from public.sv_contact_preferences pr where pr.company_id=p_company and pr.customer_id=a.customer_id and pr.brand_id=brand and pr.channel=a.channel and pr.purpose=coalesce(p_query->>'purpose','marketing')and pr.allowed)),
 'sample',coalesce((select jsonb_agg(s)from(select customer_id,customer_name from smartvolt_private.delivery_audience(p_company,p_actor,brand,p_query->>'provider',(p_query->>'connection')::uuid,coalesce(p_query->'audience','{}'))limit 10)s),'[]'))
 from smartvolt_private.delivery_audience(p_company,p_actor,brand,p_query->>'provider',(p_query->>'connection')::uuid,coalesce(p_query->'audience','{}'))a)end)into r;
 return r;end;$$;

create function public.sv_templates_store(p_company uuid,p_connection uuid,p_expected jsonb,p_templates jsonb)returns void language plpgsql security invoker set search_path=''as $$begin
 perform 1 from public.sv_wa_connections where company_id=p_company and id=p_connection and encrypted_credentials=p_expected and state<>'disabled'for update;
 if not found then raise exception 'connection_changed';end if;
 if jsonb_typeof(p_templates)<>'array'or jsonb_array_length(p_templates)>1000 or octet_length(p_templates::text)>2000000 then raise exception 'invalid_templates';end if;
 insert into public.sv_wa_template_inventory(company_id,connection_id,templates)values(p_company,p_connection,p_templates)on conflict(company_id,connection_id)do update set templates=excluded.templates,checked_at=now();
end;$$;
create function public.sv_templates_invalidate(p_company uuid,p_connection uuid)returns void language sql security invoker set search_path=''as $$
 update public.sv_wa_template_inventory set checked_at='epoch'where company_id=p_company and connection_id=p_connection
$$;

create function public.sv_engagement_receipt(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare b text:=p_data->>'brandId';begin
 if p_kind='cancel'then select brand_id into b from public.sv_campaigns where company_id=p_company and id=(p_data->>'id')::uuid;end if;
 perform public.sv_authorize(p_company,p_actor,'crm',true,p_kind not in('preference','manual'),b);
 if p_kind='preference'then perform public.sv_customer_scope(p_company,p_actor,p_data->>'customerId');end if;
 if p_kind in('campaign','manual')and not exists(
 select 1 from public.sv_wa_connections where p_data->>'provider'='whatsapp'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=b
 union all select 1 from public.sv_meta_connections where p_data->>'provider'='meta'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=b)then raise exception 'brand_scope';end if;
 return smartvolt_private.action_replay(p_company,p_actor,p_command,'engagement:'||p_kind,p_data);end;$$;

create function smartvolt_private.delivery_optout(p_body text)returns boolean language sql immutable security invoker set search_path=''as $$
 select lower(btrim(p_body))~'^(stop|stop all|unsubscribe|opt out|退訂|取消訂閱|停止推廣|停止所有訊息)[.!。！ ]*$'
$$;
create function smartvolt_private.delivery_optout_message()returns trigger language plpgsql security invoker set search_path=''as $$
declare p text;t uuid;link public.sv_customer_threads;ch text;v_purpose text;begin
 if not smartvolt_private.delivery_optout(new.body)then return new;end if;
 if tg_table_name='sv_wa_messages'then if new.direction<>'incoming'then return new;end if;p='whatsapp';t=new.conversation_id;ch='whatsapp';
 else if new.direction<>'inbound'then return new;end if;p='meta';t=new.thread_id;select c.channel into ch from public.sv_meta_threads mt join public.sv_meta_connections c on c.company_id=mt.company_id and c.id=mt.connection_id where mt.company_id=new.company_id and mt.id=t;end if;
 select * into link from public.sv_customer_threads where company_id=new.company_id and provider=p and thread_id=t;if not found then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('delivery-contact:'||new.company_id::text||':'||link.customer_id,0));
 for v_purpose in select unnest(case when lower(btrim(new.body))in('stop all','停止所有訊息')then array['marketing','service']else array['marketing']end)loop
  insert into public.sv_contact_preferences(company_id,customer_id,brand_id,channel,purpose,allowed,source)values(new.company_id,link.customer_id,link.brand_id,ch,v_purpose,false,'customer-message:'||new.id)
  on conflict(company_id,customer_id,brand_id,channel,purpose)do update set allowed=false,source=excluded.source,revision=sv_contact_preferences.revision+1,updated_at=now();
  insert into public.sv_preference_events(company_id,customer_id,brand_id,channel,purpose,allowed,source,command_id)values(new.company_id,link.customer_id,link.brand_id,ch,v_purpose,false,'customer-message:'||new.id,case when v_purpose='marketing'then new.id else gen_random_uuid()end)on conflict do nothing;
  update public.sv_delivery_jobs set state='cancelled',reason='consent_withdrawn',updated_at=now()where company_id=new.company_id and customer_id=link.customer_id and brand_id=link.brand_id and channel=ch and sv_delivery_jobs.purpose=v_purpose and state='scheduled';
 end loop;return new;end;$$;
create trigger sv_delivery_optout_wa after insert on public.sv_wa_messages for each row execute function smartvolt_private.delivery_optout_message();
create trigger sv_delivery_optout_meta after insert on public.sv_meta_messages for each row execute function smartvolt_private.delivery_optout_message();

create function smartvolt_private.delivery_receipt()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if new.state in('sent','delivered','read','failed')then
  update public.sv_delivery_jobs set state=new.state,reason=new.error_code,provider_id=new.provider_id,updated_at=now()where company_id=new.company_id and message_id=new.id and state not in('cancelled','skipped','read')and(state<>'delivered'or new.state in('read','failed'));
 end if;return new;end;$$;
create trigger sv_delivery_wa_receipt after update of state on public.sv_wa_messages for each row execute function smartvolt_private.delivery_receipt();
create trigger sv_delivery_meta_receipt after update of state on public.sv_meta_messages for each row execute function smartvolt_private.delivery_receipt();

-- Scheduler lease is fenced by generation; a recovered workflow cannot keep dispatching.
create function public.sv_delivery_scheduler(p_company uuid,p_mode text,p_generation bigint default null,p_token uuid default null,p_run text default null)returns jsonb
language plpgsql security invoker set search_path=''as $$declare s public.sv_delivery_schedulers;n timestamptz;begin
 insert into public.sv_delivery_schedulers(company_id)values(p_company)on conflict do nothing;
 select * into strict s from public.sv_delivery_schedulers where company_id=p_company for update;
 select min(due_at)into n from public.sv_delivery_jobs where company_id=p_company and state='scheduled';
 if p_mode='wake'then
  if n is null then return jsonb_build_object('start',false);end if;
  if s.lease_until>now()then return jsonb_build_object('start',false,'runId',s.run_id,'generation',s.generation,'token',s.token);end if;
  update public.sv_delivery_schedulers set generation=generation+1,token=gen_random_uuid(),run_id=null,lease_until=now()+interval '2 minutes',next_at=n where company_id=p_company returning * into s;
  return jsonb_build_object('start',true,'generation',s.generation,'token',s.token);
 end if;
 if s.generation is distinct from p_generation or s.token is distinct from p_token then return jsonb_build_object('active',false);end if;
 if p_mode='bind'then update public.sv_delivery_schedulers set run_id=p_run where company_id=p_company;return jsonb_build_object('active',true);end if;
 if p_mode='tick'then
  update public.sv_delivery_jobs set state='unknown',reason='worker_interrupted',updated_at=now()where company_id=p_company and state='dispatching'and attempted_at<now()-interval '2 minutes';
  update public.sv_delivery_schedulers set next_at=n,lease_until=case when n is null then now()else greatest(now(),n)+interval '2 minutes'end where company_id=p_company;
  return jsonb_build_object('active',n is not null,'nextAt',n,'jobs',coalesce((select jsonb_agg(id order by due_at,id)from(select id,due_at from public.sv_delivery_jobs where company_id=p_company and state='scheduled'and due_at<=now()order by due_at,id limit 20)q),'[]'));
 end if;
 if p_mode='release'then update public.sv_delivery_schedulers set lease_until=now(),run_id=null where company_id=p_company;end if;
 return jsonb_build_object('active',false);
end;$$;

do $$declare t text;f record;begin
 foreach t in array array['sv_delivery_policies','sv_contact_preferences','sv_preference_events','sv_wa_template_inventory','sv_campaigns','sv_delivery_jobs','sv_delivery_events','sv_delivery_schedulers']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 revoke update on public.sv_preference_events,public.sv_delivery_events from service_role;
 revoke all on sequence public.sv_delivery_events_seq_seq from public,anon,authenticated;grant usage,select on sequence public.sv_delivery_events_seq_seq to service_role;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('delivery_event','delivery_audience','delivery_render','delivery_text','delivery_optout','delivery_optout_message','delivery_editor_admit','sv_engagement_action','sv_engagement_receipt','sv_engagement_read','sv_templates_store','sv_templates_invalidate','sv_delivery_claim','sv_delivery_finish','delivery_receipt','sv_delivery_scheduler')loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;

create function public.sv_manual_template_context(p_company uuid,p_actor uuid,p_thread uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
declare c public.sv_wa_conversations;link public.sv_customer_threads;begin
 perform public.sv_thread_scope(p_company,p_actor,'whatsapp',p_thread);perform public.sv_authorize(p_company,p_actor,'crm',true);
 select *into strict c from public.sv_wa_conversations where company_id=p_company and id=p_thread;
 select *into strict link from public.sv_customer_threads where company_id=p_company and provider='whatsapp'and thread_id=p_thread;
 return jsonb_build_object('customerId',link.customer_id,'brandId',link.brand_id,'connection',jsonb_build_object('id',c.connection_id,'brand_id',link.brand_id,'provider','whatsapp','channel','whatsapp','label','WhatsApp','ready',coalesce((select state='active'and webhook_verified_at is not null from public.sv_wa_connections where company_id=p_company and id=c.connection_id),false),'inbound',c.last_inbound_at is not null,'accepted',exists(select 1 from public.sv_wa_messages where company_id=p_company and conversation_id=p_thread and direction='outgoing'and state in('accepted','sent','delivered','read')),'delivered',exists(select 1 from public.sv_wa_messages where company_id=p_company and conversation_id=p_thread and direction='outgoing'and state in('delivered','read'))),
 'serviceAllowed',exists(select 1 from public.sv_contact_preferences where company_id=p_company and customer_id=link.customer_id and brand_id=link.brand_id and channel='whatsapp'and purpose='service'and allowed),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('connection_id',connection_id,'templates',templates,'checked_at',checked_at))from public.sv_wa_template_inventory where company_id=p_company and connection_id=c.connection_id),'[]'));
end;$$;
revoke all on function public.sv_manual_template_context(uuid,uuid,uuid)from public,anon,authenticated;grant execute on function public.sv_manual_template_context(uuid,uuid,uuid)to service_role;
