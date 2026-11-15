-- Product Learning Sync checked: scoped customer context, governed projections,
-- permission-aware brand scope and CRM-owned final delivery admission.
-- Rules do not grant contact consent; campaigns retain their enrolled snapshot.
create table public.sv_dynamic_segments(
 company_id uuid not null references public.sv_companies(id),id uuid not null,brand_id text not null,
 name text not null check(length(btrim(name))between 1 and 100),mode text not null check(mode in('all','any')),
 rules jsonb not null check(jsonb_typeof(rules)='array'and jsonb_array_length(rules)between 1 and 10),
 include_pos boolean not null default false,enabled boolean not null default true,revision bigint not null default 1,
 created_by uuid not null,updated_at timestamptz not null default now(),evaluated_at timestamptz,full_evaluated_at timestamptz,source_stamp text,last_error text,
 primary key(company_id,id),foreign key(company_id,created_by)references public.sv_memberships(company_id,user_id)
);
create index sv_dynamic_segments_brand on public.sv_dynamic_segments(company_id,brand_id,id);
create table public.sv_segment_members(
 company_id uuid not null,segment_id uuid not null,customer_id text not null,brand_id text not null,
 active boolean not null,entered_at timestamptz not null,exited_at timestamptz,definition_revision bigint not null,source_stamp text not null,
 primary key(company_id,segment_id,customer_id),foreign key(company_id,segment_id)references public.sv_dynamic_segments(company_id,id),
 foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create index sv_segment_members_active on public.sv_segment_members(company_id,segment_id,customer_id)where active;
create table public.sv_segment_events(
 seq bigint generated always as identity primary key,company_id uuid not null,segment_id uuid not null,customer_id text not null,brand_id text not null,
 kind text not null check(kind in('entered','exited')),reason text not null,definition_revision bigint not null,source_stamp text not null,created_at timestamptz not null,
 foreign key(company_id,segment_id)references public.sv_dynamic_segments(company_id,id),foreign key(company_id,customer_id)references public.sv_customers(company_id,id)
);
create index sv_segment_events_history on public.sv_segment_events(company_id,segment_id,seq desc);
create table public.sv_segment_dirty(company_id uuid primary key references public.sv_companies(id),revision bigint not null default 1,changed_at timestamptz not null default now());

create function smartvolt_private.segment_definition_valid(p_rules jsonb,p_pos boolean)returns boolean language plpgsql immutable security invoker set search_path=''as $$
declare r jsonb;k text;begin
 if jsonb_typeof(p_rules)is distinct from 'array'or jsonb_array_length(p_rules)not between 1 and 10 then return false;end if;
 for r in select value from jsonb_array_elements(p_rules)loop
  if jsonb_typeof(r)is distinct from 'object'then return false;end if;k=r->>'kind';
  if k in('tag','stage','channel','booking','visit','payment')then
   if(select count(*)from jsonb_object_keys(r))<>2 or not(r ?&array['kind','value'])or jsonb_typeof(r->'value')is distinct from 'string'then return false;end if;
   if k='tag'and length(btrim(r->>'value'))not between 1 and 40 then return false;end if;
   if k='stage'and length(btrim(r->>'value'))not between 1 and 100 then return false;end if;
   if k='channel'and r->>'value'not in('whatsapp','messenger','instagram','website')then return false;end if;
   if k='booking'and r->>'value'not in('none','confirmed')then return false;end if;
   if k='visit'and(r->>'value'not in('never','visited')or not p_pos)then return false;end if;
   if k='payment'and(r->>'value'not in('unpaid','paid')or not p_pos)then return false;end if;
  elsif k in('inactive','recent_inbound')then
   if(select count(*)from jsonb_object_keys(r))<>2 or not(r ?&array['kind','days'])or jsonb_typeof(r->'days')is distinct from 'number'or(r->>'days')!~'^[0-9]{1,4}$'or(r->>'days')::integer not between 1 and 3650 then return false;end if;
  else return false;end if;
 end loop;return true;end;$$;
alter table public.sv_dynamic_segments add constraint sv_segment_rules_valid check(smartvolt_private.segment_definition_valid(rules,include_pos));

create function smartvolt_private.segment_facts(p_company uuid,p_brand text,p_pos boolean,p_customer text default null)
returns table(customer_id text,customer_name text,facts jsonb)language sql stable security invoker set search_path=''as $$
 select c.id,c.name,jsonb_build_object('tags',c.tags,'stage',l.stage_id,'customerRevision',c.revision,
 'lastInbound',last_inbound.at,'channels',channels.data,
 'booking',exists(select 1 from public.sv_booking_requests b where b.company_id=c.company_id and b.brand_id=p_brand and b.customer_id=c.id and b.status in('confirmed','linked'))
 or exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{inbox,bookings}')b join jsonb_array_elements(w.payload#>'{inbox,conversations}')cv on cv->>'id'=b->>'conversationId' where w.company_id=c.company_id and cv->>'brandId'=p_brand and b->>'contactId'=c.id and b->>'status'='confirmed'and coalesce((b->>'customerConfirmed')::boolean,false)
 and(p_pos or not exists(select 1 from public.sv_pos_appointments pa where pa.company_id=c.company_id and pa.snapshot->>'crmBookingId'=b->>'id')))
 or(p_pos and exists(select 1 from public.sv_pos_appointments b where b.company_id=c.company_id and b.brand_id=p_brand and b.contact_id=c.id and b.status in('confirmed','checked_in','completed'))),
 'visited',p_pos and exists(select 1 from public.sv_pos_appointments b where b.company_id=c.company_id and b.brand_id=p_brand and b.contact_id=c.id and b.status in('checked_in','completed')),
 'paid',case when p_pos then exists(select 1 from public.sv_pos_orders o where o.company_id=c.company_id and o.brand_id=p_brand and o.contact_id=c.id and not o.voided and coalesce((select sum(p.amount_cents)from public.sv_pos_payments p where p.company_id=o.company_id and p.order_id=o.id),0)>coalesce((select sum(p.amount_cents)from public.sv_pos_refunds p where p.company_id=o.company_id and p.order_id=o.id),0))else false end)
 from public.sv_customer_brands b join public.sv_customers c on c.company_id=b.company_id and c.id=b.customer_id
 left join public.sv_customer_lifecycle l on l.company_id=b.company_id and l.customer_id=b.customer_id and l.brand_id=b.brand_id
 cross join lateral(select max(x.at)at from(
  select to_timestamp(i.last_inbound_at::double precision/1000)at from smartvolt_private.ops_inquiries i where i.company_id=b.company_id and i.brand_id=b.brand_id and i.customer_id=b.customer_id and i.last_inbound_at>0
  union all select e.source_created_at from public.sv_sales_enquiries e where e.company_id=b.company_id and e.brand_id=b.brand_id and e.customer_id=b.customer_id
  union all select to_timestamp((m->>'at')::double precision/1000)from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{inbox,conversations}')cv join jsonb_array_elements(w.payload#>'{inbox,messages}')m on m->>'conversationId'=cv->>'id'where w.company_id=b.company_id and cv->>'brandId'=b.brand_id and cv->>'contactId'=b.customer_id and m->>'kind'='incoming'
 )x)last_inbound
 cross join lateral(select coalesce(jsonb_agg(distinct x.channel order by x.channel),'[]'::jsonb)data from(
  select i.channel from smartvolt_private.ops_inquiries i where i.company_id=b.company_id and i.brand_id=b.brand_id and i.customer_id=b.customer_id
  union all select 'website'from public.sv_sales_enquiries e where e.company_id=b.company_id and e.brand_id=b.brand_id and e.customer_id=b.customer_id
  union all select cv->>'channel'from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{inbox,conversations}')cv where w.company_id=b.company_id and cv->>'brandId'=b.brand_id and cv->>'contactId'=b.customer_id
 )x)channels
 where b.company_id=p_company and b.brand_id=p_brand and(p_customer is null or b.customer_id=p_customer)
