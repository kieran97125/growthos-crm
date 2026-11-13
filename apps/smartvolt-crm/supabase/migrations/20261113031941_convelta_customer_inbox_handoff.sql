-- Product Learning Sync checked. Original company-scoped customer identity,
-- channel links, operational handoffs and immutable history. No sample data.
create table public.sv_customers(
 company_id uuid not null references public.sv_companies(id),id text not null check(length(id) between 1 and 100),
 name text not null check(length(name) between 1 and 80),phone text not null default '' check(length(phone)<=40),
 email text not null default '' check(length(email)<=160),tags jsonb not null default '[]' check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=20),
 note text not null default '' check(length(note)<=12000),source text not null default '' check(length(source)<=100),
 revision bigint not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(company_id,id)
);
create table public.sv_customer_brands(
 company_id uuid not null,customer_id text not null,brand_id text not null,
 primary key(company_id,customer_id,brand_id),foreign key(company_id,customer_id) references public.sv_customers(company_id,id)
);
create index sv_customer_brands_scope on public.sv_customer_brands(company_id,brand_id,customer_id);
create index sv_customers_search on public.sv_customers(company_id,lower(name),id);
create index sv_customers_phone on public.sv_customers(company_id,phone) where phone<>'';
create table public.sv_customer_threads(
 company_id uuid not null,provider text not null check(provider in ('meta','whatsapp')),thread_id uuid not null,
 brand_id text not null,customer_id text not null,revision bigint not null default 0,
 primary key(company_id,provider,thread_id),foreign key(company_id,customer_id,brand_id) references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create index sv_customer_threads_customer on public.sv_customer_threads(company_id,customer_id,provider,thread_id);
create table public.sv_customer_events(
 seq bigint generated always as identity primary key,company_id uuid not null,customer_id text not null,brand_id text not null,
 event_key text not null,kind text not null,actor_id uuid,detail jsonb not null,created_at timestamptz not null default now(),
 unique(company_id,event_key),foreign key(company_id,customer_id) references public.sv_customers(company_id,id)
);
create index sv_customer_events_history on public.sv_customer_events(company_id,customer_id,seq desc);
create table public.sv_inquiry_commands(
 company_id uuid not null references public.sv_companies(id),command_id uuid not null,actor_id uuid not null,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(company_id,command_id),
 foreign key(company_id,actor_id) references public.sv_memberships(company_id,user_id)
);
create index sv_inquiry_commands_actor on public.sv_inquiry_commands(company_id,actor_id);
create table public.sv_booking_requests(
 company_id uuid not null,id uuid not null,customer_id text not null,brand_id text not null,
 provider text not null,thread_id uuid not null,service text not null check(length(service) between 1 and 100),
 desired_at timestamptz not null check(isfinite(desired_at)),guests integer not null check(guests between 1 and 10),note text not null default '' check(length(note)<=1000),
 status text not null default 'requested' check(status in ('requested','confirmed','cancelled','linked')),
 pos_appointment_id text,revision bigint not null default 0,created_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,pos_appointment_id),
 foreign key(company_id,customer_id,brand_id) references public.sv_customer_brands(company_id,customer_id,brand_id),
 foreign key(company_id,provider,thread_id) references public.sv_customer_threads(company_id,provider,thread_id)
);
create index sv_booking_requests_customer on public.sv_booking_requests(company_id,customer_id,created_at desc,id desc);
create index sv_booking_requests_thread on public.sv_booking_requests(company_id,provider,thread_id,created_at desc);
alter table public.sv_wa_conversations
 add column customer_name text not null default '' check(length(customer_name)<=100),
 add column assignee_id uuid,add column priority text not null default 'normal' check(priority in ('normal','high','urgent')),
 add column follow_up_at timestamptz,add column next_step text not null default '' check(length(next_step)<=500),
 add constraint sv_wa_assignee_tenant foreign key(company_id,assignee_id) references public.sv_memberships(company_id,user_id);
create index sv_wa_assignee on public.sv_wa_conversations(company_id,assignee_id,updated_at desc,id desc);
create index sv_wa_followup on public.sv_wa_conversations(company_id,follow_up_at) where status='open' and follow_up_at is not null;
create table public.sv_wa_thread_activity(like public.sv_meta_thread_activity including defaults including constraints);
alter table public.sv_wa_thread_activity add primary key(company_id,command_id),
 add foreign key(company_id,thread_id) references public.sv_wa_conversations(company_id,id),
 add foreign key(company_id,actor_id) references public.sv_memberships(company_id,user_id);
create index sv_wa_thread_activity_history on public.sv_wa_thread_activity(company_id,thread_id,created_at desc,command_id desc);
create index sv_wa_thread_activity_actor on public.sv_wa_thread_activity(company_id,actor_id);

