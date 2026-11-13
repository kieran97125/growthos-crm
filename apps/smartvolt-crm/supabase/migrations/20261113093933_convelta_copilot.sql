-- Original Convelta implementation. Product Learning Sync checked: neutral
-- scoped metrics, explicit readiness, immutable receipts and draft-only handoff.
alter table public.sv_ai_requests drop constraint sv_ai_requests_source_check;
alter table public.sv_ai_requests add constraint sv_ai_requests_source_check check(source in('playground','conversation','meta','whatsapp','copilot'));
alter table public.sv_ai_requests add column product text not null default 'crm' check(product in('crm','pos')),
 add column feature text not null default 'reply' check(feature in('reply','copilot','proactive'));
create index sv_ai_requests_copilot_thread on public.sv_ai_requests(company_id,actor_id,source_id,created_at desc)where source='copilot';
create index sv_meta_messages_first_inbound on public.sv_meta_messages(company_id,thread_id,created_at)where direction='inbound'and state='received';
create index sv_wa_messages_first_inbound on public.sv_wa_messages(company_id,conversation_id,created_at)where direction='incoming'and state in('accepted','sent','delivered','read');
create table public.sv_copilot_threads(
 company_id uuid not null,id uuid not null,actor_id uuid not null,product text not null check(product in('crm','pos')),
 title text not null check(length(title) between 1 and 100),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create index sv_copilot_threads_actor on public.sv_copilot_threads(company_id,actor_id,updated_at desc,id);
create table public.sv_copilot_messages(
 company_id uuid not null,id uuid not null,thread_id uuid not null,role text not null check(role in('user','assistant')),
 body text not null check(length(body) between 1 and 6000),result jsonb,created_at timestamptz not null default now(),
 primary key(company_id,id),foreign key(company_id,thread_id)references public.sv_copilot_threads(company_id,id),
 check(result is null or octet_length(result::text)<=50000)
);
create index sv_copilot_messages_thread on public.sv_copilot_messages(company_id,thread_id,created_at,id);
create table public.sv_copilot_feedback(
 company_id uuid not null,actor_id uuid not null,signal_key text not null check(length(signal_key) between 1 and 120),
 family text not null check(length(family) between 1 and 40),subject text not null check(length(subject) between 1 and 100),
 status text not null check(status in('seen','dismissed','snoozed','accepted')),until timestamptz not null,updated_at timestamptz not null default now(),
 primary key(company_id,actor_id,signal_key),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create table public.sv_copilot_briefs(
 company_id uuid not null,id uuid not null,actor_id uuid not null,thread_id uuid not null,request_id uuid not null,
 brand_id text not null,title text not null check(length(title) between 1 and 100),plan jsonb not null check(octet_length(plan::text)<=16000),
 status text not null default 'draft' check(status in('draft','ready','complete','cancelled')),revision bigint not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,actor_id,request_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 foreign key(company_id,thread_id)references public.sv_copilot_threads(company_id,id),
 foreign key(company_id,request_id)references public.sv_ai_requests(company_id,request_id)
);
create index sv_copilot_briefs_actor on public.sv_copilot_briefs(company_id,actor_id,created_at desc,id);
create index sv_copilot_briefs_thread on public.sv_copilot_briefs(company_id,thread_id);
create index sv_copilot_briefs_request on public.sv_copilot_briefs(company_id,request_id);
create function public.sv_copilot_authorize(p_company uuid,p_actor uuid,p_product text,p_write boolean default false)returns void
language plpgsql security invoker set search_path='' as $$begin
 perform public.sv_customer_authorize(p_company,p_actor,p_write,false);
 if p_product is null or p_product not in('crm','pos')then raise exception 'copilot_invalid';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company and p.product=p_product and p.status='active' and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now())for share;
 if not found then raise exception 'copilot_product_required';end if;
end;$$;

-- Complete aggregates are computed before limits. No names, phones, private
-- notes, credentials or raw attribution payload are returned to the model.
create function public.sv_copilot_snapshot(p_company uuid,p_actor uuid,p_product text,p_brand text default null,p_customer text default null)returns jsonb
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
 return result;
end;$$;

create function public.sv_copilot_claim(p_company uuid,p_actor uuid,p_product text,p_request uuid,p_thread uuid,p_brand text,p_hash text,p_message text,p_revision bigint,p_model text,p_feature text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;s public.sv_ai_settings;t public.sv_copilot_threads;d public.sv_workspaces;day_start timestamptz;
begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);
 select * into r from public.sv_ai_requests where company_id=p_company and request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.source<>'copilot'or r.request_hash<>p_hash or r.source_id<>p_thread::text or r.product<>p_product then raise exception 'copilot_idempotency_conflict';end if;
  return jsonb_build_object('dispatch',false,'status',r.status,'result',r.result,'error_code',r.error_code);
 end if;
 select * into s from public.sv_ai_settings where company_id=p_company for update;
 if not found or not s.enabled then raise exception 'ai_disabled';end if;
 select * into strict d from public.sv_workspaces where company_id=p_company for share;
 if d.revision<>p_revision then raise exception 'ai_context_changed';end if;
 if p_brand is null or not exists(select 1 from jsonb_array_elements(d.payload#>'{scope,brands}')b where b->>'id'=p_brand)then raise exception 'copilot_brand_scope';end if;
 if p_request is null or p_thread is null or p_hash is null or p_hash!~'^[a-f0-9]{64}$'or p_message is null or length(p_message)not between 1 and 2000 or p_model is null or length(p_model)not between 3 and 150 or p_feature not in('copilot','proactive')then raise exception 'copilot_invalid';end if;
 day_start=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';
 if(select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=day_start)>=s.daily_limit then raise exception 'ai_daily_limit';end if;
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and status='running'and created_at>now()-interval '90 seconds')then raise exception 'ai_busy';end if;
 if p_feature='proactive'and((select count(*)from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and feature='proactive'and created_at>=day_start)>=3 or exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and feature='proactive'and created_at>now()-interval '5 minutes'))then raise exception 'copilot_quiet';end if;
 select * into t from public.sv_copilot_threads where company_id=p_company and id=p_thread for update;
 if found then if t.actor_id<>p_actor or t.product<>p_product then raise exception 'copilot_access_denied';end if;
 else insert into public.sv_copilot_threads(company_id,id,actor_id,product,title)values(p_company,p_thread,p_actor,p_product,left(p_message,80));end if;
 insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,product,feature)
 values(p_company,p_request,p_actor,p_brand,'copilot',p_thread::text,p_revision,p_model,p_hash,p_product,p_feature);
 insert into public.sv_copilot_messages(company_id,id,thread_id,role,body)values(p_company,p_request,p_thread,'user',p_message);
 update public.sv_copilot_threads set updated_at=now()where company_id=p_company and id=p_thread;
 return jsonb_build_object('dispatch',true,'status','running');