$$;
create function smartvolt_private.segment_matches(p_mode text,p_rules jsonb,p_facts jsonb,p_at timestamptz)returns boolean language plpgsql immutable security invoker set search_path=''as $$
declare r jsonb;matched boolean;answer boolean:=p_mode='all';last_inbound timestamptz:=(p_facts->>'lastInbound')::timestamptz;begin
 for r in select value from jsonb_array_elements(p_rules)loop
  matched=case r->>'kind'
   when 'tag'then p_facts->'tags' ? (r->>'value')
   when 'stage'then p_facts->>'stage'=r->>'value'
   when 'channel'then p_facts->'channels' ? (r->>'value')
   when 'inactive'then last_inbound is not null and last_inbound<=p_at-make_interval(days=>(r->>'days')::integer)
   when 'recent_inbound'then last_inbound is not null and last_inbound>p_at-make_interval(days=>(r->>'days')::integer)and last_inbound<=p_at
   when 'booking'then coalesce((p_facts->>'booking')::boolean,false)=(r->>'value'='confirmed')
   when 'visit'then coalesce((p_facts->>'visited')::boolean,false)=(r->>'value'='visited')
   when 'payment'then coalesce((p_facts->>'paid')::boolean,false)=(r->>'value'='paid')
   else false end;
  if p_mode='all'then answer=answer and coalesce(matched,false);else answer=answer or coalesce(matched,false);end if;
 end loop;return answer;end;$$;
create function smartvolt_private.segment_owner_allowed(p_segment public.sv_dynamic_segments)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_memberships m where m.company_id=p_segment.company_id and m.user_id=p_segment.created_by and m.status='active'and m.role in('owner','manager'))
 and smartvolt_private.member_has_product(p_segment.company_id,p_segment.created_by,'crm')and smartvolt_private.member_brand_allowed(p_segment.company_id,p_segment.created_by,p_segment.brand_id)
 and(not p_segment.include_pos or smartvolt_private.member_has_product(p_segment.company_id,p_segment.created_by,'pos'))
$$;
create function smartvolt_private.segment_member_set(p_segment public.sv_dynamic_segments,p_customer text,p_match boolean,p_stamp text,p_at timestamptz,p_reason text)returns void language plpgsql security invoker set search_path=''as $$
declare old_active boolean;begin
 select active into old_active from public.sv_segment_members where company_id=p_segment.company_id and segment_id=p_segment.id and customer_id=p_customer;
 if coalesce(old_active,false)is distinct from p_match then
  insert into public.sv_segment_events(company_id,segment_id,customer_id,brand_id,kind,reason,definition_revision,source_stamp,created_at)
  values(p_segment.company_id,p_segment.id,p_customer,p_segment.brand_id,case when p_match then 'entered'else 'exited'end,p_reason,p_segment.revision,p_stamp,p_at);
 end if;
 if p_match then
  insert into public.sv_segment_members(company_id,segment_id,customer_id,brand_id,active,entered_at,definition_revision,source_stamp)
  values(p_segment.company_id,p_segment.id,p_customer,p_segment.brand_id,true,p_at,p_segment.revision,p_stamp)
  on conflict(company_id,segment_id,customer_id)do update set active=true,entered_at=case when sv_segment_members.active then sv_segment_members.entered_at else excluded.entered_at end,exited_at=null,definition_revision=excluded.definition_revision,source_stamp=excluded.source_stamp;
 else update public.sv_segment_members set active=false,exited_at=case when active then p_at else exited_at end,definition_revision=p_segment.revision,source_stamp=p_stamp where company_id=p_segment.company_id and segment_id=p_segment.id and customer_id=p_customer;end if;
