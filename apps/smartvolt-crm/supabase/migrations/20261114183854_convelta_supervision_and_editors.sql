-- Product Learning Sync checked: current brand grants, durable source ownership,
-- immutable observed event times. Active editors participate in real send admission.
create table public.sv_thread_editors(
 company_id uuid not null,provider text not null check(provider in('whatsapp','meta')),thread_id uuid not null,actor_id uuid not null,
 token uuid not null,revision bigint not null default 0,expires_at timestamptz not null,
 primary key(company_id,provider,thread_id),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create table public.sv_editor_events(
 company_id uuid not null,provider text not null,thread_id uuid not null,id uuid not null default gen_random_uuid(),actor_id uuid not null,kind text not null,revision bigint not null,created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create function smartvolt_private.editor_lock_thread(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_write boolean default true)returns void language plpgsql security invoker set search_path=''as $$
declare conn uuid;begin
 if p_provider='whatsapp'and p_write then perform smartvolt_private.wa_require_actor(p_company,p_actor);end if;
 perform public.sv_authorize(p_company,p_actor,'crm',p_write);
 perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);
 if p_provider='whatsapp'then
  select connection_id into strict conn from public.sv_wa_conversations where company_id=p_company and id=p_thread;
  perform 1 from public.sv_wa_connections where company_id=p_company and id=conn for update;
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_thread for update;
 else
  select connection_id into strict conn from public.sv_meta_threads where company_id=p_company and id=p_thread;
  perform 1 from public.sv_meta_connections where company_id=p_company and id=conn for update;
  perform 1 from public.sv_meta_threads where company_id=p_company and id=p_thread for update;
 end if;end;$$;
create function smartvolt_private.editor_admit(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_token uuid,p_required boolean default false)returns void language plpgsql security invoker set search_path=''as $$
declare e public.sv_thread_editors;begin
 select * into e from public.sv_thread_editors where company_id=p_company and provider=p_provider and thread_id=p_thread for update;
 if e.expires_at>statement_timestamp()then
  if e.actor_id<>p_actor or p_token is distinct from e.token then raise exception 'editor_conflict';end if;
 elsif p_required or p_token is not null then raise exception 'editor_expired';end if;end;$$;
create function public.sv_editor_action(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_token uuid,p_mode text,p_expected bigint default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare e public.sv_thread_editors;r record;changed boolean:=false;label text;begin
 if p_mode not in('read','acquire','heartbeat','takeover','release')or p_token is null then raise exception 'invalid_editor';end if;
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,p_provider,p_thread,p_mode<>'read');
 select * into e from public.sv_thread_editors where company_id=p_company and provider=p_provider and thread_id=p_thread for update;
 if p_mode='takeover'and coalesce(e.revision,0)is distinct from p_expected and not(e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp())then raise exception 'editor_conflict';end if;
 if p_mode='release'and e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp()then
  update public.sv_thread_editors set expires_at=statement_timestamp(),revision=revision+1 where company_id=p_company and provider=p_provider and thread_id=p_thread returning * into e;
 elsif p_mode in('acquire','heartbeat','takeover')then
  if(p_mode='takeover'and not coalesce(e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp(),false))or(p_mode='acquire'and(e.expires_at is null or e.expires_at<=statement_timestamp()))then
   insert into public.sv_thread_editors(company_id,provider,thread_id,actor_id,token,revision,expires_at)values(p_company,p_provider,p_thread,p_actor,p_token,coalesce(e.revision,0)+1,statement_timestamp()+interval '45 seconds')
   on conflict(company_id,provider,thread_id)do update set actor_id=excluded.actor_id,token=excluded.token,revision=excluded.revision,expires_at=excluded.expires_at returning * into e;changed=true;
  elsif e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp()then
   update public.sv_thread_editors set expires_at=statement_timestamp()+interval '45 seconds'where company_id=p_company and provider=p_provider and thread_id=p_thread returning * into e;
  end if;
 end if;
 if changed then
  insert into public.sv_editor_events(company_id,provider,thread_id,actor_id,kind,revision)values(p_company,p_provider,p_thread,p_actor,p_mode,e.revision);
  for r in select id from public.sv_journey_runs where company_id=p_company and provider=p_provider and thread_id=p_thread and status='active'order by id loop perform smartvolt_private.journey_stop(p_company,r.id,'human_takeover');end loop;
  update public.sv_journey_sources set active=false where company_id=p_company and provider=p_provider and thread_id=p_thread and recipe='unanswered';
 end if;
 select display_name into label from public.sv_memberships where company_id=p_company and user_id=e.actor_id;
 return jsonb_build_object('held',coalesce(e.expires_at>statement_timestamp()and e.actor_id=p_actor and e.token=p_token,false),'occupied',coalesce(e.expires_at>statement_timestamp(),false),
 'actorName',case when e.expires_at>statement_timestamp()then label end,'revision',coalesce(e.revision,0),'expiresAt',e.expires_at);
end;$$;

-- Keep existing receipt semantics; no active editor can be bypassed through a
-- legacy inbox. A receipt replay reads an earlier outcome without a new POST.
alter function public.sv_wa_claim_send(uuid,uuid,uuid,bigint,uuid,text,uuid)rename to sv_wa_claim_send_core;
create function public.sv_wa_claim_send(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_body text,p_reply_to uuid default null,p_editor_token uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,'whatsapp',p_conversation);
 if exists(select 1 from public.sv_wa_commands where company_id=p_company and client_id=p_client_id)then return public.sv_wa_claim_send_core(p_company,p_actor,p_conversation,p_expected,p_client_id,p_body,p_reply_to);end if;
 perform smartvolt_private.editor_admit(p_company,p_actor,'whatsapp',p_conversation,p_editor_token);
 if exists(select 1 from public.sv_wa_messages where company_id=p_company and conversation_id=p_conversation and direction='outgoing'and state in('dispatching','unknown'))then raise exception 'send_unresolved';end if;
 return public.sv_wa_claim_send_core(p_company,p_actor,p_conversation,p_expected,p_client_id,p_body,p_reply_to);end;$$;
alter function public.sv_meta_claim(uuid,uuid,uuid,uuid,bigint,text)rename to sv_meta_claim_core;
create function public.sv_meta_claim(p_company uuid,p_actor uuid,p_thread uuid,p_client uuid,p_expected bigint,p_body text,p_editor_token uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,'meta',p_thread);
 if exists(select 1 from public.sv_meta_messages where company_id=p_company and client_id=p_client)then return public.sv_meta_claim_core(p_company,p_actor,p_thread,p_client,p_expected,p_body);end if;
 perform smartvolt_private.editor_admit(p_company,p_actor,'meta',p_thread,p_editor_token);
 return public.sv_meta_claim_core(p_company,p_actor,p_thread,p_client,p_expected,p_body);end;$$;

create or replace function smartvolt_private.delivery_editor_admit(p_job public.sv_delivery_jobs)returns text language plpgsql volatile security invoker set search_path=''as $$begin
 if p_job.origin='manual'then
  begin perform smartvolt_private.editor_admit(p_job.company_id,p_job.actor_id,p_job.provider,p_job.thread_id,p_job.editor_token,true);exception when others then return 'human_takeover';end;
 elsif exists(select 1 from public.sv_thread_editors where company_id=p_job.company_id and provider=p_job.provider and thread_id=p_job.thread_id and expires_at>statement_timestamp())then return 'human_takeover';end if;
 if p_job.provider='whatsapp'and exists(select 1 from public.sv_wa_messages where company_id=p_job.company_id and conversation_id=p_job.thread_id and direction='outgoing'and state in('dispatching','unknown'))then return 'send_unresolved';end if;
 return null;end;$$;
alter table public.sv_thread_editors enable row level security;
revoke all on public.sv_thread_editors from public,anon,authenticated,service_role;grant select,insert,update on public.sv_thread_editors to service_role;
alter table public.sv_editor_events enable row level security;
revoke all on public.sv_editor_events from public,anon,authenticated,service_role;grant select,insert on public.sv_editor_events to service_role;
create trigger sv_editor_events_immutable before update or delete on public.sv_editor_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_editor_events_no_truncate before truncate on public.sv_editor_events for each statement execute function smartvolt_private.wa_reject_rewrite();
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('editor_lock_thread','editor_admit','sv_editor_action','sv_wa_claim_send','sv_meta_claim','delivery_editor_admit')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;

-- SLA measures durable workbench receipt -> observed provider acceptance.
-- True provider time continues to govern the separate messaging window.
create table public.sv_sla_coverage(
 singleton boolean primary key default true check(singleton),recorded_from timestamptz not null default statement_timestamp()
);
insert into public.sv_sla_coverage values(true,statement_timestamp());
create table public.sv_sla_policies(
 company_id uuid not null references public.sv_companies(id),brand_id text not null,data jsonb not null,revision bigint not null default 1,primary key(company_id,brand_id)
);
create table public.sv_sla_episodes(
 company_id uuid not null,id uuid not null default gen_random_uuid(),brand_id text not null,provider text not null,thread_id uuid not null,
 first_message uuid not null,started_at timestamptz not null,last_inbound_at timestamptz not null,policy jsonb not null,response_due_at timestamptz,
 first_response_at timestamptz,first_human_at timestamptz,human_actor uuid,human_name text,first_automation_at timestamptz,resolved_at timestamptz,
 primary key(company_id,id),unique(company_id,provider,first_message),
 foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id)
);
create index sv_sla_episode_period on public.sv_sla_episodes(company_id,started_at,id);
create index sv_sla_episode_due on public.sv_sla_episodes(company_id,response_due_at,id)where first_human_at is null and resolved_at is null;
create table public.sv_sla_states(
 company_id uuid not null,provider text not null,thread_id uuid not null,episode_id uuid,last_human_at timestamptz,
 primary key(company_id,provider,thread_id),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),
 foreign key(company_id,episode_id)references public.sv_sla_episodes(company_id,id)
);
create table public.sv_sla_events(
 company_id uuid not null,event_key text not null,brand_id text not null,provider text not null,thread_id uuid not null,
 kind text not null check(kind in('resolved','reopened')),owner_id uuid,created_at timestamptz not null default statement_timestamp(),
 primary key(company_id,event_key),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id)
);
create index sv_sla_event_period on public.sv_sla_events(company_id,created_at,kind);
create function smartvolt_private.sla_default()returns jsonb language sql immutable security invoker set search_path=''as $$
 select '{"timeZone":"Asia/Hong_Kong","hoursEnabled":false,"responseMinutes":15,"weekly":[{"day":1,"start":540,"end":1080},{"day":2,"start":540,"end":1080},{"day":3,"start":540,"end":1080},{"day":4,"start":540,"end":1080},{"day":5,"start":540,"end":1080}],"holidays":[]}'::jsonb
