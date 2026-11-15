-- Product Learning Sync checked: neutral company/brand isolation, explicit
-- staff-reviewed advice, source-owned outcomes and immutable receipts.
-- No channel send, model call, pilot identity or live customer data is created.
alter table public.sv_ai_requests drop constraint sv_ai_requests_feature_check;
alter table public.sv_ai_requests add constraint sv_ai_requests_feature_check
 check(feature in('reply','copilot','proactive','translation','coaching'));
alter table public.sv_ai_requests add column coaching_context jsonb;
alter table public.sv_ai_requests add constraint sv_coaching_context_valid check(
 (feature='coaching' and coaching_context is not null and jsonb_typeof(coaching_context)='object' and octet_length(coaching_context::text)<=1000)
 or(feature<>'coaching' and coaching_context is null));

create table public.sv_coaching_analyses(
 company_id uuid not null,id uuid not null,actor_id uuid not null,brand_id text not null,
 source text not null check(source in('conversation','meta','whatsapp')),source_id text not null,
 source_stamp text not null check(source_stamp~'^[a-f0-9]{32}$'),result jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,id)references public.sv_ai_requests(company_id,request_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 check(jsonb_typeof(result)='object' and octet_length(result::text)<=50000)
);
create index sv_coaching_analyses_source on public.sv_coaching_analyses(company_id,brand_id,source,source_id,created_at desc,id);
create index sv_coaching_analyses_actor on public.sv_coaching_analyses(company_id,actor_id);
create table public.sv_coaching_reviews(
 company_id uuid not null,command_id uuid not null,analysis_id uuid not null,actor_id uuid not null,
 kind text not null check(kind in('adopt','review')),data jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,command_id),
 foreign key(company_id,analysis_id)references public.sv_coaching_analyses(company_id,id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 check(jsonb_typeof(data)='object'and octet_length(data::text)<=20000),
 check(jsonb_typeof(result)='object'and octet_length(result::text)<=2000)
);
create unique index sv_coaching_adopt_once on public.sv_coaching_reviews(company_id,analysis_id,(data->>'index'))where kind='adopt';
create index sv_coaching_reviews_analysis on public.sv_coaching_reviews(company_id,analysis_id,created_at desc,command_id);
create index sv_coaching_reviews_actor on public.sv_coaching_reviews(company_id,actor_id);
create function smartvolt_private.coaching_immutable()returns trigger language plpgsql security invoker set search_path=''as $$
begin raise exception 'coaching_evidence_immutable';end;$$;
create trigger sv_coaching_analyses_immutable before update or delete on public.sv_coaching_analyses for each row execute function smartvolt_private.coaching_immutable();
create trigger sv_coaching_reviews_immutable before update or delete on public.sv_coaching_reviews for each row execute function smartvolt_private.coaching_immutable();

-- Only a stable stamp and source-owned outcome leave this routine. The raw
-- source transcript stays in its original protected storage.
create function public.sv_coaching_context(p_company uuid,p_actor uuid,p_brand text,p_source text,p_source_id text)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare d public.sv_workspaces;t jsonb;messages jsonb;bookings jsonb;pos jsonb;link jsonb;
 source_revision bigint;customer text;verified boolean:=false;stamp text;
