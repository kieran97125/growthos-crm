-- Product Learning Sync checked: company isolation, explicit readiness,
-- actor-owned immutable receipts and concise optional operator actions.
-- Reuse the shared company AI budget; no customer message is sent here.
alter table public.sv_ai_requests drop constraint sv_ai_requests_feature_check;
alter table public.sv_ai_requests add constraint sv_ai_requests_feature_check check(feature in('reply','copilot','proactive','translation'));
alter table public.sv_ai_requests add column translation_context jsonb;
alter table public.sv_ai_requests add constraint sv_translation_context check(
 (feature='translation' and translation_context is not null and jsonb_typeof(translation_context)='object' and octet_length(translation_context::text)<=1000)
 or(feature<>'translation' and translation_context is null));
create index sv_ai_translation_cache on public.sv_ai_requests(company_id,actor_id,request_hash,model,created_at desc)where feature='translation';

-- Resolve the exact incoming message under company + brand + thread scope.
-- NULL message means a staff-authored draft; it never reads customer content.
create function public.sv_translation_source(p_company uuid,p_brand text,p_source text,p_thread text,p_message text)returns text
language plpgsql security invoker set search_path='' as $$
declare d public.sv_workspaces;body text;
begin
 select * into strict d from public.sv_workspaces where company_id=p_company for share;
 if p_brand is null or not exists(select 1 from jsonb_array_elements(d.payload#>'{scope,brands}')b where b->>'id'=p_brand)then raise exception 'ai_brand_scope';end if;
 if p_source='playground' and p_thread='studio' and p_message is null then
  return null;
 elsif p_source='conversation' then
  if not exists(select 1 from jsonb_array_elements(d.payload#>'{inbox,conversations}')c where c->>'id'=p_thread and c->>'brandId'=p_brand)then raise exception 'ai_conversation_scope';end if;
  if p_message is not null then
   select m->>'body' into body from jsonb_array_elements(d.payload#>'{inbox,messages}')m where m->>'conversationId'=p_thread and m->>'id'=p_message and m->>'kind'='incoming';
  end if;
 elsif p_source='whatsapp' then
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_thread::uuid and brand_id=p_brand for share;
  if not found then raise exception 'ai_conversation_scope';end if;
  if p_message is not null then
   select m.body into body from public.sv_wa_messages m where m.company_id=p_company and m.conversation_id=p_thread::uuid and m.id=p_message::uuid and m.direction='incoming' and m.message_type='text' and m.state in('accepted','sent','delivered','read')for share;
  end if;
 elsif p_source='meta' then
  perform 1 from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where t.company_id=p_company and t.id=p_thread::uuid and c.brand_id=p_brand for share of t,c;
  if not found then raise exception 'ai_conversation_scope';end if;
  if p_message is not null then
   select m.body into body from public.sv_meta_messages m where m.company_id=p_company and m.thread_id=p_thread::uuid and m.id=p_message::uuid and m.direction='inbound' and m.state='received'for share;
  end if;
 else raise exception 'ai_invalid';end if;
 if p_message is not null and(body is null or body='[附件／分享內容：請於原生平台查看]' or length(btrim(body))not between 1 and 6000)then raise exception 'translation_source';end if;
 return body;
end;$$;

create function public.sv_translation_claim(p_company uuid,p_actor uuid,p_request uuid,p_data jsonb,p_model text,p_hash text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.sv_ai_settings;r public.sv_ai_requests;body text;context jsonb;day_start timestamptz;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select * into s from public.sv_ai_settings where company_id=p_company for update;
 if not found or not s.enabled then raise exception 'ai_disabled';end if;
 if p_request is null or p_model is null or length(p_model)not between 3 and 150 or p_hash is null or p_hash!~'^[a-f0-9]{64}$'
 or jsonb_typeof(p_data)is distinct from 'object' or coalesce(p_data->>'mode','')not in('message','draft') or coalesce(p_data->>'target','')not in('zh-Hant','en')
 or coalesce(length(p_data->>'threadId'),0)not between 1 and 100 then raise exception 'ai_invalid';end if;
 if p_data->>'mode'='message' then
  if p_data?'text' or coalesce(length(p_data->>'messageId'),0)not between 1 and 100 then raise exception 'ai_invalid';end if;
 else
  if p_data?'messageId' or coalesce(length(btrim(p_data->>'text')),0)not between 1 and 6000 then raise exception 'ai_invalid';end if;
 end if;
 body=public.sv_translation_source(p_company,p_data->>'brandId',p_data->>'source',p_data->>'threadId',p_data->>'messageId');
 if p_data->>'mode'='draft' then body=p_data->>'text';end if;
 context=jsonb_build_object('mode',p_data->>'mode','target',p_data->>'target','messageId',p_data->>'messageId','sourceHash',md5(body));
 select * into r from public.sv_ai_requests where company_id=p_company and request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.feature<>'translation' or r.product<>'crm' or r.request_hash<>p_hash or r.brand_id is distinct from p_data->>'brandId' or r.source is distinct from p_data->>'source' or r.source_id is distinct from p_data->>'threadId' or r.translation_context is distinct from context then raise exception 'ai_idempotency_conflict';end if;
 else
  -- Identical translations are reused for this actor only. Parallel clicks
  -- share one reservation; changed source text cannot hit an old translation.
  select * into r from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and feature='translation' and request_hash=p_hash and model=p_model and translation_context=context and status in('running','completed')order by created_at desc limit 1;
 end if;
 if r.request_id is not null then
  if r.status='running'and r.created_at<now()-interval '90 seconds' then
   update public.sv_ai_requests set status='failed',error_code='interrupted',finished_at=now()where company_id=p_company and request_id=r.request_id returning * into r;
  end if;
  return jsonb_build_object('dispatch',false,'status',r.status,'result',r.result,'error_code',r.error_code);
 end if;
 day_start=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';
 if(select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=day_start and created_at<day_start+interval '1 day')>=s.daily_limit then raise exception 'ai_daily_limit';end if;
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and status='running'and created_at>now()-interval '90 seconds')then raise exception 'ai_busy';end if;
 insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,product,feature,translation_context)
 select p_company,p_request,p_actor,p_data->>'brandId',p_data->>'source',p_data->>'threadId',w.revision,p_model,p_hash,'crm','translation',context from public.sv_workspaces w where w.company_id=p_company;
 return jsonb_build_object('dispatch',true,'status','running','sourceText',body);
end;$$;

create function public.sv_translation_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;enabled boolean;body text;err text:=p_error;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select s.enabled into enabled from public.sv_ai_settings s where company_id=p_company for share;
 select * into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor for update;
 if r.feature<>'translation' or r.product<>'crm' then raise exception 'ai_idempotency_conflict';end if;
 body=public.sv_translation_source(p_company,r.brand_id,r.source,r.source_id,r.translation_context->>'messageId');
 if r.status<>'running' then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 if not coalesce(enabled,false)then err='disabled';
 elsif r.translation_context->>'mode'='message'and md5(body)is distinct from r.translation_context->>'sourceHash' then err='source_changed';end if;
 if err is null and(p_result is null or jsonb_typeof(p_result)is distinct from 'object' or p_result->>'requestId'is distinct from p_request::text or p_result->>'target'is distinct from r.translation_context->>'target' or coalesce(length(btrim(p_result->>'text')),0)not between 1 and 12000)then raise exception 'ai_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then 'completed'else 'failed'end,result=case when err is null then p_result else null end,error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;
revoke all on function public.sv_translation_source(uuid,text,text,text,text),public.sv_translation_claim(uuid,uuid,uuid,jsonb,text,text),public.sv_translation_finish(uuid,uuid,uuid,jsonb,text,integer,integer)from public,anon,authenticated;
grant execute on function public.sv_translation_source(uuid,text,text,text,text),public.sv_translation_claim(uuid,uuid,uuid,jsonb,text,text),public.sv_translation_finish(uuid,uuid,uuid,jsonb,text,integer,integer)to service_role;

insert into public.sv_system_cards(company_id,id,title,category,status,detail)
 select id,'inbox-translation','對話及回覆草稿中英翻譯','build','in_progress','客戶語言偵測、原文旁譯文、草稿繁中／英文翻譯及還原；共享公司 AI 用量、請求去重及權限驗證。待瀏覽器、部署與正式讀回驗收。'from public.sv_companies on conflict do nothing;

-- Reply and translation receipts cannot be completed by each other's routine.
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
  if r.feature<>'reply' or r.actor_id<>p_actor or r.request_hash<>p_hash or r.model<>p_model or r.brand_id<>p_brand or r.source<>p_source or r.source_id is distinct from p_source_id
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
 if r.feature<>'reply' then raise exception 'ai_idempotency_conflict';end if;
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
