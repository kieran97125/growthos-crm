-- Product Learning Sync checked: neutral Customer360, scope and governed source
-- contracts only. Human-confirmed preferences are not business-policy evidence.
create table public.sv_customer_memories(
 company_id uuid not null,id uuid not null,revision bigint not null check(revision>0),customer_id text not null,brand_id text not null,
 category text not null check(category in('need','preference','constraint','context')),
 content text not null check(length(btrim(content))between 1 and 1000),status text not null check(status in('active','archived')),
 actor_id uuid not null,actor_name text not null,reason text not null check(length(btrim(reason))between 3 and 300),
 created_at timestamptz not null default now(),primary key(company_id,id,revision),
 foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create index sv_customer_memories_scope on public.sv_customer_memories(company_id,customer_id,brand_id,id,revision desc);
create index sv_customer_memories_history on public.sv_customer_memories(company_id,customer_id,brand_id,created_at desc,id desc,revision desc);
alter table public.sv_customer_memories enable row level security;
revoke all on public.sv_customer_memories from public,anon,authenticated,service_role;
grant select,insert on public.sv_customer_memories to service_role;
create trigger sv_customer_memories_immutable before update or delete on public.sv_customer_memories for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_customer_memories_no_truncate before truncate on public.sv_customer_memories for each statement execute function smartvolt_private.wa_reject_rewrite();

create function public.sv_customer_memory_scope(p_company uuid,p_actor uuid,p_customer text,p_brand text default null,p_write boolean default false)returns text
language plpgsql security invoker set search_path=''as $$
declare b text;begin
 perform public.sv_authorize(p_company,p_actor,'crm',p_write);
 if p_brand is null then
  select cb.brand_id into b from public.sv_customer_brands cb where cb.company_id=p_company and cb.customer_id=p_customer
   and smartvolt_private.member_brand_allowed(p_company,p_actor,cb.brand_id)order by cb.brand_id limit 1;
 else b=p_brand;end if;
 perform public.sv_member_scope(p_company,p_actor,b,'crm');
 perform 1 from public.sv_customer_brands where company_id=p_company and customer_id=p_customer and brand_id=b for share;
 if not found then raise exception 'memory_customer_scope';end if;return b;
end;$$;

create function public.sv_customer_memory_action(p_company uuid,p_actor uuid,p_customer text,p_command uuid,p_data jsonb)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare b text;mid uuid;old public.sv_customer_memories;r jsonb;req jsonb;cat text;body text;v_status text;v bigint;name text;
begin
 if jsonb_typeof(p_data)is distinct from'object'or coalesce(length(p_data->>'brandId'),0)not between 1 and 100 then raise exception 'memory_invalid';end if;
 b=public.sv_customer_memory_scope(p_company,p_actor,p_customer,p_data->>'brandId',true);
 if p_command is null or coalesce(p_data->>'action','')not in('save','archive')or coalesce(length(btrim(p_data->>'reason')),0)not between 3 and 300
 or coalesce(p_data->>'expectedRevision','')!~'^[0-9]{1,15}$'then raise exception 'memory_invalid';end if;
 mid=(p_data->>'memoryId')::uuid;if mid is null then raise exception 'memory_invalid';end if;
 req=jsonb_build_object('customerId',p_customer,'data',p_data);
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'customer-memory',req);if r is not null then return r;end if;
 perform pg_advisory_xact_lock(hashtextextended('customer-memory:'||p_company::text||':'||p_customer||':'||b,0));
 select *into old from public.sv_customer_memories where company_id=p_company and id=mid order by revision desc limit 1;
 if found then
  if old.customer_id<>p_customer or old.brand_id<>b then raise exception 'memory_customer_scope';end if;
  if old.revision<>(p_data->>'expectedRevision')::bigint or old.status='archived'then raise exception 'memory_revision_conflict';end if;
  v=old.revision+1;
 else
  if(p_data->>'expectedRevision')::bigint<>0 or p_data->>'action'='archive'then raise exception 'memory_revision_conflict';end if;
  if(select count(*)from(select distinct on(id)status from public.sv_customer_memories where company_id=p_company and customer_id=p_customer and brand_id=b order by id,revision desc)x where status='active')>=100 then raise exception 'memory_capacity';end if;
  v=1;
 end if;
 if p_data->>'action'='archive'then cat=old.category;body=old.content;v_status='archived';
 else cat=p_data->>'category';body=btrim(p_data->>'content');v_status='active';end if;
 if cat is null or cat not in('need','preference','constraint','context')or coalesce(length(body),0)not between 1 and 1000 then raise exception 'memory_invalid';end if;
 select display_name into strict name from public.sv_memberships where company_id=p_company and user_id=p_actor;
 insert into public.sv_customer_memories(company_id,id,revision,customer_id,brand_id,category,content,status,actor_id,actor_name,reason)
 values(p_company,mid,v,p_customer,b,cat,body,v_status,p_actor,name,btrim(p_data->>'reason'));
 r=jsonb_build_object('saved',true,'memoryId',mid,'revision',v);
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'customer-memory',req,r);return r;
end;$$;