end;$$;
create function smartvolt_private.segment_refresh(p_company uuid,p_segment uuid,p_at timestamptz,p_customer text default null,p_reason text default 'source_changed')returns void language plpgsql security invoker set search_path=''as $$
declare s public.sv_dynamic_segments;f record;stamp text;allowed boolean;why text;begin
 select *into strict s from public.sv_dynamic_segments where company_id=p_company and id=p_segment;
 allowed=s.enabled and smartvolt_private.segment_owner_allowed(s);why=case when not s.enabled then 'disabled'when not allowed then 'authority_changed'else p_reason end;
 for f in select *from smartvolt_private.segment_facts(p_company,s.brand_id,s.include_pos,p_customer)loop
  stamp=md5(f.facts::text);perform smartvolt_private.segment_member_set(s,f.customer_id,allowed and smartvolt_private.segment_matches(s.mode,s.rules,f.facts,p_at),stamp,p_at,why);
 end loop;
 select md5(coalesce(string_agg(customer_id||':'||source_stamp,','order by customer_id),''))into stamp from public.sv_segment_members where company_id=p_company and segment_id=p_segment;
  update public.sv_dynamic_segments set evaluated_at=p_at,full_evaluated_at=case when p_customer is null then p_at else full_evaluated_at end,source_stamp=stamp,last_error=case when s.enabled and not allowed then 'authority_changed'else null end where company_id=p_company and id=p_segment;
end;$$;
create function public.sv_segments_catchup(p_company uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
declare s record;n integer:=0;dirty bigint;at timestamptz:=statement_timestamp();begin
 if not pg_try_advisory_xact_lock(hashtextextended('segments:'||p_company::text,0))then return jsonb_build_object('checked',0,'pending',true);end if;
 select revision into dirty from public.sv_segment_dirty where company_id=p_company;
 for s in select id from public.sv_dynamic_segments where company_id=p_company and(dirty is not null or full_evaluated_at is null or full_evaluated_at<=at-interval '1 minute')order by id limit 100 loop
  perform smartvolt_private.segment_refresh(p_company,s.id,at,null,'scheduled_refresh');n=n+1;
 end loop;
 delete from public.sv_segment_dirty where company_id=p_company and revision=dirty;
 return jsonb_build_object('checked',n,'pending',false);end;$$;
create function smartvolt_private.segment_source_changed()returns trigger language plpgsql security invoker set search_path=''as $$
declare company uuid:=new.company_id;customer text;brand text;s record;linked record;begin
 if not exists(select 1 from public.sv_dynamic_segments where company_id=company)then return new;end if;
 insert into public.sv_segment_dirty(company_id)values(company)on conflict(company_id)do update set revision=sv_segment_dirty.revision+1,changed_at=statement_timestamp();
 -- Shared payload and authority writes only enqueue work. A normal inbox edit
 -- must not scan every customer for every definition while holding its write lock.
 -- Maintenance performs the full refresh; dispatch always checks current facts.
 if tg_table_name in('sv_workspaces','sv_memberships','sv_company_products')then return new;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('segments:'||company::text,0))then return new;end if;
 if tg_table_name='sv_customers'then customer=new.id;
 elsif tg_table_name in('sv_customer_brands','sv_customer_lifecycle','sv_booking_requests','sv_business_outcomes','sv_sales_enquiries')then customer=new.customer_id;brand=new.brand_id;
 elsif tg_table_name in('sv_pos_appointments','sv_pos_orders')then customer=new.contact_id;brand=new.brand_id;
 elsif tg_table_name in('sv_wa_conversations','sv_meta_threads')then
  select l.customer_id,l.brand_id into linked from public.sv_customer_threads l where l.company_id=company and l.thread_id=new.id and l.provider=case when tg_table_name='sv_wa_conversations'then 'whatsapp'else 'meta'end;
  customer=linked.customer_id;brand=linked.brand_id;
 elsif tg_table_name='sv_customer_threads'then customer=new.customer_id;brand=new.brand_id;
 end if;
 if customer is not null then
  for s in select id from public.sv_dynamic_segments where company_id=company and(brand is null or brand_id=brand)order by id limit 100 loop perform smartvolt_private.segment_refresh(company,s.id,statement_timestamp(),customer,'source_changed');end loop;
 end if;return new;end;$$;
create trigger sv_segments_customer after insert or update on public.sv_customers for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_brand after insert on public.sv_customer_brands for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_stage after insert or update on public.sv_customer_lifecycle for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_links after insert or update on public.sv_customer_threads for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_wa after update of last_inbound_at on public.sv_wa_conversations for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_meta after update of last_inbound_at on public.sv_meta_threads for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_bookings after insert or update on public.sv_booking_requests for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_pos_booking after insert or update on public.sv_pos_appointments for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_pos_order after update on public.sv_pos_orders for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_member after update on public.sv_memberships for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_product after update on public.sv_company_products for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_outcomes after insert on public.sv_business_outcomes for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_website after insert or update on public.sv_sales_enquiries for each row execute function smartvolt_private.segment_source_changed();
create trigger sv_segments_workspace after update of payload on public.sv_workspaces for each row when(old.payload->'inbox'is distinct from new.payload->'inbox')execute function smartvolt_private.segment_source_changed();

create function smartvolt_private.segment_json(s public.sv_dynamic_segments)returns jsonb language sql stable security invoker set search_path=''as $$
 select jsonb_build_object('id',s.id,'brandId',s.brand_id,'name',s.name,'mode',s.mode,'rules',s.rules,'includePos',s.include_pos,'enabled',s.enabled,'revision',s.revision,'evaluatedAt',s.evaluated_at,'sourceStamp',s.source_stamp,'lastError',s.last_error,'count',(select count(*)from public.sv_segment_members m where m.company_id=s.company_id and m.segment_id=s.id and m.active))