end;$$;
create function public.sv_copilot_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;s public.sv_ai_settings;d public.sv_workspaces;err text:=p_error;
begin
 select * into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and source='copilot'and actor_id=p_actor for update;
 perform public.sv_copilot_authorize(p_company,p_actor,r.product,true);
 if r.status<>'running'then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 select * into s from public.sv_ai_settings where company_id=p_company for share;
 select * into strict d from public.sv_workspaces where company_id=p_company for share;
 if not coalesce(s.enabled,false)then err='disabled';elsif d.revision<>r.workspace_revision then err='context_changed';end if;
 if err is null and(p_result is null or jsonb_typeof(p_result)<>'object'or p_result->>'answer'is null or length(p_result->>'answer')not between 1 and 6000)then raise exception 'copilot_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then'completed'else'failed'end,result=case when err is null then p_result else null end,error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 if err is null then insert into public.sv_copilot_messages(company_id,id,thread_id,role,body,result)values(p_company,gen_random_uuid(),r.source_id::uuid,'assistant',p_result->>'answer',p_result);end if;
 update public.sv_copilot_threads set updated_at=now()where company_id=p_company and id=r.source_id::uuid;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

do $$declare t text;begin foreach t in array array['sv_copilot_threads','sv_copilot_messages','sv_copilot_feedback','sv_copilot_briefs']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;end;$$;
grant select,insert,update on public.sv_copilot_threads,public.sv_copilot_feedback,public.sv_copilot_briefs to service_role;
grant select,insert on public.sv_copilot_messages to service_role;
revoke all on function public.sv_copilot_authorize(uuid,uuid,text,boolean),public.sv_copilot_snapshot(uuid,uuid,text,text,text),public.sv_copilot_claim(uuid,uuid,text,uuid,uuid,text,text,text,bigint,text,text),public.sv_copilot_finish(uuid,uuid,uuid,jsonb,text,integer,integer)from public,anon,authenticated;
grant execute on function public.sv_copilot_authorize(uuid,uuid,text,boolean),public.sv_copilot_snapshot(uuid,uuid,text,text,text),public.sv_copilot_claim(uuid,uuid,text,uuid,uuid,text,text,text,bigint,text,text),public.sv_copilot_finish(uuid,uuid,uuid,jsonb,text,integer,integer)to service_role;

