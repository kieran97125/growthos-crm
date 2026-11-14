-- Current stored brand/product grants, before paging, aggregation, replay or mutation.
create function smartvolt_private.copilot_thread_allowed(p_company uuid,p_actor uuid,p_thread uuid)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_copilot_threads t where t.company_id=p_company and t.id=p_thread and t.actor_id=p_actor)
 and not exists(select 1 from public.sv_ai_requests r where r.company_id=p_company and r.source='copilot'and r.source_id=p_thread::text
 and(not smartvolt_private.member_has_product(p_company,p_actor,r.product)or not smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)))
$$;
-- Return retained data that this member may not modify. Compare old/new under the document lock.
create function smartvolt_private.protected_workspace(p_company uuid,p_actor uuid,p jsonb)returns jsonb language plpgsql stable security invoker set search_path=''as $$
declare result jsonb='{}';path text[];paths text[];item jsonb;denied jsonb;brand text;entity text;brands text[];crm boolean;pos boolean;
begin
 select brand_ids into brands from public.sv_memberships where company_id=p_company and user_id=p_actor;
 crm=smartvolt_private.member_has_product(p_company,p_actor,'crm');pos=smartvolt_private.member_has_product(p_company,p_actor,'pos');
 if brands is null and crm and pos then return result;end if;
 foreach paths slice 1 in array array[
  ['inbox','contacts'],['inbox','conversations'],['inbox','messages'],['inbox','bookings'],['studio','flows'],['studio','versions'],['studio','bots'],['studio','articles'],
  ['broadcasts','templates'],['broadcasts','profiles'],['broadcasts','campaigns'],['broadcasts','recipients'],['broadcasts','events'],
  ['pos','catalog'],['pos','resources'],['pos','appointments'],['pos','orders'],['pos','payments'],['pos','refunds'],['pos','entitlements'],['pos','redemptions'],['pos','audit']
 ]loop
  if brands is null and(paths=array['inbox','contacts']or(paths[1]='pos'and pos)or(paths[1]<>'pos'and crm))then continue;end if;
  denied='[]';
  for item in select value from jsonb_array_elements(coalesce(p#>paths,'[]'))loop
   brand=item->>'brandId';
   if paths=array['studio','versions']then brand=item#>>'{flow,brandId}';end if;
   if paths[1]='inbox'and paths[2]in('messages','bookings')then select c->>'brandId'into brand from jsonb_array_elements(p#>'{inbox,conversations}')c where c->>'id'=item->>'conversationId';end if;
   if paths=array['broadcasts','recipients']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{broadcasts,campaigns}')c where c->>'id'=item->>'campaignId';end if;
   if paths=array['broadcasts','events']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{broadcasts,campaigns}')c join jsonb_array_elements(p#>'{broadcasts,recipients}')r on r->>'campaignId'=c->>'id'where r->>'id'=item->>'recipientId';end if;
   if paths[1]='pos'and paths[2]in('payments','refunds')then select c->>'brandId'into brand from jsonb_array_elements(p#>'{pos,orders}')c where c->>'id'=item->>'orderId';end if;
   if paths=array['pos','redemptions']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{pos,entitlements}')c where c->>'id'=item->>'entitlementId';end if;
   if paths=array['pos','audit']then
    select c->>'brandId'into brand from(
     select value c from jsonb_array_elements(coalesce(p#>'{pos,orders}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,appointments}','[]'))union all
     select value from jsonb_array_elements(coalesce(p#>'{pos,catalog}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,resources}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,entitlements}','[]'))
    )q where c->>'id'=item->>'entityId';
   end if;
   if paths=array['inbox','contacts']then
    if brands is not null and(not exists(select 1 from jsonb_array_elements_text(item->'brandIds')b where b=any(brands))or exists(select 1 from jsonb_array_elements_text(item->'brandIds')b where not b=any(brands)))then denied=denied||jsonb_build_array(item);end if;
   elsif(paths[1]='pos'and not pos)or(paths[1]<>'pos'and not crm)or(brands is not null and(brand is null or not brand=any(brands)))then denied=denied||jsonb_build_array(item);end if;
  end loop;
  result=result||jsonb_build_object(array_to_string(paths,'.'),denied);
 end loop;
 return result;
end;$$;
create function public.sv_copilot_thread_list(p_company uuid,p_actor uuid,p_product text)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)into r from(select id,title,created_at,updated_at from public.sv_copilot_threads where company_id=p_company and actor_id=p_actor and product=p_product and smartvolt_private.copilot_thread_allowed(p_company,p_actor,id)order by updated_at desc,id limit 30)t;return r;
end;$$;
create function public.sv_copilot_thread_read(p_company uuid,p_actor uuid,p_product text,p_thread uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 if not smartvolt_private.copilot_thread_allowed(p_company,p_actor,p_thread)or not exists(select 1 from public.sv_copilot_threads where company_id=p_company and id=p_thread and product=p_product)then raise exception 'brand_scope';end if;
 select coalesce(jsonb_agg(to_jsonb(t)order by created_at,id),'[]'::jsonb)into r from(select id,role,body,result,created_at from public.sv_copilot_messages where company_id=p_company and thread_id=p_thread order by created_at desc,id desc limit 100)t;return r;
end;$$;
revoke all on function smartvolt_private.copilot_thread_allowed(uuid,uuid,uuid),smartvolt_private.protected_workspace(uuid,uuid,jsonb),public.sv_copilot_thread_list(uuid,uuid,text),public.sv_copilot_thread_read(uuid,uuid,text,uuid)from public,anon,authenticated;
grant execute on function smartvolt_private.copilot_thread_allowed(uuid,uuid,uuid),smartvolt_private.protected_workspace(uuid,uuid,jsonb),public.sv_copilot_thread_list(uuid,uuid,text),public.sv_copilot_thread_read(uuid,uuid,text,uuid)to service_role;

-- Generated explicit overrides; source anchors verified by scripts/build-abc-scopes.mjs.
create or replace function public.sv_meta_authorize(p_company uuid,p_actor uuid,p_write boolean default false,p_owner boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active' for share of m,c;
 if r is null or (p_write and r='viewer') or (p_owner and r<>'owner') then raise exception 'meta_access_denied';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company and p.product='crm' and p.status='active' and p.starts_at<=now() and (p.ends_at is null or p.ends_at>now()) for share;
 if not found then raise exception 'meta_product_required';end if;
 if not smartvolt_private.member_has_product(p_company,p_actor,'crm')then raise exception 'meta_product_required';end if;return r;
end;$$;

create or replace function smartvolt_private.wa_require_actor(p_company uuid,p_actor uuid) returns text
 language plpgsql security invoker set search_path='' as $$
declare v_role text;
begin
 perform smartvolt_private.wa_require_company(p_company);
 select role into v_role from public.sv_memberships where company_id=p_company and user_id=p_actor and status='active' for share;
 if v_role is null or v_role='viewer' then raise exception 'access_denied';end if;
 if not smartvolt_private.member_has_product(p_company,p_actor,'crm')then raise exception 'access_denied';end if;return v_role;
end;$$;

create or replace function public.sv_customer_authorize(p_company uuid,p_actor uuid,p_write boolean default false,p_crm boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active' for share of m,c;
 if r is null or (p_write and r='viewer') then raise exception 'customer_access_denied';end if;
 perform 1 from public.sv_company_products where company_id=p_company and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()) and (not p_crm or product='crm') for share;
 if not found then raise exception 'customer_product_required';end if;if (p_crm and not smartvolt_private.member_has_product(p_company,p_actor,'crm'))or(not p_crm and not(smartvolt_private.member_has_product(p_company,p_actor,'crm')or smartvolt_private.member_has_product(p_company,p_actor,'pos')))then raise exception 'customer_product_required';end if;return r;
end;$$;

create or replace function public.sv_copilot_authorize(p_company uuid,p_actor uuid,p_product text,p_write boolean default false)returns void
language plpgsql security invoker set search_path='' as $$begin
 perform public.sv_customer_authorize(p_company,p_actor,p_write,false);
 if p_product is null or p_product not in('crm','pos')then raise exception 'copilot_invalid';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company and p.product=p_product and p.status='active' and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now())for share;
 if not found or not smartvolt_private.member_has_product(p_company,p_actor,p_product)then raise exception 'copilot_product_required';end if;
end;$$;

create or replace function public.sv_wa_claim_send(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_body text,p_reply_to uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare c public.sv_wa_connections;cv public.sv_wa_conversations;m public.sv_wa_messages;cmd public.sv_wa_commands;v_fp text;v_conn uuid;v_name text;
 v_now bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 perform smartvolt_private.wa_require_actor(p_company,p_actor);
 perform public.sv_thread_scope(p_company,p_actor,'whatsapp',p_conversation);
 if p_client_id is null or p_body is null or char_length(btrim(p_body))<1 or char_length(p_body)>4096 then raise exception 'invalid_send';end if;
 v_fp:=encode(sha256(convert_to(jsonb_build_array('send',p_actor,p_conversation,p_body,p_reply_to)::text,'UTF8')),'hex');
 select connection_id into v_conn from public.sv_wa_conversations where company_id=p_company and id=p_conversation;
 select * into c from public.sv_wa_connections where company_id=p_company and id=v_conn for update;
 if not found then raise exception 'conversation_missing';end if;
 select * into cv from public.sv_wa_conversations where company_id=p_company and id=p_conversation for update;
 select * into cmd from public.sv_wa_commands where company_id=p_company and client_id=p_client_id;
 if found then
  if cmd.fingerprint<>v_fp or cmd.kind<>'send' or cmd.actor_id<>p_actor then raise exception 'idempotency_conflict';end if;
  select * into m from public.sv_wa_messages where id=cmd.message_id and company_id=p_company;
  return jsonb_build_object('dispatch',false,'message',to_jsonb(m),'connectionId',c.id,'remoteId',cv.remote_id,'remoteKind',cv.remote_kind);
 end if;
 if cv.revision<>p_expected or p_expected is null then raise exception 'revision_conflict';end if;
 if c.state<>'active' or c.webhook_verified_at is null then raise exception 'connection_not_ready';end if;
 if cv.last_inbound_at is null or cv.last_inbound_at<=v_now-86400000 then raise exception 'reply_window_closed';end if;
 if p_reply_to is not null and not exists(select 1 from public.sv_wa_messages where company_id=p_company and connection_id=c.id and conversation_id=cv.id and id=p_reply_to and provider_id is not null) then raise exception 'invalid_reply_target';end if;
 select display_name into v_name from public.sv_memberships where company_id=p_company and user_id=p_actor;
 insert into public.sv_wa_messages(company_id,connection_id,conversation_id,client_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,reply_to,state)
 values(p_company,c.id,cv.id,p_client_id,v_fp,'outgoing',p_body,'text',v_now,p_actor,left(coalesce(v_name,'同事'),200),p_reply_to,'dispatching') returning * into m;
 insert into public.sv_wa_commands(company_id,client_id,conversation_id,actor_id,kind,fingerprint,message_id) values(p_company,p_client_id,cv.id,p_actor,'send',v_fp,m.id);
 update public.sv_wa_conversations set revision=revision+1,last_message_at=greatest(last_message_at,v_now),updated_at=now() where id=cv.id;
 return jsonb_build_object('dispatch',true,'message',to_jsonb(m),'connectionId',c.id,'remoteId',cv.remote_id,'remoteKind',cv.remote_kind);
end;$$;

create or replace function public.sv_wa_conversation_command(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_kind text,p_body text default null,p_through_message uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare cv public.sv_wa_conversations;cmd public.sv_wa_commands;v_conn uuid;v_fp text;v_seq bigint;v_message uuid;v_name text;
 v_now bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 perform smartvolt_private.wa_require_actor(p_company,p_actor);
 perform public.sv_thread_scope(p_company,p_actor,'whatsapp',p_conversation);
 if p_client_id is null or p_kind is null or p_kind not in ('read','resolve','reopen','note') then raise exception 'invalid_conversation_command';end if;
 if p_kind='note' and (p_body is null or char_length(btrim(p_body))<1 or char_length(p_body)>12000) then raise exception 'invalid_note';end if;
 if p_kind<>'note' and p_body is not null then raise exception 'unexpected_body';end if;
 if p_kind<>'read' and p_through_message is not null then raise exception 'unexpected_read_cursor';end if;
 v_fp:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_actor,p_conversation,p_body,p_through_message)::text,'UTF8')),'hex');
 select connection_id into v_conn from public.sv_wa_conversations where company_id=p_company and id=p_conversation;
 perform 1 from public.sv_wa_connections where company_id=p_company and id=v_conn for update;
 if not found then raise exception 'conversation_missing';end if;
 select * into cv from public.sv_wa_conversations where company_id=p_company and id=p_conversation for update;
 select * into cmd from public.sv_wa_commands where company_id=p_company and client_id=p_client_id;
 if found then
  if cmd.fingerprint<>v_fp or cmd.actor_id<>p_actor then raise exception 'idempotency_conflict';end if;
  return to_jsonb(cv);
 end if;
 if cv.revision<>p_expected or p_expected is null then raise exception 'revision_conflict';end if;
 if p_kind='read' then
  select seq into v_seq from public.sv_wa_messages where company_id=p_company and conversation_id=cv.id and id=p_through_message;
  if not found then raise exception 'invalid_read_cursor';end if;
  update public.sv_wa_conversations set read_seq=greatest(read_seq,v_seq) where id=cv.id returning * into cv;
  update public.sv_wa_conversations set unread_count=(select count(*) from public.sv_wa_messages where company_id=p_company and conversation_id=cv.id and direction='incoming' and seq>cv.read_seq) where id=cv.id;
 elsif p_kind='note' then
  select display_name into v_name from public.sv_memberships where company_id=p_company and user_id=p_actor;
  insert into public.sv_wa_messages(company_id,connection_id,conversation_id,client_id,fingerprint,direction,body,message_type,provider_at,author_id,author_name,state)
  values(p_company,v_conn,cv.id,p_client_id,v_fp,'note',p_body,'note',v_now,p_actor,left(coalesce(v_name,'同事'),200),'delivered') returning id into v_message;
  update public.sv_wa_conversations set last_message_at=greatest(last_message_at,v_now) where id=cv.id;
 else
  update public.sv_wa_conversations set status=case when p_kind='resolve' then 'resolved' else 'open' end where id=cv.id;
 end if;
 insert into public.sv_wa_commands(company_id,client_id,conversation_id,actor_id,kind,fingerprint,message_id) values(p_company,p_client_id,cv.id,p_actor,p_kind,v_fp,v_message);
 update public.sv_wa_conversations set revision=revision+1,updated_at=now() where id=cv.id returning * into cv;
 return to_jsonb(cv);
end;$$;

create or replace function public.sv_meta_claim(p_company uuid,p_actor uuid,p_thread uuid,p_client uuid,p_expected bigint,p_body text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads;c public.sv_meta_connections;m public.sv_meta_messages;ms bigint:=floor(extract(epoch from now())*1000);
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 perform public.sv_thread_scope(p_company,p_actor,'meta',p_thread);
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

create or replace function public.sv_meta_command(p_company uuid,p_actor uuid,p_thread uuid,p_kind text,p_body text default null,p_through bigint default null)returns void
language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 perform public.sv_thread_scope(p_company,p_actor,'meta',p_thread);
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

create or replace function public.sv_meta_manage_thread(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_expected bigint,p_data jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads; prior jsonb; target jsonb; receipt public.sv_meta_thread_activity; assignee uuid; actor_name text;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 perform public.sv_thread_scope(p_company,p_actor,'meta',p_thread);
 -- Immutable receipts can be confirmed after an assignee has left the company.
 select * into receipt from public.sv_meta_thread_activity where company_id=p_company and command_id=p_command;
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
 assignee=(p_data->>'assignee_id')::uuid;if assignee is not null and(not smartvolt_private.member_has_product(p_company,assignee,'crm')or not smartvolt_private.member_brand_allowed(p_company,assignee,(select brand_id from public.sv_customer_threads where company_id=p_company and thread_id=p_thread and provider='meta')))then raise exception 'customer_assignee_invalid';end if;
 -- Lock memberships before the thread, consistently with access authorization.
 -- A removed/view-only assignee must be explicitly reassigned or cleared.
 if assignee is not null then
  perform 1 from public.sv_memberships where company_id=p_company and user_id=assignee and status='active' and role<>'viewer' for share;
  if not found then raise exception 'meta_assignee_invalid';end if;
 end if;
 select * into strict t from public.sv_meta_threads where company_id=p_company and id=p_thread for update;
 select * into receipt from public.sv_meta_thread_activity where company_id=p_company and command_id=p_command;
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
 update public.sv_meta_threads set customer_name=target->>'customer_name',assignee_id=assignee,priority=target->>'priority',
 follow_up_at=(target->>'follow_up_at')::timestamptz,next_step=target->>'next_step',status=target->>'status',revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sv_meta_thread_activity(company_id,command_id,thread_id,actor_id,actor_name,request,previous,next)
 values(p_company,p_command,t.id,p_actor,actor_name,jsonb_build_object('revision',p_expected,'data',p_data),prior,target);
 return jsonb_build_object('saved',true,'replayed',false);
end;$$;

create or replace function public.sv_wa_manage_thread(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_expected bigint,p_data jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_wa_conversations; prior jsonb; target jsonb; receipt public.sv_wa_thread_activity; assignee uuid; actor_name text;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 perform public.sv_thread_scope(p_company,p_actor,'whatsapp',p_thread);
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
 assignee=(p_data->>'assignee_id')::uuid;if assignee is not null and(not smartvolt_private.member_has_product(p_company,assignee,'crm')or not smartvolt_private.member_brand_allowed(p_company,assignee,(select brand_id from public.sv_customer_threads where company_id=p_company and thread_id=p_thread and provider='whatsapp')))then raise exception 'customer_assignee_invalid';end if;
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

create or replace function public.sv_ops_context(p_company uuid,p_actor uuid,p_provider text,p_thread uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;life jsonb;stages jsonb;tasks jsonb;handoff jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,false,true);
 perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);
 select * into strict l from public.sv_customer_threads where company_id=p_company and provider=p_provider and thread_id=p_thread;
 select to_jsonb(x)-array['company_id','created_at','updated_at','updated_by']into life from public.sv_customer_lifecycle x where company_id=p_company and customer_id=l.customer_id and brand_id=l.brand_id;
 select jsonb_agg(to_jsonb(s)-array['company_id','position']order by position,id)into stages from public.sv_lifecycle_stages s where company_id=p_company;
 select jsonb_build_object('summary',h.summary,'interest',h.interest,'next_step',h.next_step,'created_at',h.created_at)into handoff from public.sv_ai_handoffs h where company_id=p_company and customer_id=l.customer_id and brand_id=l.brand_id order by created_at desc,id desc limit 1;
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v from public.sv_followup_tasks f
  join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.customer_id=l.customer_id and f.brand_id=l.brand_id and f.status='open'order by f.due_at,f.id limit 20
 )q;
 return jsonb_build_object('lifecycle',life,'stages',stages,'followups',tasks,'handoff',handoff);
end;$$;

create or replace function public.sv_inquiry_auto_assign(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_expected bigint,p_command uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt public.sv_inquiry_commands;req jsonb;result jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);
 if p_command is null or p_provider is null or p_provider not in('meta','whatsapp') or p_expected is null then raise exception 'ops_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 req=jsonb_build_object('kind','auto-assign','provider',p_provider,'thread',p_thread,'revision',p_expected);
 select * into receipt from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if receipt.actor_id<>p_actor or receipt.request<>req then raise exception 'ops_idempotency_conflict';end if;return receipt.result;end if;
 result=smartvolt_private.ops_assign(p_company,p_provider,p_thread,p_actor,p_expected,true);
 insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

create or replace function public.sv_inquiry_meta_note(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_body text)returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.sv_inquiry_commands;req jsonb;result jsonb;begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 perform public.sv_thread_scope(p_company,p_actor,'meta',p_thread);
 req=jsonb_build_object('kind','meta-note','thread',p_thread,'body',p_body);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'customer_idempotency_conflict';end if;return r.result;end if;
 perform public.sv_meta_command(p_company,p_actor,p_thread,'note',p_body,null);
 result=jsonb_build_object('saved',true);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

create or replace function public.sv_customer_relink(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_customer text,p_expected bigint,p_command uuid,p_reason text)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;r public.sv_inquiry_commands;req jsonb;outcome jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);perform public.sv_customer_scope(p_company,p_actor,p_customer);
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

create or replace function public.sv_customer_update(p_company uuid,p_actor uuid,p_customer text,p_expected bigint,p_command uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sv_customers;r public.sv_inquiry_commands;req jsonb;outcome jsonb;doc public.sv_workspaces;cs jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true);
 perform public.sv_customer_scope(p_company,p_actor,p_customer,true);
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
 else
 -- A first POS operation can already hold a canonical customer projection
 -- before that customer appears in the compatibility workspace. Invalidate
 -- that prepared operation too, without inventing a legacy contact.
 update public.sv_workspaces set revision=revision+1,updated_at=now()where company_id=p_company;
 end if;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)
 select p_company,p_customer,b.brand_id,'profile:'||p_command||':'||b.brand_id,'customer-updated',p_actor,jsonb_build_object('name',p_data->>'name')from public.sv_customer_brands b where b.company_id=p_company and b.customer_id=p_customer;
 outcome=jsonb_build_object('saved',true);insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,outcome,now());return outcome;
end;$$;

create or replace function public.sv_ai_claim(p_company uuid,p_actor uuid,p_request uuid,p_brand text,p_source text,p_source_id text,p_workspace_revision bigint,p_source_revision bigint,p_model text,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare settings public.sv_ai_settings;doc public.sv_workspaces;r public.sv_ai_requests;t public.sv_meta_threads;day_start timestamptz;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 perform public.sv_member_scope(p_company,p_actor,p_brand,'crm');
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

create or replace function public.sv_translation_claim(p_company uuid,p_actor uuid,p_request uuid,p_data jsonb,p_model text,p_hash text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s public.sv_ai_settings;r public.sv_ai_requests;body text;context jsonb;day_start timestamptz;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 perform public.sv_member_scope(p_company,p_actor,p_data->>'brandId','crm');
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

create or replace function public.sv_website_access(p_company uuid,p_actor uuid,p_brand text)returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform public.sv_member_scope(p_company,p_actor,p_brand,'crm');
 perform 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active'and m.role in('owner','manager')and c.status='active'for share of m,c;
 if not found then raise exception 'website_access_denied';end if;
 perform 1 from public.sv_company_products where company_id=p_company for share;
 if not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm'and status='active'and starts_at<=statement_timestamp()and(ends_at is null or ends_at>statement_timestamp()))then raise exception 'website_product_required';end if;
 if not exists(select 1 from public.sv_workspaces w cross join lateral jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=p_brand)then raise exception 'website_brand_scope';end if;
end;$$;

create or replace function public.sv_customer_list(p_company uuid,p_actor uuid,p_brand text default null,p_search text default '',p_after text default null)returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 perform public.sv_customer_authorize(p_company,p_actor);
 if p_search is null or length(p_search)>100 or length(p_after)>100 then raise exception 'customer_query_invalid';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'revision',revision)order by id),'[]'::jsonb)into result from(
 select c.* from public.sv_customers c where c.company_id=p_company and exists(select 1 from public.sv_customer_brands sb where sb.company_id=c.company_id and sb.customer_id=c.id and smartvolt_private.member_brand_allowed(p_company,p_actor,sb.brand_id))and(p_after is null or c.id>p_after)
 and(p_search='' or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)
 and(p_brand is null or exists(select 1 from public.sv_customer_brands b where b.company_id=c.company_id and b.customer_id=c.id and b.brand_id=p_brand and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)))order by c.id limit 51)q;
 return result;
end;$$;

create or replace function public.sv_commit_booking(p_company uuid,p_actor uuid,p_command uuid,p_request uuid,p_expected bigint,p_request_revision bigint,p_selection jsonb,p_payload jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.sv_booking_requests;r public.sv_inquiry_commands;req jsonb;result jsonb;ap jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 perform public.sv_authorize(p_company,p_actor,'pos',true);perform public.sv_member_scope(p_company,p_actor,(select brand_id from public.sv_booking_requests where company_id=p_company and id=p_request),'pos');
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

create or replace function public.sv_booking_request(p_company uuid,p_actor uuid,p_command uuid,p_id uuid,p_action text,p_data jsonb,p_expected bigint default 0)returns jsonb language plpgsql security invoker set search_path='' as $$
declare l public.sv_customer_threads;b public.sv_booking_requests;r public.sv_inquiry_commands;req jsonb;outcome jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_id is null or p_action is null or p_action not in ('create','confirm','cancel')then raise exception 'customer_booking_invalid';end if;
 if p_action='create'then perform public.sv_thread_scope(p_company,p_actor,p_data->>'provider',(p_data->>'threadId')::uuid);else perform public.sv_member_scope(p_company,p_actor,(select brand_id from public.sv_booking_requests where company_id=p_company and id=p_id));end if;
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

create or replace function public.sv_ops_action(p_company uuid,p_actor uuid,p_command uuid,p_action text,p_data jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare role text;req jsonb;r public.sv_inquiry_commands;result jsonb;cfg public.sv_ops_settings;x jsonb;n integer;item record;
 life public.sv_customer_lifecycle;link public.sv_customer_threads;ai public.sv_ai_requests;t record;task public.sv_followup_tasks;target uuid;brands jsonb;doc public.sv_workspaces;
begin
 role=public.sv_customer_authorize(p_company,p_actor,true,true);
 if p_command is null or p_action is null or jsonb_typeof(p_data)is distinct from 'object' or octet_length(p_data::text)>40000 then raise exception 'ops_invalid';end if;
 if p_action in('settings','agent')and exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and brand_ids is not null)then raise exception 'ops_brand_scope';end if;
 if p_action='stage'then perform public.sv_member_scope(p_company,p_actor,p_data->>'brandId','crm');elsif p_action in('handoff','followup-create')then perform public.sv_thread_scope(p_company,p_actor,p_data->>'provider',(p_data->>'threadId')::uuid);elsif p_action='followup-update'then perform public.sv_member_scope(p_company,p_actor,(select brand_id from public.sv_followup_tasks where company_id=p_company and id=(p_data->>'id')::uuid),'crm');end if;
 req=jsonb_build_object('kind','operations','action',p_action,'data',p_data);
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||p_command::text,0));
 select * into r from public.sv_inquiry_commands where company_id=p_company and command_id=p_command;
 if found then if r.actor_id<>p_actor or r.request<>req then raise exception 'ops_idempotency_conflict';end if;return r.result;end if;
 if p_action in('settings','agent')and role not in('owner','manager')then raise exception 'ops_access_denied';end if;
 if p_action='settings'then
  select * into strict cfg from public.sv_ops_settings where company_id=p_company for update;
  if cfg.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  x=p_data->'data';
  if jsonb_typeof(x)is distinct from'object' or jsonb_typeof(x->'stages')is distinct from'array' or jsonb_array_length(x->'stages')not between 2 and 20
  or jsonb_typeof(x->'rules')is distinct from'array' or jsonb_array_length(x->'rules')>20
  or jsonb_typeof(x->'routingEnabled')is distinct from'boolean' or jsonb_typeof(x->'followupsEnabled')is distinct from'boolean'
  or jsonb_typeof(x->'followupStageIds')is distinct from'array' or jsonb_array_length(x->'followupStageIds')>20
  or(x->>'followupMinutes')::integer not between 5 and 43200
  or x->>'followupMinutes'is null then raise exception 'ops_invalid';end if;
  if(select count(distinct s->>'id')from jsonb_array_elements(x->'stages')s)<>jsonb_array_length(x->'stages')
  or not exists(select 1 from jsonb_array_elements(x->'stages')s where s->>'id'='new' and s->>'kind'='open' and s->'active'='true')
  or exists(select 1 from public.sv_lifecycle_stages s where s.company_id=p_company and not exists(select 1 from jsonb_array_elements(x->'stages')v where v->>'id'=s.id))then raise exception 'ops_stages_invalid';end if;
  if exists(select 1 from public.sv_lifecycle_stages s join jsonb_array_elements(x->'stages')v on v->>'id'=s.id where s.company_id=p_company and v->>'kind'<>s.kind)then raise exception 'ops_stage_kind_invalid';end if;
  for item in select a.v,a.n from jsonb_array_elements(x->'stages')with ordinality a(v,n)loop
   if length(item.v->>'id')not between 1 and 100 or length(btrim(item.v->>'name'))not between 1 and 30 or jsonb_typeof(item.v->'active')is distinct from'boolean'then raise exception 'ops_stages_invalid';end if;
   insert into public.sv_lifecycle_stages values(p_company,item.v->>'id',btrim(item.v->>'name'),item.v->>'tone',item.v->>'kind',(item.v->>'active')::boolean,item.n)
   on conflict(company_id,id)do update set name=excluded.name,tone=excluded.tone,kind=excluded.kind,active=excluded.active,position=excluded.position;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(x->'followupStageIds')v where not exists(select 1 from public.sv_lifecycle_stages s where s.company_id=p_company and s.id=v and s.active and s.kind='open'))then raise exception 'ops_stages_invalid';end if;
  select payload#>'{scope,brands}'into strict brands from public.sv_workspaces where company_id=p_company;
  if(select count(distinct v->>'id')from jsonb_array_elements(x->'rules')v)<>jsonb_array_length(x->'rules')then raise exception 'ops_rules_invalid';end if;
  for item in select v from jsonb_array_elements(x->'rules')v loop
   if(item.v->>'id')::uuid is null or length(btrim(item.v->>'name'))not between 1 and 60 or item.v->>'method'not in('least_open','round_robin')
   or item.v->>'channel'not in('all','whatsapp','messenger','instagram')or(item.v->>'maxOpen')::integer not between 1 and 500
   or jsonb_typeof(item.v->'enabled')is distinct from'boolean'or jsonb_typeof(item.v->'onlineOnly')is distinct from'boolean'
   or jsonb_typeof(item.v->'tags')is distinct from'array'or jsonb_array_length(item.v->'tags')>10
   or length(item.v->>'team')>40 or item.v->>'maxOpen'is null or item.v->>'method'is null or item.v->>'channel'is null or item.v->>'name'is null or item.v->>'team'is null
   or(item.v->>'brandId'is not null and not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=item.v->>'brandId'))then raise exception 'ops_rules_invalid';end if;
   if exists(select 1 from jsonb_array_elements(item.v->'tags')v where jsonb_typeof(v)<>'string'or length(v#>>'{}')not between 1 and 40)then raise exception 'ops_rules_invalid';end if;
  end loop;
  update public.sv_ops_settings set data=x,revision=revision+1,updated_at=now()where company_id=p_company;
  result=jsonb_build_object('saved',true,'revision',cfg.revision+1);
 elsif p_action='agent'then
  target=(p_data->>'userId')::uuid;
  perform 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=target and m.status='active'and m.role<>'viewer'for share;
  if not found then raise exception 'ops_agent_invalid';end if;
  perform pg_advisory_xact_lock(hashtextextended('agent:'||p_company::text||target::text,0));
  select payload#>'{scope,brands}'into strict brands from public.sv_workspaces where company_id=p_company;
  if length(p_data->>'team')>40 or p_data->>'team'is null or(p_data->>'capacity')::integer not between 1 and 500 or p_data->>'capacity'is null
  or jsonb_typeof(p_data->'paused')is distinct from'boolean'or jsonb_typeof(p_data->'brandIds')is distinct from'array'or jsonb_array_length(p_data->'brandIds')>100 then raise exception 'ops_invalid';end if;
  if exists(select 1 from jsonb_array_elements(p_data->'brandIds')v where jsonb_typeof(v)<>'string'or not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=v#>>'{}'))then raise exception 'ops_brand_scope';end if;
  select coalesce((select revision from public.sv_agent_routing where company_id=p_company and user_id=target),0)into n;
  if n is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  insert into public.sv_agent_routing(company_id,user_id,team,capacity,brand_ids,paused,revision)
  values(p_company,target,btrim(p_data->>'team'),(p_data->>'capacity')::integer,p_data->'brandIds',(p_data->>'paused')::boolean,n+1)
  on conflict(company_id,user_id)do update set team=excluded.team,capacity=excluded.capacity,brand_ids=excluded.brand_ids,paused=excluded.paused,revision=excluded.revision;
  result=jsonb_build_object('saved',true);
 elsif p_action in('stage','handoff')then
  if p_action='handoff'then
   select * into strict ai from public.sv_ai_requests where company_id=p_company and request_id=(p_data->>'requestId')::uuid and actor_id=p_actor and status='completed'for share;
   if ai.product<>'crm'or ai.feature<>'reply'or ai.source not in('meta','whatsapp')or ai.source<>p_data->>'provider'or ai.source_id is distinct from p_data->>'threadId'then raise exception 'ops_ai_context_changed';end if;
   -- Use the saved, validated answer, never a client-supplied AI label/summary.
   select * into strict doc from public.sv_workspaces where company_id=p_company for share;
   if doc.revision<>ai.workspace_revision then raise exception 'ops_ai_context_changed';end if;
   if ai.source='meta'then perform 1 from public.sv_meta_threads where company_id=p_company and id=ai.source_id::uuid for share;
   else perform 1 from public.sv_wa_conversations where company_id=p_company and id=ai.source_id::uuid for share;end if;
   select * into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=ai.source and thread_id=ai.source_id::uuid;
   if t.revision<>ai.source_revision or t.revision is distinct from(p_data->>'revision')::bigint or t.brand_id<>ai.brand_id then raise exception 'ops_ai_context_changed';end if;
   select * into strict link from public.sv_customer_threads where company_id=p_company and provider=ai.source and thread_id=ai.source_id::uuid for share;
   if link.customer_id is distinct from p_data->>'customerId'or link.revision is distinct from(p_data->>'linkRevision')::bigint then raise exception 'ops_ai_context_changed';end if;
   select * into strict life from public.sv_customer_lifecycle where company_id=p_company and customer_id=link.customer_id and brand_id=link.brand_id for update;
   if p_data->>'stageId'is not null and life.revision is distinct from(p_data->>'lifecycleRevision')::bigint then raise exception 'ops_revision_conflict';end if;
   if length(ai.result->>'summary')not between 1 and 1200 or length(ai.result->>'nextStep')not between 1 and 300 or ai.result->>'interest'not in('high','medium','low','unknown')then raise exception 'ops_ai_invalid';end if;
   insert into public.sv_ai_handoffs(company_id,id,request_id,customer_id,brand_id,provider,thread_id,actor_id,summary,interest,next_step)
   values(p_company,p_command,ai.request_id,link.customer_id,link.brand_id,ai.source,ai.source_id::uuid,p_actor,ai.result->>'summary',ai.result->>'interest',ai.result->>'nextStep');
   insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,link.customer_id,link.brand_id,'ai-handoff:'||p_command,'ai-handoff',p_actor,jsonb_build_object('requestId',ai.request_id,'summary',ai.result->>'summary','interest',ai.result->>'interest','nextStep',ai.result->>'nextStep','reason',p_data->>'reason'));
  else
   select * into strict life from public.sv_customer_lifecycle where company_id=p_company and customer_id=p_data->>'customerId'and brand_id=p_data->>'brandId'for update;
   if life.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  end if;
  if p_data->>'stageId'is not null then
   if length(btrim(p_data->>'reason'))not between 1 and 500 or p_data->>'reason'is null then raise exception 'ops_reason_required';end if;
   perform 1 from public.sv_lifecycle_stages where company_id=p_company and id=p_data->>'stageId'and active for share;
   if not found then raise exception 'ops_stage_invalid';end if;
   update public.sv_customer_lifecycle set stage_id=p_data->>'stageId',reason=btrim(p_data->>'reason'),updated_by=p_actor,revision=revision+1,updated_at=now()
   where company_id=p_company and customer_id=life.customer_id and brand_id=life.brand_id;
  elsif p_action='stage'then raise exception 'ops_stage_invalid';end if;
  result=jsonb_build_object('saved',true);
 elsif p_action='followup-create'then
  select * into strict link from public.sv_customer_threads where company_id=p_company and provider=p_data->>'provider'and thread_id=(p_data->>'threadId')::uuid for share;
  target=(p_data->>'ownerId')::uuid;
  if target is not null then
   perform 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=target and m.status='active'and m.role<>'viewer'for share;
   if not found then raise exception 'ops_agent_invalid';end if;
  end if;
  if length(btrim(p_data->>'title'))not between 1 and 200 or p_data->>'title'is null or p_data->>'dueAt'is null or not isfinite((p_data->>'dueAt')::timestamptz)
  or(p_data->>'dueAt')::timestamptz>now()+interval '366 days'then raise exception 'ops_invalid';end if;
  insert into public.sv_followup_tasks(company_id,id,customer_id,brand_id,provider,thread_id,title,due_at,owner_id,source_key)
  values(p_company,p_command,link.customer_id,link.brand_id,link.provider,link.thread_id,btrim(p_data->>'title'),(p_data->>'dueAt')::timestamptz,target,'manual:'||p_command);
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,link.customer_id,link.brand_id,'followup:'||p_command,'followup-created',p_actor,jsonb_build_object('taskId',p_command,'title',p_data->>'title','dueAt',p_data->>'dueAt','ownerId',target));
  result=jsonb_build_object('saved',true);
 elsif p_action='followup-update'then
  select * into strict task from public.sv_followup_tasks where company_id=p_company and id=(p_data->>'id')::uuid for update;
  if task.owner_id is not null and task.owner_id<>p_actor and role not in('owner','manager')and exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=task.owner_id and m.status='active'and m.role<>'viewer')then raise exception 'ops_access_denied';end if;
  if task.revision is distinct from(p_data->>'revision')::bigint then raise exception 'ops_revision_conflict';end if;
  if p_data->>'status'is null or p_data->>'status'not in('open','done','cancelled')or(task.status<>'open'and p_data->>'status'='open')then raise exception 'ops_invalid';end if;
  if p_data->>'dueAt'is not null and(not isfinite((p_data->>'dueAt')::timestamptz)or(p_data->>'dueAt')::timestamptz>now()+interval '366 days')then raise exception 'ops_invalid';end if;
  update public.sv_followup_tasks set status=p_data->>'status',due_at=coalesce((p_data->>'dueAt')::timestamptz,due_at),owner_id=case when exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=task.owner_id and m.status='active'and m.role<>'viewer')then task.owner_id else p_actor end,revision=revision+1,updated_at=now()where company_id=p_company and id=task.id;
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,task.customer_id,task.brand_id,'followup:'||p_command,'followup-updated',p_actor,jsonb_build_object('taskId',task.id,'status',p_data->>'status','dueAt',p_data->>'dueAt'));
  result=jsonb_build_object('saved',true);
 else raise exception 'ops_invalid';end if;
 insert into public.sv_inquiry_commands values(p_company,p_command,p_actor,req,result,now());return result;