$$;
create function public.sv_segment_action(p_company uuid,p_actor uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare s public.sv_dynamic_segments;brand text:=p_data->>'brandId';ident uuid:=(p_data->>'id')::uuid;command uuid:=(p_data->>'commandId')::uuid;req jsonb:=p_data;r jsonb;pos boolean:=coalesce((p_data->>'includePos')::boolean,false);begin
 if p_kind not in('preview','upsert','refresh')then raise exception 'segment_invalid';end if;
 if p_kind='refresh'then select *into strict s from public.sv_dynamic_segments where company_id=p_company and id=ident;brand=s.brand_id;pos=s.include_pos;end if;
 perform public.sv_authorize(p_company,p_actor,'crm',p_kind<>'preview',p_kind<>'preview',brand);
 if pos then perform public.sv_authorize(p_company,p_actor,'pos',false,false,brand);end if;
 if p_kind<>'refresh'and(not smartvolt_private.segment_definition_valid(p_data->'rules',pos)or coalesce(p_data->>'mode','')not in('all','any'))then raise exception 'segment_invalid';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_data->'rules','[]'))x where x->>'kind'='stage'and not exists(select 1 from public.sv_lifecycle_stages st where st.company_id=p_company and st.id=x->>'value'))then raise exception 'segment_invalid_stage';end if;
 if p_kind='preview'then
  with matched as materialized(select customer_id,customer_name from smartvolt_private.segment_facts(p_company,brand,pos)f where smartvolt_private.segment_matches(p_data->>'mode',p_data->'rules',f.facts,statement_timestamp()))
  select jsonb_build_object('preview',jsonb_build_object('total',(select count(*)from matched),'sample',coalesce((select jsonb_agg(x)from(select customer_id as "customerId",customer_name as name from matched order by customer_id limit 10)x),'[]')))into r;return r;
 end if;
 if command is null then raise exception 'segment_invalid';end if;
 r=smartvolt_private.action_replay(p_company,p_actor,command,'segment:'||p_kind,req);if r is not null then return r;end if;
 perform pg_advisory_xact_lock(hashtextextended('segments:'||p_company::text,0));
 r=smartvolt_private.action_replay(p_company,p_actor,command,'segment:'||p_kind,req);if r is not null then return r;end if;
 if p_kind='upsert'then
  select *into s from public.sv_dynamic_segments where company_id=p_company and id=ident for update;
  if found and s.brand_id<>brand then raise exception 'segment_scope';end if;
  if s.id is not null and s.include_pos then perform public.sv_authorize(p_company,p_actor,'pos',false,false,brand);end if;
  if s.id is not null and s.include_pos is distinct from pos then raise exception 'segment_identity_changed';end if;
  if coalesce(s.revision,0)<>(p_data->>'revision')::bigint then raise exception 'segment_revision_conflict';end if;
  if s.id is null and(select count(*)from public.sv_dynamic_segments where company_id=p_company)>=100 then raise exception 'segment_capacity';end if;
  if ident is null or length(btrim(p_data->>'name'))not between 1 and 100 or jsonb_typeof(p_data->'enabled')is distinct from 'boolean'then raise exception 'segment_invalid';end if;
  insert into public.sv_dynamic_segments(company_id,id,brand_id,name,mode,rules,include_pos,enabled,created_by)values(p_company,ident,brand,btrim(p_data->>'name'),p_data->>'mode',p_data->'rules',pos,(p_data->>'enabled')::boolean,p_actor)
  on conflict(company_id,id)do update set name=excluded.name,mode=excluded.mode,rules=excluded.rules,include_pos=excluded.include_pos,enabled=excluded.enabled,created_by=excluded.created_by,revision=sv_dynamic_segments.revision+1,updated_at=statement_timestamp();
 end if;
 perform smartvolt_private.segment_refresh(p_company,ident,statement_timestamp(),null,case when p_kind='upsert'then 'rule_changed'else 'manual_refresh'end);
 select smartvolt_private.segment_json(d)||jsonb_build_object('saved',true)into r from public.sv_dynamic_segments d where d.company_id=p_company and d.id=ident;
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,command,p_actor,'segment:'||p_kind,req,r);return r;
end;$$;

create function public.sv_segments_read(p_company uuid,p_actor uuid,p_query jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare brand text:=p_query->>'brandId';ident uuid:=(p_query->>'segmentId')::uuid;s public.sv_dynamic_segments;r jsonb;selected jsonb;members jsonb;events jsonb;has_pos boolean;begin
 perform public.sv_authorize(p_company,p_actor,'crm',false,false,brand);has_pos=smartvolt_private.member_has_product(p_company,p_actor,'pos');
 if brand is null or length(brand)not between 1 and 100 then raise exception 'segment_invalid';end if;
 if ident is not null then
  select *into s from public.sv_dynamic_segments where company_id=p_company and id=ident and brand_id=brand and(not include_pos or has_pos);
  if not found then raise exception 'segment_scope';end if;
  select coalesce(jsonb_agg(x order by x."customerId"),'[]')into members from(select m.customer_id as "customerId",c.name,m.entered_at as "enteredAt"from public.sv_segment_members m join public.sv_customers c on c.company_id=m.company_id and c.id=m.customer_id where m.company_id=p_company and m.segment_id=ident and m.active and(p_query->>'after'is null or m.customer_id>p_query->>'after')order by m.customer_id limit 51)x;
  select coalesce(jsonb_agg(x order by x.id::bigint desc),'[]')into events from(select e.seq::text as id,e.customer_id as "customerId",c.name as "customerName",e.kind,e.created_at as at,e.reason,e.definition_revision as "segmentRevision"from public.sv_segment_events e join public.sv_customers c on c.company_id=e.company_id and c.id=e.customer_id where e.company_id=p_company and e.segment_id=ident and(p_query->>'before'is null or e.seq<(p_query->>'before')::bigint)order by e.seq desc limit 51)x;
  selected=smartvolt_private.segment_json(s)||jsonb_build_object('members',case when jsonb_array_length(members)>50 then members-50 else members end,'events',case when jsonb_array_length(events)>50 then events-50 else events end,'nextMember',case when jsonb_array_length(members)>50 then members#>>'{49,customerId}'end,'nextEvent',case when jsonb_array_length(events)>50 then events#>>'{49,id}'end);
 end if;
 select jsonb_build_object('brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'stages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)order by position,id)from public.sv_lifecycle_stages where company_id=p_company),'[]'),
 'refreshPending',exists(select 1 from public.sv_segment_dirty where company_id=p_company)or exists(select 1 from public.sv_dynamic_segments d where d.company_id=p_company and d.brand_id=brand and(not d.include_pos or has_pos)and(d.full_evaluated_at is null or d.full_evaluated_at<=statement_timestamp()-interval '1 minute')),
 'canManage',(select role in('owner','manager')from public.sv_memberships where company_id=p_company and user_id=p_actor),'hasPos',has_pos,
 'segments',coalesce((select jsonb_agg(smartvolt_private.segment_json(d)order by d.updated_at desc,d.id)from public.sv_dynamic_segments d where d.company_id=p_company and d.brand_id=brand and(not d.include_pos or has_pos)),'[]'))into r;
 if selected is not null then r=r||jsonb_build_object('selected',selected);end if;return r;end;$$;