$$;
create function smartvolt_private.sla_policy(p_company uuid,p_brand text)returns jsonb language sql stable security invoker set search_path=''as $$
 select coalesce((select data from public.sv_sla_policies where company_id=p_company and brand_id=p_brand),smartvolt_private.sla_default())
$$;
create function smartvolt_private.work_minutes(p_from timestamptz,p_to timestamptz,p_policy jsonb)returns numeric
language plpgsql stable security invoker set search_path=''as $$
declare result numeric;tz text:=p_policy->>'timeZone';begin
 if p_from is null or p_to is null then return null;end if;
 if p_to<=p_from then return 0;end if;
 if not(p_policy->>'hoursEnabled')::boolean then return extract(epoch from(p_to-p_from))/60;end if;
 select coalesce(sum(greatest(0,extract(epoch from(
  least(p_to,(d::date+make_interval(mins=>(s->>'end')::integer))at time zone tz)-
  greatest(p_from,(d::date+make_interval(mins=>(s->>'start')::integer))at time zone tz)
 ))/60)),0)into result
 from generate_series((p_from at time zone tz)::date::timestamp,(p_to at time zone tz)::date::timestamp,interval '1 day')d,
 jsonb_array_elements(p_policy->'weekly')s
 where extract(isodow from d)=(s->>'day')::integer and not(p_policy->'holidays' ? to_char(d,'YYYY-MM-DD'));
 return result;end;$$;
