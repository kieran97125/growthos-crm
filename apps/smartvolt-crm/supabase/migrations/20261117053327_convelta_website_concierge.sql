-- Product Learning Sync checked: durable accepted capture, notification lifecycle,
-- immutable reviewed source and company/brand-scoped operational ownership.
alter table public.sv_web_chat_configs
 add column ai_enabled boolean not null default false,
 add column ai_article_ids text[] not null default '{}',
 add column accent_color text not null default '#2457E7' check(accent_color ~ '^#[0-9A-Fa-f]{6}$'),
 add constraint sv_web_chat_public_article_limit check(cardinality(ai_article_ids)<=30);
alter table public.sv_web_chat_threads
 add column human_waiting boolean not null default false,
 add column human_requested_at timestamptz,
 add column assigned_actor_id uuid,
 add column c_paused boolean not null default false,
 add column visitor_preference text not null default 'cooperate' check(visitor_preference in('cooperate','human_only')),
 add column attention_sequence bigint not null default 0,
 add column last_staff_at timestamptz,
 add column intent text not null default '需要進一步了解',
 add column intent_basis text not null default 'unknown' check(intent_basis in('stated','inferred','unknown')),
 add column inquiry_summary text not null default '' check(length(inquiry_summary)<=600),
 add column unanswered text not null default '' check(length(unanswered)<=600),
 add foreign key(company_id,assigned_actor_id) references public.sv_memberships(company_id,user_id);
alter table public.sv_web_chat_messages add column sender text;
update public.sv_web_chat_messages set sender=case when direction='incoming' then 'visitor' else 'staff' end;
alter table public.sv_web_chat_messages alter column sender set not null;
alter table public.sv_web_chat_messages drop constraint sv_web_chat_messages_check;
alter table public.sv_web_chat_messages add constraint sv_web_chat_sender_check check(
 (sender='visitor' and direction='incoming' and actor_id is null and actor_name is null) or
 (sender='staff' and direction='outgoing' and actor_id is not null and actor_name is not null) or
 (sender='c' and direction='outgoing' and actor_id is null and actor_name='C · AI 助理'));
create function smartvolt_private.web_chat_sender() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.sender is null then new.sender=case when new.direction='incoming' then 'visitor' else 'staff' end;end if;
 return new;
end;$$;
create trigger sv_web_chat_sender before insert on public.sv_web_chat_messages for each row execute function smartvolt_private.web_chat_sender();

create table public.sv_web_chat_c_turns(
 company_id uuid not null,thread_id uuid not null,message_id uuid not null,
 turn_kind text not null check(turn_kind in('message','human','human_only','resume_c')),
 state text not null check(state in('queued','running','completed','failed','skipped','superseded')),
 source_revision bigint not null,context_hash text,model text,
 admitted_at timestamptz,finished_at timestamptz,error_code text,input_tokens integer,output_tokens integer,
 result jsonb,created_at timestamptz not null default now(),
 primary key(company_id,thread_id,message_id),unique(company_id,message_id),
 foreign key(company_id,thread_id,message_id) references public.sv_web_chat_messages(company_id,thread_id,id),
 check(input_tokens is null or input_tokens>=0),check(output_tokens is null or output_tokens>=0),
 check(result is null or octet_length(result::text)<=30000)
);
create index sv_web_chat_c_pending on public.sv_web_chat_c_turns(company_id,created_at) where state in('queued','running');
create index sv_web_chat_c_usage on public.sv_web_chat_c_turns(company_id,admitted_at) where admitted_at is not null;
alter table public.sv_web_chat_c_turns enable row level security;
revoke all on public.sv_web_chat_c_turns from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_web_chat_c_turns to service_role;
create function smartvolt_private.web_chat_c_receipt_guard() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if old.state not in('queued','running') or
 (new.company_id,new.thread_id,new.message_id,new.turn_kind,new.source_revision,new.created_at) is distinct from
 (old.company_id,old.thread_id,old.message_id,old.turn_kind,old.source_revision,old.created_at) or
 (old.admitted_at is not null and (new.admitted_at,new.model,new.context_hash) is distinct from(old.admitted_at,old.model,old.context_hash))
 then raise exception 'chat_c_receipt_immutable';end if;return new;
end;$$;
create trigger sv_web_chat_c_receipt_guard before update on public.sv_web_chat_c_turns for each row execute function smartvolt_private.web_chat_c_receipt_guard();