-- Re-evaluate a selected segment against current source data. Materialization is
-- for audit/fast lists, never the final authority of a provider dispatch.
create function smartvolt_private.segment_customer_allowed(p_company uuid,p_actor uuid,p_brand text,p_segment uuid,p_customer text)returns boolean language plpgsql stable security invoker set search_path=''as $$
declare s public.sv_dynamic_segments;facts jsonb;begin
 select *into s from public.sv_dynamic_segments where company_id=p_company and id=p_segment and brand_id=p_brand and enabled;
 if not found or not smartvolt_private.segment_owner_allowed(s)or not smartvolt_private.member_has_product(p_company,p_actor,'crm')or not smartvolt_private.member_brand_allowed(p_company,p_actor,p_brand)or(s.include_pos and not smartvolt_private.member_has_product(p_company,p_actor,'pos'))then return false;end if;
 select f.facts into facts from smartvolt_private.segment_facts(p_company,p_brand,s.include_pos,p_customer)f;
 return facts is not null and smartvolt_private.segment_matches(s.mode,s.rules,facts,statement_timestamp());end;$$;

create or replace function smartvolt_private.delivery_audience(p_company uuid,p_actor uuid,p_brand text,p_provider text,p_connection uuid,p_filter jsonb)
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
 and(coalesce(p_filter->>'segmentId','')=''or smartvolt_private.segment_customer_allowed(p_company,p_actor,p_brand,(p_filter->>'segmentId')::uuid,c.id))
 order by i.customer_id,i.last_inbound_at desc nulls last,i.thread_id
$$;