end;$$;

create or replace function public.sv_ops_read(p_company uuid,p_actor uuid,p_brand text default null,p_stage text default null,p_search text default '',p_before timestamptz default null,p_before_key text default null,p_from timestamptz default null,p_to timestamptz default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;settings public.sv_ops_settings;stages jsonb;rows jsonb;tasks jsonb;members jsonb;metrics jsonb;brands jsonb;pos boolean;actor_role text;task_count bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 if p_search is null or length(p_search)>100 or(p_before is null)<>(p_before_key is null)or length(p_before_key)>400
 or p_from is null or p_to is null or not isfinite(p_from)or not isfinite(p_to)or p_to<=p_from or p_to>p_from+interval '367 days'then raise exception 'ops_query_invalid';end if;
 select * into strict settings from public.sv_ops_settings where company_id=p_company;
 select(select jsonb_agg(b)from jsonb_array_elements(payload#>'{scope,brands}')b where smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id'))into strict brands from public.sv_workspaces where company_id=p_company;
 if p_brand is not null and not exists(select 1 from jsonb_array_elements(brands)b where b->>'id'=p_brand)then raise exception 'ops_brand_scope';end if;
 if p_stage is not null and not exists(select 1 from public.sv_lifecycle_stages where company_id=p_company and id=p_stage)then raise exception 'ops_query_invalid';end if;
 pos=smartvolt_private.member_has_product(p_company,p_actor,'pos')and exists(select 1 from public.sv_company_products where company_id=p_company and product='pos'and status='active'and starts_at<=now()and(ends_at is null or ends_at>now()));
 select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'tone',s.tone,'kind',s.kind,'active',s.active,'count',(
 select count(*)from public.sv_customer_lifecycle l join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
 where l.company_id=p_company and l.stage_id=s.id and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))and(p_search=''or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)))order by s.position,s.id)
 into stages from public.sv_lifecycle_stages s where s.company_id=p_company;
 select coalesce(jsonb_agg(v order by at desc,key),'[]'::jsonb)into rows from(
  select l.updated_at at,jsonb_build_array(l.customer_id,l.brand_id)::text key,
  jsonb_build_object('key',jsonb_build_array(l.customer_id,l.brand_id)::text,'customer_id',l.customer_id,'brand_id',l.brand_id,'name',c.name,'stage_id',l.stage_id,
  'revision',l.revision,'reason',l.reason,'updated_at',l.updated_at,'priority',coalesce(t.priority,'normal'),'owner_name',m.display_name,'follow_up_at',t.follow_up_at,
  'provider',t.provider,'thread_id',t.thread_id,'interest',h.interest,'summary',h.summary,'next_step',h.next_step)v
  from public.sv_customer_lifecycle l join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
  left join lateral(select i.*from smartvolt_private.ops_inquiries i where i.company_id=l.company_id and i.customer_id=l.customer_id and i.brand_id=l.brand_id order by(i.status='open')desc,i.updated_at desc,i.provider,i.thread_id limit 1)t on true
  left join public.sv_memberships m on m.company_id=l.company_id and m.user_id=t.assignee_id and m.status='active'and m.role<>'viewer'
  left join lateral(select a.*from public.sv_ai_handoffs a where a.company_id=l.company_id and a.customer_id=l.customer_id and a.brand_id=l.brand_id order by a.created_at desc,a.id desc limit 1)h on true
  where l.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,l.brand_id)and(p_brand is null or l.brand_id=p_brand))and(p_stage is null or l.stage_id=p_stage)
  and(p_search=''or strpos(lower(c.name||' '||c.phone),lower(p_search))>0)
  and(p_before is null or l.updated_at<p_before or(l.updated_at=p_before and jsonb_build_array(l.customer_id,l.brand_id)::text>p_before_key))
  order by l.updated_at desc,key limit 51
 )q;
 select count(*)into task_count from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'));
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v
  from public.sv_followup_tasks f join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id
  left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.status='open'and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  order by f.due_at,f.id limit 50
 )q;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'display_name',m.display_name,'role',m.role,'team',coalesce(a.team,''),
 'capacity',coalesce(a.capacity,20),'brand_ids',coalesce(a.brand_ids,'[]'),'paused',coalesce(a.paused,false),'revision',coalesce(a.revision,0),
 'presence',case when a.seen_at>now()-interval '3 minutes'then a.presence else'offline'end,
 'open_count',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and i.assignee_id=m.user_id and i.status='open'))order by m.display_name,m.user_id),'[]'::jsonb)
 into members from public.sv_memberships m left join public.sv_agent_routing a on a.company_id=m.company_id and a.user_id=m.user_id
 where m.company_id=p_company and m.status='active'and m.role<>'viewer';
 select jsonb_build_object(
 'inquiries',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and(p_brand is null or i.brand_id=p_brand))and i.created_at>=p_from and i.created_at<p_to),
 'confirmedBookings',(select count(*)from(select coalesce(e.detail->>'requestId',e.detail->>'id')key,min(e.created_at)at from public.sv_customer_events e
 where e.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id)and(p_brand is null or e.brand_id=p_brand))and(e.kind='booking-confirm'or(pos and e.kind='pos-appointment'and e.detail->>'status'in('confirmed','checked_in','completed','no_show')))
 group by coalesce(e.detail->>'requestId',e.detail->>'id'))q where key is not null and at>=p_from and at<p_to),
 'attended',case when pos then(select count(*)from(select e.detail->>'id'key,min(e.created_at)at from public.sv_customer_events e where e.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id)and(p_brand is null or e.brand_id=p_brand))and e.kind='pos-appointment'and e.detail->>'status'in('checked_in','completed')group by e.detail->>'id')q where key is not null and at>=p_from and at<p_to)else 0 end,
 'unassigned',(select count(*)from smartvolt_private.ops_inquiries i where i.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and(p_brand is null or i.brand_id=p_brand))and i.status='open'and not exists(select 1 from public.sv_memberships m where m.company_id=i.company_id and m.user_id=i.assignee_id and m.status='active'and m.role<>'viewer')),
 'overdue',(select count(*)from(
  select provider,thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id)and(p_brand is null or i.brand_id=p_brand))and i.status='open'and i.follow_up_at<=now()
  union select provider,thread_id from public.sv_followup_tasks f where f.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and f.status='open'and f.due_at<=now()
 )q),
 'receivedCents',case when pos then(select coalesce(sum(p.amount_cents),0)from public.sv_pos_payments p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
 where p.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and(p_brand is null or o.brand_id=p_brand))and p.occurred_at>=extract(epoch from p_from)*1000 and p.occurred_at<extract(epoch from p_to)*1000)else null end,
 'refundedCents',case when pos then(select coalesce(sum(p.amount_cents),0)from public.sv_pos_refunds p join public.sv_pos_orders o on o.company_id=p.company_id and o.id=p.order_id
 where p.company_id=p_company and(smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and(p_brand is null or o.brand_id=p_brand))and p.occurred_at>=extract(epoch from p_from)*1000 and p.occurred_at<extract(epoch from p_to)*1000)else null end
 )into metrics;
 return jsonb_build_object('settings',settings.data,'revision',settings.revision,'stages',stages,'records',rows,'followups',tasks,'followupCount',task_count,
 'members',members,'metrics',metrics,'brands',brands,'checkedAt',now());