create function public.sv_customer_memory_read(p_company uuid,p_actor uuid,p_customer text,p_brand text default null,p_before timestamptz default null,p_before_key text default null)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare b text;mem jsonb;hist jsonb;events jsonb;brands jsonb;can_pos boolean;more_history boolean;begin
 b=public.sv_customer_memory_scope(p_company,p_actor,p_customer,p_brand,false);
 can_pos=smartvolt_private.member_has_product(p_company,p_actor,'pos');
 if (p_before is null)<>(p_before_key is null)or(p_before is not null and not isfinite(p_before))or length(p_before_key)>300 then raise exception 'memory_cursor_invalid';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.brand_id,'name',coalesce(n.value->>'name',x.brand_id))order by x.brand_id),'[]')into brands
 from public.sv_customer_brands x join public.sv_workspaces w on w.company_id=x.company_id
 join lateral jsonb_array_elements(w.payload#>'{scope,brands}')n(value)on n.value->>'id'=x.brand_id
 where x.company_id=p_company and x.customer_id=p_customer and smartvolt_private.member_brand_allowed(p_company,p_actor,x.brand_id);
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id),'[]')into mem from(
  select *from(select distinct on(id)id,revision,category,content,status,actor_name,reason,created_at from public.sv_customer_memories
  where company_id=p_company and customer_id=p_customer and brand_id=b order by id,revision desc)x where status='active' limit 100)x;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc,x.id desc,x.revision desc),'[]')into hist from(
  select id,revision,category,content,status,actor_name,reason,created_at from public.sv_customer_memories where company_id=p_company and customer_id=p_customer and brand_id=b
  order by created_at desc,id desc,revision desc limit 101)x;
 more_history=jsonb_array_length(hist)>100;
 with linked as(select provider,thread_id from public.sv_customer_threads where company_id=p_company and customer_id=p_customer and brand_id=b),
 legacy as(select w.payload from public.sv_workspaces w where w.company_id=p_company),
 candidates as(
  select 'event:'||e.seq as key,e.created_at as at,e.kind,'event'::text as source,e.seq::text as source_id,e.detail as data
   from public.sv_customer_events e where e.company_id=p_company and e.customer_id=p_customer and e.brand_id=b and(can_pos or e.kind not like'pos-%')
  union all select 'memory:'||m.id||':'||lpad(m.revision::text,15,'0'),m.created_at,case when m.status='archived'then'memory-archived'when m.revision=1 then'memory-added'else'memory-corrected'end,'memory',m.id::text,to_jsonb(m)-array['company_id','customer_id','brand_id','actor_id']
   from public.sv_customer_memories m where m.company_id=p_company and m.customer_id=p_customer and m.brand_id=b
  union all select 'meta:'||m.id,to_timestamp(coalesce(m.provider_at,floor(extract(epoch from m.created_at)*1000)::bigint)/1000.0),'message-'||m.direction,'meta',m.id::text,
   jsonb_build_object('body',left(m.body,600),'threadId',m.thread_id,'state',m.state,'direction',m.direction)
   from public.sv_meta_messages m join linked l on l.provider='meta'and l.thread_id=m.thread_id where m.company_id=p_company
  union all select 'whatsapp:'||m.id,to_timestamp(m.provider_at/1000.0),'message-'||m.direction,'whatsapp',m.id::text,
   jsonb_build_object('body',left(m.body,600),'threadId',m.conversation_id,'state',m.state,'direction',m.direction)
   from public.sv_wa_messages m join linked l on l.provider='whatsapp'and l.thread_id=m.conversation_id where m.company_id=p_company
  union all select 'conversation:'||(m->>'id'),to_timestamp((m->>'at')::numeric/1000.0),'message-'||(m->>'kind'),'conversation',m->>'id',
   jsonb_build_object('body',left(m->>'body',600),'threadId',c->>'id','direction',m->>'kind','state','stored')
   from legacy w,jsonb_array_elements(w.payload#>'{inbox,conversations}')c,jsonb_array_elements(w.payload#>'{inbox,messages}')m
   where c->>'contactId'=p_customer and c->>'brandId'=b and m->>'conversationId'=c->>'id'and m->>'kind'in('incoming','outgoing','note')
  union all select 'request:'||r.id,r.created_at,'booking-request','request',r.id::text,
   jsonb_build_object('service',r.service,'status',r.status,'desiredAt',r.desired_at,'threadId',r.thread_id,'provider',r.provider)
   from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=p_customer and r.brand_id=b
   and not exists(select 1 from public.sv_customer_events e where e.company_id=r.company_id and e.customer_id=p_customer and e.brand_id=b and e.detail->>'requestId'=r.id::text)
  union all select 'legacy-booking:'||(k->>'id'),((k->>'date')||' '||(k->>'time'))::timestamp at time zone'Asia/Hong_Kong','legacy-booking','conversation',k->>'id',
   jsonb_build_object('service',k->>'service','status',k->>'status','threadId',c->>'id','timeBasis','scheduled')
   from legacy w,jsonb_array_elements(w.payload#>'{inbox,conversations}')c,jsonb_array_elements(w.payload#>'{inbox,bookings}')k
   where c->>'contactId'=p_customer and c->>'brandId'=b and k->>'contactId'=p_customer and k->>'conversationId'=c->>'id'
   and k->>'date'~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'and k->>'time'~'^[0-9]{2}:[0-9]{2}$'
  union all select 'voice-review:'||v.command_id,v.created_at,'voice-reviewed',a.source,t.id::text,
   jsonb_build_object('text',left(v.text,600),'threadId',a.source_id,'provider',case when a.source in('meta','whatsapp')then a.source else null end,'revision',v.revision,'reason',v.reason)
   from public.sv_voice_assets a join public.sv_voice_transcripts t on t.company_id=a.company_id and t.asset_id=a.id
   join public.sv_voice_corrections v on v.company_id=t.company_id and v.transcript_id=t.id
   where a.company_id=p_company and a.brand_id=b and(
    exists(select 1 from linked l where l.provider=a.source and l.thread_id::text=a.source_id)
    or(a.source='conversation'and exists(select 1 from legacy w,jsonb_array_elements(w.payload#>'{inbox,conversations}')c where c->>'id'=a.source_id and c->>'contactId'=p_customer and c->>'brandId'=b)))
  union all select 'pos-appointment:'||a.id,to_timestamp(coalesce((a.snapshot->>'createdAt')::numeric,a.starts_at)/1000.0),'pos-appointment','pos',a.id,a.snapshot
   from public.sv_pos_appointments a where can_pos and a.company_id=p_company and a.contact_id=p_customer and a.brand_id=b
   and not exists(select 1 from public.sv_customer_events e where e.company_id=a.company_id and e.customer_id=p_customer and e.brand_id=b and e.kind='pos-appointment'and e.detail->>'id'=a.id)
  union all select 'pos-payment:'||p.id,to_timestamp(p.occurred_at/1000.0),'pos-payment','pos',p.id,p.snapshot
   from public.sv_pos_payments p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
   where can_pos and p.company_id=p_company and o.contact_id=p_customer and o.brand_id=b
   and not exists(select 1 from public.sv_customer_events e where e.company_id=p.company_id and e.customer_id=p_customer and e.brand_id=b and e.kind='pos-payment'and e.detail->>'id'=p.id)
  union all select 'pos-refund:'||p.id,to_timestamp(p.occurred_at/1000.0),'pos-refund','pos',p.id,p.snapshot
   from public.sv_pos_refunds p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
   where can_pos and p.company_id=p_company and o.contact_id=p_customer and o.brand_id=b
   and not exists(select 1 from public.sv_customer_events e where e.company_id=p.company_id and e.customer_id=p_customer and e.brand_id=b and e.kind='pos-refund'and e.detail->>'id'=p.id)
 )select coalesce(jsonb_agg(to_jsonb(x)order by x.at desc,x.key desc),'[]')into events from(
 select *from candidates where p_before is null or(at,key)<(p_before,p_before_key)order by at desc,key desc limit 51)x;
 return jsonb_build_object('brandId',b,'customerId',p_customer,'brands',brands,'canEdit',(select role<>'viewer'from public.sv_memberships where company_id=p_company and user_id=p_actor),
 'memories',mem,'history',hist,'timeline',events,'moreHistory',more_history);
end;$$;

-- Exact stored source -> customer context. No caller-supplied identity is trusted.
create function public.sv_customer_memory_context(p_company uuid,p_actor uuid,p_brand text,p_source text,p_source_id text)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare cid text;binding text;facts jsonb;guidance jsonb;voice jsonb:='[]'::jsonb;doc public.sv_workspaces;l public.sv_customer_threads;begin
 perform public.sv_member_scope(p_company,p_actor,p_brand,'crm');
 perform pg_advisory_xact_lock_shared(hashtextextended('customer-context:'||p_company::text||':'||p_brand||':'||p_source||':'||p_source_id,0));
 if p_source in('meta','whatsapp')then
  select *into strict l from public.sv_customer_threads where company_id=p_company and provider=p_source and thread_id=p_source_id::uuid and brand_id=p_brand for share;
  cid=l.customer_id;binding=l.provider||':'||l.thread_id||':'||l.revision;
 elsif p_source='conversation'then
  select *into strict doc from public.sv_workspaces where company_id=p_company for share;
  select c->>'contactId'into cid from jsonb_array_elements(doc.payload#>'{inbox,conversations}')c where c->>'id'=p_source_id and c->>'brandId'=p_brand;
  if cid is null then raise exception 'query returned no rows'using errcode='P0002';end if;
  binding='conversation:'||p_source_id||':'||coalesce(cid,'');
 else raise exception 'memory_source_invalid';end if;
 perform public.sv_customer_memory_scope(p_company,p_actor,cid,p_brand,false);
 perform pg_advisory_xact_lock_shared(hashtextextended('customer-memory:'||p_company::text||':'||cid||':'||p_brand,0));
 select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]')into facts from(
  select *from(select distinct on(id)id,revision,category,content,status,created_at from public.sv_customer_memories where company_id=p_company and customer_id=cid and brand_id=p_brand order by id,revision desc)x where status='active' limit 100)x;
 select coalesce(jsonb_agg(jsonb_build_object('id',x->>'id','revision',x->'revision','category',x->>'category','content',left(x->>'content',500))),'[]')into guidance
 from(select value x from jsonb_array_elements(facts)where value->>'status'='active'order by case value->>'category'when'constraint'then 0 when'need'then 1 else 2 end,value->>'created_at'desc,value->>'id'limit 8)y;
 if to_regclass('public.sv_voice_corrections')is not null then
  select coalesce(jsonb_agg(x.item order by x.at desc,x.id desc),'[]')into voice from(
   select t.id,t.created_at as at,jsonb_build_object('id',t.id,'messageId',a.message_id,'revision',c.revision,'text',left(c.text,1200),'contentHash',a.content_hash,'textHash',md5(c.text),'label','同事已核對語音逐字稿')as item
   from public.sv_voice_assets a join public.sv_voice_transcripts t on t.company_id=a.company_id and t.asset_id=a.id
   join lateral(select v.revision,v.text from public.sv_voice_corrections v where v.company_id=t.company_id and v.transcript_id=t.id order by v.revision desc limit 1)c on true
   where a.company_id=p_company and a.brand_id=p_brand and a.source=p_source and a.source_id=p_source_id order by t.created_at desc,t.id desc limit 3)x;
 end if;
 return jsonb_build_object('customerId',cid,'stamp',md5(jsonb_build_object('companyId',p_company,'customerId',cid,'brandId',p_brand,'binding',binding,'facts',facts,'reviewedVoice',voice)::text),'guidance',guidance,'reviewedVoice',voice);
end;$$;
create table public.sv_memory_ai_contexts(
 company_id uuid not null,request_id uuid not null,actor_id uuid not null,brand_id text not null,source text not null,source_id text not null,
 customer_id text not null,stamp text not null check(stamp~'^[a-f0-9]{32}$'),created_at timestamptz not null default now(),primary key(company_id,request_id),
 foreign key(company_id,request_id)references public.sv_ai_requests(company_id,request_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
alter table public.sv_memory_ai_contexts enable row level security;
revoke all on public.sv_memory_ai_contexts from public,anon,authenticated,service_role;
grant select,insert on public.sv_memory_ai_contexts to service_role;
create trigger sv_memory_ai_contexts_immutable before update or delete on public.sv_memory_ai_contexts for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_memory_ai_contexts_no_truncate before truncate on public.sv_memory_ai_contexts for each statement execute function smartvolt_private.wa_reject_rewrite();
create function public.sv_memory_ai_claim(p_company uuid,p_actor uuid,p_request uuid,p_brand text,p_source text,p_source_id text,p_workspace_revision bigint,p_source_revision bigint,p_model text,p_hash text,p_memory_stamp text)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare ctx jsonb;r jsonb;old public.sv_memory_ai_contexts;begin
 ctx=public.sv_customer_memory_context(p_company,p_actor,p_brand,p_source,p_source_id);
 if ctx->>'stamp'is distinct from p_memory_stamp then raise exception 'ai_context_changed';end if;
 select *into old from public.sv_memory_ai_contexts where company_id=p_company and request_id=p_request;
 if found and(old.stamp<>p_memory_stamp or old.actor_id<>p_actor or old.brand_id<>p_brand or old.source<>p_source or old.source_id<>p_source_id)then raise exception 'ai_context_changed';end if;
 if not found and exists(select 1 from public.sv_ai_requests where company_id=p_company and request_id=p_request)then raise exception 'ai_idempotency_conflict';end if;
 r=public.sv_ai_claim(p_company,p_actor,p_request,p_brand,p_source,p_source_id,p_workspace_revision,p_source_revision,p_model,p_hash);
 if(r->>'dispatch')::boolean then insert into public.sv_memory_ai_contexts(company_id,request_id,actor_id,brand_id,source,source_id,customer_id,stamp)
 values(p_company,p_request,p_actor,p_brand,p_source,p_source_id,ctx->>'customerId',p_memory_stamp);end if;return r;
end;$$;
create function public.sv_memory_ai_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare prior public.sv_memory_ai_contexts;ctx jsonb;err text:=p_error;r public.sv_ai_requests;begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select *into strict prior from public.sv_memory_ai_contexts where company_id=p_company and request_id=p_request and actor_id=p_actor;
 begin ctx=public.sv_customer_memory_context(p_company,p_actor,prior.brand_id,prior.source,prior.source_id);
 exception when no_data_found then err='context_changed';end;
 if ctx->>'stamp'is distinct from prior.stamp then err='context_changed';end if;
 select *into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor;
 if r.status<>'running'and err='context_changed'then return jsonb_build_object('status','failed','result',null,'error_code','context_changed');end if;
 return public.sv_ai_finish(p_company,p_actor,p_request,p_result,err,p_input,p_output);
end;$$;
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('sv_customer_memory_scope','sv_customer_memory_action','sv_customer_memory_read','sv_customer_memory_context','sv_memory_ai_claim','sv_memory_ai_finish')loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);end loop;
end;$$;