create function smartvolt_private.work_due(p_from timestamptz,p_minutes integer,p_policy jsonb)returns timestamptz
language plpgsql stable security invoker set search_path=''as $$
declare tz text:=p_policy->>'timeZone';remaining numeric:=p_minutes;day date:=(p_from at time zone tz)::date;i integer;s jsonb;opening timestamptz;closing timestamptz;available numeric;begin
 if not(p_policy->>'hoursEnabled')::boolean then return p_from+make_interval(mins=>p_minutes);end if;
 for i in 0..3660 loop
  if not(p_policy->'holidays' ? to_char(day,'YYYY-MM-DD'))then
   for s in select value from jsonb_array_elements(p_policy->'weekly')where(value->>'day')::integer=extract(isodow from day)order by(value->>'start')::integer loop
    opening=greatest(p_from,(day+make_interval(mins=>(s->>'start')::integer))at time zone tz);
    closing=(day+make_interval(mins=>(s->>'end')::integer))at time zone tz;
    available=greatest(0,extract(epoch from(closing-opening))/60);
    if available>=remaining then return opening+remaining*interval '1 minute';end if;remaining=remaining-available;
   end loop;
  end if;day=day+1;
 end loop;return null;end;$$;

create function smartvolt_private.sla_message()returns trigger language plpgsql security invoker set search_path=''as $$
declare p text;t uuid;link public.sv_customer_threads;s public.sv_sla_states;e public.sv_sla_episodes;policy jsonb;eid uuid;automated boolean;incoming boolean;label text;at timestamptz;sender uuid;begin
 if new.direction='note'then return new;end if;
 p=case when tg_table_name='sv_wa_messages'then 'whatsapp'else 'meta'end;
 if p='whatsapp'then t=new.conversation_id;incoming=new.direction='incoming';sender=new.author_id;else t=new.thread_id;incoming=new.direction='inbound';sender=new.actor_id;end if;
 if incoming and tg_op<>'INSERT'then return new;end if;
 if not incoming then
  if new.state not in('accepted','sent','delivered','read')then return new;end if;
  if tg_op='UPDATE'and old.state in('accepted','sent','delivered','read')then return new;end if;
 end if;
 select * into link from public.sv_customer_threads where company_id=new.company_id and provider=p and thread_id=t;if not found then return new;end if;
 insert into public.sv_sla_states(company_id,provider,thread_id)values(new.company_id,p,t)on conflict do nothing;
 select * into strict s from public.sv_sla_states where company_id=new.company_id and provider=p and thread_id=t for update;
 select * into e from public.sv_sla_episodes where company_id=new.company_id and id=s.episode_id;
 if incoming then
  at=new.created_at;
  if e.id is null or e.first_human_at is not null or e.resolved_at is not null then
   policy=smartvolt_private.sla_policy(new.company_id,link.brand_id);
   insert into public.sv_sla_episodes(company_id,brand_id,provider,thread_id,first_message,started_at,last_inbound_at,policy,response_due_at)
   values(new.company_id,link.brand_id,p,t,new.id,at,at,policy,smartvolt_private.work_due(at,(policy->>'responseMinutes')::integer,policy))returning id into eid;
   update public.sv_sla_states set episode_id=eid where company_id=new.company_id and provider=p and thread_id=t;
  else update public.sv_sla_episodes set last_inbound_at=greatest(last_inbound_at,at)where company_id=new.company_id and id=e.id;end if;
 else
  at=statement_timestamp();
  select exists(select 1 from public.sv_delivery_jobs where company_id=new.company_id and id=new.client_id and origin<>'manual')into automated;
  if not automated and sender is not null then
   select display_name into label from public.sv_memberships where company_id=new.company_id and user_id=sender;
   update public.sv_sla_states set last_human_at=at where company_id=new.company_id and provider=p and thread_id=t;
   update public.sv_sla_episodes set first_response_at=coalesce(first_response_at,at),first_human_at=coalesce(first_human_at,at),
   human_actor=case when first_human_at is null then sender else human_actor end,human_name=case when first_human_at is null then label else human_name end
   where company_id=new.company_id and id=e.id and resolved_at is null;
  else
   update public.sv_sla_episodes set first_response_at=coalesce(first_response_at,at),first_automation_at=case when automated then coalesce(first_automation_at,at)else first_automation_at end
   where company_id=new.company_id and id=e.id and resolved_at is null;
  end if;
 end if;return new;end;$$;