create function smartvolt_private.web_chat_public_articles(c public.sv_web_chat_configs) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(a order by a->>'id'),'[]') from public.sv_workspaces w,
 jsonb_array_elements(w.payload#>'{studio,articles}')a where w.company_id=c.company_id
 and a->>'clientId'=c.company_id::text and a->>'brandId'=c.brand_id and a->>'status'='approved'
 and a->>'id'=any(c.ai_article_ids) and coalesce(a#>>'{coaching,kind}','')<>'pattern'
 and a->>'validUntil' ~ '^\d{4}-\d{2}-\d{2}$'
 and a->>'validUntil'>=to_char(statement_timestamp() at time zone 'Asia/Hong_Kong','YYYY-MM-DD')
$$;
create function smartvolt_private.web_chat_c_context_hash(c public.sv_web_chat_configs) returns text
language sql stable security invoker set search_path='' as $$
 select md5(jsonb_build_object('articles',smartvolt_private.web_chat_public_articles(c),
 'profile',(select b from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,bots}')b where w.company_id=c.company_id and b->>'brandId'=c.brand_id),
 'name',(select name from public.sv_companies where id=c.company_id))::text)
$$;

alter function public.sv_web_chat_settings(uuid,uuid) rename to sv_web_chat_settings_before_c;
alter function public.sv_web_chat_settings_before_c(uuid,uuid) set schema smartvolt_private;
create function public.sv_web_chat_settings(p_company uuid,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 r=smartvolt_private.sv_web_chat_settings_before_c(p_company,p_actor);
 return r||jsonb_build_object('canManageAI',exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner' and status='active'),
 'configs',coalesce((select jsonb_agg(v||jsonb_build_object('aiEnabled',c.ai_enabled,'aiArticleIds',c.ai_article_ids,'accentColor',c.accent_color)) from jsonb_array_elements(r->'configs')v join public.sv_web_chat_configs c on c.company_id=p_company and c.id=(v->>'id')::uuid),'[]'),
 'publicArticles',coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','brandId',a->>'brandId','title',a->>'title')) from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,articles}')a where w.company_id=p_company and a->>'clientId'=p_company::text and a->>'status'='approved' and coalesce(a#>>'{coaching,kind}','')<>'pattern' and a->>'validUntil'>=to_char(statement_timestamp()at time zone 'Asia/Hong_Kong','YYYY-MM-DD') and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')),'[]'));
end;$$;
alter function public.sv_web_chat_configure(uuid,uuid,uuid,jsonb,text) rename to sv_web_chat_configure_before_c;
alter function public.sv_web_chat_configure_before_c(uuid,uuid,uuid,jsonb,text) set schema smartvolt_private;
create function public.sv_web_chat_configure(p_company uuid,p_actor uuid,p_command uuid,p_data jsonb,p_verification text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare old public.sv_web_chat_configs;c public.sv_web_chat_configs;r jsonb;want boolean;ids text[];color text;begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,p_data->>'brandId');
 perform pg_advisory_xact_lock(hashtextextended('web-chat-config:'||p_company::text||':'||(p_data->>'id'),0));
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-config',p_data);if r is not null then return r;end if;
 select * into old from public.sv_web_chat_configs where company_id=p_company and id=(p_data->>'id')::uuid for update;
 want=coalesce((p_data->>'aiEnabled')::boolean,old.ai_enabled,false);
 ids=case when p_data?'aiArticleIds' then array(select distinct v from jsonb_array_elements_text(p_data->'aiArticleIds')v order by v) else coalesce(old.ai_article_ids,'{}') end;
 color=coalesce(p_data->>'accentColor',old.accent_color,'#2457E7');
 if color !~ '^#[0-9A-Fa-f]{6}$' or cardinality(ids)>30 then raise exception 'chat_settings_invalid';end if;
 if want is distinct from coalesce(old.ai_enabled,false) or ids is distinct from coalesce(old.ai_article_ids,'{}') then perform public.sv_ai_authorize(p_company,p_actor,true);end if;
 if want then
  if not exists(select 1 from public.sv_ai_settings where company_id=p_company and enabled) then raise exception 'chat_ai_disabled';end if;
  c.company_id=p_company;c.brand_id=p_data->>'brandId';c.ai_article_ids=ids;
  if cardinality(ids)=0 or jsonb_array_length(smartvolt_private.web_chat_public_articles(c))<>cardinality(ids) then raise exception 'chat_public_knowledge_required';end if;
 end if;
 r=smartvolt_private.sv_web_chat_configure_before_c(p_company,p_actor,p_command,p_data,p_verification);
 update public.sv_web_chat_configs set ai_enabled=want,ai_article_ids=ids,accent_color=upper(color) where company_id=p_company and id=(p_data->>'id')::uuid;
 return r;
end;$$;
create function public.sv_web_chat_activate(p_company uuid,p_actor uuid,p_command uuid,p_config uuid,p_revision bigint,p_proof text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sv_web_chat_configs;r jsonb;d jsonb:=jsonb_build_object('id',p_config,'revision',p_revision);begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true);
 select * into strict c from public.sv_web_chat_configs where company_id=p_company and id=p_config for update;
 perform public.sv_member_scope(p_company,p_actor,c.brand_id);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-activate',d);if r is not null then return r;end if;
 if c.revision<>p_revision then raise exception 'revision_conflict';end if;
 if p_proof is distinct from c.verification then raise exception 'chat_domain_unverified';end if;
 update public.sv_web_chat_configs set enabled=true,verified_origins=origins,revision=revision+1,updated_at=now() where company_id=p_company and id=p_config;
 r='{"ok":true}';insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'web-chat-activate',d,r);return r;
end;$$;
create or replace function public.sv_web_chat_public_config(p_id uuid,p_origin text) returns jsonb language plpgsql security invoker set search_path='' as $$declare c public.sv_web_chat_configs;begin
 c=smartvolt_private.web_chat_config(p_id,p_origin);
 return jsonb_build_object('id',c.id,'name',c.name,'greeting',c.greeting,'origin',p_origin,'aiEnabled',c.ai_enabled,'accentColor',c.accent_color);
end;$$;

create function smartvolt_private.web_chat_append_c(p_company uuid,p_thread uuid,p_body text) returns uuid language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;new_id uuid:=gen_random_uuid();begin
 select * into strict t from public.sv_web_chat_threads where company_id=p_company and id=p_thread for update;
 if length(trim(p_body)) not between 1 and 2000 then raise exception 'chat_body_invalid';end if;
 if(select count(*)from public.sv_web_chat_messages where company_id=p_company and thread_id=p_thread)>=600 then return null;end if;
 update public.sv_web_chat_threads set revision=revision+1,preview=left(p_body,160),last_message_at=now() where company_id=p_company and id=p_thread returning * into t;
 insert into public.sv_web_chat_messages(company_id,thread_id,id,sequence,direction,body,actor_name,sender)values(p_company,p_thread,new_id,t.revision,'outgoing',p_body,'C · AI 助理','c');
 return new_id;
end;$$;
create function public.sv_web_chat_receive(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_command uuid,p_body text,p_kind text default 'message',p_assessment jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;c public.sv_web_chat_configs;m public.sv_web_chat_messages;turn public.sv_web_chat_c_turns;human boolean;pref text;begin
 t=smartvolt_private.web_chat_session(p_id,p_origin,p_thread,p_hash);
 select * into strict t from public.sv_web_chat_threads where company_id=t.company_id and id=t.id for update;
 select * into m from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id and id=p_command;
 if found then
  select * into turn from public.sv_web_chat_c_turns where company_id=t.company_id and thread_id=t.id and message_id=p_command;
  if m.sender<>'visitor' or m.body<>p_body or (turn.turn_kind is not null and turn.turn_kind<>p_kind) then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('ok',true,'id',p_command,'companyId',t.company_id);
 end if;
 if t.status<>'open' then raise exception 'chat_closed';end if;
 if p_kind not in('message','human','human_only','resume_c') or length(trim(p_body)) not between 1 and 2000 then raise exception 'chat_body_invalid';end if;
 if(select count(*)from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id)>=300 then raise exception 'chat_limit_reached';end if;
 perform smartvolt_private.web_chat_limit(p_id,'send:'||p_thread::text,interval '1 minute',6);
 perform smartvolt_private.web_chat_limit(p_id,'send-hour:'||p_thread::text,interval '1 hour',60);
 perform smartvolt_private.web_chat_limit(p_id,'send:all',interval '1 hour',2000);
 c=smartvolt_private.web_chat_config(p_id,p_origin);
 human=p_kind in('human','human_only') or coalesce((p_assessment->>'human')::boolean,false);
 pref=case when p_kind='human_only' then 'human_only' when p_kind='resume_c' then 'cooperate' when p_assessment->>'preference' in('cooperate','human_only') then p_assessment->>'preference' else t.visitor_preference end;
 update public.sv_web_chat_threads set revision=revision+1,preview=left(p_body,160),unread=true,last_message_at=now(),
 attention_sequence=case when not unread and not human_waiting then revision+1 else attention_sequence end,
 human_waiting=human_waiting or human,human_requested_at=case when human and not human_waiting then now() else human_requested_at end,
 visitor_preference=pref,intent=left(coalesce(p_assessment->>'intentLabel','需要進一步了解'),100),
 intent_basis=case when p_assessment->>'intentBasis' in('stated','inferred')then p_assessment->>'intentBasis'else'unknown'end,
 inquiry_summary=left(coalesce(p_assessment->>'summary',p_body),600),unanswered=left(p_body,600)
 where company_id=t.company_id and id=t.id returning * into t;
 insert into public.sv_web_chat_messages(company_id,thread_id,id,sequence,direction,body,sender)values(t.company_id,t.id,p_command,t.revision,'incoming',p_body,'visitor');
 insert into public.sv_web_chat_c_turns(company_id,thread_id,message_id,turn_kind,source_revision,state)
 values(t.company_id,t.id,p_command,p_kind,t.revision,case when c.ai_enabled and not t.c_paused and pref='cooperate' and not human then 'queued' else 'skipped' end);
 if human then perform smartvolt_private.web_chat_append_c(t.company_id,t.id,'收到，我已將你嘅查詢交到客服工作台，請稍等，客服會盡快回覆你。');end if;
 perform smartvolt_private.web_chat_notify(t.company_id,t.id);
 if t.customer_id is not null then insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail)values(t.company_id,t.customer_id,t.brand_id,'website-message:'||p_command,'website-message',jsonb_build_object('threadId',t.id,'messageId',p_command,'direction','incoming'))on conflict do nothing;end if;
 return jsonb_build_object('ok',true,'id',p_command,'companyId',t.company_id);
end;$$;
create or replace function public.sv_web_chat_visitor_send(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_command uuid,p_body text) returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 r=public.sv_web_chat_receive(p_id,p_origin,p_thread,p_hash,p_command,p_body);return r-'companyId';
end;$$;

create function smartvolt_private.web_chat_attention(t public.sv_web_chat_threads) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('humanWaiting',t.human_waiting,'humanRequestedAt',t.human_requested_at,'waitingMinutes',case when t.human_waiting then greatest(0,floor(extract(epoch from(now()-t.human_requested_at))/60))else 0 end,'assigneeId',t.assigned_actor_id,
 'assigneeName',(select display_name from public.sv_memberships where company_id=t.company_id and user_id=t.assigned_actor_id),
 'cPaused',t.c_paused,'preference',t.visitor_preference,'intent',t.intent,'intentBasis',t.intent_basis,'summary',t.inquiry_summary,'unanswered',t.unanswered,
 'aiState',(select state from public.sv_web_chat_c_turns where company_id=t.company_id and thread_id=t.id order by created_at desc limit 1),
 'aiEnabled',(select ai_enabled from public.sv_web_chat_configs where company_id=t.company_id and id=t.config_id))
$$;
create or replace function smartvolt_private.web_chat_thread_json(t public.sv_web_chat_threads) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',t.id,'brandId',t.brand_id,'brandName',coalesce((select b->>'name'from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=t.company_id and b->>'id'=t.brand_id),t.brand_id),
 'visitorName',case when t.visitor_name=''then'網站訪客'else t.visitor_name end,'preview',t.preview,'lastMessageAt',t.last_message_at,'unread',t.unread,'customerId',t.customer_id,'status',t.status,'revision',t.revision,'site',t.origin)||smartvolt_private.web_chat_attention(t)
$$;
create or replace function public.sv_web_chat_visitor_read(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_after bigint default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;rows jsonb;a jsonb;begin
 t=smartvolt_private.web_chat_session(p_id,p_origin,p_thread,p_hash);
 perform smartvolt_private.web_chat_limit(p_id,'read:'||p_thread::text,interval '1 minute',40);
 perform smartvolt_private.web_chat_limit(p_id,'read:all',interval '1 minute',6000);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'direction',m.direction,'sender',m.sender,'createdAt',m.created_at,'actorName',m.actor_name,'sequence',m.sequence)order by m.sequence),'[]') into rows from(select *from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id and sequence>greatest(0,p_after)order by sequence limit 51)m;
 a=smartvolt_private.web_chat_attention(t);
 return jsonb_build_object('status',t.status,'revision',t.revision,'messages',rows,'expiresAt',t.expires_at,'humanWaiting',t.human_waiting,'preference',t.visitor_preference,'cPaused',t.c_paused,'aiState',a->'aiState','aiEnabled',a->'aiEnabled');