begin
 perform public.sv_authorize(p_company,p_actor,'crm',false,false,p_brand);
 if p_brand is null or p_source_id is null or length(p_source_id)not between 1 and 100 then raise exception 'coaching_invalid';end if;
 select *into strict d from public.sv_workspaces where company_id=p_company for share;
 if p_source='conversation'then
  select c into t from jsonb_array_elements(d.payload#>'{inbox,conversations}')c where c->>'id'=p_source_id and c->>'brandId'=p_brand;
  if t is null then raise exception 'coaching_source_scope';end if;
  customer=t->>'contactId';source_revision=null;
  select coalesce(jsonb_agg(jsonb_build_object('id',m->>'id','kind',m->>'kind','body',m->>'body','at',m->'at')order by(m->>'at')::numeric,m->>'id'),'[]')into messages
   from jsonb_array_elements(d.payload#>'{inbox,messages}')m where m->>'conversationId'=p_source_id and m->>'kind'in('incoming','outgoing');
  select coalesce(jsonb_agg(b order by b->>'id'),'[]')into bookings from jsonb_array_elements(d.payload#>'{inbox,bookings}')b where b->>'conversationId'=p_source_id and b->>'contactId'=customer;
  verified=exists(select 1 from jsonb_array_elements(bookings)b where b->>'status'='confirmed'and(b->>'customerConfirmed')::boolean);
  -- A linked POS appointment has its own current authority: cancelled/no-show
  -- must not be treated as a successful booking just because a projection lags.
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'startsAt',p.starts_at,'endsAt',p.ends_at)order by p.id),'[]')into pos
   from public.sv_pos_appointments p where p.company_id=p_company and p.brand_id=p_brand and p.contact_id=customer and p.snapshot->>'crmBookingId' in(select b->>'id'from jsonb_array_elements(bookings)b);
  if jsonb_array_length(pos)>0 then verified=exists(select 1 from jsonb_array_elements(pos)p where p->>'status'in('confirmed','checked_in','completed'));end if;
  t=jsonb_build_object('id',t->>'id','brand',t->>'brandId','customer',customer,'status',t->>'status');
 elsif p_source in('meta','whatsapp')then
  perform public.sv_thread_scope(p_company,p_actor,p_source,p_source_id::uuid);
  select jsonb_build_object('customer',c.customer_id,'revision',c.revision,'brand',c.brand_id),c.customer_id into link,customer from public.sv_customer_threads c
   where c.company_id=p_company and c.provider=p_source and c.thread_id=p_source_id::uuid and c.brand_id=p_brand for share;
  if link is null then raise exception 'coaching_source_scope';end if;
  if p_source='meta'then
   select jsonb_build_object('id',x.id,'revision',x.revision,'status',x.status),x.revision into t,source_revision
    from public.sv_meta_threads x join public.sv_meta_connections c on c.company_id=x.company_id and c.id=x.connection_id
    where x.company_id=p_company and x.id=p_source_id::uuid and c.brand_id=p_brand for share of x,c;
   select jsonb_build_object('count',count(*),'lastSeq',max(seq))into messages from public.sv_meta_messages
    where company_id=p_company and thread_id=p_source_id::uuid and direction in('inbound','outbound')and state in('received','accepted','sent','delivered','read');
  else
   select jsonb_build_object('id',x.id,'revision',x.revision,'status',x.status),x.revision into t,source_revision from public.sv_wa_conversations x
    where x.company_id=p_company and x.id=p_source_id::uuid and x.brand_id=p_brand for share;
   select jsonb_build_object('count',count(*),'lastSeq',max(seq))into messages from public.sv_wa_messages
    where company_id=p_company and conversation_id=p_source_id::uuid and direction in('incoming','outgoing')and state in('accepted','sent','delivered','read');
  end if;
  if t is null then raise exception 'coaching_source_scope';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'revision',b.revision,'appointmentId',b.pos_appointment_id,'appointmentStatus',p.status,'appointmentStartsAt',p.starts_at,'appointmentEndsAt',p.ends_at)order by b.id),'[]')into bookings
   from public.sv_booking_requests b left join public.sv_pos_appointments p on p.company_id=b.company_id and p.id=b.pos_appointment_id and p.brand_id=b.brand_id and p.contact_id=b.customer_id
   where b.company_id=p_company and b.brand_id=p_brand and b.provider=p_source and b.thread_id=p_source_id::uuid and b.customer_id=customer;
  verified=exists(select 1 from jsonb_array_elements(bookings)b where(b->>'status'='confirmed'and b->>'appointmentId'is null)or(b->>'status'='linked'and b->>'appointmentStatus'in('confirmed','checked_in','completed')));
 else raise exception 'coaching_invalid';end if;
 stamp=md5(jsonb_build_object('source',p_source,'id',p_source_id,'brand',p_brand,'thread',t,'messages',messages,'bookings',bookings,'pos',pos,'link',link)::text);
 return jsonb_build_object('stamp',stamp,'workspaceRevision',d.revision,'sourceRevision',source_revision,'verifiedBooking',verified,'label',case when verified then'已核實來源預約'else'未有已核實來源預約'end);
end;$$;