create function smartvolt_private.sla_status()returns trigger language plpgsql security invoker set search_path=''as $$
declare p text;brand text;begin
 if new.status is not distinct from old.status then return new;end if;
 p=case when tg_table_name='sv_wa_conversations'then 'whatsapp'else 'meta'end;
 select brand_id into brand from public.sv_customer_threads where company_id=new.company_id and provider=p and thread_id=new.id;if brand is null then return new;end if;
 insert into public.sv_sla_events(company_id,event_key,brand_id,provider,thread_id,kind,owner_id)
 values(new.company_id,p||':'||new.id||':'||new.revision||':'||new.status,brand,p,new.id,case when new.status='resolved'then 'resolved'else 'reopened'end,new.assignee_id)on conflict do nothing;
 if new.status='resolved'then update public.sv_sla_episodes set resolved_at=statement_timestamp()where company_id=new.company_id and id=(select episode_id from public.sv_sla_states where company_id=new.company_id and provider=p and thread_id=new.id)and resolved_at is null;end if;return new;end;$$;
create trigger sv_sla_wa_message after insert or update of state on public.sv_wa_messages for each row execute function smartvolt_private.sla_message();
create trigger sv_sla_meta_message after insert or update of state on public.sv_meta_messages for each row execute function smartvolt_private.sla_message();
create trigger sv_sla_wa_status after update of status on public.sv_wa_conversations for each row execute function smartvolt_private.sla_status();
create trigger sv_sla_meta_status after update of status on public.sv_meta_threads for each row execute function smartvolt_private.sla_status();