end;$$;
-- Preserve the existing scoped pagination/read contract and only enrich returned messages.
alter function public.sv_web_chat_staff_read(uuid,uuid,jsonb) rename to sv_web_chat_staff_read_before_c;
alter function public.sv_web_chat_staff_read_before_c(uuid,uuid,jsonb) set schema smartvolt_private;
create function public.sv_web_chat_staff_read(p_company uuid,p_actor uuid,p_query jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 r=smartvolt_private.sv_web_chat_staff_read_before_c(p_company,p_actor,p_query);
 if p_query->>'threadId' is not null then
  r=jsonb_set(r,'{messages}',coalesce((select jsonb_agg(v||jsonb_build_object('sender',m.sender)order by m.sequence)from jsonb_array_elements(r->'messages')v join public.sv_web_chat_messages m on m.company_id=p_company and m.thread_id=(p_query->>'threadId')::uuid and m.id=(v->>'id')::uuid),'[]'));
 end if;return r;
end;$$;
alter function public.sv_web_chat_staff_action(uuid,uuid,uuid,jsonb) rename to sv_web_chat_staff_action_before_c;
alter function public.sv_web_chat_staff_action_before_c(uuid,uuid,uuid,jsonb) set schema smartvolt_private;
create function public.sv_web_chat_staff_action(p_company uuid,p_actor uuid,p_command uuid,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;r jsonb;role text;begin
 role=public.sv_authorize(p_company,p_actor,'crm',true);
 select * into strict t from public.sv_web_chat_threads where company_id=p_company and id=(p_data->>'threadId')::uuid for update;
 perform public.sv_member_scope(p_company,p_actor,t.brand_id);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-staff',p_data);if r is not null then return r;end if;
 if t.revision<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
 if p_data->>'action' in('claim','pauseC','resumeC') then
  if t.status<>'open' then raise exception 'chat_closed';end if;
  if t.assigned_actor_id is not null and t.assigned_actor_id<>p_actor and role not in('owner','manager') then raise exception 'chat_already_claimed';end if;
  update public.sv_web_chat_threads set assigned_actor_id=case when p_data->>'action'='claim'then p_actor else assigned_actor_id end,
  c_paused=case when p_data->>'action'='pauseC'then true when p_data->>'action'='resumeC'then false else c_paused end,revision=revision+1 where company_id=p_company and id=t.id;
  r='{"ok":true}';insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'web-chat-staff',p_data,r);
 else
  r=smartvolt_private.sv_web_chat_staff_action_before_c(p_company,p_actor,p_command,p_data);
  if p_data->>'action'='reply' then update public.sv_web_chat_threads set human_waiting=false,assigned_actor_id=p_actor,last_staff_at=now(),unanswered='' where company_id=p_company and id=t.id;
  elsif p_data->>'action'='close' then update public.sv_web_chat_threads set human_waiting=false,unread=false where company_id=p_company and id=t.id;end if;
 end if;return r;
end;$$;

-- A single shared settings-row lock serializes staff and public AI admission.
create function smartvolt_private.web_chat_staff_budget_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare used bigint;cap integer;day_start timestamptz:=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';begin
 select daily_limit into cap from public.sv_ai_settings where company_id=new.company_id for update;
 select count(*) into used from public.sv_web_chat_c_turns where company_id=new.company_id and admitted_at>=day_start and admitted_at<day_start+interval'1 day';
 if used>0 and used+(select count(*)from public.sv_ai_requests where company_id=new.company_id and created_at>=day_start and created_at<day_start+interval'1 day')>=cap then raise exception'ai_daily_limit';end if;return new;
end;$$;
create trigger sv_web_chat_staff_budget before insert on public.sv_ai_requests for each row execute function smartvolt_private.web_chat_staff_budget_guard();
create function public.sv_web_chat_c_claim(p_company uuid,p_message uuid,p_model text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;c public.sv_web_chat_configs;j public.sv_web_chat_c_turns;s public.sv_ai_settings;articles jsonb;profile jsonb;history jsonb;body text;reason text;day_start timestamptz:=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';begin
 select * into s from public.sv_ai_settings where company_id=p_company for update;
 select * into strict j from public.sv_web_chat_c_turns where company_id=p_company and message_id=p_message for update;
 if j.state='running' and j.admitted_at<now()-interval'2 minutes' then
  update public.sv_web_chat_c_turns set state='failed',error_code='worker_interrupted',finished_at=now()where company_id=p_company and message_id=p_message;
  update public.sv_web_chat_threads set human_waiting=true,human_requested_at=coalesce(human_requested_at,now())where company_id=p_company and id=j.thread_id and status='open';
  return jsonb_build_object('dispatch',false,'state','failed');
 end if;
 if j.state<>'queued'then return jsonb_build_object('dispatch',false,'state',j.state);end if;
 select * into strict t from public.sv_web_chat_threads where company_id=p_company and id=j.thread_id for update;
 select * into strict c from public.sv_web_chat_configs where company_id=p_company and id=t.config_id;
 if not c.enabled or not(t.origin=any(c.origins)) or not(t.origin=any(c.verified_origins)) or j.created_at<now()-interval'5 minutes' or t.status<>'open' or t.expires_at<=now() or t.revision<>j.source_revision or not c.ai_enabled or t.c_paused or t.visitor_preference='human_only' then reason='context_changed';
 elsif not exists(select 1 from public.sv_companies where id=p_company and status='active') or not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm'and status='active'and starts_at<=now()and(ends_at is null or ends_at>now())) then reason='context_changed';
 elsif not coalesce(s.enabled,false) or p_model is null or not exists(select 1 from public.sv_ai_runtime where id='platform'and model=p_model and status='ready') then reason='ai_unavailable';
 elsif (select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=day_start and created_at<day_start+interval'1 day')+(select count(*)from public.sv_web_chat_c_turns where company_id=p_company and admitted_at>=day_start and admitted_at<day_start+interval'1 day')>=s.daily_limit then reason='ai_daily_limit';
 elsif(select count(*)from public.sv_web_chat_c_turns where company_id=p_company and thread_id=t.id and admitted_at>=now()-interval'1 hour')>=20 then reason='ai_rate_limited';end if;
 articles=smartvolt_private.web_chat_public_articles(c);
 select b into profile from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,bots}')b where w.company_id=p_company and b->>'brandId'=c.brand_id;
 if reason is null and(jsonb_array_length(articles)=0 or profile is null)then reason='knowledge_required';end if;
 if reason is not null then
  update public.sv_web_chat_c_turns set state='skipped',error_code=reason,finished_at=now()where company_id=p_company and message_id=p_message;
  if reason<>'context_changed'then
   if not t.human_waiting then perform smartvolt_private.web_chat_append_c(p_company,t.id,'呢個問題需要同事再核實，我已將問題交到客服工作台，客服會盡快喺呢度回覆你。');end if;
   update public.sv_web_chat_threads set human_waiting=true,human_requested_at=coalesce(human_requested_at,now())where company_id=p_company and id=t.id;
  end if;perform smartvolt_private.web_chat_notify(p_company,t.id);return jsonb_build_object('dispatch',false,'state','skipped');
 end if;
 select m.body into strict body from public.sv_web_chat_messages m where m.company_id=p_company and m.thread_id=t.id and m.id=p_message and m.sender='visitor';
 select coalesce(jsonb_agg(jsonb_build_object('role',case when direction='incoming'then'user'else'assistant'end,'content',left(m.body,1500))order by m.sequence),'[]')into history from(select *from public.sv_web_chat_messages where company_id=p_company and thread_id=t.id and sequence<j.source_revision order by sequence desc limit 12)m;
 update public.sv_web_chat_c_turns set state='running',admitted_at=now(),model=p_model,context_hash=smartvolt_private.web_chat_c_context_hash(c)where company_id=p_company and message_id=p_message;
 return jsonb_build_object('dispatch',true,'companyId',p_company,'brandId',t.brand_id,'companyName',(select name from public.sv_companies where id=p_company),'name',t.visitor_name,'message',body,'profile',profile,'articles',articles,'history',history);
end;$$;
create function public.sv_web_chat_c_finish(p_company uuid,p_message uuid,p_result jsonb,p_error text,p_input integer,p_output integer) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.sv_web_chat_c_turns;t public.sv_web_chat_threads;c public.sv_web_chat_configs;reason text:=p_error;answer_id uuid;begin
 perform 1 from public.sv_ai_settings where company_id=p_company for share;
 select * into strict j from public.sv_web_chat_c_turns where company_id=p_company and message_id=p_message for update;
 if j.state<>'running'then return jsonb_build_object('state',j.state);end if;
 select * into strict t from public.sv_web_chat_threads where company_id=p_company and id=j.thread_id for update;
 select * into strict c from public.sv_web_chat_configs where company_id=p_company and id=t.config_id for share;
 if t.status<>'open' or t.expires_at<=now() or t.revision<>j.source_revision or not c.enabled or not c.ai_enabled or t.c_paused or t.visitor_preference='human_only'
 or not(t.origin=any(c.verified_origins)) or not(t.origin=any(c.origins))
 or not exists(select 1 from public.sv_companies where id=p_company and status='active')
 or not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm'and status='active'and starts_at<=now()and(ends_at is null or ends_at>now()))
 or not exists(select 1 from public.sv_ai_settings where company_id=p_company and enabled)
 or j.context_hash is distinct from smartvolt_private.web_chat_c_context_hash(c)then reason='context_changed';end if;
 if reason='context_changed'then
  update public.sv_web_chat_c_turns set state='superseded',error_code=reason,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and message_id=p_message;
  return jsonb_build_object('state','superseded');
 end if;
 if reason is null and p_result->>'decision'='draft' and length(trim(p_result->>'reply'))between 1 and 1500 and jsonb_array_length(coalesce(p_result->'sources','[]'))>0 then
  answer_id=smartvolt_private.web_chat_append_c(p_company,t.id,p_result->>'reply');
  -- The receipt cannot clear unread or the independently requested human response.
  update public.sv_web_chat_threads set inquiry_summary=left(coalesce(nullif(trim(p_result->>'summary'),''),inquiry_summary),600),unanswered=case when human_waiting then unanswered else '' end where company_id=p_company and id=t.id;
  update public.sv_web_chat_c_turns set state='completed',result=p_result,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and message_id=p_message;
 else
  if not t.human_waiting then answer_id=smartvolt_private.web_chat_append_c(p_company,t.id,'呢個問題需要同事再核實，我已將問題交到客服工作台，客服會盡快喺呢度回覆你。');end if;
  update public.sv_web_chat_threads set human_waiting=true,human_requested_at=case when not human_waiting then now()else human_requested_at end where company_id=p_company and id=t.id;
  update public.sv_web_chat_c_turns set state='failed',error_code=coalesce(reason,'answer_verification_failed'),input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and message_id=p_message;
 end if;perform smartvolt_private.web_chat_notify(p_company,t.id);return jsonb_build_object('state',(select state from public.sv_web_chat_c_turns where company_id=p_company and message_id=p_message),'messageId',answer_id);
end;$$;
create function public.sv_web_chat_c_pending(p_company uuid)returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(message_id order by created_at),'[]')from(select message_id,created_at from public.sv_web_chat_c_turns where company_id=p_company and(state='queued'or(state='running'and admitted_at<now()-interval'2 minutes'))order by created_at limit 4)j
$$;