create or replace function public.sv_delivery_claim(p_company uuid,p_id uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
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
 if why is null and j.origin='campaign'and exists(select 1 from public.sv_campaigns c where c.company_id=p_company and c.id=j.source_id and nullif(c.audience->>'segmentId','')is not null and not smartvolt_private.segment_customer_allowed(p_company,j.actor_id,j.brand_id,(c.audience->>'segmentId')::uuid,j.customer_id))then why='segment_changed';end if;
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


create trigger sv_segment_events_immutable before update or delete on public.sv_segment_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_segment_events_no_truncate before truncate on public.sv_segment_events for each statement execute function smartvolt_private.wa_reject_rewrite();
do $$declare t text;f record;begin
 foreach t in array array['sv_dynamic_segments','sv_segment_members','sv_segment_events','sv_segment_dirty']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 revoke update on public.sv_segment_events from service_role;grant delete on public.sv_segment_dirty to service_role;
 grant usage,select on sequence public.sv_segment_events_seq_seq to service_role;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and(proname like 'segment_%'or proname like 'sv_segment_%'or proname like 'sv_segments_%')loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;

-- The optional target is frozen on each published journey version. A new entry
-- still requires a real recipe source; audience membership creates no source.
alter table public.sv_journeys add column segment_id uuid,add foreign key(company_id,segment_id)references public.sv_dynamic_segments(company_id,id);
alter table public.sv_journey_versions add column segment_id uuid,add foreign key(company_id,segment_id)references public.sv_dynamic_segments(company_id,id);
create or replace function smartvolt_private.journey_enroll(p_company uuid,p_key text,p_journey uuid default null)returns integer language plpgsql security invoker set search_path=''as $$
declare s public.sv_journey_sources;j public.sv_journeys;v public.sv_journey_versions;t record;run_id uuid;step jsonb;position integer;stamp timestamptz;name text;ctx jsonb;rendered jsonb;n integer:=0;begin
 select * into s from public.sv_journey_sources where company_id=p_company and source_key=p_key;if not found or not s.active then return 0;end if;
 select c.name into strict name from public.sv_customers c where c.company_id=p_company and c.id=s.customer_id;
 for j in select *from public.sv_journeys where company_id=p_company and brand_id=s.brand_id and recipe=s.recipe and enabled and(p_journey is null or id=p_journey)loop
  if not smartvolt_private.member_has_product(p_company,j.created_by,'crm')or not smartvolt_private.member_brand_allowed(p_company,j.created_by,s.brand_id)or(s.product='pos'and not smartvolt_private.member_has_product(p_company,j.created_by,'pos'))then continue;end if;
  select * into t from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.customer_id=s.customer_id and i.brand_id=s.brand_id and i.provider=j.provider
  and(s.thread_id is null or i.thread_id=s.thread_id)and((j.provider='whatsapp'and exists(select 1 from public.sv_wa_conversations c where c.company_id=p_company and c.id=i.thread_id and c.connection_id=j.connection_id))or(j.provider='meta'and exists(select 1 from public.sv_meta_threads c where c.company_id=p_company and c.id=i.thread_id and c.connection_id=j.connection_id)))order by i.updated_at desc,i.thread_id limit 1;
  if not found then continue;end if;
  select * into strict v from public.sv_journey_versions where company_id=p_company and journey_id=j.id and version=j.published_version;
  if v.segment_id is not null and not smartvolt_private.segment_customer_allowed(p_company,j.created_by,j.brand_id,v.segment_id,s.customer_id)then continue;end if;
  if not exists(select 1 from jsonb_array_elements(v.steps)sx where(case when s.recipe='appointment'then s.anchor_at-make_interval(mins=>(sx->>'delayMinutes')::integer)else s.anchor_at+make_interval(mins=>(sx->>'delayMinutes')::integer)end)>statement_timestamp())then continue;end if;
  insert into public.sv_journey_runs(company_id,journey_id,version,source_key,source_version,customer_id,brand_id,provider,thread_id)values(p_company,j.id,j.published_version,s.source_key,s.source_version,s.customer_id,s.brand_id,j.provider,t.thread_id)on conflict do nothing returning id into run_id;
  if run_id is null then continue;end if;position=0;
  ctx=s.context||jsonb_build_object('brand',(select b->>'name'from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=s.brand_id));
  for step in select value from jsonb_array_elements(v.steps)loop
   position=position+1;stamp=case when s.recipe='appointment'then s.anchor_at-make_interval(mins=>(step->>'delayMinutes')::integer)else s.anchor_at+make_interval(mins=>(step->>'delayMinutes')::integer)end;if stamp<=statement_timestamp()then continue;end if;
   rendered=smartvolt_private.delivery_render(step->'definition',name,ctx);
   insert into public.sv_delivery_jobs(company_id,brand_id,customer_id,provider,channel,connection_id,thread_id,purpose,origin,source_id,source_key,actor_id,payload,due_at,state,reason)
   values(p_company,s.brand_id,s.customer_id,j.provider,t.channel,j.connection_id,t.thread_id,j.purpose,'journey',run_id,'journey:'||run_id||':'||position,j.created_by,coalesce(rendered,step->'definition'),stamp,case when rendered is null then 'skipped'else 'scheduled'end,case when rendered is null then 'source_details_missing'end);n=n+1;
  end loop;
  update public.sv_journey_runs set status='completed',reason=case when exists(select 1 from public.sv_delivery_jobs d where d.company_id=p_company and d.source_id=run_id and d.reason='source_details_missing')then 'source_details_missing'end where company_id=p_company and id=run_id and not exists(select 1 from public.sv_delivery_jobs d where d.company_id=p_company and d.source_id=run_id and d.state in('scheduled','dispatching','unknown'));
 end loop;return n;end;$$;

create or replace function smartvolt_private.journey_admit(p_job public.sv_delivery_jobs)returns text language plpgsql security invoker set search_path=''as $$declare r public.sv_journey_runs;s public.sv_journey_sources;j public.sv_journeys;target uuid;begin
 select * into r from public.sv_journey_runs where company_id=p_job.company_id and id=p_job.source_id;
 select * into s from public.sv_journey_sources where company_id=p_job.company_id and source_key=r.source_key;
 select * into j from public.sv_journeys where company_id=p_job.company_id and id=r.journey_id;
 if r.id is null or r.status<>'active'or not s.active or s.source_version<>r.source_version or not j.enabled or j.published_version<>r.version then return 'source_changed';end if;
 select segment_id into target from public.sv_journey_versions where company_id=p_job.company_id and journey_id=r.journey_id and version=r.version;
 if target is not null and not smartvolt_private.segment_customer_allowed(p_job.company_id,p_job.actor_id,p_job.brand_id,target,p_job.customer_id)then return 'segment_changed';end if;
 if s.product='pos'and not smartvolt_private.member_has_product(p_job.company_id,p_job.actor_id,'pos')then return 'authority_changed';end if;return null;end;$$;


create or replace function public.sv_journey_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb,p_request jsonb default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare j public.sv_journeys;ident uuid:=(p_data->>'id')::uuid;r jsonb;step jsonb;last_delay integer;delay integer;row record;v integer;target uuid;sg public.sv_dynamic_segments;begin
 select * into j from public.sv_journeys where company_id=p_company and id=ident;
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,coalesce(j.brand_id,p_data->>'brandId'));
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'journey:'||p_kind,coalesce(p_request,p_data));if r is not null then return r;end if;
 target=case when p_kind='publish'then nullif(p_data->>'segmentId','')::uuid else j.segment_id end;
 if target is not null and(p_kind='publish'or coalesce((p_data->>'enabled')::boolean,false))then
  select *into sg from public.sv_dynamic_segments where company_id=p_company and id=target and brand_id=coalesce(j.brand_id,p_data->>'brandId')and enabled;
  if not found or not smartvolt_private.segment_owner_allowed(sg)then raise exception 'segment_scope';end if;
  if sg.include_pos then perform public.sv_authorize(p_company,p_actor,'pos',false,false,sg.brand_id);end if;
 end if;
 if p_kind='publish'then
  if exists(select 1 from public.sv_wa_connections where p_data->>'provider'='whatsapp'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=p_data->>'brandId')or exists(select 1 from public.sv_meta_connections where p_data->>'provider'='meta'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=p_data->>'brandId')then null;else raise exception 'brand_scope';end if;
  if j.id is not null and(j.brand_id,j.recipe,j.provider,j.connection_id)is distinct from(p_data->>'brandId',p_data->>'recipe',p_data->>'provider',(p_data->>'connectionId')::uuid)then raise exception 'journey_identity_changed';end if;
  if coalesce(j.revision,0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  if p_data->>'recipe'='completed'and not smartvolt_private.member_has_product(p_company,p_actor,'pos')then raise exception 'product_required';end if;
  if jsonb_typeof(p_data->'steps')<>'array'or jsonb_array_length(p_data->'steps')not between 1 and 4 then raise exception 'invalid_steps';end if;
  for step in select value from jsonb_array_elements(p_data->'steps')loop
   delay=(step->>'delayMinutes')::integer;
   if delay not between 5 and 43200 or(last_delay is not null and((p_data->>'recipe'='appointment'and delay>=last_delay)or(p_data->>'recipe'<>'appointment'and delay<=last_delay)))then raise exception 'invalid_delays';end if;last_delay=delay;
  end loop;
  v=coalesce(j.published_version,0)+1;
  insert into public.sv_journeys(company_id,id,brand_id,name,recipe,provider,connection_id,purpose,enabled,published_version,created_by,segment_id)
  values(p_company,ident,p_data->>'brandId',p_data->>'name',p_data->>'recipe',p_data->>'provider',(p_data->>'connectionId')::uuid,p_data->>'purpose',(p_data->>'enabled')::boolean,v,p_actor,target)
  on conflict(company_id,id)do update set name=excluded.name,purpose=excluded.purpose,enabled=excluded.enabled,segment_id=excluded.segment_id,published_version=v,created_by=p_actor,revision=sv_journeys.revision+1;
  insert into public.sv_journey_versions(company_id,journey_id,version,steps,created_by,segment_id)values(p_company,ident,v,p_data->'steps',p_actor,target);
 elsif p_kind='toggle'then
  if j.id is null then raise exception 'journey_missing';end if;
  update public.sv_journeys set enabled=(p_data->>'enabled')::boolean,revision=revision+1 where company_id=p_company and id=ident and revision=(p_data->>'revision')::bigint;if not found then raise exception 'revision_conflict';end if;
  if(p_data->>'enabled')::boolean then
   insert into public.sv_journey_versions(company_id,journey_id,version,steps,created_by,segment_id)select p_company,ident,j.published_version+1,steps,p_actor,segment_id from public.sv_journey_versions where company_id=p_company and journey_id=ident and version=j.published_version;
   update public.sv_journeys set published_version=j.published_version+1,created_by=p_actor where company_id=p_company and id=ident;
  end if;
 else raise exception 'invalid_action';end if;
 for row in select id from public.sv_journey_runs where company_id=p_company and journey_id=ident and status='active'order by id loop perform smartvolt_private.journey_stop(p_company,row.id,'journey_changed');end loop;
 -- Catch-up is keyset paged by the watchdog; publication handles the first page.
 for row in select source_key from public.sv_journey_sources s where s.company_id=p_company and s.active and s.recipe<>'unanswered'and exists(select 1 from public.sv_journeys jj where jj.company_id=p_company and jj.id=ident and jj.enabled and jj.recipe=s.recipe and jj.brand_id=s.brand_id)order by s.anchor_at,s.source_key limit 200 loop perform smartvolt_private.journey_enroll(p_company,row.source_key,ident);end loop;
 r=jsonb_build_object('saved',true,'id',ident);insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'journey:'||p_kind,coalesce(p_request,p_data),r);return r;end;$$;