create function public.sv_sla_policy_action(p_company uuid,p_actor uuid,p_command uuid,p_brand text,p_revision bigint,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare r jsonb;request jsonb:=jsonb_build_object('brandId',p_brand,'revision',p_revision,'data',p_data);current_revision bigint;begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,p_brand);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'sla:policy',request);if r is not null then return r;end if;
 if p_brand is null or not exists(select 1 from pg_timezone_names where name=p_data->>'timeZone')
 or jsonb_typeof(p_data->'weekly')<>'array'or jsonb_array_length(p_data->'weekly')not between 1 and 21
 or jsonb_typeof(p_data->'holidays')<>'array'or jsonb_array_length(p_data->'holidays')>366
 or(p_data->>'responseMinutes')::integer not between 1 and 10080 then raise exception 'invalid_sla_policy';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'weekly')s where(s->>'day')::integer not between 1 and 7 or(s->>'start')::integer not between 0 and 1439 or(s->>'end')::integer not between 1 and 1440 or(s->>'start')::integer>=(s->>'end')::integer)
 or exists(select 1 from jsonb_array_elements(p_data->'weekly')with ordinality a(x,i),jsonb_array_elements(p_data->'weekly')with ordinality b(y,j)where i<j and x->>'day'=y->>'day'and greatest((x->>'start')::integer,(y->>'start')::integer)<least((x->>'end')::integer,(y->>'end')::integer))
 or smartvolt_private.work_due(statement_timestamp(),(p_data->>'responseMinutes')::integer,p_data)is null then raise exception 'invalid_sla_hours';end if;
 perform pg_advisory_xact_lock(hashtextextended('sla-policy:'||p_company::text||':'||p_brand,0));
 select revision into current_revision from public.sv_sla_policies where company_id=p_company and brand_id=p_brand for update;
 if coalesce(current_revision,0)is distinct from p_revision then raise exception 'revision_conflict';end if;
 insert into public.sv_sla_policies(company_id,brand_id,data)values(p_company,p_brand,p_data)on conflict(company_id,brand_id)do update set data=excluded.data,revision=sv_sla_policies.revision+1 returning revision into current_revision;
 r=jsonb_build_object('saved',true,'revision',current_revision);
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'sla:policy',request,r);return r;end;$$;

