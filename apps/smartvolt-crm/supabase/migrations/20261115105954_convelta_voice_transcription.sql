-- Product Learning Sync checked: scoped source identity, explicit provider readiness,
-- immutable evidence, bounded private media and shared company AI admission.
alter table public.sv_ai_requests drop constraint sv_ai_requests_feature_check;
alter table public.sv_ai_requests add constraint sv_ai_requests_feature_check check(feature in('reply','copilot','proactive','translation','coaching','voice'));
alter table public.sv_ai_requests add column voice_context jsonb;
alter table public.sv_ai_requests add constraint sv_voice_context_valid check((feature='voice' and voice_context is not null and jsonb_typeof(voice_context)='object'and octet_length(voice_context::text)<=1000)or(feature<>'voice'and voice_context is null));
create index sv_ai_voice_asset on public.sv_ai_requests(company_id,(voice_context->>'assetId'),created_at desc)where feature='voice';
-- Some isolated PostgreSQL test environments have no Storage schema.
do $bucket$begin
 if to_regclass('storage.buckets')is not null then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('convelta-voice','convelta-voice',false,4194304,array['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/flac']) on conflict(id)do nothing$sql$;
 end if;
end;$bucket$;
create table public.sv_voice_assets(
 company_id uuid not null references public.sv_companies(id),id uuid not null,brand_id text not null,
 source text not null check(source in('conversation','whatsapp','meta')),source_id text not null,
 message_id uuid not null,origin text not null check(origin in('provider','staff_upload')),
 object_path text not null,content_hash text not null check(content_hash~'^[a-f0-9]{64}$'),
 mime_type text not null check(mime_type in('audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/webm','audio/mp4','audio/flac')),
 audio_bytes integer not null check(audio_bytes between 1 and 4194304),duration_seconds double precision not null check(duration_seconds>0 and duration_seconds<=300),
 created_by uuid not null,created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,created_by)references public.sv_memberships(company_id,user_id),
 unique(company_id,source,source_id,message_id),check(object_path=company_id::text||'/'||id::text)
);
create index sv_voice_assets_thread on public.sv_voice_assets(company_id,brand_id,source,source_id,created_at desc,id);
create index sv_voice_assets_actor on public.sv_voice_assets(company_id,created_by);
create table public.sv_voice_transcripts(
 company_id uuid not null,id uuid not null,asset_id uuid not null,actor_id uuid not null,
 original_text text not null check(length(btrim(original_text))between 1 and 12000),
 language text not null check(language in('cantonese','english','mixed','other')),extractions jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,id),unique(company_id,asset_id),
 foreign key(company_id,asset_id)references public.sv_voice_assets(company_id,id),
 foreign key(company_id,id)references public.sv_ai_requests(company_id,request_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 check(jsonb_typeof(extractions)='array'and jsonb_array_length(extractions)<=8)
);
create index sv_voice_transcripts_actor on public.sv_voice_transcripts(company_id,actor_id);
create table public.sv_voice_corrections(
 company_id uuid not null,command_id uuid not null,transcript_id uuid not null,actor_id uuid not null,
 revision integer not null check(revision>0),text text not null check(length(btrim(text))between 1 and 12000),
 reason text not null check(length(btrim(reason))between 1 and 500),extractions jsonb not null,
 created_at timestamptz not null default now(),primary key(company_id,command_id),unique(company_id,transcript_id,revision),
 foreign key(company_id,transcript_id)references public.sv_voice_transcripts(company_id,id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),
 check(jsonb_typeof(extractions)='array'and jsonb_array_length(extractions)<=8)
);
create index sv_voice_corrections_actor on public.sv_voice_corrections(company_id,actor_id);
create function smartvolt_private.voice_immutable()returns trigger language plpgsql security invoker set search_path=''as $$begin raise exception 'voice_evidence_immutable';end;$$;
create trigger sv_voice_assets_immutable before update or delete on public.sv_voice_assets for each row execute function smartvolt_private.voice_immutable();
create trigger sv_voice_transcripts_immutable before update or delete on public.sv_voice_transcripts for each row execute function smartvolt_private.voice_immutable();
create trigger sv_voice_corrections_immutable before update or delete on public.sv_voice_corrections for each row execute function smartvolt_private.voice_immutable();
alter table public.sv_voice_assets enable row level security;
alter table public.sv_voice_transcripts enable row level security;
alter table public.sv_voice_corrections enable row level security;
revoke all on public.sv_voice_assets,public.sv_voice_transcripts,public.sv_voice_corrections from public,anon,authenticated,service_role;
grant select,insert on public.sv_voice_assets,public.sv_voice_transcripts,public.sv_voice_corrections to service_role;
create function public.sv_voice_scope(p_company uuid,p_actor uuid,p_brand text,p_source text,p_source_id text,p_write boolean default false)returns void
language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm',p_write,false,p_brand);
 if p_brand is null or p_source_id is null or length(p_source_id)not between 1 and 100 then raise exception 'voice_invalid';end if;
 if p_source='conversation'then
  if not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{inbox,conversations}')c where w.company_id=p_company and c->>'id'=p_source_id and c->>'brandId'=p_brand)then raise exception 'voice_source_missing';end if;
 elsif p_source='whatsapp'then
  perform public.sv_thread_scope(p_company,p_actor,p_source,p_source_id::uuid);
  if not exists(select 1 from public.sv_wa_conversations where company_id=p_company and id=p_source_id::uuid and brand_id=p_brand)then raise exception 'voice_source_missing';end if;
 elsif p_source='meta'then
  perform public.sv_thread_scope(p_company,p_actor,p_source,p_source_id::uuid);
  if not exists(select 1 from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where t.company_id=p_company and t.id=p_source_id::uuid and c.brand_id=p_brand)then raise exception 'voice_source_missing';end if;
 else raise exception 'voice_invalid';end if;