create function smartvolt_private.segment_journey_visible(p_company uuid,p_actor uuid,p_journey uuid,p_version integer)returns boolean language sql stable security invoker set search_path=''as $$
 select not exists(select 1 from public.sv_journey_versions v join public.sv_dynamic_segments sg on sg.company_id=v.company_id and sg.id=v.segment_id where v.company_id=p_company and v.journey_id=p_journey and v.version=p_version and sg.include_pos and not smartvolt_private.member_has_product(p_company,p_actor,'pos'))
$$;
revoke all on function smartvolt_private.segment_journey_visible(uuid,uuid,uuid,integer)from public,anon,authenticated;grant execute on function smartvolt_private.segment_journey_visible(uuid,uuid,uuid,integer)to service_role;

create or replace function public.sv_journey_read(p_company uuid,p_actor uuid,p_after timestamptz default null,p_after_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm');return jsonb_build_object('journeys',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(select j.*,v.steps,
 (select count(*)from public.sv_journey_runs r where r.company_id=p_company and r.journey_id=j.id and smartvolt_private.segment_journey_visible(p_company,p_actor,r.journey_id,r.version)and r.status='active'and exists(select 1 from public.sv_journey_sources s where s.company_id=r.company_id and s.source_key=r.source_key and(s.product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))))active_runs,
 (select count(*)from public.sv_delivery_jobs d join public.sv_journey_runs r on r.company_id=d.company_id and r.id=d.source_id where d.company_id=p_company and r.journey_id=j.id and smartvolt_private.segment_journey_visible(p_company,p_actor,r.journey_id,r.version)and d.state in('accepted','sent','delivered','read')and exists(select 1 from public.sv_journey_sources s where s.company_id=r.company_id and s.source_key=r.source_key and(s.product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))))accepted
 from public.sv_journeys j join public.sv_journey_versions v on v.company_id=j.company_id and v.journey_id=j.id and v.version=j.published_version where j.company_id=p_company and(j.segment_id is null or exists(select 1 from public.sv_dynamic_segments sg where sg.company_id=j.company_id and sg.id=j.segment_id and(not sg.include_pos or smartvolt_private.member_has_product(p_company,p_actor,'pos'))))and(j.recipe<>'completed'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)and(p_after is null or(j.created_at,j.id)<(p_after,p_after_id))order by j.created_at desc,j.id desc limit 31)q),'[]'));end;$$;



create or replace function public.sv_journey_history(p_company uuid,p_actor uuid,p_journey uuid,p_before timestamptz default null,p_before_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare brand text;begin
 select brand_id into brand from public.sv_journeys where company_id=p_company and id=p_journey;
 perform public.sv_member_scope(p_company,p_actor,brand);
 return jsonb_build_object('total',(select count(*)from public.sv_journey_runs r join public.sv_journey_sources s on s.company_id=r.company_id and s.source_key=r.source_key where r.company_id=p_company and r.journey_id=p_journey and smartvolt_private.segment_journey_visible(p_company,p_actor,r.journey_id,r.version)and(s.product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))),
 'runs',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(select r.id,r.version,r.created_at,r.status,r.reason,c.name customer_name,s.recipe,s.product,
 coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'state',d.state,'reason',d.reason,'due_at',d.due_at,'updated_at',d.updated_at)order by d.due_at,d.id)from public.sv_delivery_jobs d where d.company_id=p_company and d.source_id=r.id and d.origin='journey'),'[]')jobs
 from public.sv_journey_runs r join public.sv_customers c on c.company_id=r.company_id and c.id=r.customer_id join public.sv_journey_sources s on s.company_id=r.company_id and s.source_key=r.source_key
 where r.company_id=p_company and r.journey_id=p_journey and smartvolt_private.segment_journey_visible(p_company,p_actor,r.journey_id,r.version)and(s.product='crm'or smartvolt_private.member_has_product(p_company,p_actor,'pos'))and(p_before is null or(r.created_at,r.id)<(p_before,p_before_id))order by r.created_at desc,r.id desc limit 31)q),'[]'));end;$$;