do $$declare t text;f record;begin
 foreach t in array array['sv_sla_coverage','sv_sla_policies','sv_sla_episodes','sv_sla_states','sv_sla_events']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 revoke insert,update on public.sv_sla_coverage from service_role;revoke update on public.sv_sla_events from service_role;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('sla_default','sla_policy','work_minutes','work_due','sla_message','sla_status','sv_sla_policy_action')loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;end;$$;
create trigger sv_sla_events_immutable before update or delete on public.sv_sla_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_sla_events_no_truncate before truncate on public.sv_sla_events for each statement execute function smartvolt_private.wa_reject_rewrite();

create function smartvolt_private.sla_legacy_pending(p_company uuid,p_provider text,p_thread uuid,p_human timestamptz)returns boolean language sql stable security invoker set search_path=''as $$
 with messages as(
 select m.created_at,m.direction='incoming'incoming,m.direction='outgoing'outgoing,m.state,m.author_id actor,m.client_id
 from public.sv_wa_messages m where p_provider='whatsapp'and m.company_id=p_company and m.conversation_id=p_thread
 union all select m.created_at,m.direction='inbound',m.direction='outbound',m.state,m.actor_id,m.client_id
 from public.sv_meta_messages m where p_provider='meta'and m.company_id=p_company and m.thread_id=p_thread)
 select coalesce(max(created_at)filter(where incoming)>greatest(coalesce(p_human,'epoch'),coalesce(max(created_at)filter(where outgoing and actor is not null and state in('accepted','sent','delivered','read')and not exists(select 1 from public.sv_delivery_jobs j where j.company_id=p_company and j.id=messages.client_id and j.origin<>'manual')),'epoch')),false)from messages
$$;
create view smartvolt_private.sla_queue with(security_invoker=true)as
 select i.*,c.name customer_name,m.display_name owner_name,e.id episode_id,e.started_at,e.response_due_at,e.first_automation_at,
 coalesce(e.response_due_at,'9999-12-31T00:00:00Z'::timestamptz)sort_at,i.provider||':'||i.thread_id key,
 ed.expires_at>statement_timestamp()editing,case when ed.expires_at>statement_timestamp()then em.display_name end editor_name
 from smartvolt_private.ops_inquiries i join public.sv_customers c on c.company_id=i.company_id and c.id=i.customer_id
 left join public.sv_sla_states s on s.company_id=i.company_id and s.provider=i.provider and s.thread_id=i.thread_id
 left join public.sv_sla_episodes e on e.company_id=s.company_id and e.id=s.episode_id
 left join public.sv_memberships m on m.company_id=i.company_id and m.user_id=i.assignee_id
 left join public.sv_thread_editors ed on ed.company_id=i.company_id and ed.provider=i.provider and ed.thread_id=i.thread_id
 left join public.sv_memberships em on em.company_id=ed.company_id and em.user_id=ed.actor_id
 where i.status='open'and((e.id is not null and e.first_human_at is null and e.resolved_at is null)or(e.id is null and smartvolt_private.sla_legacy_pending(i.company_id,i.provider,i.thread_id,s.last_human_at)));
