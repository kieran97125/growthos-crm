-- Product Learning Sync checked: exact source identity, private evidence, scoped
-- reads, immutable send receipts and truthful provider outcomes (07-17/26/29,
-- 08-10 permission scopes and 10-06 progressive disclosure).
do $bucket$begin
 if to_regclass('storage.buckets')is not null then
  execute $sql$insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('convelta-attachments','convelta-attachments',false,26214400,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/aac','audio/flac','audio/webm','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']) on conflict(id)do nothing$sql$;
 end if;
end;$bucket$;
create table public.sv_media_assets(
 company_id uuid not null references public.sv_companies(id),id uuid not null,
 brand_id text not null,source text not null check(source in('whatsapp','meta')),source_id uuid not null,
 origin text not null check(origin in('staff_upload','provider')),message_id uuid,attachment_index integer not null default 0 check(attachment_index between 0 and 9),
 created_by uuid not null,filename text not null check(length(filename)between 1 and 200 and filename!~E'[\\\\/\\x00-\\x1f\\x7f]'),
 declared_bytes integer not null check(declared_bytes between 1 and 26214400),declared_mime text not null,
 object_path text not null,kind text check(kind in('image','video','audio','document')),mime_type text,
 media_bytes integer check(media_bytes between 1 and 26214400),content_hash text check(content_hash~'^[a-f0-9]{64}$'),
 state text not null default 'uploading'check(state in('uploading','ready','cancelled','rejected')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval'2 hours',verified_at timestamptz,cleaned_at timestamptz,
 primary key(company_id,id),foreign key(company_id,created_by)references public.sv_memberships(company_id,user_id),
 check(object_path=company_id::text||'/'||id::text),
 check((origin='provider'and message_id is not null)or(origin='staff_upload'and message_id is null)),
 check(state<>'ready'or(kind is not null and mime_type is not null and media_bytes is not null and content_hash is not null and verified_at is not null))
);
create unique index sv_media_native on public.sv_media_assets(company_id,source,source_id,message_id,attachment_index)where origin='provider';
create index sv_media_thread on public.sv_media_assets(company_id,source,source_id,created_at desc);
create index sv_media_actor on public.sv_media_assets(company_id,created_by,created_at desc);
create table public.sv_media_commands(
 company_id uuid not null,client_id uuid not null,actor_id uuid not null,source text not null check(source in('whatsapp','meta')),source_id uuid not null,
 asset_id uuid not null,message_id uuid not null,caption text not null,fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),
 primary key(company_id,client_id),foreign key(company_id,asset_id)references public.sv_media_assets(company_id,id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id),unique(company_id,source,message_id)
);
create index sv_media_command_asset on public.sv_media_commands(company_id,asset_id);
create index sv_media_command_thread on public.sv_media_commands(company_id,source,source_id,message_id);
create function smartvolt_private.media_asset_guard()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if tg_op<>'UPDATE'then raise exception 'media_evidence_immutable';end if;
 if old.state='ready'and(new.kind,new.mime_type,new.media_bytes,new.content_hash,new.filename,new.brand_id,new.source,new.source_id,new.message_id,new.attachment_index,new.object_path,new.created_by,new.origin)is distinct from(old.kind,old.mime_type,old.media_bytes,old.content_hash,old.filename,old.brand_id,old.source,old.source_id,old.message_id,old.attachment_index,old.object_path,old.created_by,old.origin)then raise exception 'media_evidence_immutable';end if;
 if old.state in('cancelled','rejected')and(to_jsonb(new)-'cleaned_at')is distinct from(to_jsonb(old)-'cleaned_at')then raise exception 'media_evidence_immutable';end if;
 return new;
end;$$;
create trigger sv_media_asset_guard before update or delete on public.sv_media_assets for each row execute function smartvolt_private.media_asset_guard();
create trigger sv_media_command_immutable before update or delete on public.sv_media_commands for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_media_asset_no_truncate before truncate on public.sv_media_assets for each statement execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_media_command_no_truncate before truncate on public.sv_media_commands for each statement execute function smartvolt_private.wa_reject_rewrite();
alter table public.sv_media_assets enable row level security;
alter table public.sv_media_commands enable row level security;
revoke all on public.sv_media_assets,public.sv_media_commands from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_media_assets to service_role;
grant select,insert on public.sv_media_commands to service_role;

create function public.sv_media_reserve(p_company uuid,p_actor uuid,p_id uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare a public.sv_media_assets;v_count integer;v_bytes bigint;begin
 perform public.sv_voice_scope(p_company,p_actor,p_data->>'brandId',p_data->>'source',p_data->>'sourceId',true);
 perform pg_advisory_xact_lock(hashtextextended('media-upload:'||p_company::text,0));
 select *into a from public.sv_media_assets where company_id=p_company and id=p_id for update;
 if found then
  if a.origin<>'staff_upload'or a.created_by<>p_actor or a.brand_id<>p_data->>'brandId'or a.source<>p_data->>'source'or a.source_id<>(p_data->>'sourceId')::uuid or a.filename<>p_data->>'filename'or a.declared_bytes<>(p_data->>'bytes')::integer or a.declared_mime<>p_data->>'mimeType'then raise exception 'media_idempotency_conflict';end if;
  if a.state not in('uploading','ready')or a.expires_at<=now()then raise exception 'media_expired';end if;
  return to_jsonb(a);
 end if;
 select count(*),coalesce(sum(declared_bytes),0)into v_count,v_bytes from public.sv_media_assets where company_id=p_company and origin='staff_upload'and created_at>now()-interval'15 minutes';
 if v_count>=40 or v_bytes+(p_data->>'bytes')::integer>262144000 then raise exception 'media_upload_limit';end if;
 insert into public.sv_media_assets(company_id,id,brand_id,source,source_id,origin,created_by,filename,declared_bytes,declared_mime,object_path)
 values(p_company,p_id,p_data->>'brandId',p_data->>'source',(p_data->>'sourceId')::uuid,'staff_upload',p_actor,p_data->>'filename',(p_data->>'bytes')::integer,p_data->>'mimeType',p_company::text||'/'||p_id::text)returning *into a;
 return to_jsonb(a);
end;$$;

create function public.sv_media_verify(p_company uuid,p_actor uuid,p_id uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare a public.sv_media_assets;v_type text;begin
 select *into strict a from public.sv_media_assets where company_id=p_company and id=p_id for update;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id::text,true);
 if a.origin<>'staff_upload'or a.created_by<>p_actor then raise exception 'media_access_denied';end if;
 if a.state='ready'then
  if a.content_hash<>p_data->>'contentHash'or a.mime_type<>p_data->>'mimeType'or a.kind<>p_data->>'kind'or a.media_bytes<>(p_data->>'bytes')::integer then raise exception 'media_idempotency_conflict';end if;
  return to_jsonb(a);
 end if;
 if a.state<>'uploading'or a.expires_at<=now()then raise exception 'media_expired';end if;
 if a.declared_bytes<>(p_data->>'bytes')::integer then raise exception 'media_size_changed';end if;
 update public.sv_media_assets set state='ready',kind=p_data->>'kind',mime_type=p_data->>'mimeType',media_bytes=(p_data->>'bytes')::integer,content_hash=p_data->>'contentHash',verified_at=now(),expires_at=now()+interval'1 day'where company_id=p_company and id=p_id returning *into a;
 return to_jsonb(a);
end;$$;

create function public.sv_media_native(p_company uuid,p_actor uuid,p_id uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare a public.sv_media_assets;v_source text:=p_data->>'source';v_thread uuid:=(p_data->>'sourceId')::uuid;v_message uuid:=(p_data->>'messageId')::uuid;v_index integer:=(p_data->>'index')::integer;begin
 perform public.sv_voice_scope(p_company,p_actor,p_data->>'brandId',v_source,v_thread::text,false);
 if v_index not between 0 and 9 then raise exception 'media_invalid';end if;
 if v_source='whatsapp'then
  if v_index<>0 or not exists(select 1 from public.sv_wa_messages m join public.sv_wa_events e on e.company_id=m.company_id and e.connection_id=m.connection_id and e.provider_id=m.provider_id and e.kind='message'where m.company_id=p_company and m.id=v_message and m.conversation_id=v_thread and m.direction='incoming'and m.message_type in('image','video','audio','document','sticker'))then raise exception 'media_source_missing';end if;
 else
  if not exists(select 1 from public.sv_meta_messages m join public.sv_meta_threads t on t.company_id=m.company_id and t.id=m.thread_id join public.sv_meta_events e on e.connection_id=t.connection_id and e.provider_id=m.provider_id and e.peer_id=t.peer_id and e.kind='inbound'where m.company_id=p_company and m.id=v_message and m.thread_id=v_thread and m.direction='inbound'and(e.raw#>'{message,attachments}'->v_index->>'type')in('image','video','audio','file'))then raise exception 'media_source_missing';end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('media-native:'||p_company::text||':'||v_message::text||':'||v_index::text,0));
 select *into a from public.sv_media_assets where company_id=p_company and source=v_source and source_id=v_thread and message_id=v_message and attachment_index=v_index;
 if found then
  if a.content_hash<>p_data->>'contentHash'then raise exception 'media_source_changed';end if;
  return to_jsonb(a);
 end if;
 insert into public.sv_media_assets(company_id,id,brand_id,source,source_id,origin,message_id,attachment_index,created_by,filename,declared_bytes,declared_mime,object_path,kind,mime_type,media_bytes,content_hash,state,verified_at,expires_at)
 values(p_company,p_id,p_data->>'brandId',v_source,v_thread,'provider',v_message,v_index,p_actor,p_data->>'filename',(p_data->>'bytes')::integer,p_data->>'mimeType',p_company::text||'/'||p_id::text,p_data->>'kind',p_data->>'mimeType',(p_data->>'bytes')::integer,p_data->>'contentHash','ready',now(),'infinity')returning *into a;
 return to_jsonb(a);
end;$$;

create function public.sv_media_cancel(p_company uuid,p_actor uuid,p_id uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare a public.sv_media_assets;begin
 select *into strict a from public.sv_media_assets where company_id=p_company and id=p_id for update;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id::text,true);
 if a.origin<>'staff_upload'or a.created_by<>p_actor then raise exception 'media_access_denied';end if;
 if exists(select 1 from public.sv_media_commands where company_id=p_company and asset_id=p_id)then raise exception 'media_already_sent';end if;
 if a.state in('uploading','ready')then update public.sv_media_assets set state='cancelled'where company_id=p_company and id=p_id returning *into a;end if;
 return to_jsonb(a);
end;$$;

create function public.sv_media_claim(p_company uuid,p_actor uuid,p_id uuid,p_client uuid,p_expected bigint,p_caption text,p_editor uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
declare a public.sv_media_assets;c public.sv_media_commands;v_fp text;v_body text;v_claim jsonb;v_id uuid;begin
 select *into strict a from public.sv_media_assets where company_id=p_company and id=p_id for update;
 perform public.sv_voice_scope(p_company,p_actor,a.brand_id,a.source,a.source_id::text,true);
 if p_caption is null or length(p_caption)>1000 then raise exception 'media_invalid';end if;
 v_fp:=encode(sha256(convert_to(jsonb_build_array(p_actor,p_id,a.source,a.source_id,p_caption)::text,'UTF8')),'hex');
 select *into c from public.sv_media_commands where company_id=p_company and client_id=p_client;
 if found and(c.fingerprint<>v_fp or c.actor_id<>p_actor)then raise exception 'media_idempotency_conflict';end if;
 if not found then
  if a.state<>'ready'or a.origin<>'staff_upload'or a.created_by<>p_actor or a.expires_at<=now()then raise exception 'media_not_ready';end if;
  if exists(select 1 from public.sv_wa_commands where company_id=p_company and client_id=p_client)or exists(select 1 from public.sv_meta_messages where company_id=p_company and client_id=p_client)then raise exception 'media_idempotency_conflict';end if;
 end if;
 v_body:=case when length(btrim(p_caption))>0 then p_caption else '[附件] '||a.filename end;
 if a.source='whatsapp'then
  v_claim:=public.sv_wa_claim_send(p_company,p_actor,a.source_id,p_expected,p_client,v_body,null,p_editor);
  if(v_claim->>'dispatch')::boolean then update public.sv_wa_messages set message_type=a.kind where company_id=p_company and id=(v_claim#>>'{message,id}')::uuid;end if;
 else
  v_claim:=public.sv_meta_claim(p_company,p_actor,a.source_id,p_client,p_expected,v_body,p_editor);
 end if;
 v_id:=(v_claim#>>'{message,id}')::uuid;
 if c.client_id is null then insert into public.sv_media_commands(company_id,client_id,actor_id,source,source_id,asset_id,message_id,caption,fingerprint)values(p_company,p_client,p_actor,a.source,a.source_id,p_id,v_id,p_caption,v_fp);end if;
 return v_claim||jsonb_build_object('asset',to_jsonb(a),'caption',p_caption);
end;$$;

create function public.sv_media_expire(p_company uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare a public.sv_media_assets;items jsonb:='[]';begin
 -- A signed upload token remains valid for its original window. Reap cancelled
 -- objects only after that window, so a late PUT cannot outlive cleanup ack.
 for a in select *from public.sv_media_assets where company_id=p_company and origin='staff_upload'and cleaned_at is null and state in('cancelled','uploading','ready')and expires_at<=now()order by expires_at,id limit 20 for update skip locked loop
  if exists(select 1 from public.sv_media_commands where company_id=p_company and asset_id=a.id)then continue;end if;
  if a.state<>'cancelled'then update public.sv_media_assets set state='cancelled'where company_id=p_company and id=a.id;end if;
  items:=items||jsonb_build_array(jsonb_build_object('id',a.id,'objectPath',a.object_path));
 end loop;
 return items;
end;$$;
create function public.sv_media_cleanup_ack(p_company uuid,p_ids uuid[])returns void language plpgsql security invoker set search_path=''as $$begin
 update public.sv_media_assets set cleaned_at=now()where company_id=p_company and id=any(p_ids)and origin='staff_upload'and state='cancelled'and expires_at<=now()and cleaned_at is null;
end;$$;

do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('media_asset_guard','sv_media_reserve','sv_media_verify','sv_media_native','sv_media_cancel','sv_media_claim','sv_media_expire','sv_media_cleanup_ack')loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