create function public.sv_customer_authorize(p_company uuid,p_actor uuid,p_write boolean default false,p_crm boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active' for share of m,c;
 if r is null or (p_write and r='viewer') then raise exception 'customer_access_denied';end if;
 perform 1 from public.sv_company_products where company_id=p_company and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()) and (not p_crm or product='crm') for share;
 if not found then raise exception 'customer_product_required';end if;return r;
end;$$;
create function public.sv_customer_json(p_company uuid,p_id text)returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',c.id,'clientId',c.company_id,'name',c.name,'initials',left(c.name,2),'phone',c.phone,'email',c.email,'company','','tags',c.tags,'note',c.note,'source',c.source,'createdAt',floor(extract(epoch from c.created_at)*1000),'brandIds',coalesce((select jsonb_agg(b.brand_id order by b.brand_id) from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id),'[]'::jsonb)) from public.sv_customers c where c.company_id=p_company and c.id=p_id
$$;
create function smartvolt_private.customer_workspace_projection()returns trigger language plpgsql security invoker set search_path='' as $$
declare c jsonb;b text;
begin
 for c in select value from jsonb_array_elements(new.payload #> '{inbox,contacts}') loop
  -- A workspace snapshot can contain an older projection of an independently
  -- edited directory record. Only explicit contact changes can update it.
  if tg_op='INSERT' or not exists(select 1 from jsonb_array_elements(old.payload #> '{inbox,contacts}')o where o=c) then
   insert into public.sv_customers(company_id,id,name,phone,email,tags,note,source,created_at)
   values(new.company_id,c->>'id',c->>'name',coalesce(c->>'phone',''),coalesce(c->>'email',''),coalesce(c->'tags','[]'),coalesce(c->>'note',''),coalesce(c->>'source',''),to_timestamp((c->>'createdAt')::double precision/1000))
   on conflict(company_id,id)do update set name=excluded.name,phone=excluded.phone,email=excluded.email,tags=excluded.tags,note=excluded.note,source=excluded.source,revision=sv_customers.revision+1,updated_at=now()
   where (sv_customers.name,sv_customers.phone,sv_customers.email,sv_customers.tags,sv_customers.note,sv_customers.source) is distinct from (excluded.name,excluded.phone,excluded.email,excluded.tags,excluded.note,excluded.source);
  end if;
  for b in select distinct v from(
   select x->>'brandId' v from jsonb_array_elements(new.payload #> '{inbox,conversations}')x where x->>'contactId'=c->>'id'
   union select jsonb_array_elements_text(coalesce(c->'brandIds','[]'::jsonb))
  )q where v is not null loop
   if not exists(select 1 from jsonb_array_elements(new.payload #> '{scope,brands}')x where x->>'id'=b)then raise exception 'customer_brand_scope';end if;
   insert into public.sv_customer_brands values(new.company_id,c->>'id',b)on conflict do nothing;
  end loop;
 end loop;return new;
end;$$;
create trigger sv_customer_workspace after insert or update of payload on public.sv_workspaces for each row execute function smartvolt_private.customer_workspace_projection();
-- Backfill existing directory without changing the workspace or its revision.
insert into public.sv_customers(company_id,id,name,phone,email,tags,note,source,created_at)
 select w.company_id,c->>'id',c->>'name',c->>'phone',c->>'email',c->'tags',c->>'note',c->>'source',to_timestamp((c->>'createdAt')::double precision/1000) from public.sv_workspaces w,jsonb_array_elements(w.payload #> '{inbox,contacts}')c;
insert into public.sv_customer_brands select distinct w.company_id,c->>'contactId',c->>'brandId' from public.sv_workspaces w,jsonb_array_elements(w.payload #> '{inbox,conversations}')c on conflict do nothing;

create function smartvolt_private.customer_channel_insert()returns trigger language plpgsql security invoker set search_path='' as $$
declare b text;n text;p text:='';provider text;cid text:='customer-'||gen_random_uuid()::text;
begin
 if tg_table_name='sv_meta_threads' then
  provider='meta';select brand_id,case channel when 'instagram' then 'Instagram 客戶' else 'Messenger 客戶' end into strict b,n from public.sv_meta_connections where company_id=new.company_id and id=new.connection_id;
 else
  provider='whatsapp';b=new.brand_id;select left(display_name,80),coalesce(phone,'') into strict n,p from public.sv_wa_contacts where company_id=new.company_id and id=new.contact_id;
 end if;
 insert into public.sv_customers(company_id,id,name,phone,source)values(new.company_id,cid,n,p,provider);
 insert into public.sv_customer_brands values(new.company_id,cid,b);
 insert into public.sv_customer_threads(company_id,provider,thread_id,brand_id,customer_id)values(new.company_id,provider,new.id,b,cid);
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail)values(new.company_id,cid,b,'channel:'||provider||':'||new.id,'channel-linked',jsonb_build_object('provider',provider,'threadId',new.id,'evidence','provider-thread'));
 return new;
end;$$;
create trigger sv_customer_meta after insert on public.sv_meta_threads for each row execute function smartvolt_private.customer_channel_insert();
create trigger sv_customer_wa after insert on public.sv_wa_conversations for each row execute function smartvolt_private.customer_channel_insert();
-- Existing provider threads get their own identity, never a name/phone guess.
do $$declare t record;cid text;begin
 for t in select m.company_id,'meta'::text provider,m.id,c.brand_id,coalesce(nullif(left(m.customer_name,80),''),'社交客戶') name,''::text phone from public.sv_meta_threads m join public.sv_meta_connections c on c.id=m.connection_id
 union all select w.company_id,'whatsapp',w.id,w.brand_id,left(c.display_name,80),coalesce(c.phone,'')from public.sv_wa_conversations w join public.sv_wa_contacts c on c.id=w.contact_id loop
 cid='customer-'||gen_random_uuid()::text;
 insert into public.sv_customers(company_id,id,name,phone,source)values(t.company_id,cid,t.name,t.phone,t.provider);
 insert into public.sv_customer_brands values(t.company_id,cid,t.brand_id);
 insert into public.sv_customer_threads values(t.company_id,t.provider,t.id,t.brand_id,cid,0);
 end loop;
end;$$;

create function public.sv_customer_relink(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_customer text,p_expected bigint,p_command uuid,p_reason text)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;r public.sv_inquiry_commands;req jsonb;outcome jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_reason is null or length(btrim(p_reason))not between 3 and 300 then raise exception 'customer_reason_required';end if;
 req=jsonb_build_object('kind','relink','provider',p_provider,'thread',p_thread,'customer',p_customer,'revision',p_expected,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 select * into strict l from public.sv_customer_threads where company_id=p_company and provider=p_provider and thread_id=p_thread for update;
 if l.revision<>p_expected then raise exception 'customer_revision_conflict';end if;
 if not exists(select 1 from public.sv_customer_brands where company_id=p_company and customer_id=p_customer and brand_id=l.brand_id)then raise exception 'customer_brand_scope';end if;
 -- Historical bookings keep their original customer; only this channel's
 -- future context moves. A subsequent relink can restore the prior identity.
 update public.sv_customer_threads set customer_id=p_customer,revision=revision+1 where company_id=p_company and provider=p_provider and thread_id=p_thread;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,p_customer,l.brand_id,'relink:'||p_command,'identity-linked',p_actor,jsonb_build_object('provider',p_provider,'threadId',p_thread,'previousCustomer',l.customer_id,'reason',p_reason));
 if l.customer_id<>p_customer then insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,l.customer_id,l.brand_id,'unlink:'||p_command,'identity-unlinked',p_actor,jsonb_build_object('provider',p_provider,'threadId',p_thread,'nextCustomer',p_customer,'reason',p_reason));end if;
 outcome=jsonb_build_object('saved',true);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,outcome,now());return outcome;
end;$$;

create function public.sv_booking_request(p_company uuid,p_actor uuid,p_command uuid,p_id uuid,p_action text,p_data jsonb,p_expected bigint default 0)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;b public.sv_booking_requests;r public.sv_inquiry_commands;req jsonb;outcome jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_id is null or p_action is null or p_action not in ('create','confirm','cancel')then raise exception 'customer_booking_invalid';end if;
 req=jsonb_build_object('kind','booking','id',p_id,'action',p_action,'data',p_data,'revision',p_expected);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 if p_action='create' then
  select * into strict l from public.sv_customer_threads where company_id=p_company and provider=p_data->>'provider' and thread_id=(p_data->>'threadId')::uuid for share;
  if l.customer_id is distinct from p_data->>'customerId' or l.revision is distinct from (p_data->>'linkRevision')::bigint then raise exception 'customer_context_changed';end if;
  if p_data->>'service' is null or p_data->>'desiredAt' is null or p_data->>'guests' is null then raise exception 'customer_booking_invalid';end if;
  insert into public.sv_booking_requests(company_id,id,customer_id,brand_id,provider,thread_id,service,desired_at,guests,note)
  values(p_company,p_id,l.customer_id,l.brand_id,l.provider,l.thread_id,p_data->>'service',(p_data->>'desiredAt')::timestamptz,(p_data->>'guests')::integer,coalesce(p_data->>'note',''))returning * into b;
 else
  select * into strict b from public.sv_booking_requests where company_id=p_company and id=p_id for update;
  if b.revision<>p_expected or b.status not in ('requested','confirmed')then raise exception 'customer_revision_conflict';end if;
  if p_action='confirm' and exists(select 1 from public.sv_company_products where company_id=p_company and product='pos' and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()))then raise exception 'customer_pos_required';end if;
  update public.sv_booking_requests set status=case p_action when 'confirm' then 'confirmed' else 'cancelled' end,revision=revision+1 where company_id=p_company and id=p_id returning * into b;
 end if;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,b.customer_id,b.brand_id,'request:'||p_command,'booking-'||p_action,p_actor,jsonb_build_object('requestId',b.id,'service',b.service,'desiredAt',b.desired_at,'status',b.status));
 outcome=jsonb_build_object('saved',true,'requestId',b.id);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,outcome,now());return outcome;
end;$$;

-- Read model combines all actual channels before filtering/counting/pagination.
create function public.sv_inbox_list(p_company uuid,p_actor uuid,p_queue text default 'all',p_channel text default 'all',p_search text default '',p_before timestamptz default null,p_before_key text default null)returns jsonb
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
 select * from scoped where case p_queue when 'mine' then status='open' and assignee_id=p_actor when 'unassigned' then status='open' and not assignee_active when 'overdue' then status='open' and follow_up_at<=now() when 'priority' then status='open' and priority in ('high','urgent') when 'unread' then status='open' and unread_count>0 when 'resolved' then status='resolved' else status='open' end
 ), page as(select * from filtered where p_before is null or(updated_at,key)<(p_before,p_before_key)order by updated_at desc,key desc limit 51)
 select jsonb_build_object('threads',coalesce((select jsonb_agg(to_jsonb(p) order by updated_at desc,key desc)from page p),'[]'::jsonb),'counts',(select jsonb_build_object('all',count(*)filter(where status='open'),'mine',count(*)filter(where status='open' and assignee_id=p_actor),'unassigned',count(*)filter(where status='open' and not assignee_active),'overdue',count(*)filter(where status='open' and follow_up_at<=now()),'priority',count(*)filter(where status='open' and priority in ('high','urgent')),'unread',count(*)filter(where status='open' and unread_count>0),'resolved',count(*)filter(where status='resolved'))from scoped))into result;return result;
end;$$;

create function smartvolt_private.customer_pos_event()returns trigger language plpgsql security invoker set search_path='' as $$
declare b public.sv_booking_requests;cid text;brand text;k text;
begin
 if tg_table_name='sv_pos_appointments' then
  cid=new.contact_id;brand=new.brand_id;k='pos-appointment';
  if tg_op='UPDATE' and new.snapshot=old.snapshot then return new;end if;
  if new.snapshot->>'requestId' is not null then
   select * into strict b from public.sv_booking_requests where company_id=new.company_id and id=(new.snapshot->>'requestId')::uuid for update;
   if b.customer_id<>cid or b.brand_id<>brand or b.status='cancelled' or(b.pos_appointment_id is not null and b.pos_appointment_id<>new.id)then raise exception 'customer_booking_scope';end if;
   update public.sv_booking_requests set status='linked',pos_appointment_id=new.id,revision=revision+1 where company_id=b.company_id and id=b.id;
  end if;
 else
  select contact_id,brand_id into cid,brand from public.sv_pos_orders where company_id=new.company_id and id=new.order_id;k=case tg_table_name when 'sv_pos_payments' then 'pos-payment' else 'pos-refund' end;
 end if;
 if exists(select 1 from public.sv_customer_brands where company_id=new.company_id and customer_id=cid and brand_id=brand)then
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail)values(new.company_id,cid,brand,k||':'||new.id||':'||new.workspace_revision,k,new.snapshot)on conflict do nothing;
 end if;return new;