create table public.sv_copilot_commands(
 company_id uuid not null,command_id uuid not null,actor_id uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(company_id,command_id),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create index sv_copilot_commands_actor on public.sv_copilot_commands(company_id,actor_id);
alter table public.sv_copilot_commands enable row level security;
revoke all on public.sv_copilot_commands from public,anon,authenticated,service_role;
grant select,insert on public.sv_copilot_commands to service_role;
create function public.sv_copilot_action(p_company uuid,p_actor uuid,p_product text,p_command uuid,p_data jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved public.sv_copilot_commands;r public.sv_ai_requests;c public.sv_customers;b public.sv_copilot_briefs;v jsonb;kind text:=p_data#>>'{client,action}';
begin
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_actor::text,0));
 perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);
 -- One actor/company lock serializes a retried confirmation without swallowing
 -- an unrelated uniqueness failure. All state changes and receipts are atomic.
 select * into saved from public.sv_copilot_commands where company_id=p_company and command_id=p_command;
 if found then if saved.actor_id<>p_actor or saved.request is distinct from p_data then raise exception 'copilot_idempotency_conflict';end if;return saved.result;end if;
 if kind='feedback'then
  if p_data#>>'{client,status}'not in('seen','dismissed','snoozed','accepted')or length(p_data#>>'{client,key}')not between 1 and 120 or length(p_data#>>'{client,family}')not between 1 and 40 or length(p_data#>>'{client,subject}')not between 1 and 100 then raise exception 'copilot_invalid';end if;
  insert into public.sv_copilot_feedback(company_id,actor_id,signal_key,family,subject,status,until)
   values(p_company,p_actor,p_data#>>'{client,key}',p_data#>>'{client,family}',p_data#>>'{client,subject}',p_data#>>'{client,status}',now()+case when p_data#>>'{client,family}'='quiet'then interval'1 hour'when p_data#>>'{client,status}'='seen'then interval'12 hours'when p_data#>>'{client,status}'='snoozed'then interval'1 day'else interval'7 days'end)
   on conflict(company_id,actor_id,signal_key)do update set status=excluded.status,until=excluded.until,updated_at=now();
  v=jsonb_build_object('saved',true);
 elsif kind='tag'then
  if p_product<>'crm'or p_data->>'tag'is null or length(p_data->>'tag')not between 1 and 30 then raise exception 'copilot_invalid';end if;
  select * into strict c from public.sv_customers where company_id=p_company and id=p_data->>'customerId'for update;
  if c.revision<>(p_data->>'revision')::bigint or jsonb_array_length(c.tags)>=20 then raise exception 'copilot_context_changed';end if;
  v=public.sv_customer_update(p_company,p_actor,c.id,c.revision,p_command,jsonb_build_object('name',c.name,'phone',c.phone,'email',c.email,'note',c.note,'tags',case when c.tags? (p_data->>'tag')then c.tags else c.tags||jsonb_build_array(p_data->>'tag')end));
 elsif kind='save-brief'then
  if p_product<>'crm'then raise exception 'copilot_product_required';end if;
  select * into strict r from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and request_id=(p_data#>>'{client,requestId}')::uuid and source='copilot'and status='completed';
  if r.result->'campaign'is null or r.result->'campaign'='null'::jsonb then raise exception 'copilot_invalid';end if;
  insert into public.sv_copilot_briefs(company_id,id,actor_id,thread_id,request_id,brand_id,title,plan)
   values(p_company,p_command,p_actor,r.source_id::uuid,r.request_id,r.brand_id,r.result#>>'{campaign,title}',r.result->'campaign')on conflict(company_id,actor_id,request_id)do nothing;
  select * into strict b from public.sv_copilot_briefs where company_id=p_company and actor_id=p_actor and request_id=r.request_id;
  v=jsonb_build_object('saved',true,'id',b.id);
 elsif kind='brief-status'then
  if p_product<>'crm'or p_data#>>'{client,status}'not in('draft','ready','complete','cancelled')then raise exception 'copilot_invalid';end if;
  select * into strict b from public.sv_copilot_briefs where company_id=p_company and actor_id=p_actor and id=(p_data#>>'{client,id}')::uuid for update;
  if b.revision<>(p_data#>>'{client,revision}')::bigint then raise exception 'copilot_context_changed';end if;
  update public.sv_copilot_briefs set status=p_data#>>'{client,status}',revision=revision+1,updated_at=now()where company_id=p_company and id=b.id;
  v=jsonb_build_object('saved',true,'id',b.id);
 elsif kind='configure'then
  if not exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner'and status='active')then raise exception 'copilot_access_denied';end if;
  insert into public.sv_ai_settings(company_id,enabled)values(p_company,(p_data#>>'{client,enabled}')::boolean)on conflict(company_id)do update set enabled=excluded.enabled,updated_at=now();
  v=jsonb_build_object('saved',true);
 else raise exception 'copilot_invalid';end if;
 insert into public.sv_copilot_commands(company_id,command_id,actor_id,request,result)values(p_company,p_command,p_actor,p_data,v);
 return v;
end;$$;
revoke all on function public.sv_copilot_action(uuid,uuid,text,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.sv_copilot_action(uuid,uuid,text,uuid,jsonb)to service_role;

create function public.sv_copilot_memory(p_company uuid,p_actor uuid,p_product text,p_query text)returns jsonb
language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);
 if p_query is null or length(p_query)not between 1 and 100 then raise exception 'copilot_invalid';end if;
 select jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(q))from(
  select t.title,m.role,left(m.body,1800)body,m.created_at from public.sv_copilot_messages m join public.sv_copilot_threads t on t.company_id=m.company_id and t.id=m.thread_id
  where t.company_id=p_company and t.actor_id=p_actor and t.product=p_product and strpos(lower(m.body),lower(p_query))>0 order by m.created_at desc,m.id limit 8
 )q),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(to_jsonb(q))from(
  select b.title,b.status,b.plan,b.updated_at from public.sv_copilot_briefs b where p_product='crm'and b.company_id=p_company and b.actor_id=p_actor and strpos(lower(b.title||' '||b.plan::text),lower(p_query))>0 order by b.updated_at desc,b.id limit 5
 )q),'[]'::jsonb))into result;return result;
end;$$;
revoke all on function public.sv_copilot_memory(uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.sv_copilot_memory(uuid,uuid,text,text)to service_role;

create function public.sv_copilot_receipt(p_company uuid,p_actor uuid,p_product text,p_request uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$declare r public.sv_ai_requests;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 select * into strict r from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and product=p_product and source='copilot'and request_id=p_request for update;
 if r.status='running'and r.created_at<now()-interval'120 seconds'then
  update public.sv_ai_requests set status='failed',error_code='unavailable',finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 end if;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;
revoke all on function public.sv_copilot_receipt(uuid,uuid,text,uuid)from public,anon,authenticated;
grant execute on function public.sv_copilot_receipt(uuid,uuid,text,uuid)to service_role;