revoke all on function public.sv_journey_history(uuid,uuid,uuid,timestamptz,uuid)from public,anon,authenticated;grant execute on function public.sv_journey_history(uuid,uuid,uuid,timestamptz,uuid)to service_role;


-- Historical membership and journey events must never be downgraded from POS
-- authority by changing a saved definition's source-product identity.
create function smartvolt_private.segment_identity_immutable()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if(new.company_id,new.id,new.brand_id,new.include_pos)is distinct from(old.company_id,old.id,old.brand_id,old.include_pos)then raise exception 'segment_identity_changed';end if;return new;end;$$;
revoke all on function smartvolt_private.segment_identity_immutable()from public,anon,authenticated;grant execute on function smartvolt_private.segment_identity_immutable()to service_role;
create trigger sv_segment_identity_immutable before update on public.sv_dynamic_segments for each row execute function smartvolt_private.segment_identity_immutable();

-- Customer-keyed source predicates and all new reference paths stay indexed.
create index sv_dynamic_segments_owner on public.sv_dynamic_segments(company_id,created_by);
create index sv_segment_members_customer on public.sv_segment_members(company_id,customer_id,brand_id);
create index sv_segment_events_customer on public.sv_segment_events(company_id,customer_id);
create index sv_journeys_segment on public.sv_journeys(company_id,segment_id);
create index sv_journey_versions_segment on public.sv_journey_versions(company_id,segment_id);
create index sv_pos_appointments_segment_customer on public.sv_pos_appointments(company_id,brand_id,contact_id,status);
create index sv_pos_orders_segment_customer on public.sv_pos_orders(company_id,brand_id,contact_id)where not voided;
create index sv_booking_requests_segment_customer on public.sv_booking_requests(company_id,brand_id,customer_id,status);
create index sv_sales_segment_customer on public.sv_sales_enquiries(company_id,brand_id,customer_id);


-- A historical POS-selected audience still reveals POS facts after the rule is
-- edited, paused or the reader loses POS. Filter before pagination and aggregates.
create function smartvolt_private.segment_campaign_visible(p_company uuid,p_actor uuid,p_campaign uuid)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_campaigns c where c.company_id=p_company and c.id=p_campaign and(
 nullif(c.audience->>'segmentId','')is null or exists(select 1 from public.sv_dynamic_segments s where s.company_id=c.company_id and s.id=(c.audience->>'segmentId')::uuid and s.brand_id=c.brand_id and(not s.include_pos or smartvolt_private.member_has_product(p_company,p_actor,'pos')))))
$$;
revoke all on function smartvolt_private.segment_campaign_visible(uuid,uuid,uuid)from public,anon,authenticated;grant execute on function smartvolt_private.segment_campaign_visible(uuid,uuid,uuid)to service_role;

create or replace function public.sv_engagement_read(p_company uuid,p_actor uuid,p_query jsonb default '{}')returns jsonb language plpgsql security invoker set search_path=''as $$
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
 from public.sv_campaigns c where c.company_id=p_company and smartvolt_private.segment_campaign_visible(p_company,p_actor,c.id)and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)and(brand is null or c.brand_id=brand)
 and(p_query->>'before'is null or(c.created_at,c.id)<((p_query->>'before')::timestamptz,(p_query->>'beforeId')::uuid))order by c.created_at desc,c.id desc limit 31)q),'[]'),
 'results',coalesce((select jsonb_agg(q order by q.id)from(select j.id,j.customer_id,c.name customer_name,j.state,j.reason,j.due_at,j.updated_at from public.sv_delivery_jobs j join public.sv_customers c on c.company_id=j.company_id and c.id=j.customer_id
 where j.company_id=p_company and j.source_id=campaign and smartvolt_private.segment_campaign_visible(p_company,p_actor,campaign)and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)and(p_query->>'after'is null or j.id>(p_query->>'after')::uuid)order by j.id limit 51)q),'[]'),
 'resultTotal',(select count(*)from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=campaign and smartvolt_private.segment_campaign_visible(p_company,p_actor,campaign)and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)),
 'resultCounts',coalesce((select jsonb_object_agg(x.state,x.n)from(select j.state,count(*)n from public.sv_delivery_jobs j where j.company_id=p_company and j.source_id=campaign and smartvolt_private.segment_campaign_visible(p_company,p_actor,campaign)and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)group by j.state)x),'{}'),
 'preferences',coalesce((select jsonb_agg(to_jsonb(pr)-'company_id'-'updated_at')from public.sv_contact_preferences pr where pr.company_id=p_company and pr.customer_id=p_query->>'customer'and smartvolt_private.member_brand_allowed(p_company,p_actor,pr.brand_id)),'[]'),
 'audience',case when p_query->>'connection'is null or brand is null then null else(
 select jsonb_build_object('total',count(*),'consented',count(*)filter(where exists(select 1 from public.sv_contact_preferences pr where pr.company_id=p_company and pr.customer_id=a.customer_id and pr.brand_id=brand and pr.channel=a.channel and pr.purpose=coalesce(p_query->>'purpose','marketing')and pr.allowed)),
 'sample',coalesce((select jsonb_agg(s)from(select customer_id,customer_name from smartvolt_private.delivery_audience(p_company,p_actor,brand,p_query->>'provider',(p_query->>'connection')::uuid,coalesce(p_query->'audience','{}'))limit 10)s),'[]'))
 from smartvolt_private.delivery_audience(p_company,p_actor,brand,p_query->>'provider',(p_query->>'connection')::uuid,coalesce(p_query->'audience','{}'))a)end)into r;
 return r;end;$$;