revoke all on smartvolt_private.sla_queue from public,anon,authenticated,service_role;grant select on smartvolt_private.sla_queue to service_role;
create function public.sv_supervision_read(p_company uuid,p_actor uuid,p_brand text default null,p_after timestamptz default null,p_after_key text default null,p_from timestamptz default null,p_to timestamptz default null)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare result jsonb;begin
 perform public.sv_authorize(p_company,p_actor,'crm',false,true,p_brand);
 if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '367 days'then raise exception 'invalid_period';end if;
 with queue as materialized(select q.*from smartvolt_private.sla_queue q where q.company_id=p_company and(p_brand is null or q.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,q.brand_id)),
 episodes as materialized(select e.*from public.sv_sla_episodes e where e.company_id=p_company and e.started_at>=p_from and e.started_at<p_to and(p_brand is null or e.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id))
 select jsonb_build_object(
 'coverageFrom',(select recorded_from from public.sv_sla_coverage where singleton),'checkedAt',statement_timestamp(),
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'policy',case when p_brand is null then null else jsonb_build_object('data',smartvolt_private.sla_policy(p_company,p_brand),'revision',coalesce((select revision from public.sv_sla_policies where company_id=p_company and brand_id=p_brand),0))end,
 'metrics',jsonb_build_object('pending',(select count(*)from queue),'overdue',(select count(*)from queue where response_due_at<=statement_timestamp()),'unmeasured',(select count(*)from queue where episode_id is null),
 'episodes',(select count(*)from episodes),'humanAnswered',(select count(*)from episodes where first_human_at is not null and first_human_at<p_to),
 'automatedAnswered',(select count(*)from episodes where first_automation_at is not null and first_automation_at<p_to),
 'averageResponseMinutes',(select round(avg(smartvolt_private.work_minutes(started_at,first_human_at,policy)),1)from episodes where first_human_at is not null and first_human_at<p_to),
 'withinTarget',(select count(*)from episodes where first_human_at is not null and first_human_at<p_to and first_human_at<=response_due_at),
 'resolved',(select count(*)from public.sv_sla_events e where e.company_id=p_company and e.kind='resolved'and e.created_at>=p_from and e.created_at<p_to and(p_brand is null or e.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id)),
 'reopened',(select count(*)from public.sv_sla_events e where e.company_id=p_company and e.kind='reopened'and e.created_at>=p_from and e.created_at<p_to and(p_brand is null or e.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id))),
 'queue',coalesce((select jsonb_agg(q order by q.sort_at,q.key)from(select key,provider,thread_id,customer_id,brand_id,channel,customer_name,owner_name,started_at,response_due_at,first_automation_at,sort_at,episode_id is not null measured,coalesce(editing,false)editing,editor_name from queue where p_after is null or(sort_at,key)>(p_after,p_after_key)order by sort_at,key limit 51)q),'[]')
 )into result;return result;end;$$;
revoke all on function smartvolt_private.sla_legacy_pending(uuid,text,uuid,timestamptz),public.sv_supervision_read(uuid,uuid,text,timestamptz,text,timestamptz,timestamptz)from public,anon,authenticated;
grant execute on function smartvolt_private.sla_legacy_pending(uuid,text,uuid,timestamptz),public.sv_supervision_read(uuid,uuid,text,timestamptz,text,timestamptz,timestamptz)to service_role;