end;$$;

create or replace function public.sv_ops_tasks(p_company uuid,p_actor uuid,p_brand text default null,p_after timestamptz default null,p_after_id uuid default null)returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_role text;tasks jsonb;total bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 if(p_after is null)<>(p_after_id is null)or(p_after is not null and not isfinite(p_after))then raise exception 'ops_query_invalid';end if;
 if p_brand is not null and not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=p_brand)then raise exception 'ops_brand_scope';end if;
 select count(*)into total from public.sv_followup_tasks f where f.company_id=p_company and f.status='open'and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'));
 select coalesce(jsonb_agg(v order by due,id),'[]'::jsonb)into tasks from(
  select f.due_at due,f.id,to_jsonb(f)-array['company_id','source_key','created_at','updated_at']||jsonb_build_object('name',c.name,'owner_name',m.display_name,'owner_active',m.user_id is not null)v
  from public.sv_followup_tasks f join public.sv_customers c on c.company_id=f.company_id and c.id=f.customer_id
  left join public.sv_memberships m on m.company_id=f.company_id and m.user_id=f.owner_id and m.status='active'and m.role<>'viewer'
  where f.company_id=p_company and f.status='open'and(smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id)and(p_brand is null or f.brand_id=p_brand))and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  and(p_after is null or f.due_at>p_after or(f.due_at=p_after and f.id>p_after_id))order by f.due_at,f.id limit 51
 )q;
 return jsonb_build_object('tasks',tasks,'total',total);