end;$$;
create function public.sv_voice_register(p_company uuid,p_actor uuid,p_asset uuid,p_data jsonb)returns jsonb
language plpgsql security invoker set search_path=''as $$declare a public.sv_voice_assets;begin
 perform public.sv_voice_scope(p_company,p_actor,p_data->>'brandId',p_data->>'source',p_data->>'sourceId',true);
 if p_asset is null or p_data->>'origin'not in('provider','staff_upload')then raise exception 'voice_invalid';end if;
 if p_data->>'origin'='provider'then
  if p_data->>'source'='whatsapp'then
   if not exists(select 1 from public.sv_wa_messages m join public.sv_wa_events e on e.company_id=m.company_id and e.connection_id=m.connection_id and e.provider_id=m.provider_id and e.kind='message' where m.company_id=p_company and m.id=(p_data->>'messageId')::uuid and m.conversation_id=(p_data->>'sourceId')::uuid and m.direction='incoming'and m.message_type='audio'and e.payload#>>'{raw,audio,id}'~'^[1-9][0-9]{0,49}$')then raise exception 'voice_source_missing';end if;
  elsif p_data->>'source'='meta'then
   if not exists(select 1 from public.sv_meta_messages m join public.sv_meta_threads t on t.company_id=m.company_id and t.id=m.thread_id join public.sv_meta_events e on e.connection_id=t.connection_id and e.provider_id=m.provider_id and e.peer_id=t.peer_id and e.kind='inbound' where m.company_id=p_company and m.id=(p_data->>'messageId')::uuid and m.thread_id=(p_data->>'sourceId')::uuid and m.direction='inbound'and exists(select 1 from jsonb_array_elements(coalesce(e.raw#>'{message,attachments}','[]'::jsonb))a where a->>'type'='audio'))then raise exception 'voice_source_missing';end if;
  else raise exception 'voice_source_missing';end if;
 elsif (p_data->>'messageId')::uuid<>p_asset then raise exception 'voice_invalid';end if;
 select *into a from public.sv_voice_assets where company_id=p_company and id=p_asset;
 if found then
  if a.brand_id<>p_data->>'brandId'or a.source<>p_data->>'source'or a.source_id<>p_data->>'sourceId'or a.message_id<>(p_data->>'messageId')::uuid or a.origin<>p_data->>'origin'or a.content_hash<>p_data->>'contentHash'or(a.origin='staff_upload'and a.created_by<>p_actor) then raise exception 'voice_idempotency_conflict';end if;
  return to_jsonb(a);
 end if;
 insert into public.sv_voice_assets(company_id,id,brand_id,source,source_id,message_id,origin,object_path,content_hash,mime_type,audio_bytes,duration_seconds,created_by)
 values(p_company,p_asset,p_data->>'brandId',p_data->>'source',p_data->>'sourceId',(p_data->>'messageId')::uuid,p_data->>'origin',p_company::text||'/'||p_asset::text,p_data->>'contentHash',p_data->>'mimeType',(p_data->>'audioBytes')::integer,(p_data->>'durationSeconds')::double precision,p_actor)returning *into a;
 return to_jsonb(a);
end;$$;
create function public.sv_voice_claim(p_company uuid,p_actor uuid,p_request uuid,p_asset uuid,p_model text,p_hash text)returns jsonb
language plpgsql security invoker set search_path=''as $$declare a public.sv_voice_assets;s public.sv_ai_settings;r public.sv_ai_requests;d timestamptz;begin
 select *into strict a from public.sv_voice_assets where company_id=p_company and id=p_asset;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id,true);
 select *into s from public.sv_ai_settings where company_id=p_company for update;
 if p_request is null or p_model is null or length(p_model)not between 3 and 150 or p_hash is null or p_hash!~'^[a-f0-9]{64}$'then raise exception 'voice_invalid';end if;
 select *into r from public.sv_ai_requests where company_id=p_company and request_id=p_request;
 if found then
  if r.actor_id<>p_actor or r.feature<>'voice'or r.product<>'crm'or r.request_hash<>p_hash or r.model<>p_model or r.voice_context->>'assetId'<>p_asset::text then raise exception 'voice_idempotency_conflict';end if;
  if r.status='running'and r.created_at<now()-interval'120 seconds'then update public.sv_ai_requests set status='failed',error_code='interrupted',finished_at=now()where company_id=p_company and request_id=p_request returning *into r;end if;
  return jsonb_build_object('dispatch',false,'status',r.status,'result',r.result,'error_code',r.error_code);
 end if;
 if exists(select 1 from public.sv_voice_transcripts where company_id=p_company and asset_id=p_asset)then return jsonb_build_object('dispatch',false,'status','completed','result',jsonb_build_object('assetId',p_asset));end if;
 if not coalesce(s.enabled,false)then raise exception 'ai_disabled';end if;
 update public.sv_ai_requests set status='failed',error_code='interrupted',finished_at=now() where company_id=p_company and feature='voice'and voice_context->>'assetId'=p_asset::text and status='running'and created_at<=now()-interval'120 seconds';
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and feature='voice'and voice_context->>'assetId'=p_asset::text and status='running'and created_at>now()-interval'120 seconds')then return jsonb_build_object('dispatch',false,'status','running');end if;
 d=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';
 if(select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=d and created_at<d+interval'1 day')>=s.daily_limit then raise exception 'ai_daily_limit';end if;
 if exists(select 1 from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and status='running'and created_at>now()-interval'120 seconds')then raise exception 'ai_busy';end if;
 insert into public.sv_ai_requests(company_id,request_id,actor_id,brand_id,source,source_id,workspace_revision,model,request_hash,product,feature,voice_context)
 select p_company,p_request,p_actor,a.brand_id,a.source,a.source_id,w.revision,p_model,p_hash,'crm','voice',jsonb_build_object('assetId',a.id,'contentHash',a.content_hash,'durationSeconds',a.duration_seconds)from public.sv_workspaces w where w.company_id=p_company;
 return jsonb_build_object('dispatch',true,'status','running');
end;$$;
create function public.sv_voice_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text)returns jsonb
language plpgsql security invoker set search_path=''as $$declare r public.sv_ai_requests;a public.sv_voice_assets;err text:=p_error;v jsonb;begin
 select *into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor for update;
 if r.feature<>'voice'or r.product<>'crm'then raise exception 'voice_idempotency_conflict';end if;
 select *into strict a from public.sv_voice_assets where company_id=p_company and id=(r.voice_context->>'assetId')::uuid;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id,true);
 perform pg_advisory_xact_lock(hashtextextended('customer-context:'||p_company::text||':'||a.brand_id||':'||a.source||':'||a.source_id,0));
 if r.status<>'running'then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 if not exists(select 1 from public.sv_ai_settings where company_id=p_company and enabled)then err='disabled';end if;
 if err is null then
  if p_result is null or coalesce(length(btrim(p_result->>'text')),0)not between 1 and 12000 or p_result->>'language'not in('cantonese','english','mixed','other')or jsonb_typeof(p_result->'extractions')is distinct from'array'or jsonb_array_length(p_result->'extractions')>8 then raise exception 'voice_invalid';end if;
  for v in select value from jsonb_array_elements(p_result->'extractions')loop if v->>'kind'not in('need','date')or coalesce(length(v->>'quote'),0)not between 1 and 300 or position(v->>'quote'in p_result->>'text')=0 or v->>'text'is distinct from v->>'quote'then raise exception 'voice_invalid';end if;end loop;
  insert into public.sv_voice_transcripts(company_id,id,asset_id,actor_id,original_text,language,extractions)values(p_company,p_request,a.id,p_actor,p_result->>'text',p_result->>'language',p_result->'extractions')on conflict(company_id,asset_id)do nothing;
 end if;
 update public.sv_ai_requests set status=case when err is null then'completed'else'failed'end,result=case when err is null then jsonb_build_object('assetId',a.id)else null end,error_code=err,finished_at=now()where company_id=p_company and request_id=p_request returning *into r;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;
create function public.sv_voice_correct(p_company uuid,p_actor uuid,p_transcript uuid,p_command uuid,p_expected integer,p_text text,p_reason text,p_extractions jsonb)returns jsonb
language plpgsql security invoker set search_path=''as $$declare t public.sv_voice_transcripts;a public.sv_voice_assets;c public.sv_voice_corrections;v integer;x jsonb;begin
 select *into strict t from public.sv_voice_transcripts where company_id=p_company and id=p_transcript;
 select *into strict a from public.sv_voice_assets where company_id=p_company and id=t.asset_id;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id,true);
 perform pg_advisory_xact_lock(hashtextextended('customer-context:'||p_company::text||':'||a.brand_id||':'||a.source||':'||a.source_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_transcript::text,0));
 select *into c from public.sv_voice_corrections where company_id=p_company and command_id=p_command;
 if found then
  if c.actor_id<>p_actor or c.transcript_id<>p_transcript or c.revision<>p_expected+1 or c.text<>p_text or c.reason<>p_reason or c.extractions<>p_extractions then raise exception 'voice_idempotency_conflict';end if;return jsonb_build_object('saved',true);
 end if;
 select coalesce(max(revision),0)into v from public.sv_voice_corrections where company_id=p_company and transcript_id=p_transcript;
 if p_expected is distinct from v then raise exception 'voice_revision_conflict';end if;
 if p_command is null or coalesce(length(btrim(p_text)),0)not between 1 and 12000 or coalesce(length(btrim(p_reason)),0)not between 1 and 500 or jsonb_typeof(p_extractions)is distinct from'array'or jsonb_array_length(p_extractions)>8 then raise exception 'voice_invalid';end if;
 for x in select value from jsonb_array_elements(p_extractions)loop if x->>'kind'not in('need','date')or coalesce(length(x->>'quote'),0)not between 1 and 300 or position(x->>'quote'in p_text)=0 or x->>'text'is distinct from x->>'quote'then raise exception 'voice_invalid';end if;end loop;
 insert into public.sv_voice_corrections(company_id,command_id,transcript_id,actor_id,revision,text,reason,extractions)values(p_company,p_command,p_transcript,p_actor,v+1,p_text,p_reason,p_extractions);
 return jsonb_build_object('saved',true);
end;$$;
revoke all on function smartvolt_private.voice_immutable(),public.sv_voice_scope(uuid,uuid,text,text,text,boolean),public.sv_voice_register(uuid,uuid,uuid,jsonb),public.sv_voice_claim(uuid,uuid,uuid,uuid,text,text),public.sv_voice_finish(uuid,uuid,uuid,jsonb,text),public.sv_voice_correct(uuid,uuid,uuid,uuid,integer,text,text,jsonb)from public,anon,authenticated;
grant execute on function public.sv_voice_scope(uuid,uuid,text,text,text,boolean),public.sv_voice_register(uuid,uuid,uuid,jsonb),public.sv_voice_claim(uuid,uuid,uuid,uuid,text,text),public.sv_voice_finish(uuid,uuid,uuid,jsonb,text),public.sv_voice_correct(uuid,uuid,uuid,uuid,integer,text,text,jsonb)to service_role;
