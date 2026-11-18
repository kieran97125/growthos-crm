-- Product Learning Sync checked: exact identity, tenant/brand scope, human-send authority,
-- source-linked evidence and truthful readiness. No pilot data or implementation imported.
create table public.sv_web_chat_configs(
 company_id uuid not null references public.sv_companies(id),id uuid not null,brand_id text not null,
 name text not null check(length(name)between 1 and 60),greeting text not null check(length(greeting)between 1 and 240),
 origins text[]not null check(cardinality(origins)between 1 and 10),verified_origins text[]not null default '{}',
 verification text not null check(verification~'^[a-f0-9]{48}$'),enabled boolean not null default false,
 revision bigint not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),unique(id),unique(company_id,id,brand_id)
);
create table public.sv_web_chat_threads(
 company_id uuid not null,id uuid not null,config_id uuid not null,brand_id text not null,origin text not null,
 token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),visitor_name text not null check(length(visitor_name)<=60),
 customer_id text,status text not null default 'open'check(status in('open','closed')),revision bigint not null default 0,
 unread boolean not null default false,preview text not null default '',last_message_at timestamptz not null default now(),
 created_at timestamptz not null default now(),expires_at timestamptz not null default(now()+interval '30 days'),
 primary key(company_id,id),unique(id),foreign key(company_id,config_id,brand_id)references public.sv_web_chat_configs(company_id,id,brand_id),
 foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create index sv_web_chat_threads_queue on public.sv_web_chat_threads(company_id,brand_id,last_message_at desc,id desc);
