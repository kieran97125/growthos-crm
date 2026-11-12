-- Tenant-isolated Meta inbox. Dedicated Convelta database only.
create table public.sv_meta_connections(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sv_companies(id),
 brand_id text not null, channel text not null check(channel in ('messenger','instagram')),
 app_id text not null check(app_id ~ '^[1-9][0-9]{1,49}$'), page_id text not null check(page_id ~ '^[1-9][0-9]{1,49}$'),
 account_id text not null check(account_id ~ '^[1-9][0-9]{1,49}$'), label text not null check(length(label) between 1 and 200),
 credentials jsonb not null check(jsonb_typeof(credentials)='object' and octet_length(credentials::text)<100000),
 enabled boolean not null default true,last_inbound_at bigint,created_at timestamptz not null default now(),
 unique(channel,account_id),unique(company_id,id)
);
create index sv_meta_connections_company on public.sv_meta_connections(company_id,created_at);
create table public.sv_meta_threads(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,connection_id uuid not null,
 peer_id text not null check(peer_id ~ '^[1-9][0-9]{1,49}$'),revision bigint not null default 0,
 last_inbound_at bigint,updated_at timestamptz not null default now(),read_seq bigint not null default 0,
 status text not null default 'open' check(status in ('open','resolved')),
 foreign key(company_id,connection_id) references public.sv_meta_connections(company_id,id),
 unique(connection_id,peer_id),unique(company_id,id)
);
create index sv_meta_threads_list on public.sv_meta_threads(company_id,updated_at desc,id desc);
create table public.sv_meta_messages(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,thread_id uuid not null,
 seq bigint generated always as identity, direction text not null check(direction in ('inbound','outbound','note')),
 body text not null check(length(body) between 1 and 20000),provider_id text,
 state text not null check(state in ('received','sending','accepted','sent','delivered','read','failed','uncertain','note')),
 provider_at bigint,created_at timestamptz not null default now(),actor_id uuid references auth.users(id),
 client_id uuid,error_code text,referral jsonb,
 foreign key(company_id,thread_id) references public.sv_meta_threads(company_id,id),
 unique(thread_id,provider_id),unique(company_id,client_id)
);
create index sv_meta_messages_thread on public.sv_meta_messages(company_id,thread_id,seq desc);
create index sv_meta_messages_actor on public.sv_meta_messages(actor_id);
create table public.sv_meta_events(
 connection_id uuid not null references public.sv_meta_connections(id),event_key text not null check(event_key ~ '^[a-f0-9]{64}$'),
 kind text not null,provider_id text,peer_id text not null,provider_at bigint not null,raw jsonb not null,
 created_at timestamptz not null default now(),primary key(connection_id,event_key)
);
create index sv_meta_events_receipt on public.sv_meta_events(connection_id,provider_id,kind);
create function public.sv_meta_event_immutable() returns trigger language plpgsql security invoker set search_path='' as $$begin raise exception 'meta_evidence_immutable';end;$$;
create trigger sv_meta_events_immutable before update or delete on public.sv_meta_events for each row execute function public.sv_meta_event_immutable();