alter table public.sv_notifications drop constraint sv_notifications_kind_check;
alter table public.sv_notifications add constraint sv_notifications_kind_check check(kind in('assignment','followup','sla','observation','website'));
alter function smartvolt_private.notification_candidates(uuid,uuid) rename to notification_candidates_before_web_chat;
create function smartvolt_private.notification_candidates(p_company uuid,p_actor uuid) returns table(source_key text,brand_id text,kind text,title text,href text)language sql stable security invoker set search_path='' as $$
 select *from smartvolt_private.notification_candidates_before_web_chat(p_company,p_actor)
 union all select 'website:'||t.id||':'||t.attention_sequence,t.brand_id,'website',case when t.human_waiting then'網站客人正等候真人回覆'else'網站有新查詢'end,
 '/company/'||p_company||'/crm?provider=website&thread='||t.id
 from public.sv_web_chat_threads t join public.sv_memberships m on m.company_id=t.company_id and m.user_id=p_actor and m.status='active'and m.role<>'viewer'
 where t.company_id=p_company and t.status='open'and(t.unread or t.human_waiting)and t.attention_sequence>0
 and(t.assigned_actor_id=p_actor or(t.assigned_actor_id is null and m.role in('owner','manager'))or m.role in('owner','manager'))
 and smartvolt_private.member_has_product(p_company,p_actor,'crm')and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id)