end;$$;

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
  'knowledge',coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','brandId',a->>'brandId','title',a->>'title','content',a->>'content','source',a->>'source','revision',(a->>'revision')::integer))from jsonb_array_elements(doc.payload#>'{studio,articles}')a where has_crm and a->>'status'='approved'and(a->>'validUntil')::date>=(now()at time zone'Asia/Hong_Kong')::date and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('id','pos-service:'||(a->>'id'),'brandId',a->>'brandId','title',a->>'name','content','POS目錄服務：'||(a->>'name')||'；目錄收費 HK$'||round((a->>'priceCents')::numeric/100,2)::text||'；時長 '||(a->>'durationMinutes')||' 分鐘。目錄不代表已確認空位。','source','公司 POS 服務設定','revision',doc.revision))from jsonb_array_elements(doc.payload#>'{pos,catalog}')a where has_pos and coalesce((a->>'active')::boolean,false)and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')and(p_brand is null or a->>'brandId'=p_brand)),'[]'::jsonb),
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

create or replace function public.sv_inbox_list(p_company uuid,p_actor uuid,p_queue text default 'all',p_channel text default 'all',p_search text default '',p_before timestamptz default null,p_before_key text default null)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,false,true);
 if p_queue is null or p_queue not in ('all','mine','unassigned','overdue','priority','unread','resolved') or p_channel is null or p_channel not in ('all','whatsapp','messenger','instagram') or p_search is null or length(p_search)>100 or(p_before is null)<>(p_before_key is null)then raise exception 'customer_query_invalid';end if;
 with channel_rows as(
  select 'meta:'||t.id key,'meta' provider,t.id,c.channel,c.brand_id,t.revision,t.customer_name,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.status,t.last_inbound_at,t.updated_at,
   (select count(*)::integer from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound' and m.seq>t.read_seq)unread_count,
   coalesce((select left(m.body,180) from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction<>'note' order by seq desc limit 1),'')preview
  from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)
  union all
  select 'whatsapp:'||t.id,'whatsapp',t.id,'whatsapp',t.brand_id,t.revision,t.customer_name,t.assignee_id,t.priority,t.follow_up_at,t.next_step,t.status,t.last_inbound_at,t.updated_at,t.unread_count,
   coalesce((select left(m.body,180) from public.sv_wa_messages m where m.company_id=t.company_id and m.conversation_id=t.id and m.direction<>'note' order by seq desc limit 1),'')
  from public.sv_wa_conversations t where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id)
 ), scoped as materialized(
  select r.*,l.customer_id,l.revision link_revision,c.name,coalesce(a.status='active' and a.role<>'viewer',false) assignee_active from channel_rows r
  join public.sv_customer_threads l on l.company_id=p_company and l.provider=r.provider and l.thread_id=r.id
  join public.sv_customers c on c.company_id=l.company_id and c.id=l.customer_id
  left join public.sv_memberships a on a.company_id=p_company and a.user_id=r.assignee_id
  where (p_channel='all' or r.channel=p_channel)and(p_search='' or strpos(lower(c.name||' '||c.phone||' '||r.customer_name),lower(p_search))>0)
 ), filtered as(
 select * from scoped where case p_queue when 'mine' then status='open' and assignee_id=p_actor when 'unassigned' then status='open' and not assignee_active when 'overdue' then status='open' and (follow_up_at<=now()or exists(select 1 from public.sv_followup_tasks f where f.company_id=p_company and f.provider=scoped.provider and f.thread_id=scoped.id and f.status='open'and f.due_at<=now())) when 'priority' then status='open' and priority in ('high','urgent') when 'unread' then status='open' and unread_count>0 when 'resolved' then status='resolved' else status='open' end
 ), page as(select * from filtered where p_before is null or(updated_at,key)<(p_before,p_before_key)order by updated_at desc,key desc limit 51)
 select jsonb_build_object('threads',coalesce((select jsonb_agg(to_jsonb(p) order by updated_at desc,key desc)from page p),'[]'::jsonb),'counts',(select jsonb_build_object('all',count(*)filter(where status='open'),'mine',count(*)filter(where status='open' and assignee_id=p_actor),'unassigned',count(*)filter(where status='open' and not assignee_active),'overdue',count(*)filter(where status='open' and (follow_up_at<=now()or exists(select 1 from public.sv_followup_tasks f where f.company_id=p_company and f.provider=scoped.provider and f.thread_id=scoped.id and f.status='open'and f.due_at<=now()))),'priority',count(*)filter(where status='open' and priority in ('high','urgent')),'unread',count(*)filter(where status='open' and unread_count>0),'resolved',count(*)filter(where status='resolved'))from scoped))into result;return result;