create table public.sv_web_chat_messages(
 company_id uuid not null,thread_id uuid not null,id uuid not null,sequence bigint not null,
 direction text not null check(direction in('incoming','outgoing')),body text not null check(length(body)between 1 and 2000),
 actor_id uuid,actor_name text,created_at timestamptz not null default now(),
 primary key(company_id,thread_id,id),unique(company_id,thread_id,sequence),
 foreign key(company_id,thread_id)references public.sv_web_chat_threads(company_id,id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 check((direction='incoming'and actor_id is null and actor_name is null)or(direction='outgoing'and actor_id is not null and actor_name is not null))
);
create table public.sv_web_chat_limits(
 config_id uuid not null references public.sv_web_chat_configs(id),bucket text not null,window_at timestamptz not null,hits integer not null,
 primary key(config_id,bucket,window_at)
);
create function smartvolt_private.web_chat_limit(p_config uuid,p_bucket text,p_window interval,p_cap integer)returns void
language plpgsql security invoker set search_path=''as $$declare at timestamptz;hits integer;begin
 at=to_timestamp(floor(extract(epoch from statement_timestamp())/extract(epoch from p_window))*extract(epoch from p_window));
 insert into public.sv_web_chat_limits(config_id,bucket,window_at,hits)values(p_config,p_bucket,at,1)
 on conflict(config_id,bucket,window_at)do update set hits=public.sv_web_chat_limits.hits+1 returning public.sv_web_chat_limits.hits into hits;
 if hits>p_cap then raise exception 'chat_rate_limited';end if;
 delete from public.sv_web_chat_limits where ctid in(select ctid from public.sv_web_chat_limits where config_id=p_config and window_at<statement_timestamp()-interval '2 days'limit 100);
end;$$;
create function public.sv_web_chat_settings(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm',false,true);
 return jsonb_build_object('companyId',p_company,'canManage',true,'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'configs',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'brandId',c.brand_id,'name',c.name,'greeting',c.greeting,'origins',c.origins,'verifiedOrigins',c.verified_origins,'verification',c.verification,'enabled',c.enabled,'revision',c.revision)order by c.created_at)from public.sv_web_chat_configs c where c.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)),'[]'));
end;$$;
create function public.sv_web_chat_configure(p_company uuid,p_actor uuid,p_command uuid,p_data jsonb,p_verification text)returns jsonb language plpgsql security invoker set search_path=''as $$
declare c public.sv_web_chat_configs;r jsonb;v_origins text[];verified text[];begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,p_data->>'brandId');
 select array_agg(v)into v_origins from jsonb_array_elements_text(p_data->'origins')v;
 if cardinality(v_origins)not between 1 and 10 or exists(select 1 from unnest(v_origins)v where v !~ '^https://[a-z0-9][a-z0-9.-]*\.[a-z]{2,63}$')then raise exception 'chat_origin_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('web-chat-config:'||p_company::text||':'||(p_data->>'id'),0));
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-config',p_data);if r is not null then return r;end if;
 select *into c from public.sv_web_chat_configs where company_id=p_company and id=(p_data->>'id')::uuid for update;
 if found then
  if c.revision<>(p_data->>'revision')::bigint or c.brand_id<>p_data->>'brandId' then raise exception 'revision_conflict';end if;
  select coalesce(array_agg(v),'{}')into verified from unnest(c.verified_origins)v where v=any(v_origins);
  if(p_data->>'enabled')::boolean and cardinality(verified)<>cardinality(v_origins)then raise exception 'chat_domain_unverified';end if;
  update public.sv_web_chat_configs set name=p_data->>'name',greeting=p_data->>'greeting',origins=v_origins,verified_origins=verified,enabled=(p_data->>'enabled')::boolean,revision=revision+1,updated_at=now()where company_id=p_company and id=c.id;
 else
  if(p_data->>'revision')::bigint<>0 or(p_data->>'enabled')::boolean then raise exception 'chat_domain_unverified';end if;
  insert into public.sv_web_chat_configs(company_id,id,brand_id,name,greeting,origins,verification)values(p_company,(p_data->>'id')::uuid,p_data->>'brandId',p_data->>'name',p_data->>'greeting',v_origins,p_verification);
 end if;
 r=jsonb_build_object('ok',true);insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'web-chat-config',p_data,r);return r;
end;$$;
create function public.sv_web_chat_verify(p_company uuid,p_actor uuid,p_command uuid,p_config uuid,p_revision bigint,p_origin text,p_proof text)returns jsonb language plpgsql security invoker set search_path=''as $$
declare c public.sv_web_chat_configs;r jsonb;d jsonb:=jsonb_build_object('id',p_config,'revision',p_revision,'origin',p_origin);begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true);
 select *into strict c from public.sv_web_chat_configs where company_id=p_company and id=p_config for update;
 perform public.sv_member_scope(p_company,p_actor,c.brand_id);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-verify',d);if r is not null then return r;end if;
 if c.revision<>p_revision then raise exception 'revision_conflict';end if;
 if not(p_origin=any(c.origins))or p_proof<>c.verification then raise exception 'chat_domain_unverified';end if;
 update public.sv_web_chat_configs set verified_origins=array(select distinct x from unnest(verified_origins||array[p_origin])x),revision=revision+1,updated_at=now()where company_id=p_company and id=p_config;
 r=jsonb_build_object('ok',true);insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'web-chat-verify',d,r);return r;
end;$$;
create function smartvolt_private.web_chat_config(p_id uuid,p_origin text)returns public.sv_web_chat_configs language plpgsql security invoker set search_path=''as $$
declare c public.sv_web_chat_configs;begin
 select *into c from public.sv_web_chat_configs where id=p_id for share;
 if not found or not c.enabled or not(p_origin=any(c.origins))or not(p_origin=any(c.verified_origins))or not exists(select 1 from public.sv_companies where id=c.company_id and status='active')or not exists(select 1 from public.sv_company_products where company_id=c.company_id and product='crm'and status='active'and starts_at<=statement_timestamp()and(ends_at is null or ends_at>statement_timestamp()))or not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=c.company_id and b->>'id'=c.brand_id)then raise exception 'chat_unavailable';end if;
 return c;