$$;
alter function public.sv_notification_read(uuid,uuid,timestamptz,uuid) rename to sv_notification_read_before_web_chat;
alter function public.sv_notification_read_before_web_chat(uuid,uuid,timestamptz,uuid) set schema smartvolt_private;
create function public.sv_notification_read(p_company uuid,p_actor uuid,p_before timestamptz default null,p_id uuid default null)returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 r=smartvolt_private.sv_notification_read_before_web_chat(p_company,p_actor,p_before,p_id);
 return jsonb_set(r,'{rows}',coalesce((select jsonb_agg(v||case when t.id is not null then jsonb_build_object('website',smartvolt_private.web_chat_attention(t)||jsonb_build_object('visitorName',coalesce(nullif(t.visitor_name,''),'網站訪客'),'site',t.origin))else'{}'::jsonb end order by(v->>'created_at')desc,v->>'id')from jsonb_array_elements(r->'rows')v left join public.sv_notifications n on n.company_id=p_company and n.user_id=p_actor and n.id=(v->>'id')::uuid left join public.sv_web_chat_threads t on t.company_id=p_company and n.kind='website'and n.source_key='website:'||t.id||':'||t.attention_sequence and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id)),'[]'));
end;$$;
alter function public.sv_notification_action(uuid,uuid,uuid,text,jsonb) rename to sv_notification_action_before_web_chat;
alter function public.sv_notification_action_before_web_chat(uuid,uuid,uuid,text,jsonb) set schema smartvolt_private;
create function public.sv_notification_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 if p_kind in('done','snooze')and exists(select 1 from public.sv_notifications n join public.sv_web_chat_threads t on t.company_id=n.company_id and n.source_key='website:'||t.id||':'||t.attention_sequence where n.company_id=p_company and n.user_id=p_actor and n.id=(p_data->>'id')::uuid and n.kind='website'and t.status='open'and(t.human_waiting or t.unread)and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id))then raise exception'chat_response_required';end if;
 return smartvolt_private.sv_notification_action_before_web_chat(p_company,p_actor,p_command,p_kind,p_data);