end;$$;

create or replace function public.sv_meta_inbox_list(p_company uuid,p_actor uuid,p_queue text default 'all',p_channel text default 'all',p_search text default '',p_before timestamptz default null,p_before_id uuid default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare output jsonb;
begin
 perform public.sv_meta_authorize(p_company,p_actor,false,false);
 if p_queue is null or p_queue not in ('all','mine','unassigned','overdue','priority','unread','resolved')
 or p_channel is null or p_channel not in ('all','messenger','instagram') or p_search is null or length(p_search)>100
 or (p_before is null)<>(p_before_id is null) then raise exception 'meta_query_invalid';end if;
 with scoped as materialized(
  select t.*,coalesce(a.status='active' and a.role<>'viewer',false) as assignee_active,
   (select count(*)::integer from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound' and m.seq>t.read_seq) as unread_count
  from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id
  left join public.sv_memberships a on a.company_id=t.company_id and a.user_id=t.assignee_id
  where t.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id) and (p_channel='all' or c.channel=p_channel)
  and (p_search='' or strpos(lower(t.customer_name||' '||t.peer_id),lower(p_search))>0)
 ), filtered as(
  select * from scoped where case p_queue
   when 'resolved' then status='resolved'
   when 'mine' then status='open' and assignee_id=p_actor
   when 'unassigned' then status='open' and not assignee_active
   when 'overdue' then status='open' and follow_up_at<=now()
   when 'priority' then status='open' and priority in ('high','urgent')
   when 'unread' then status='open' and unread_count>0
   else status='open' end
 ), page as(
  select * from filtered where p_before is null or (updated_at,id)<(p_before,p_before_id)
  order by updated_at desc,id desc limit 101
 )
 select jsonb_build_object('threads',coalesce((select jsonb_agg(to_jsonb(page) order by updated_at desc,id desc) from page),'[]'::jsonb),
 'counts',(select jsonb_build_object(
  'all',count(*)filter(where status='open'),
  'mine',count(*)filter(where status='open' and assignee_id=p_actor),
  'unassigned',count(*)filter(where status='open' and not assignee_active),
  'overdue',count(*)filter(where status='open' and follow_up_at<=now()),
  'priority',count(*)filter(where status='open' and priority in ('high','urgent')),
  'unread',count(*)filter(where status='open' and unread_count>0),
  'resolved',count(*)filter(where status='resolved')) from scoped)) into output;
 return output;
end;$$;

create or replace function public.sv_ops_attention(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor_role text;presence text;due bigint;
begin
 actor_role=public.sv_customer_authorize(p_company,p_actor,false,true);
 select case when seen_at>now()-interval '3 minutes'then a.presence else'offline'end into presence from public.sv_agent_routing a where company_id=p_company and user_id=p_actor;
 select count(*)into due from(
  select f.provider,f.thread_id from public.sv_followup_tasks f where f.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,f.brand_id) and f.status='open'and f.due_at<=now()and(actor_role in('owner','manager')or f.owner_id=p_actor or not exists(select 1 from public.sv_memberships om where om.company_id=f.company_id and om.user_id=f.owner_id and om.status='active'and om.role<>'viewer'))
  union select i.provider,i.thread_id from smartvolt_private.ops_inquiries i where i.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,i.brand_id) and i.status='open'and i.follow_up_at<=now()and(actor_role in('owner','manager')or i.assignee_id=p_actor or i.assignee_id is null)
 )q;
 return jsonb_build_object('presence',coalesce(presence,'offline'),'due',due,'canEdit',actor_role<>'viewer');