end;$$;
create function public.sv_web_chat_public_config(p_id uuid,p_origin text)returns jsonb language plpgsql security invoker set search_path=''as $$declare c public.sv_web_chat_configs;begin
 c=smartvolt_private.web_chat_config(p_id,p_origin);return jsonb_build_object('id',c.id,'name',c.name,'greeting',c.greeting,'origin',p_origin);
end;$$;
create function public.sv_web_chat_start(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_name text,p_rate text)returns jsonb language plpgsql security invoker set search_path=''as $$
declare c public.sv_web_chat_configs;t public.sv_web_chat_threads;begin
 c=smartvolt_private.web_chat_config(p_id,p_origin);
 perform pg_advisory_xact_lock(hashtextextended('web-chat-session:'||p_thread::text,0));
 select *into t from public.sv_web_chat_threads where id=p_thread;
 if found then
  if t.config_id<>p_id or t.token_hash<>p_hash or t.origin<>p_origin or t.expires_at<statement_timestamp()then raise exception 'chat_session_invalid';end if;
  return jsonb_build_object('threadId',t.id);
 end if;
 if length(p_name)>60 or p_hash !~ '^[a-f0-9]{64}$'or p_rate !~ '^[a-f0-9]{64}$'then raise exception 'chat_session_invalid';end if;
 perform smartvolt_private.web_chat_limit(p_id,'start:'||p_rate,interval '1 hour',20);
 perform smartvolt_private.web_chat_limit(p_id,'start:all',interval '1 hour',300);
 insert into public.sv_web_chat_threads(company_id,id,config_id,brand_id,origin,token_hash,visitor_name)values(c.company_id,p_thread,p_id,c.brand_id,p_origin,p_hash,coalesce(p_name,''));
 return jsonb_build_object('threadId',p_thread);
end;$$;
create function smartvolt_private.web_chat_session(p_id uuid,p_origin text,p_thread uuid,p_hash text)returns public.sv_web_chat_threads language plpgsql security invoker set search_path=''as $$
declare c public.sv_web_chat_configs;t public.sv_web_chat_threads;begin
 c=smartvolt_private.web_chat_config(p_id,p_origin);
 select *into t from public.sv_web_chat_threads where company_id=c.company_id and id=p_thread and config_id=p_id and token_hash=p_hash and origin=p_origin and expires_at>statement_timestamp();
 if not found then raise exception 'chat_session_invalid';end if;return t;
end;$$;
create function public.sv_web_chat_visitor_read(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_after bigint default 0)returns jsonb language plpgsql security invoker set search_path=''as $$
declare t public.sv_web_chat_threads;rows jsonb;begin
 t=smartvolt_private.web_chat_session(p_id,p_origin,p_thread,p_hash);
 perform smartvolt_private.web_chat_limit(p_id,'read:'||p_thread::text,interval '1 minute',40);
 perform smartvolt_private.web_chat_limit(p_id,'read:all',interval '1 minute',6000);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'direction',m.direction,'createdAt',m.created_at,'actorName',m.actor_name,'sequence',m.sequence)order by m.sequence),'[]')into rows from(select *from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id and sequence>greatest(0,p_after)order by sequence limit 51)m;
 return jsonb_build_object('status',t.status,'revision',t.revision,'messages',rows,'expiresAt',t.expires_at);