create function public.sv_meta_authorize(p_company uuid,p_actor uuid,p_write boolean default false,p_owner boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active' for share of m,c;
 if r is null or (p_write and r='viewer') or (p_owner and r<>'owner') then raise exception 'meta_access_denied';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company and p.product='crm' and p.status='active' and p.starts_at<=now() and (p.ends_at is null or p.ends_at>now()) for share;
 if not found then raise exception 'meta_product_required';end if;
 return r;
end;$$;
create function public.sv_meta_save(p_company uuid,p_actor uuid,p_config jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cid uuid := (p_config->>'id')::uuid; existing public.sv_meta_connections;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,true);
 if not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload #> '{scope,brands}') b where w.company_id=p_company and b->>'id'=p_config->>'brandId')then raise exception 'meta_brand_scope';end if;
 select * into existing from public.sv_meta_connections where id=cid for update;
 if found then
  if existing.company_id<>p_company or existing.brand_id<>p_config->>'brandId' or existing.channel<>p_config->>'channel' or existing.account_id<>p_config->>'accountId' or existing.page_id<>p_config->>'pageId' or existing.app_id<>p_config->>'appId' then raise exception 'meta_connection_scope';end if;
  update public.sv_meta_connections set credentials=p_config->'credentials',label=p_config->>'label',enabled=true where id=cid;
 else
  insert into public.sv_meta_connections(id,company_id,brand_id,channel,app_id,page_id,account_id,label,credentials)
  values(cid,p_company,p_config->>'brandId',p_config->>'channel',p_config->>'appId',p_config->>'pageId',p_config->>'accountId',p_config->>'label',p_config->'credentials');
 end if;
 return cid;
end;$$;
create function public.sv_meta_ingest(p_connection uuid,p_events jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare c public.sv_meta_connections;e jsonb;t public.sv_meta_threads;n integer:=0; added integer; stamp bigint;
begin
 select * into strict c from public.sv_meta_connections where id=p_connection and enabled for update;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>500 then raise exception 'meta_event_invalid';end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'channel' is distinct from c.channel or e->>'accountId' is distinct from c.account_id or e->>'peerId' !~ '^[1-9][0-9]{1,49}$' or e->>'kind' not in ('inbound','echo','delivered','read','referral') then raise exception 'meta_event_scope';end if;
  stamp=(e->>'at')::bigint;if stamp<1 or stamp>floor(extract(epoch from now())*1000)+300000 then raise exception 'meta_event_time';end if;
  insert into public.sv_meta_events(connection_id,event_key,kind,provider_id,peer_id,provider_at,raw)
  values(c.id,e->>'key',e->>'kind',e->>'mid',e->>'peerId',stamp,e->'raw') on conflict do nothing;
  get diagnostics added=row_count;if added=0 then continue;end if;n=n+1;
  if e->>'kind'='inbound' then
   insert into public.sv_meta_threads(company_id,connection_id,peer_id)values(c.company_id,c.id,e->>'peerId') on conflict do nothing;
   select * into strict t from public.sv_meta_threads where connection_id=c.id and peer_id=e->>'peerId' for update;
   insert into public.sv_meta_messages(company_id,thread_id,direction,body,provider_id,state,provider_at,referral)
   values(c.company_id,t.id,'inbound',e->>'body',e->>'mid','received',stamp,nullif(e->'referral','null'::jsonb)) on conflict(thread_id,provider_id) do nothing;
   get diagnostics added=row_count;
   if added>0 then
    update public.sv_meta_threads set revision=revision+1,status='open',last_inbound_at=greatest(coalesce(last_inbound_at,0),least(stamp,floor(extract(epoch from now())*1000)::bigint)),updated_at=now()where id=t.id;
    update public.sv_meta_connections set last_inbound_at=greatest(coalesce(last_inbound_at,0),least(stamp,floor(extract(epoch from now())*1000)::bigint))where id=c.id;
   end if;
  elsif e->>'mid' is not null then
   update public.sv_meta_messages m set state=case when e->>'kind'='read' then 'read' when e->>'kind'='delivered' and m.state<>'read' then 'delivered' when e->>'kind'='echo' and m.state in ('sending','accepted','uncertain')then 'sent' else m.state end
   from public.sv_meta_threads th where m.thread_id=th.id and th.connection_id=c.id and th.peer_id=e->>'peerId' and m.provider_id=e->>'mid' and m.direction='outbound';
  end if;
 end loop;
 return n;
end;$$;
create function public.sv_meta_claim(p_company uuid,p_actor uuid,p_thread uuid,p_client uuid,p_expected bigint,p_body text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads;c public.sv_meta_connections;m public.sv_meta_messages;ms bigint:=floor(extract(epoch from now())*1000);
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 select cn.* into strict c from public.sv_meta_connections cn join public.sv_meta_threads th on th.connection_id=cn.id and th.company_id=cn.company_id where th.id=p_thread and cn.company_id=p_company and cn.enabled for share of cn;
 select * into strict t from public.sv_meta_threads where id=p_thread and company_id=p_company for update;
 select * into m from public.sv_meta_messages where company_id=p_company and client_id=p_client;
 if found then
  if m.thread_id<>p_thread or m.actor_id<>p_actor or m.body<>p_body then raise exception 'meta_idempotency_conflict';end if;
  return jsonb_build_object('dispatch',false,'message',to_jsonb(m));
 end if;
 if p_expected<>t.revision then raise exception 'meta_revision_conflict';end if;
 if t.last_inbound_at is null or ms-t.last_inbound_at>=86400000 or ms<t.last_inbound_at then raise exception 'meta_window_closed';end if;
 if length(trim(p_body))=0 or length(p_body)>(case when c.channel='instagram' then 1000 else 2000 end)then raise exception 'meta_body_invalid';end if;
 if exists(select 1 from public.sv_meta_messages where thread_id=t.id and direction='outbound' and state in ('sending','uncertain'))then raise exception 'meta_send_unresolved';end if;
 insert into public.sv_meta_messages(company_id,thread_id,direction,body,state,actor_id,client_id)
 values(p_company,t.id,'outbound',p_body,'sending',p_actor,p_client)returning * into m;
 update public.sv_meta_threads set revision=revision+1,updated_at=now()where id=t.id;
 return jsonb_build_object('dispatch',true,'message',to_jsonb(m),'connectionId',c.id,'accountId',c.account_id,'peerId',t.peer_id,'channel',c.channel);
end;$$;
create function public.sv_meta_finish(p_company uuid,p_message uuid,p_state text,p_provider text,p_code text)returns void
language plpgsql security invoker set search_path='' as $$
declare m public.sv_meta_messages;t public.sv_meta_threads;final_state text:=p_state;
begin
 select * into strict m from public.sv_meta_messages where id=p_message and company_id=p_company for update;
 if m.direction<>'outbound' or m.state<>'sending' then return;end if;
 if p_state not in ('accepted','failed','uncertain') or (p_state='accepted' and (p_provider is null or length(p_provider)not between 1 and 512)) then raise exception 'meta_finish_invalid';end if;
 select * into strict t from public.sv_meta_threads where id=m.thread_id;
 if p_state='accepted' then
  select case when bool_or(kind='read')then 'read' when bool_or(kind='delivered')then 'delivered' when bool_or(kind='echo')then 'sent' else 'accepted' end into final_state
  from public.sv_meta_events where connection_id=t.connection_id and provider_id=p_provider and peer_id=t.peer_id;
 end if;
 update public.sv_meta_messages set state=final_state,provider_id=p_provider,error_code=p_code where id=m.id;
end;$$;
create function public.sv_meta_command(p_company uuid,p_actor uuid,p_thread uuid,p_kind text,p_body text default null,p_through bigint default null)returns void
language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 select * into strict t from public.sv_meta_threads where id=p_thread and company_id=p_company for update;
 if p_kind='read' then
  if p_through is null or not exists(select 1 from public.sv_meta_messages where thread_id=t.id and seq=p_through)then raise exception 'meta_read_horizon_invalid';end if;
  update public.sv_meta_threads set read_seq=greatest(read_seq,p_through)where id=t.id;
 elsif p_kind in ('resolve','reopen')then update public.sv_meta_threads set status=case when p_kind='resolve' then 'resolved' else 'open' end,revision=revision+1 where id=t.id;
 elsif p_kind='note' and length(trim(p_body))between 1 and 2000 then
  insert into public.sv_meta_messages(company_id,thread_id,direction,body,state,actor_id)values(p_company,t.id,'note',p_body,'note',p_actor);
  update public.sv_meta_threads set revision=revision+1,updated_at=now()where id=t.id;
 else raise exception 'meta_command_invalid';end if;
end;$$;
-- No browser table/RPC access; server authorization and DB checks are both required.
alter table public.sv_meta_connections enable row level security;
alter table public.sv_meta_threads enable row level security;
alter table public.sv_meta_messages enable row level security;
alter table public.sv_meta_events enable row level security;
revoke all on public.sv_meta_connections,public.sv_meta_threads,public.sv_meta_messages,public.sv_meta_events from public,anon,authenticated;
grant select,insert,update on public.sv_meta_connections,public.sv_meta_threads,public.sv_meta_messages to service_role;
grant select,insert on public.sv_meta_events to service_role;
revoke all on sequence public.sv_meta_messages_seq_seq from public,anon,authenticated;
grant usage,select on sequence public.sv_meta_messages_seq_seq to service_role;
revoke all on function public.sv_meta_event_immutable(),public.sv_meta_authorize(uuid,uuid,boolean,boolean),public.sv_meta_save(uuid,uuid,jsonb),public.sv_meta_ingest(uuid,jsonb),public.sv_meta_claim(uuid,uuid,uuid,uuid,bigint,text),public.sv_meta_finish(uuid,uuid,text,text,text),public.sv_meta_command(uuid,uuid,uuid,text,text,bigint)from public,anon,authenticated;
grant execute on function public.sv_meta_authorize(uuid,uuid,boolean,boolean),public.sv_meta_save(uuid,uuid,jsonb),public.sv_meta_ingest(uuid,jsonb),public.sv_meta_claim(uuid,uuid,uuid,uuid,bigint,text),public.sv_meta_finish(uuid,uuid,text,text,text),public.sv_meta_command(uuid,uuid,uuid,text,text,bigint)to service_role;

create function public.sv_meta_disable(p_company uuid,p_actor uuid,p_connection uuid) returns void language plpgsql security invoker set search_path='' as $$begin perform public.sv_meta_authorize(p_company,p_actor,true,true);update public.sv_meta_connections set enabled=false where id=p_connection and company_id=p_company;if not found then raise exception 'meta_connection_missing';end if;end;$$;
revoke all on function public.sv_meta_disable(uuid,uuid,uuid)from public,anon,authenticated;
grant execute on function public.sv_meta_disable(uuid,uuid,uuid)to service_role;

create view public.sv_meta_thread_summaries with(security_invoker=true) as select t.*,
 (select count(*)::integer from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound' and m.seq>t.read_seq)as unread_count
 from public.sv_meta_threads t;
revoke all on public.sv_meta_thread_summaries from public,anon,authenticated;
grant select on public.sv_meta_thread_summaries to service_role;