end;$$;

create or replace function public.sv_read_pos_ledger(
 p_company uuid,p_actor uuid,p_brand text,p_from bigint,p_to bigint,p_limit integer,
 p_before_at bigint default null,p_before_id text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
   where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active')
 then raise exception 'access_denied'; end if;
 if not exists(select 1 from public.sv_company_products where company_id=p_company and product='pos'
   and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()))
 then raise exception 'product_not_purchased'; end if;
 if p_from is null or p_to is null or p_limit is null or p_from<0 or p_to<=p_from
  or p_to-p_from>31622400000 or p_limit<1 or p_limit>100
  or (p_before_at is null)<>(p_before_id is null)
  or (p_before_id is not null and (length(p_before_id)<1 or length(p_before_id)>100))
  or (p_before_at is not null and p_before_at<0)
  or (p_brand is not null and (length(p_brand)<1 or length(p_brand)>100))
 then raise exception 'invalid_ledger_filter'; end if;
 if not smartvolt_private.member_has_product(p_company,p_actor,'pos')then raise exception 'product_not_purchased';end if;
 -- The date range selects order creation dates; receipts/refunds are lifetime values for that cohort.
 -- All aggregates share one database snapshot. Pagination never changes the totals.
 with cohort as materialized (
  select o.*,coalesce(p.paid,0)::bigint paid,coalesce(r.refunded,0)::bigint refunded
  from public.sv_pos_orders o
  left join lateral(select sum(amount_cents) paid from public.sv_pos_payments p
    where p.company_id=o.company_id and p.order_id=o.id) p on true
  left join lateral(select sum(amount_cents) refunded from public.sv_pos_refunds r
    where r.company_id=o.company_id and r.order_id=o.id) r on true
  where o.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,o.brand_id)and (p_brand is null or o.brand_id=p_brand)
    and o.created_at>=p_from and o.created_at<p_to
 ), windowed as materialized (
  select * from cohort where p_before_at is null or (created_at,id)<(p_before_at,p_before_id)
  order by created_at desc,id desc limit p_limit+1
 ), page as (select * from windowed order by created_at desc,id desc limit p_limit)
 select jsonb_build_object(
  'revision',(select revision from public.sv_workspaces where company_id=p_company),
  'totals',(select jsonb_build_object('orders',count(*),
    'orderedCents',coalesce(sum(case when voided then 0 else total_cents end),0),
    'paidCents',coalesce(sum(paid),0),'refundedCents',coalesce(sum(refunded),0),
    'netCents',coalesce(sum(paid-refunded),0)) from cohort),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'number',number,'brandId',brand_id,'createdAt',created_at,
    'totalCents',total_cents,'paidCents',paid,'refundedCents',refunded,
    'netCents',paid-refunded,'voided',voided,'revision',workspace_revision
   ) order by created_at desc,id desc) from page),'[]'::jsonb),
  'hasMore',(select count(*)>p_limit from windowed)
 ) into result;
 return result;