end;$$;

-- Accepted capture and its CRM attention records commit together. Device delivery
-- stays in the existing opt-in dispatcher; the visitor is never promised a push.
create function smartvolt_private.web_chat_notify(p_company uuid,p_thread uuid)returns void language plpgsql security invoker set search_path=''as $$
declare recipient uuid;begin
 for recipient in select m.user_id from public.sv_memberships m join public.sv_web_chat_threads t on t.company_id=m.company_id and t.id=p_thread
 where m.company_id=p_company and m.status='active'and m.role<>'viewer'and(m.role in('owner','manager')or t.assigned_actor_id=m.user_id)
 and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id)order by m.user_id loop
  perform public.sv_notification_sync(p_company,recipient);
  update public.sv_notifications n set title=c.title,revision=n.revision+1 from smartvolt_private.notification_candidates(p_company,recipient)c
  where n.company_id=p_company and n.user_id=recipient and n.kind='website'and n.state='open'and n.source_key=c.source_key and n.title is distinct from c.title;
 end loop;
end;$$;

do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','smartvolt_private')and(p.proname like'sv_web_chat_%'or p.proname like'web_chat_%'or p.proname in('notification_candidates','sv_notification_read','sv_notification_action'))loop
  execute'revoke all on function '||f.sig||' from public,anon,authenticated';execute'grant execute on function '||f.sig||' to service_role';
 end loop;
end;$$;