end;$$;
create function public.sv_web_chat_visitor_send(p_id uuid,p_origin text,p_thread uuid,p_hash text,p_command uuid,p_body text)returns jsonb language plpgsql security invoker set search_path=''as $$
declare t public.sv_web_chat_threads;m public.sv_web_chat_messages;begin
 t=smartvolt_private.web_chat_session(p_id,p_origin,p_thread,p_hash);
 select *into t from public.sv_web_chat_threads where company_id=t.company_id and id=t.id for update;
 select *into m from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id and id=p_command;
 if found then if m.direction<>'incoming'or m.body<>p_body then raise exception 'idempotency_conflict';end if;return jsonb_build_object('ok',true,'id',m.id);end if;
 if t.status<>'open'then raise exception 'chat_closed';end if;
 if length(trim(p_body))not between 1 and 2000 then raise exception 'chat_body_invalid';end if;
 if(select count(*)from public.sv_web_chat_messages where company_id=t.company_id and thread_id=t.id)>=300 then raise exception 'chat_limit_reached';end if;
 perform smartvolt_private.web_chat_limit(p_id,'send:'||p_thread::text,interval '1 minute',6);
 perform smartvolt_private.web_chat_limit(p_id,'send-hour:'||p_thread::text,interval '1 hour',60);
 perform smartvolt_private.web_chat_limit(p_id,'send:all',interval '1 hour',2000);
 update public.sv_web_chat_threads set revision=revision+1,preview=left(p_body,160),unread=true,last_message_at=now()where company_id=t.company_id and id=t.id returning *into t;
 insert into public.sv_web_chat_messages(company_id,thread_id,id,sequence,direction,body)values(t.company_id,t.id,p_command,t.revision,'incoming',p_body);
 if t.customer_id is not null then insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail)values(t.company_id,t.customer_id,t.brand_id,'website-message:'||p_command,'website-message',jsonb_build_object('threadId',t.id,'messageId',p_command,'direction','incoming'))on conflict do nothing;end if;
 return jsonb_build_object('ok',true,'id',p_command);
end;$$;
create function smartvolt_private.web_chat_thread_json(t public.sv_web_chat_threads)returns jsonb language sql stable security invoker set search_path=''as $$
 select jsonb_build_object('id',t.id,'brandId',t.brand_id,'brandName',coalesce((select b->>'name'from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=t.company_id and b->>'id'=t.brand_id),t.brand_id),'visitorName',case when t.visitor_name=''then '網站訪客'else t.visitor_name end,'preview',t.preview,'lastMessageAt',t.last_message_at,'unread',t.unread,'customerId',t.customer_id,'status',t.status,'revision',t.revision,'site',t.origin)
$$;
create function public.sv_web_chat_staff_read(p_company uuid,p_actor uuid,p_query jsonb default '{}')returns jsonb language plpgsql security invoker set search_path=''as $$
declare rows jsonb;t public.sv_web_chat_threads;msgs jsonb;role text;begin
 role=public.sv_authorize(p_company,p_actor,'crm');
 if p_query->>'threadId'is not null then
  select *into strict t from public.sv_web_chat_threads where company_id=p_company and id=(p_query->>'threadId')::uuid;
  perform public.sv_member_scope(p_company,p_actor,t.brand_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'direction',m.direction,'createdAt',m.created_at,'actorName',m.actor_name,'sequence',m.sequence)order by m.sequence),'[]')into msgs from(select *from public.sv_web_chat_messages where company_id=p_company and thread_id=t.id and(p_query->>'beforeSequence'is null or sequence<(p_query->>'beforeSequence')::bigint)order by sequence desc limit 51)m;
  return jsonb_build_object('thread',smartvolt_private.web_chat_thread_json(t),'messages',msgs,'canReply',role<>'viewer');
 end if;
 select coalesce(jsonb_agg(smartvolt_private.web_chat_thread_json(q::public.sv_web_chat_threads)order by q.last_message_at desc,q.id desc),'[]')into rows from(select *from public.sv_web_chat_threads x where x.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,x.brand_id)
 and(p_query->>'brand'is null or x.brand_id=p_query->>'brand')and(p_query->>'status'is null or x.status=p_query->>'status')and(p_query->>'search'is null or x.visitor_name ilike '%'||(p_query->>'search')||'%'or x.preview ilike '%'||(p_query->>'search')||'%')
 and(p_query->>'before'is null or(x.last_message_at,x.id)<((p_query->>'before')::timestamptz,(p_query->>'beforeId')::uuid))order by x.last_message_at desc,x.id desc limit 31)q;
 return jsonb_build_object('threads',rows,'canReply',role<>'viewer','scopeStamp',(select md5(jsonb_build_object('actor',m.user_id,'role',m.role,'brands',m.brand_ids,'products',m.product_ids,'revision',m.access_revision)::text)from public.sv_memberships m where m.company_id=p_company and m.user_id=p_actor));