end;
$$;

create or replace function public.sv_commit_workspace(p_company uuid, p_actor uuid, p_expected bigint,
 p_command_id uuid, p_payload jsonb, p_kind text) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare doc public.sv_workspaces; member_role text;
begin
 -- Lock the membership/company as well as the document so suspension cannot race a write.
 select m.role into member_role from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active'
 for share of m,c;
 if member_role is null or member_role='viewer' then raise exception 'access_denied'; end if;
 if p_kind in ('studio','campaign-save','campaign-pause','import','pos-admin') and member_role not in ('owner','manager') then
  raise exception 'manager_required';
 end if;
 if p_kind not in ('inbox','studio','import','campaign-save','campaign-pause','consent','active-recipient','pos','pos-admin','customer-create') then
  raise exception 'unknown_command';
 end if;
 -- Purchases are server-owned and locked for this operation, independently of staff role.
 perform 1 from public.sv_company_products p where p.company_id=p_company for share;
 if not exists(select 1 from public.sv_company_products p where p.company_id=p_company
  and p.status='active' and p.starts_at<=statement_timestamp() and (p.ends_at is null or p.ends_at>statement_timestamp())
  and (p_kind='customer-create' or p.product=case when p_kind in ('pos','pos-admin') then 'pos' else 'crm' end)) then
  raise exception 'product_not_purchased';
 end if;
 perform public.sv_authorize(p_company,p_actor,case when p_kind='customer-create'then null when p_kind in('pos','pos-admin')then 'pos'else 'crm'end,true);
 select * into doc from public.sv_workspaces where company_id=p_company for update;
 if not found then raise exception 'workspace_missing'; end if;
 if exists(select 1 from public.sv_commands where company_id=p_company and command_id=p_command_id) then
  return jsonb_build_object('state',doc.payload,'revision',doc.revision);
 end if;
 if doc.revision <> p_expected then raise exception 'revision_conflict'; end if;
 if p_payload #>> '{scope,companyId}' is distinct from p_company::text then raise exception 'invalid_company_scope'; end if;
 if smartvolt_private.protected_workspace(p_company,p_actor,p_payload)is distinct from smartvolt_private.protected_workspace(p_company,p_actor,doc.payload)then raise exception 'brand_scope';end if;
 if exists(select 1 from jsonb_array_elements(p_payload#>'{inbox,conversations}')n where n->>'owner'is not null and not exists(select 1 from jsonb_array_elements(doc.payload#>'{inbox,conversations}')o where o->>'id'=n->>'id'and o->'owner'=n->'owner')and(not smartvolt_private.member_has_product(p_company,(n->>'owner')::uuid,'crm')or not smartvolt_private.member_brand_allowed(p_company,(n->>'owner')::uuid,n->>'brandId')))then raise exception 'assignee_invalid';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_payload#>'{pos,appointments}','[]'))n where n->>'staffId'is not null and not exists(select 1 from jsonb_array_elements(coalesce(doc.payload#>'{pos,appointments}','[]'))o where o->>'id'=n->>'id'and o->'staffId'=n->'staffId'and o->'brandId'=n->'brandId')and(not smartvolt_private.member_has_product(p_company,(n->>'staffId')::uuid,'pos')or not smartvolt_private.member_brand_allowed(p_company,(n->>'staffId')::uuid,n->>'brandId')))then raise exception 'assignee_invalid';end if;
 if p_payload->'scope' is distinct from doc.payload->'scope' then raise exception 'scope_is_server_owned'; end if;
 insert into public.sv_workspace_versions(company_id,revision,payload) values(p_company,doc.revision,doc.payload);
 update public.sv_workspaces set payload=p_payload, revision=revision+1, updated_at=now()
 where company_id=p_company returning * into doc;
 insert into public.sv_commands(company_id,command_id,actor_id,kind,revision)
 values(p_company,p_command_id,p_actor,p_kind,doc.revision);
 delete from public.sv_workspace_versions where company_id=p_company and revision < doc.revision-30;
 return jsonb_build_object('state',doc.payload,'revision',doc.revision);
end;
$$;

create or replace function smartvolt_private.ops_assign(p_company uuid,p_provider text,p_thread uuid,p_actor uuid default null,p_expected bigint default null,p_force boolean default false)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t record;settings jsonb;rule jsonb;target uuid;event uuid:=gen_random_uuid();work bigint;
begin
 -- Ingestion already owns its thread. Other callers skip a busy thread instead
 -- of inverting thread/company locks against an incoming provider transaction.
 if p_provider='meta'then perform 1 from public.sv_meta_threads where company_id=p_company and id=p_thread for update skip locked;
 elsif p_provider='whatsapp'then perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_thread for update skip locked;
 else raise exception 'ops_invalid';end if;
 if not found then return jsonb_build_object('saved',false,'queued',true,'reason','busy');end if;
 perform pg_advisory_xact_lock(hashtextextended('assignment:'||p_company::text,0));
 select * into strict t from smartvolt_private.ops_inquiries where company_id=p_company and provider=p_provider and thread_id=p_thread;
 if p_expected is not null and t.revision<>p_expected then raise exception 'ops_revision_conflict';end if;
 if t.status<>'open' then return jsonb_build_object('saved',false,'queued',false,'reason','resolved');end if;
 if not p_force and t.assignee_id is not null and exists(select 1 from public.sv_memberships m where m.company_id=p_company and m.user_id=t.assignee_id and m.status='active'and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id))then return jsonb_build_object('saved',true,'keptOwner',true);end if;
 select data into strict settings from public.sv_ops_settings where company_id=p_company;
 if (settings->>'routingEnabled')::boolean then
  select x into rule from jsonb_array_elements(settings->'rules')with ordinality a(x,n)
  where(x->>'enabled')::boolean and(x->>'brandId' is null or x->>'brandId'=t.brand_id)
  and(x->>'channel'='all' or x->>'channel'=t.channel)
  and not exists(select 1 from jsonb_array_elements_text(x->'tags')tag where not exists(select 1 from public.sv_customers cu where cu.company_id=p_company and cu.id=t.customer_id and cu.tags ? tag))
  order by n limit 1;
  if rule is null then return smartvolt_private.ops_wait(p_company,p_provider,p_thread,'no_rule');end if;
 else
  if not p_force then return jsonb_build_object('saved',false,'queued',true,'reason','disabled');end if;
  rule='{"id":"manual-workload","team":"","onlineOnly":false,"maxOpen":500,"method":"least_open"}'::jsonb;
 end if;
 select m.user_id,load.n into target,work from public.sv_memberships m
 left join public.sv_agent_routing a on a.company_id=m.company_id and a.user_id=m.user_id
 cross join lateral(select count(*)n from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.assignee_id=m.user_id and i.status='open')load
 where m.company_id=p_company and m.status='active' and m.role<>'viewer'and smartvolt_private.member_has_product(p_company,m.user_id,'crm')and smartvolt_private.member_brand_allowed(p_company,m.user_id,t.brand_id)
 and not coalesce(a.paused,false) and (rule->>'team'='' or a.team=rule->>'team')
 and (coalesce(jsonb_array_length(a.brand_ids),0)=0 or a.brand_ids ? t.brand_id)
 and (not(rule->>'onlineOnly')::boolean or(a.presence='online' and a.seen_at>now()-interval '3 minutes'))
 and load.n<least((rule->>'maxOpen')::integer,coalesce(a.capacity,20))
 order by case when rule->>'method'='least_open' then load.n else 0 end,
 a.last_assigned_at nulls first,m.user_id limit 1 for share of m;
 if target is null then return smartvolt_private.ops_wait(p_company,p_provider,p_thread,'no_eligible_agent');end if;
 -- No intervening manual assignment can be silently overwritten.
 if p_provider='meta' then
  update public.sv_meta_threads set assignee_id=target,revision=revision+1,updated_at=now()where company_id=p_company and id=p_thread and revision=t.revision;
 else
  update public.sv_wa_conversations set assignee_id=target,revision=revision+1,updated_at=now()where company_id=p_company and id=p_thread and revision=t.revision;
 end if;
 if not found then raise exception 'ops_revision_conflict';end if;
 insert into public.sv_agent_routing(company_id,user_id,last_assigned_at)values(p_company,target,clock_timestamp())
 on conflict(company_id,user_id)do update set last_assigned_at=excluded.last_assigned_at;
 update public.sv_routing_queue set state='assigned',last_attempt_at=clock_timestamp()where company_id=p_company and provider=p_provider and thread_id=p_thread;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)
 values(p_company,t.customer_id,t.brand_id,'routing:'||event,'routing-assigned',p_actor,
 jsonb_build_object('provider',p_provider,'threadId',p_thread,'previousOwner',t.assignee_id,'ownerId',target,'ruleId',rule->>'id','method',rule->>'method','openBefore',work));
 return jsonb_build_object('saved',true,'ownerId',target,'queued',false);
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
 perform public.sv_member_scope(p_company,p_actor,r.brand_id,r.product);if r.status<>'running' then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
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