create function public.sv_coaching_claim(p_company uuid,p_actor uuid,p_request uuid,p_brand text,p_source text,p_source_id text,p_stamp text,p_workspace_revision bigint,p_model text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare s public.sv_ai_settings;r public.sv_ai_requests;ctx jsonb;day_start timestamptz;
begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,false,p_brand);
 select *into s from public.sv_ai_settings where company_id=p_company for update;
 if p_request is null or p_source is null or p_source not in('conversation','meta','whatsapp')or p_model is null or length(p_model)not between 3 and 150 or p_hash is null or p_hash!~'^[a-f0-9]{64}$'or p_stamp is null or p_stamp!~'^[a-f0-9]{32}$'then raise exception 'coaching_invalid';end if;
 select *into r from public.sv_ai_requests where company_id=p_company and request_id=p_request;
 if found then
  if r.feature<>'coaching'or r.product<>'crm'or r.actor_id<>p_actor or r.request_hash<>p_hash or r.model<>p_model or r.brand_id is distinct from p_brand or r.source<>p_source or r.source_id is distinct from p_source_id then raise exception 'ai_idempotency_conflict';end if;
  if r.status='running'and r.created_at<now()-interval'120 seconds'then
   update public.sv_ai_requests set status='failed',error_code='interrupted',finished_at=now()where company_id=p_company and request_id=p_request returning *into r;
  end if;
  return jsonb_build_object('dispatch',false,'status',r.status,'result',r.result,'error_code',r.error_code);
 end if;
 if not coalesce(s.enabled,false)then raise exception 'ai_disabled';end if;
 ctx=public.sv_coaching_context(p_company,p_actor,p_brand,p_source,p_source_id);
 if ctx->>'stamp'is distinct from p_stamp or(ctx->>'workspaceRevision')::bigint is distinct from p_workspace_revision then raise exception 'ai_context_changed';end if;
 day_start=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';
 if(select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=day_start and created_at<day_start+interval'1 day')>=s.daily_limit then raise exception 'ai_daily_limit';end if;
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and status='running'and created_at>now()-interval'120 seconds')then raise exception 'ai_busy';end if;
 insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,source_revision,model,request_hash,product,feature,coaching_context)
 values(p_company,p_request,p_actor,p_brand,p_source,p_source_id,p_workspace_revision,(ctx->>'sourceRevision')::bigint,p_model,p_hash,'crm','coaching',jsonb_build_object('stamp',p_stamp));
 return jsonb_build_object('dispatch',true,'status','running');
end;$$;