end;$$;
create function public.sv_web_chat_staff_action(p_company uuid,p_actor uuid,p_command uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare t public.sv_web_chat_threads;r jsonb;actor_name text;begin
 perform public.sv_authorize(p_company,p_actor,'crm',true);
 select *into strict t from public.sv_web_chat_threads where company_id=p_company and id=(p_data->>'threadId')::uuid for update;
 perform public.sv_member_scope(p_company,p_actor,t.brand_id);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-staff',p_data);if r is not null then return r;end if;
 if t.revision<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
 select display_name into actor_name from public.sv_memberships where company_id=p_company and user_id=p_actor;
 if p_data->>'action'='reply'then
  perform smartvolt_private.web_chat_config(t.config_id,t.origin);
  if t.expires_at<=statement_timestamp()then raise exception 'chat_expired';end if;
  if t.status<>'open'then raise exception 'chat_closed';end if;
  if length(trim(p_data->>'body'))not between 1 and 2000 then raise exception 'chat_body_invalid';end if;
  if(select count(*)from public.sv_web_chat_messages where company_id=p_company and thread_id=t.id)>=600 then raise exception 'chat_limit_reached';end if;
  perform smartvolt_private.web_chat_limit(t.config_id,'staff:'||p_actor::text,interval '1 minute',30);
  update public.sv_web_chat_threads set revision=revision+1,preview=left(p_data->>'body',160),unread=false,last_message_at=now()where company_id=p_company and id=t.id returning *into t;
  insert into public.sv_web_chat_messages(company_id,thread_id,id,sequence,direction,body,actor_id,actor_name)values(p_company,t.id,p_command,t.revision,'outgoing',p_data->>'body',p_actor,actor_name);
 elsif p_data->>'action'in('close','reopen')then update public.sv_web_chat_threads set status=case when p_data->>'action'='close'then'closed'else'open'end,revision=revision+1 where company_id=p_company and id=t.id;
 elsif p_data->>'action'='linkCustomer'then
  perform public.sv_customer_scope(p_company,p_actor,p_data->>'customerId');
  if not exists(select 1 from public.sv_customer_brands where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=t.brand_id)then raise exception 'brand_scope';end if;
  update public.sv_web_chat_threads set customer_id=p_data->>'customerId',revision=revision+1 where company_id=p_company and id=t.id;
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,p_data->>'customerId',t.brand_id,'website-link:'||p_command,'website-linked',p_actor,jsonb_build_object('threadId',t.id,'source','explicit-staff-link'));
 else raise exception 'chat_action_invalid';end if;
 r=jsonb_build_object('ok',true);insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'web-chat-staff',p_data,r);return r;
end;$$;
revoke all on public.sv_web_chat_configs,public.sv_web_chat_threads,public.sv_web_chat_messages,public.sv_web_chat_limits from public,anon,authenticated;
revoke all on public.sv_web_chat_configs,public.sv_web_chat_threads,public.sv_web_chat_messages,public.sv_web_chat_limits from service_role;
grant select,insert,update on public.sv_web_chat_configs,public.sv_web_chat_threads to service_role;
grant select,insert,update,delete on public.sv_web_chat_limits to service_role;
grant select,insert on public.sv_web_chat_messages to service_role;
alter table public.sv_web_chat_configs enable row level security;
alter table public.sv_web_chat_threads enable row level security;
alter table public.sv_web_chat_messages enable row level security;
alter table public.sv_web_chat_limits enable row level security;
do $$declare r record;begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','smartvolt_private')and(p.proname like 'sv_web_chat_%'or p.proname like 'web_chat_%')loop execute 'revoke all on function '||r.sig||' from public,anon,authenticated';execute 'grant execute on function '||r.sig||' to service_role';end loop;end;$$;