end;$$;
-- Directory sync runs before financial projection; provider customer snapshots
-- are materialized into the compatibility aggregate only when operating POS.
create trigger sv_customer_pos_appointment after insert or update on public.sv_pos_appointments for each row execute function smartvolt_private.customer_pos_event();
create trigger sv_customer_pos_payment after insert on public.sv_pos_payments for each row execute function smartvolt_private.customer_pos_event();
create trigger sv_customer_pos_refund after insert on public.sv_pos_refunds for each row execute function smartvolt_private.customer_pos_event();

-- Explicit privilege reset also removes hosted default ALL grants.
do $$declare t text;f record;begin
 foreach t in array array['sv_customers','sv_customer_brands','sv_customer_threads','sv_customer_events','sv_inquiry_commands','sv_booking_requests','sv_wa_thread_activity']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select,insert%s on public.%I to service_role',case when t in ('sv_customer_events','sv_inquiry_commands','sv_wa_thread_activity')then '' else ',update' end,t);
 if t in ('sv_customer_events','sv_inquiry_commands','sv_wa_thread_activity')then
 execute format('create trigger %I before update or delete on public.%I for each row execute function smartvolt_private.wa_reject_rewrite()',t||'_immutable',t);
 execute format('create trigger %I before truncate on public.%I for each statement execute function smartvolt_private.wa_reject_rewrite()',t||'_truncate',t);
 end if;
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='public' and p.proname in ('sv_customer_authorize','sv_customer_json','sv_customer_relink','sv_booking_request','sv_inbox_list'))or(n.nspname='smartvolt_private' and p.proname in ('customer_workspace_projection','customer_channel_insert','customer_pos_event'))loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
revoke all on sequence public.sv_customer_events_seq_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.sv_customer_events_seq_seq to service_role;
create or replace function public.sv_wa_manage_thread(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_expected bigint,p_data jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_wa_conversations; prior jsonb; target jsonb; receipt public.sv_wa_thread_activity; assignee uuid; actor_name text;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 -- Immutable receipts can be confirmed after an assignee has left the company.
 select * into receipt from public.sv_wa_thread_activity where company_id=p_company and command_id=p_command;
 if found then
  if receipt.thread_id<>p_thread or receipt.actor_id<>p_actor or receipt.request is distinct from jsonb_build_object('revision',p_expected,'data',p_data)
  then raise exception 'meta_idempotency_conflict';end if;
  return jsonb_build_object('saved',true,'replayed',true);
 end if;
 if p_command is null or p_expected is null or p_expected<0 or jsonb_typeof(p_data) is distinct from 'object'
 or (select count(*) from jsonb_object_keys(p_data))<>6
 or not (p_data ?& array['customer_name','assignee_id','priority','follow_up_at','next_step','status'])
 or jsonb_typeof(p_data->'customer_name')<>'string' or length(p_data->>'customer_name')>100
 or jsonb_typeof(p_data->'next_step')<>'string' or length(p_data->>'next_step')>500
 or p_data->>'priority' not in ('normal','high','urgent') or p_data->>'status' not in ('open','resolved')
 or jsonb_typeof(p_data->'priority')<>'string' or jsonb_typeof(p_data->'status')<>'string'
 or jsonb_typeof(p_data->'assignee_id') not in ('string','null') or jsonb_typeof(p_data->'follow_up_at') not in ('string','null')
 then raise exception 'meta_operations_invalid';end if;
 assignee=(p_data->>'assignee_id')::uuid;
 -- Lock memberships before the thread, consistently with access authorization.
 -- A removed/view-only assignee must be explicitly reassigned or cleared.
 if assignee is not null then
  perform 1 from public.sv_memberships where company_id=p_company and user_id=assignee and status='active' and role<>'viewer' for share;
  if not found then raise exception 'meta_assignee_invalid';end if;
 end if;
 select * into strict t from public.sv_wa_conversations where company_id=p_company and id=p_thread for update;
 select * into receipt from public.sv_wa_thread_activity where company_id=p_company and command_id=p_command;
 if found then
  if receipt.thread_id<>p_thread or receipt.actor_id<>p_actor or receipt.request is distinct from jsonb_build_object('revision',p_expected,'data',p_data)
  then raise exception 'meta_idempotency_conflict';end if;
  return jsonb_build_object('saved',true,'replayed',true);
 end if;
 if t.revision<>p_expected then raise exception 'meta_revision_conflict';end if;
 prior=jsonb_build_object('customer_name',t.customer_name,'assignee_id',t.assignee_id,'priority',t.priority,'follow_up_at',t.follow_up_at,'next_step',t.next_step,'status',t.status);
 target=jsonb_build_object('customer_name',btrim(p_data->>'customer_name'),'assignee_id',assignee,'priority',p_data->>'priority','follow_up_at',(p_data->>'follow_up_at')::timestamptz,'next_step',btrim(p_data->>'next_step'),'status',p_data->>'status');
 if not isfinite((target->>'follow_up_at')::timestamptz) then raise exception 'meta_operations_invalid';end if;
 select display_name into strict actor_name from public.sv_memberships where company_id=p_company and user_id=p_actor;
 update public.sv_wa_conversations set customer_name=target->>'customer_name',assignee_id=assignee,priority=target->>'priority',
 follow_up_at=(target->>'follow_up_at')::timestamptz,next_step=target->>'next_step',status=target->>'status',revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sv_wa_thread_activity(company_id,command_id,thread_id,actor_id,actor_name,request,previous,next)
 values(p_company,p_command,t.id,p_actor,actor_name,jsonb_build_object('revision',p_expected,'data',p_data),prior,target);
 return jsonb_build_object('saved',true,'replayed',false);
end;$$;


revoke all on function public.sv_wa_manage_thread(uuid,uuid,uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.sv_wa_manage_thread(uuid,uuid,uuid,uuid,bigint,jsonb) to service_role;

create function public.sv_customer_list(p_company uuid,p_actor uuid,p_brand text default null,p_search text default '',p_after text default null)returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 perform public.sv_customer_authorize(p_company,p_actor);
 if p_search is null or length(p_search)>100 or length(p_after)>100 then raise exception 'customer_query_invalid';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'revision',revision)order by id),'[]'::jsonb)into result from(
 select c.* from public.sv_customers c where c.company_id=p_company and(p_after is null or c.id>p_after)
 and(p_search='' or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)
 and(p_brand is null or exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and b.brand_id=p_brand))order by c.id limit 51)q;
 return result;