create function public.sv_coaching_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare r public.sv_ai_requests;ai_enabled boolean;ctx jsonb;err text:=p_error;
begin
 perform public.sv_authorize(p_company,p_actor,'crm',true);
 select s.enabled into ai_enabled from public.sv_ai_settings s where s.company_id=p_company for share;
 select *into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor for update;
 if r.feature<>'coaching'or r.product<>'crm'then raise exception 'ai_idempotency_conflict';end if;
 perform public.sv_member_scope(p_company,p_actor,r.brand_id,'crm');
 if r.status<>'running'then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 if not coalesce(ai_enabled,false)then err='disabled';end if;
 begin ctx=public.sv_coaching_context(p_company,p_actor,r.brand_id,r.source,r.source_id);
 exception when no_data_found then err='context_changed';when invalid_text_representation then err='context_changed';when raise_exception then if sqlerrm in('coaching_source_scope','conversation_missing')then err='context_changed';else raise;end if;end;
 if ctx->>'stamp'is distinct from r.coaching_context->>'stamp'or(ctx->>'workspaceRevision')::bigint is distinct from r.workspace_revision then err='context_changed';end if;
 if err is null and(p_result is null or jsonb_typeof(p_result)<>'object'or p_result->>'id'is distinct from p_request::text or p_result->>'brandId'is distinct from r.brand_id or p_result->>'source'is distinct from r.source or p_result->>'sourceId'is distinct from r.source_id or jsonb_typeof(p_result->'learning')is distinct from'array'or jsonb_array_length(p_result->'learning')>6 or p_result#>>'{outcome,verifiedBooking}'is distinct from ctx->>'verifiedBooking')then raise exception 'coaching_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then'completed'else'failed'end,result=case when err is null then p_result else null end,error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and request_id=p_request returning *into r;
 if err is null then
  insert into public.sv_coaching_analyses(company_id,id,actor_id,brand_id,source,source_id,source_stamp,result)
   values(p_company,p_request,p_actor,r.brand_id,r.source,r.source_id,r.coaching_context->>'stamp',p_result);
 end if;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

create function public.sv_coaching_adopt(p_company uuid,p_actor uuid,p_analysis uuid,p_index integer,p_command uuid,p_title text,p_content text,p_valid_until text,p_workspace_revision bigint)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare a public.sv_coaching_analyses;w public.sv_workspaces;ctx jsonb;item jsonb;request jsonb;receipt jsonb;article jsonb;article_id text;expiry date;
begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true);
 select *into strict a from public.sv_coaching_analyses where company_id=p_company and id=p_analysis;
 perform public.sv_member_scope(p_company,p_actor,a.brand_id,'crm');
 request=jsonb_build_object('analysisId',p_analysis,'index',p_index,'title',p_title,'content',p_content,'validUntil',p_valid_until);
 receipt=smartvolt_private.action_replay(p_company,p_actor,p_command,'coaching:adopt',request);if receipt is not null then return receipt;end if;
 select *into strict w from public.sv_workspaces where company_id=p_company for update;
 if w.revision is distinct from p_workspace_revision then raise exception 'coaching_context_changed';end if;
 ctx=public.sv_coaching_context(p_company,p_actor,a.brand_id,a.source,a.source_id);
 if ctx->>'stamp'is distinct from a.source_stamp then raise exception 'coaching_source_changed';end if;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(a.result->'learning')then raise exception 'coaching_invalid';end if;
 item=a.result->'learning'->p_index;
 if item->>'kind'not in('answer','pattern')or jsonb_typeof(item->'evidence')is distinct from'array'or jsonb_array_length(item->'evidence')=0 then raise exception 'coaching_not_adoptable';end if;
 if exists(select 1 from public.sv_coaching_reviews where company_id=p_company and analysis_id=p_analysis and kind='adopt'and data->>'index'=p_index::text)then raise exception 'coaching_already_adopted';end if;
 if p_title is null or length(btrim(p_title))not between 1 and 100 or p_content is null or length(btrim(p_content))not between 1 and 5000 or p_valid_until is null or p_valid_until!~'^\d{4}-\d{2}-\d{2}$'then raise exception 'coaching_invalid';end if;
 expiry=p_valid_until::date;
 if to_char(expiry,'YYYY-MM-DD')<>p_valid_until or expiry<(now()at time zone'Asia/Hong_Kong')::date or expiry>(now()at time zone'Asia/Hong_Kong')::date+366 then raise exception 'coaching_invalid';end if;
 if jsonb_array_length(w.payload#>'{studio,articles}')>=100 then raise exception 'coaching_knowledge_full';end if;
 article_id='coaching-'||p_command::text;
 article=jsonb_build_object('id',article_id,'clientId',p_company::text,'brandId',a.brand_id,'title',btrim(p_title),'content',btrim(p_content),'keywords','[]'::jsonb,'source',case when item->>'kind'='pattern'then'客服話術｜溝通方式'else'客服話術｜品牌問答'end,'status','approved','validUntil',p_valid_until,'revision',1,'coaching',jsonb_build_object('analysisId',p_analysis::text,'index',p_index,'kind',item->>'kind'));
 insert into public.sv_workspace_versions(company_id,revision,payload)values(p_company,w.revision,w.payload);
 update public.sv_workspaces set payload=jsonb_set(payload,'{studio,articles}',(payload#>'{studio,articles}')||jsonb_build_array(article)),revision=revision+1,updated_at=now()where company_id=p_company;
 insert into public.sv_commands(company_id,command_id,actor_id,kind,revision)values(p_company,p_command,p_actor,'coaching-adopt',w.revision+1);
 receipt=jsonb_build_object('saved',true,'articleId',article_id);
 insert into public.sv_coaching_reviews(company_id,command_id,analysis_id,actor_id,kind,data,result)values(p_company,p_command,p_analysis,p_actor,'adopt',request,receipt);
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'coaching:adopt',request,receipt);
 return receipt;
end;$$;

create function public.sv_coaching_review(p_company uuid,p_actor uuid,p_analysis uuid,p_command uuid,p_loss_code text,p_reason text,p_dismissed_codes text[])returns jsonb
language plpgsql security invoker set search_path=''as $$
declare a public.sv_coaching_analyses;ctx jsonb;request jsonb;receipt jsonb;
begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true);
 select *into strict a from public.sv_coaching_analyses where company_id=p_company and id=p_analysis;
 perform public.sv_member_scope(p_company,p_actor,a.brand_id,'crm');
 request=jsonb_build_object('analysisId',p_analysis,'lossCode',p_loss_code,'reason',p_reason,'dismissedFindingCodes',p_dismissed_codes);
 receipt=smartvolt_private.action_replay(p_company,p_actor,p_command,'coaching:review',request);if receipt is not null then return receipt;end if;
 ctx=public.sv_coaching_context(p_company,p_actor,a.brand_id,a.source,a.source_id);
 if ctx->>'stamp'is distinct from a.source_stamp then raise exception 'coaching_source_changed';end if;
 if p_loss_code is null or p_loss_code not in('price','timing','location','trust','service_mismatch','other','unknown')or p_reason is null or length(btrim(p_reason))not between 3 and 500 or p_dismissed_codes is null or cardinality(p_dismissed_codes)>10 or exists(select 1 from unnest(p_dismissed_codes)c where c is null or not exists(select 1 from jsonb_array_elements(a.result#>'{quality,findings}')f where f->>'code'=c))then raise exception 'coaching_invalid';end if;
 receipt=jsonb_build_object('saved',true);
 insert into public.sv_coaching_reviews(company_id,command_id,analysis_id,actor_id,kind,data,result)values(p_company,p_command,p_analysis,p_actor,'review',request,receipt);
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'coaching:review',request,receipt);
 return receipt;
end;$$;

alter table public.sv_coaching_analyses enable row level security;
alter table public.sv_coaching_reviews enable row level security;
revoke all on public.sv_coaching_analyses,public.sv_coaching_reviews from public,anon,authenticated,service_role;
grant select,insert on public.sv_coaching_analyses,public.sv_coaching_reviews to service_role;
revoke all on function smartvolt_private.coaching_immutable(),public.sv_coaching_context(uuid,uuid,text,text,text),public.sv_coaching_claim(uuid,uuid,uuid,text,text,text,text,bigint,text,text),public.sv_coaching_finish(uuid,uuid,uuid,jsonb,text,integer,integer),public.sv_coaching_adopt(uuid,uuid,uuid,integer,uuid,text,text,text,bigint),public.sv_coaching_review(uuid,uuid,uuid,uuid,text,text,text[])from public,anon,authenticated;
grant execute on function public.sv_coaching_context(uuid,uuid,text,text,text),public.sv_coaching_claim(uuid,uuid,uuid,text,text,text,text,bigint,text,text),public.sv_coaching_finish(uuid,uuid,uuid,jsonb,text,integer,integer),public.sv_coaching_adopt(uuid,uuid,uuid,integer,uuid,text,text,text,bigint),public.sv_coaching_review(uuid,uuid,uuid,uuid,text,text,text[])to service_role;


-- Communication patterns are style guidance, never business evidence.
create or replace function public.sv_copilot_snapshot(p_company uuid,p_actor uuid,p_product text,p_brand text default null,p_customer text default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare doc public.sv_workspaces;result jsonb;customer jsonb:=null;cutoff timestamptz:=now()-interval '90 days';has_crm boolean;has_pos boolean;
begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 has_crm=smartvolt_private.member_has_product(p_company,p_actor,'crm')and exists(select 1 from public.sv_company_products p where p.company_id=p_company and p.product='crm'and p.status='active'and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now()));
 has_pos=smartvolt_private.member_has_product(p_company,p_actor,'pos')and exists(select 1 from public.sv_company_products p where p.company_id=p_company and p.product='pos'and p.status='active'and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now()));
 if p_brand is not null then perform public.sv_member_scope(p_company,p_actor,p_brand,p_product);end if;
 select * into strict doc from public.sv_workspaces where company_id=p_company;
 if p_brand is not null and not exists(select 1 from jsonb_array_elements(doc.payload#>'{scope,brands}')b where b->>'id'=p_brand)then raise exception 'copilot_brand_scope';end if;
 if p_customer is not null then
  select jsonb_build_object('id',c.id,'tags',c.tags,'revision',c.revision,'lastMessage','','lastMessageAt',null,
   'booked',exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=c.id and (smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)and(p_brand is null or r.brand_id=p_brand))and((r.status='confirmed'and r.desired_at>=now())or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000)))))
  into customer from public.sv_customers c where c.company_id=p_company and c.id=p_customer and exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and(smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)and(p_brand is null or b.brand_id=p_brand)));
  if customer is null then raise exception 'copilot_customer_scope';end if;
  if p_product='crm' then
   customer=customer||coalesce((select jsonb_build_object('lastMessage',left(m.body,1200),'lastMessageAt',m.stamp)from(
    select m.body,floor(extract(epoch from m.created_at)*1000)::bigint stamp from public.sv_meta_messages m join public.sv_customer_threads l on l.company_id=m.company_id and l.thread_id=m.thread_id and l.provider='meta'
     where m.company_id=p_company and l.customer_id=p_customer and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))and m.direction='inbound' and m.state='received'
    union all select m.body,floor(extract(epoch from m.created_at)*1000)::bigint from public.sv_wa_messages m join public.sv_customer_threads l on l.company_id=m.company_id and l.thread_id=m.conversation_id and l.provider='whatsapp'
     where m.company_id=p_company and l.customer_id=p_customer and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))and m.direction='incoming' and m.state in('accepted','sent','delivered','read')
   )m order by stamp desc limit 1),'{}'::jsonb);
  else customer=customer||jsonb_build_object('booked',exists(select 1 from public.sv_pos_appointments a where a.company_id=p_company and a.contact_id=p_customer and(smartvolt_private.member_brand_allowed(p_company,p_actor,a.brand_id)and(p_brand is null or a.brand_id=p_brand))and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000));end if;
 end if;
 with native as(
  select l.customer_id,l.brand_id,c.channel,(select min(m.created_at)from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound'and m.state='received')created_at,t.last_inbound_at,t.status,t.follow_up_at from public.sv_customer_threads l
   join public.sv_meta_threads t on t.company_id=l.company_id and t.id=l.thread_id join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id
   where p_product='crm'and l.company_id=p_company and l.provider='meta'and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))
  union all select l.customer_id,l.brand_id,'whatsapp',(select min(m.created_at)from public.sv_wa_messages m where m.company_id=t.company_id and m.conversation_id=t.id and m.direction='incoming'and m.state in('accepted','sent','delivered','read')),t.last_inbound_at,t.status,t.follow_up_at from public.sv_customer_threads l
   join public.sv_wa_conversations t on t.company_id=l.company_id and t.id=l.thread_id
   where p_product='crm'and l.company_id=p_company and l.provider='whatsapp'and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))
 ),first_inquiry as(
  select customer_id,min(created_at)first_at,max(last_inbound_at)last_at from native group by customer_id
 ), people as(
  select n.*,exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=n.customer_id and(smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)and(p_brand is null or r.brand_id=p_brand))and(r.status='confirmed'or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status<>'cancelled')))and r.created_at>=n.first_at and r.created_at<=now())booked
   from first_inquiry n
 ),cohort as(select * from people where first_at>=cutoff),groups as(
  select 'tag:'||tag key,tag label,count(distinct p.customer_id)leads,count(distinct p.customer_id)filter(where p.booked)booked
   from cohort p join public.sv_customers c on c.company_id=p_company and c.id=p.customer_id cross join lateral jsonb_array_elements_text(c.tags)tag group by tag
  union all select 'channel:'||n.channel,n.channel,count(distinct p.customer_id),count(distinct p.customer_id)filter(where p.booked)
   from cohort p join native n on n.customer_id=p.customer_id group by n.channel
 ),scoped_customers as(select c.* from public.sv_customers c where c.company_id=p_company and exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and(smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)and(p_brand is null or b.brand_id=p_brand))))
 select jsonb_build_object('at',now(),'from',cutoff,'product',p_product,'brandId',p_brand,'revision',doc.revision,
  'brands',(select coalesce(jsonb_agg(b),'[]'::jsonb)from jsonb_array_elements(doc.payload#>'{scope,brands}')b where smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'customer',customer,
  'customers',(select count(*)from scoped_customers),
  'inquiries',(select count(*)from cohort),'confirmed',(select count(*)from cohort where booked),
  'overdue',(select count(*)from native where status='open'and follow_up_at<now()),
  'dormant',(select count(*)from people n where last_at<extract(epoch from now()-interval '14 days')*1000 and not exists(select 1 from public.sv_booking_requests r where r.company_id=p_company and r.customer_id=n.customer_id and(smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)and(p_brand is null or r.brand_id=p_brand))and((r.status='confirmed'and r.desired_at>=now())or(r.status='linked'and exists(select 1 from public.sv_pos_appointments a where a.company_id=r.company_id and a.id=r.pos_appointment_id and a.status in('confirmed','checked_in')and a.starts_at>=extract(epoch from now())*1000))))),
  'untagged',(select count(*)from scoped_customers where tags='[]'::jsonb),
  'segments',coalesce((select jsonb_agg(to_jsonb(g))from(select * from groups order by leads desc,key limit 50)g),'[]'::jsonb),
  'pos',case when p_product='pos'or has_pos and exists(select 1 from public.sv_company_products e where e.company_id=p_company and e.product='pos'and e.status='active'and e.starts_at<=now()and(e.ends_at is null or e.ends_at>now()))then
    jsonb_build_object('appointments',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,a.brand_id)and(p_brand is null or a.brand_id=p_brand))and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'completed',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,a.brand_id)and(p_brand is null or a.brand_id=p_brand))and a.status='completed'and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'noShow',(select count(*)from public.sv_pos_appointments a where a.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,a.brand_id)and(p_brand is null or a.brand_id=p_brand))and a.status='no_show'and a.starts_at>=extract(epoch from cutoff)*1000 and a.starts_at<=extract(epoch from now())*1000),
     'revenueCents',(select coalesce(sum(p.amount_cents),0)from public.sv_pos_payments p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id where p.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and(p_brand is null or o.brand_id=p_brand))and p.occurred_at>=extract(epoch from cutoff)*1000 and p.occurred_at<=extract(epoch from now())*1000)
      -(select coalesce(sum(p.amount_cents),0)from public.sv_pos_refunds p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id where p.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and(p_brand is null or o.brand_id=p_brand))and p.occurred_at>=extract(epoch from cutoff)*1000 and p.occurred_at<=extract(epoch from now())*1000))else null end,
  'knowledge',coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','brandId',a->>'brandId','title',a->>'title','content',a->>'content','source',a->>'source','revision',(a->>'revision')::integer))from jsonb_array_elements(doc.payload#>'{studio,articles}')a where has_crm and a->>'status'='approved'and(a#>>'{coaching,kind}')is distinct from'pattern'and(a->>'validUntil')::date>=(now()at time zone'Asia/Hong_Kong')::date and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('id','pos-service:'||(a->>'id'),'brandId',a->>'brandId','title',a->>'name','content','POS目錄服務：'||(a->>'name')||'；目錄收費 HK$'||round((a->>'priceCents')::numeric/100,2)::text||'；時長 '||(a->>'durationMinutes')||' 分鐘。目錄不代表已確認空位。','source','公司 POS 服務設定','revision',doc.revision))from jsonb_array_elements(doc.payload#>'{pos,catalog}')a where has_pos and coalesce((a->>'active')::boolean,false)and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb),
  'channels',jsonb_build_object('connected',case when p_product='crm'then(select count(*)from public.sv_meta_connections where company_id=p_company and enabled and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)and(p_brand is null or brand_id=p_brand))+(select count(*)from public.sv_wa_connections where company_id=p_company and state='active'and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)and(p_brand is null or brand_id=p_brand))else 0 end),
  'lastBroadcastAt',null,'broadcastCoverage','unavailable') into result;
 if p_product='crm'then
  result=result||jsonb_build_object('overdue',(select count(*)from(
   select provider,thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and(p_brand is null or i.brand_id=p_brand))and i.status='open'and i.follow_up_at<=now()
   union select f.provider,f.thread_id from public.sv_followup_tasks f join smartvolt_private.ops_inquiries i on i.company_id=f.company_id and i.provider=f.provider and i.thread_id=f.thread_id where f.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and f.status='open'and f.due_at<=now()and i.status='open'
  )q),'followupTasks',(select count(*)from public.sv_followup_tasks f where f.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and f.status='open'),
  'lifecycleStages',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'kind',s.kind,'count',(select count(*)from public.sv_customer_lifecycle l where l.company_id=p_company and l.stage_id=s.id and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))))order by s.position,s.id)from public.sv_lifecycle_stages s where s.company_id=p_company),'[]'::jsonb));
 end if;
 return result;
end;$$;