create or replace function public.sv_translation_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;enabled boolean;body text;err text:=p_error;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select s.enabled into enabled from public.sv_ai_settings s where company_id=p_company for share;
 select * into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor for update;
 if r.feature<>'translation' or r.product<>'crm' then raise exception 'ai_idempotency_conflict';end if;
 body=public.sv_translation_source(p_company,r.brand_id,r.source,r.source_id,r.translation_context->>'messageId');
 perform public.sv_member_scope(p_company,p_actor,r.brand_id,r.product);if r.status<>'running' then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 if not coalesce(enabled,false)then err='disabled';
 elsif r.translation_context->>'mode'='message'and md5(body)is distinct from r.translation_context->>'sourceHash' then err='source_changed';end if;
 if err is null and(p_result is null or jsonb_typeof(p_result)is distinct from 'object' or p_result->>'requestId'is distinct from p_request::text or p_result->>'target'is distinct from r.translation_context->>'target' or coalesce(length(btrim(p_result->>'text')),0)not between 1 and 12000)then raise exception 'ai_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then 'completed'else 'failed'end,result=case when err is null then p_result else null end,error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

create or replace function public.sv_copilot_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;s public.sv_ai_settings;d public.sv_workspaces;err text:=p_error;
begin
 select * into strict r from public.sv_ai_requests where company_id=p_company and request_id=p_request and source='copilot'and actor_id=p_actor for update;
 perform public.sv_copilot_authorize(p_company,p_actor,r.product,true);
 perform public.sv_member_scope(p_company,p_actor,r.brand_id,r.product);if r.status<>'running'then return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);end if;
 select * into s from public.sv_ai_settings where company_id=p_company for share;
 select * into strict d from public.sv_workspaces where company_id=p_company for share;
 if not coalesce(s.enabled,false)then err='disabled';elsif d.revision<>r.workspace_revision then err='context_changed';end if;
 if err is null and(p_result is null or jsonb_typeof(p_result)<>'object'or p_result->>'answer'is null or length(p_result->>'answer')not between 1 and 6000)then raise exception 'copilot_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then'completed'else'failed'end,result=case when err is null then p_result else null end,error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 if err is null then insert into public.sv_copilot_messages(company_id,id,thread_id,role,body,result)values(p_company,gen_random_uuid(),r.source_id::uuid,'assistant',p_result->>'answer',p_result);end if;
 update public.sv_copilot_threads set updated_at=now()where company_id=p_company and id=r.source_id::uuid;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

create or replace function public.sv_copilot_receipt(p_company uuid,p_actor uuid,p_product text,p_request uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$declare r public.sv_ai_requests;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 select * into strict r from public.sv_ai_requests where company_id=p_company and actor_id=p_actor and product=p_product and source='copilot'and request_id=p_request for update;
 perform public.sv_member_scope(p_company,p_actor,r.brand_id,p_product);if not smartvolt_private.copilot_thread_allowed(p_company,p_actor,r.source_id::uuid)then raise exception 'brand_scope';end if;
 if r.status='running'and r.created_at<now()-interval'120 seconds'then
  update public.sv_ai_requests set status='failed',error_code='unavailable',finished_at=now()where company_id=p_company and request_id=p_request returning * into r;
 end if;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;

create or replace function public.sv_copilot_claim(p_company uuid,p_actor uuid,p_product text,p_request uuid,p_thread uuid,p_brand text,p_hash text,p_message text,p_revision bigint,p_model text,p_feature text)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.sv_ai_requests;s public.sv_ai_settings;t public.sv_copilot_threads;d public.sv_workspaces;day_start timestamptz;
begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);
 perform public.sv_member_scope(p_company,p_actor,p_brand,p_product);if exists(select 1 from public.sv_copilot_threads where company_id=p_company and id=p_thread)and not smartvolt_private.copilot_thread_allowed(p_company,p_actor,p_thread)then raise exception 'brand_scope';end if;
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

create or replace function public.sv_copilot_memory(p_company uuid,p_actor uuid,p_product text,p_query text)returns jsonb
language plpgsql security invoker set search_path='' as $$declare result jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product,true);
 if p_query is null or length(p_query)not between 1 and 100 then raise exception 'copilot_invalid';end if;
 select jsonb_build_object('messages',coalesce((select jsonb_agg(to_jsonb(q))from(
  select t.title,m.role,left(m.body,1800)body,m.created_at from public.sv_copilot_messages m join public.sv_copilot_threads t on t.company_id=m.company_id and t.id=m.thread_id
  where t.company_id=p_company and t.actor_id=p_actor and t.product=p_product and smartvolt_private.copilot_thread_allowed(p_company,p_actor,t.id)and strpos(lower(m.body),lower(p_query))>0 order by m.created_at desc,m.id limit 8
 )q),'[]'::jsonb),'tasks',coalesce((select jsonb_agg(to_jsonb(q))from(
  select b.title,b.status,b.plan,b.updated_at from public.sv_copilot_briefs b where p_product='crm'and b.company_id=p_company and b.actor_id=p_actor and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)and strpos(lower(b.title||' '||b.plan::text),lower(p_query))>0 order by b.updated_at desc,b.id limit 5
 )q),'[]'::jsonb))into result;return result;
end;$$;

create or replace function public.sv_copilot_action(p_company uuid,p_actor uuid,p_product text,p_command uuid,p_data jsonb)returns jsonb
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
  perform public.sv_member_scope(p_company,p_actor,r.brand_id,'crm');if r.result->'campaign'is null or r.result->'campaign'='null'::jsonb then raise exception 'copilot_invalid';end if;
  insert into public.sv_copilot_briefs(company_id,id,actor_id,thread_id,request_id,brand_id,title,plan)
   values(p_company,p_command,p_actor,r.source_id::uuid,r.request_id,r.brand_id,r.result#>>'{campaign,title}',r.result->'campaign')on conflict(company_id,actor_id,request_id)do nothing;
  select * into strict b from public.sv_copilot_briefs where company_id=p_company and actor_id=p_actor and request_id=r.request_id;
  v=jsonb_build_object('saved',true,'id',b.id);
 elsif kind='brief-status'then
  if p_product<>'crm'or p_data#>>'{client,status}'not in('draft','ready','complete','cancelled')then raise exception 'copilot_invalid';end if;
  select * into strict b from public.sv_copilot_briefs where company_id=p_company and actor_id=p_actor and id=(p_data#>>'{client,id}')::uuid for update;
  perform public.sv_member_scope(p_company,p_actor,b.brand_id,'crm');if b.revision<>(p_data#>>'{client,revision}')::bigint then raise exception 'copilot_context_changed';end if;
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