end;$$;

create function public.sv_customer_update(p_company uuid,p_actor uuid,p_customer text,p_expected bigint,p_command uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sv_customers;r public.sv_inquiry_commands;req jsonb;outcome jsonb;doc public.sv_workspaces;cs jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true);
 if p_command is null or jsonb_typeof(p_data)<>'object' or p_data->>'name' is null or length(btrim(p_data->>'name'))not between 1 and 80 or length(p_data->>'phone')>40 or length(p_data->>'email')>160 or length(p_data->>'note')>12000 or jsonb_typeof(p_data->'tags')<>'array' or jsonb_array_length(p_data->'tags')>20 then raise exception 'customer_invalid';end if;
 req=jsonb_build_object('kind','customer-update','customer',p_customer,'revision',p_expected,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 -- Same lock order as POS commands: workspace before customer.
 select * into strict doc from public.sv_workspaces where company_id=p_company for update;
 select * into strict c from public.sv_customers where company_id=p_company and id=p_customer for update;
 if c.revision<>p_expected then raise exception 'customer_revision_conflict';end if;
 update public.sv_customers set name=btrim(p_data->>'name'),phone=coalesce(p_data->>'phone',''),email=coalesce(p_data->>'email',''),tags=p_data->'tags',note=coalesce(p_data->>'note',''),revision=revision+1,updated_at=now()where company_id=p_company and id=p_customer;
 if exists(select 1 from jsonb_array_elements(doc.payload #> '{inbox,contacts}')x where x->>'id'=p_customer)then
 select jsonb_agg(case when x->>'id'=p_customer then public.sv_customer_json(p_company,p_customer)else x end)into cs from jsonb_array_elements(doc.payload #> '{inbox,contacts}')x;
 update public.sv_workspaces set payload=jsonb_set(payload,'{inbox,contacts}',cs),revision=revision+1,updated_at=now()where company_id=p_company;
 end if;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)
 select p_company,p_customer,b.brand_id,'profile:'||p_command||':'||b.brand_id,'customer-updated',p_actor,jsonb_build_object('name',p_data->>'name')from public.sv_customer_brands b where b.company_id=p_company and b.customer_id=p_customer;
 outcome=jsonb_build_object('saved',true);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,outcome,now());return outcome;
end;$$;

create function public.sv_inquiry_auto_assign(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_expected bigint,p_command uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare target uuid;t jsonb;result jsonb;receipt public.sv_inquiry_commands;req jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 -- Serialize workload admission, keeping concurrent inquiries balanced.
 perform pg_advisory_xact_lock(hashtextextended('assignment:'||p_company::text,0));
 req=jsonb_build_object('kind','auto-assign','provider',p_provider,'thread',p_thread,'revision',p_expected);
 select * into receipt from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if receipt.actor_id<>p_actor or receipt.request<>req then raise exception 'customer_idempotency_conflict';end if;return receipt.result;end if;
 select m.user_id into target from public.sv_memberships m where m.company_id=p_company and m.status='active' and m.role<>'viewer'
 order by((select count(*)from public.sv_meta_threads where company_id=p_company and assignee_id=m.user_id and status='open')+(select count(*)from public.sv_wa_conversations where company_id=p_company and assignee_id=m.user_id and status='open')),m.user_id limit 1 for share;
 if target is null then raise exception 'customer_assignee_invalid';end if;
 if p_provider='meta' then select to_jsonb(x)into strict t from public.sv_meta_threads x where company_id=p_company and id=p_thread;
 elsif p_provider='whatsapp' then select to_jsonb(x)into strict t from public.sv_wa_conversations x where company_id=p_company and id=p_thread;
 else raise exception 'customer_query_invalid';end if;
 t=jsonb_build_object('customer_name',t->'customer_name','assignee_id',target,'priority',t->'priority','follow_up_at',t->'follow_up_at','next_step',t->'next_step','status',t->'status');
 if p_provider='meta' then result=public.sv_meta_manage_thread(p_company,p_actor,p_thread,p_command,p_expected,t);
 else result=public.sv_wa_manage_thread(p_company,p_actor,p_thread,p_command,p_expected,t);end if;
 insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

create function public.sv_commit_booking(p_company uuid,p_actor uuid,p_command uuid,p_request uuid,p_expected bigint,p_request_revision bigint,p_selection jsonb,p_payload jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.sv_booking_requests;r public.sv_inquiry_commands;req jsonb;result jsonb;ap jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 perform 1 from public.sv_company_products where company_id=p_company and product='pos' and status='active' and starts_at<=now()and(ends_at is null or ends_at>now())for share;
 if not found then raise exception 'customer_pos_required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 req=jsonb_build_object('kind','convert','request',p_request,'revision',p_expected,'requestRevision',p_request_revision,'selection',p_selection);
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 perform 1 from public.sv_workspaces where company_id=p_company for update;
 select * into strict b from public.sv_booking_requests where company_id=p_company and id=p_request for update;
 if b.status<>'requested' or b.revision<>p_request_revision then raise exception 'customer_revision_conflict';end if;
 if not exists(select 1 from public.sv_customer_threads where company_id=p_company and provider=b.provider and thread_id=b.thread_id and customer_id=b.customer_id)then raise exception 'customer_context_changed';end if;
 select x into ap from jsonb_array_elements(p_payload #> '{pos,appointments}')x where x->>'id'='request-'||p_request::text;
 if ap is null or ap->>'requestId'<>p_request::text or ap->>'contactId'<>b.customer_id or ap->>'brandId'<>b.brand_id or ap->>'status'<>'confirmed' or ap->>'serviceId' is distinct from p_selection->>'serviceId' or ap->>'staffId' is distinct from p_selection->>'staffId' or ap->>'resourceId' is distinct from p_selection->>'resourceId' or (ap->>'startsAt')::bigint is distinct from (p_selection->>'startsAt')::bigint or (ap->>'guests')::integer<>b.guests then raise exception 'customer_booking_scope';end if;
 perform public.sv_commit_workspace(p_company,p_actor,p_expected,p_command,p_payload,'pos');
 result=jsonb_build_object('saved',true,'appointmentId',ap->>'id');insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('sv_customer_list','sv_customer_update','sv_inquiry_auto_assign','sv_commit_booking')loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end;$$;
-- Seed cards for current and future companies, independently of provider access.
create function smartvolt_private.customer_system_cards()returns trigger language plpgsql security invoker set search_path='' as $$begin
 insert into public.sv_system_cards(company_id,id,title,category,status,detail)values
 (new.id,'inquiry-round-one','客戶身份、統一收件匣及預約交接','build','in_progress','共用客戶目錄、明確身份連結、WhatsApp／Meta 工作佇列、分派、預約意向與 POS 確認交接；實際部署及渠道收發驗收分開記錄。'),
 (new.id,'inquiry-shift-routing','分店及更表分派','admin','planned','本輪提供在職同事手動分派及按未完成工作量分派；更表、休假、分店服務技能及離線 SLA 升級另行實作。')on conflict do nothing;return new;end;$$;
revoke all on function smartvolt_private.customer_system_cards()from public,anon,authenticated;
create trigger sv_customer_system_cards after insert on public.sv_companies for each row execute function smartvolt_private.customer_system_cards();
insert into public.sv_system_cards(company_id,id,title,category,status,detail)select id,'inquiry-round-one','客戶身份、統一收件匣及預約交接','build','in_progress','共用客戶目錄、明確身份連結、渠道工作佇列、分派及預約交接已開發；待獨立測試、部署及正式讀回驗證。真實渠道收發仍由各渠道卡追蹤。'from public.sv_companies on conflict do nothing;
insert into public.sv_system_cards(company_id,id,title,category,status,detail)select id,'inquiry-shift-routing','分店及更表分派','admin','planned','提供在職同事手動分派及按未完成工作量分派；更表、休假、分店服務技能及離線 SLA 升級另行實作。'from public.sv_companies on conflict do nothing;

alter table public.sv_ai_requests drop constraint sv_ai_requests_source_check;
alter table public.sv_ai_requests add constraint sv_ai_requests_source_check check(source in ('playground','conversation','meta','whatsapp'));
create or replace function public.sv_ai_claim(p_company uuid,p_actor uuid,p_request uuid,p_brand text,p_source text,p_source_id text,p_workspace_revision bigint,p_source_revision bigint,p_model text,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare settings public.sv_ai_settings;doc public.sv_workspaces;r public.sv_ai_requests;t public.sv_meta_threads;day_start timestamptz;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select * into settings from public.sv_ai_settings where company_id=p_company for update;
 if not found or not settings.enabled then raise exception 'ai_disabled';end if;
 select * into strict doc from public.sv_workspaces where company_id=p_company for share;
 if doc.revision is distinct from p_workspace_revision then raise exception 'ai_context_changed';end if;
 if p_request is null or p_source is null or p_source not in ('playground','conversation','meta','whatsapp') or
 p_model is null or length(p_model)not between 3 and 150 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'ai_invalid';end if;
 if not exists(select 1 from jsonb_array_elements(doc.payload #> '{scope,brands}')b where b->>'id'=p_brand)then raise exception 'ai_brand_scope';end if;
 if p_source='meta' then
  select * into strict t from public.sv_meta_threads where company_id=p_company and id=p_source_id::uuid for share;
  if t.revision is distinct from p_source_revision or not exists(select 1 from public.sv_meta_connections where company_id=p_company and id=t.connection_id and brand_id=p_brand)then raise exception 'ai_context_changed';end if;
 elsif p_source='whatsapp' then
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_source_id::uuid and brand_id=p_brand and revision=p_source_revision for share;
  if not found then raise exception 'ai_context_changed';end if;
 elsif p_source='conversation' then
  if not exists(select 1 from jsonb_array_elements(doc.payload #> '{inbox,conversations}')c where c->>'id'=p_source_id and c->>'brandId'=p_brand)then raise exception 'ai_conversation_scope';end if;
 elsif p_source_id is not null or p_source_revision is not null then raise exception 'ai_invalid';end if;
 select * into r from public.sv_ai_requests where company_id=p_company and request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.request_hash<>p_hash or r.model<>p_model or r.brand_id<>p_brand or r.source<>p_source or r.source_id is distinct from p_source_id
  then raise exception 'ai_idempotency_conflict';end if;
  return jsonb_build_object('dispatch',false,'status',r.status,'result',r.result,'error_code',r.error_code);
 end if;
 day_start=date_trunc('day',now() at time zone 'Asia/Hong_Kong')at time zone 'Asia/Hong_Kong';
 if (select count(*) from public.sv_ai_requests where company_id=p_company and created_at>=day_start and created_at<day_start+interval '1 day')>=settings.daily_limit then raise exception 'ai_daily_limit';end if;
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and status='running' and created_at>now()-interval '90 seconds')then raise exception 'ai_busy';end if;
 insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,source_revision,model,request_hash)
 values(p_company,p_request,p_actor,p_brand,p_source,p_source_id,p_workspace_revision,p_source_revision,p_model,p_hash);
 return jsonb_build_object('dispatch',true,'status','running');
end;$$;
create or replace function public.sv_ai_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;doc public.sv_workspaces;enabled boolean;err text:=p_error;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select s.enabled into enabled from public.sv_ai_settings s where company_id=p_company for share;
 select * into strict doc from public.sv_workspaces where company_id=p_company for share;
 select * into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor for update;
 if r.status<>'running' then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 if not coalesce(enabled,false) then err='disabled';
 elsif doc.revision<>r.workspace_revision then err='context_changed';
 elsif r.source='whatsapp' then
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=r.source_id::uuid and revision=r.source_revision for share;
  if not found then err='context_changed';end if;
 elsif r.source='meta' then
  perform 1 from public.sv_meta_threads where company_id=p_company and id=r.source_id::uuid and revision=r.source_revision for share;
  if not found then err='context_changed';end if;
 end if;
 if err is null and (p_result is null or jsonb_typeof(p_result)<>'object')then raise exception 'ai_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then 'completed' else 'failed' end,result=case when err is null then p_result else null end,
 error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now() where company_id=p_company and request_id=p_request returning * into r;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

create function public.sv_inquiry_meta_note(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_body text)returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.sv_inquiry_commands;req jsonb;result jsonb;begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 req=jsonb_build_object('kind','meta-note','thread',p_thread,'body',p_body);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 perform public.sv_meta_command(p_company,p_actor,p_thread,'note',p_body,null);
 result=jsonb_build_object('saved',true);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;
revoke all on function public.sv_inquiry_meta_note(uuid,uuid,uuid,uuid,text)from public,anon,authenticated;
grant execute on function public.sv_inquiry_meta_note(uuid,uuid,uuid,uuid,text)to service_role;
create function smartvolt_private.customer_channel_name()returns trigger language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;begin
 if new.customer_name=old.customer_name or btrim(new.customer_name)='' then return new;end if;
 select * into l from public.sv_customer_threads where company_id=new.company_id and provider=case tg_table_name when 'sv_meta_threads' then 'meta' else 'whatsapp' end and thread_id=new.id;
 if found then update public.sv_customers set name=left(btrim(new.customer_name),80),revision=revision+1,updated_at=now()where company_id=l.company_id and id=l.customer_id;end if;return new;
end;$$;
revoke all on function smartvolt_private.customer_channel_name()from public,anon,authenticated;
create trigger sv_customer_meta_name after update of customer_name on public.sv_meta_threads for each row execute function smartvolt_private.customer_channel_name();
create trigger sv_customer_wa_name after update of customer_name on public.sv_wa_conversations for each row execute function smartvolt_private.customer_channel_name();
create function smartvolt_private.customer_link_guard()returns trigger language plpgsql security invoker set search_path='' as $$begin
 if new.provider='meta' then
  if not exists(select 1 from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where t.company_id=new.company_id and t.id=new.thread_id and c.brand_id=new.brand_id)then raise exception 'customer_brand_scope';end if;
 elsif not exists(select 1 from public.sv_wa_conversations t where t.company_id=new.company_id and t.id=new.thread_id and t.brand_id=new.brand_id)then raise exception 'customer_brand_scope';end if;
 return new;end;$$;
create trigger sv_customer_link_guard before insert or update on public.sv_customer_threads for each row execute function smartvolt_private.customer_link_guard();
revoke all on function smartvolt_private.customer_link_guard()from public,anon,authenticated;
