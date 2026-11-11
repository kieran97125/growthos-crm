-- Product Learning Sync checked: standalone company/brand ownership, protected
-- credentials, distinct readiness, atomic commands, append-only provider evidence.
-- Dedicated SmartVolt only. Live WhatsApp never enters the bounded workspace JSON.
-- Provider POST authentication is checked by the server using the original bytes;
-- this transaction independently checks the configured account and phone IDs.
create schema if not exists smartvolt_private;
revoke all on schema smartvolt_private from public,anon,authenticated;
grant usage on schema smartvolt_private to service_role;

create table public.sv_wa_connections(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.sv_companies(id),
 brand_id text not null check(char_length(brand_id) between 1 and 100),
 app_id text not null check(app_id ~ '^[0-9]{3,40}$'),
 constraint sv_wa_connections_app_identity unique(app_id),
 account_id text not null check(account_id ~ '^[0-9]{3,40}$'),
 messaging_account_id text check(messaging_account_id ~ '^[0-9]{3,40}$'),
 phone_number_id text not null unique check(phone_number_id ~ '^[0-9]{3,40}$'),
 display_phone text check(char_length(display_phone) between 1 and 80),
 encrypted_credentials jsonb not null check(jsonb_typeof(encrypted_credentials)='object' and encrypted_credentials<>'{}'::jsonb),
 verify_token_hash text not null check(verify_token_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'configured' check(state in ('configured','active','disabled')),
 webhook_verified_at timestamptz, last_inbound_at bigint,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id),unique(company_id,id,brand_id)
);
create index sv_wa_connections_company on public.sv_wa_connections(company_id,created_at desc,id);
create table public.sv_wa_contacts(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.sv_companies(id),
 display_name text not null check(char_length(display_name) between 1 and 200),
 phone text check(phone ~ '^[0-9]{5,20}$'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(company_id,id)
);
create unique index sv_wa_contacts_phone on public.sv_wa_contacts(company_id,phone) where phone is not null;
create table public.sv_wa_conversations(
 id uuid primary key default gen_random_uuid(), company_id uuid not null,
 connection_id uuid not null, contact_id uuid not null, brand_id text not null,
 remote_id text not null check(char_length(remote_id) between 1 and 200),
 remote_kind text not null check(remote_kind in ('phone','bsuid')),
 status text not null default 'open' check(status in ('open','resolved')),
 unread_count integer not null default 0 check(unread_count>=0),
 read_seq bigint not null default 0 check(read_seq>=0),
 last_inbound_at bigint, last_message_at bigint not null,
 revision bigint not null default 0 check(revision>=0),
 has_ad_referral boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(connection_id,remote_id),unique(company_id,id),unique(company_id,connection_id,id),
 foreign key(company_id,connection_id,brand_id) references public.sv_wa_connections(company_id,id,brand_id),
 foreign key(company_id,contact_id) references public.sv_wa_contacts(company_id,id)
);
create index sv_wa_conversations_page on public.sv_wa_conversations(company_id,last_message_at desc,id desc);
create index sv_wa_conversations_brand_page on public.sv_wa_conversations(company_id,brand_id,last_message_at desc,id desc);
create index sv_wa_conversations_contact on public.sv_wa_conversations(company_id,contact_id);
create table public.sv_wa_messages(
 id uuid primary key default gen_random_uuid(), seq bigint generated always as identity unique,
 company_id uuid not null,connection_id uuid not null,conversation_id uuid not null,
 provider_id text check(char_length(provider_id) between 1 and 512), client_id uuid,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 direction text not null check(direction in ('incoming','outgoing','note')),
 body text not null check(char_length(body)<=12000),
 message_type text not null check(char_length(message_type) between 1 and 80),
 provider_at bigint not null,created_at timestamptz not null default now(),
 author_id uuid references auth.users(id),author_name text not null check(char_length(author_name)<=200),
 reply_to uuid,
 state text not null check(state in ('dispatching','accepted','unknown','sent','delivered','read','failed')),
 error_code text check(char_length(error_code)<=100),status_at bigint,
 unique(company_id,client_id),unique(connection_id,provider_id),
 unique(company_id,connection_id,conversation_id,id),
 foreign key(company_id,connection_id,conversation_id) references public.sv_wa_conversations(company_id,connection_id,id),
 foreign key(company_id,connection_id,conversation_id,reply_to) references public.sv_wa_messages(company_id,connection_id,conversation_id,id),
 check((direction='outgoing' and client_id is not null and author_id is not null) or direction<>'outgoing'),
 check(direction<>'incoming' or provider_id is not null)
);
create index sv_wa_messages_page on public.sv_wa_messages(company_id,conversation_id,seq desc);
create index sv_wa_messages_connection on public.sv_wa_messages(company_id,connection_id);
create index sv_wa_messages_reply on public.sv_wa_messages(company_id,connection_id,conversation_id,reply_to) where reply_to is not null;
create table public.sv_wa_events(
 id uuid primary key default gen_random_uuid(),company_id uuid not null,connection_id uuid not null,
 event_key text not null check(char_length(event_key) between 1 and 600),
 kind text not null check(kind in ('envelope','message','status')),
 provider_id text,provider_at bigint, payload jsonb not null,
 recorded_at timestamptz not null default now(),
 unique(connection_id,event_key),
 foreign key(company_id,connection_id) references public.sv_wa_connections(company_id,id)
);
create index sv_wa_events_company_date on public.sv_wa_events(company_id,recorded_at desc,id);
create index sv_wa_events_receipts on public.sv_wa_events(company_id,connection_id,provider_id,provider_at,recorded_at,id) where kind='status';
create table public.sv_wa_commands(
 company_id uuid not null,client_id uuid not null,conversation_id uuid not null,
 actor_id uuid not null references auth.users(id),kind text not null check(kind in ('send','read','resolve','reopen','note')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 message_id uuid references public.sv_wa_messages(id),created_at timestamptz not null default now(),
 primary key(company_id,client_id),
 foreign key(company_id,conversation_id) references public.sv_wa_conversations(company_id,id)
);
create index sv_wa_commands_conversation on public.sv_wa_commands(company_id,conversation_id);

-- Reset grants, including default grants and TRUNCATE. No browser policy exposes
-- credentials, raw events, provider identities, or even the private projections.
alter table public.sv_wa_connections enable row level security;
alter table public.sv_wa_contacts enable row level security;
alter table public.sv_wa_conversations enable row level security;
alter table public.sv_wa_messages enable row level security;
alter table public.sv_wa_events enable row level security;
alter table public.sv_wa_commands enable row level security;
revoke all on public.sv_wa_connections,public.sv_wa_contacts,public.sv_wa_conversations,public.sv_wa_messages,public.sv_wa_events,public.sv_wa_commands from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_wa_connections,public.sv_wa_contacts,public.sv_wa_conversations,public.sv_wa_messages to service_role;
grant select,insert on public.sv_wa_events,public.sv_wa_commands to service_role;
revoke all on sequence public.sv_wa_messages_seq_seq from public,anon,authenticated,service_role;
grant usage,select on sequence public.sv_wa_messages_seq_seq to service_role;

create function smartvolt_private.wa_reject_rewrite() returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'whatsapp_evidence_immutable';end;$$;
revoke all on function smartvolt_private.wa_reject_rewrite() from public,anon,authenticated;
create trigger sv_wa_events_immutable before update or delete on public.sv_wa_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_wa_events_no_truncate before truncate on public.sv_wa_events for each statement execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_wa_commands_immutable before update or delete on public.sv_wa_commands for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_wa_commands_no_truncate before truncate on public.sv_wa_commands for each statement execute function smartvolt_private.wa_reject_rewrite();

create function smartvolt_private.wa_require_company(p_company uuid) returns void
 language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.sv_companies where id=p_company and status='active' for share;
 if not found then raise exception 'access_denied';end if;
 perform 1 from public.sv_company_products where company_id=p_company for share;
 if not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm' and status='active'
 and starts_at<=statement_timestamp() and (ends_at is null or ends_at>statement_timestamp())) then raise exception 'product_not_purchased';end if;
end;$$;
create function smartvolt_private.wa_require_actor(p_company uuid,p_actor uuid) returns text
 language plpgsql security invoker set search_path='' as $$
declare v_role text;
begin
 perform smartvolt_private.wa_require_company(p_company);
 select role into v_role from public.sv_memberships where company_id=p_company and user_id=p_actor and status='active' for share;
 if v_role is null or v_role='viewer' then raise exception 'access_denied';end if;
 return v_role;
end;$$;
revoke all on function smartvolt_private.wa_require_company(uuid),smartvolt_private.wa_require_actor(uuid,uuid) from public,anon,authenticated;
grant execute on function smartvolt_private.wa_require_company(uuid),smartvolt_private.wa_require_actor(uuid,uuid) to service_role;

create function public.sv_wa_save_connection(p_company uuid,p_actor uuid,p_config jsonb) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare v public.sv_wa_connections;v_id uuid;v_brand text;v_changed boolean;
begin
 if smartvolt_private.wa_require_actor(p_company,p_actor)<>'owner' then raise exception 'owner_required';end if;
 if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_connection';end if;
 v_id:=coalesce(nullif(p_config->>'id','')::uuid,gen_random_uuid());v_brand:=p_config->>'brandId';
 perform 1 from public.sv_workspaces w where w.company_id=p_company and exists(
 select 1 from jsonb_array_elements(w.payload#>'{scope,brands}') b where b->>'id'=v_brand) for share;
 if not found then raise exception 'brand_missing';end if;
 select * into v from public.sv_wa_connections where id=v_id for update;
 if found then
  if v.company_id<>p_company then raise exception 'connection_scope';end if;
  if (v.brand_id is distinct from v_brand or v.phone_number_id is distinct from p_config->>'phoneNumberId'
   or v.account_id is distinct from p_config->>'accountId' or v.app_id is distinct from p_config->>'appId'
   or v.messaging_account_id is distinct from nullif(p_config->>'messagingAccountId',''))
   and exists(select 1 from public.sv_wa_conversations where connection_id=v_id) then raise exception 'connection_identity_in_use';end if;
  v_changed:=v.encrypted_credentials is distinct from p_config->'encryptedCredentials'
   or v.verify_token_hash is distinct from p_config->>'verifyTokenHash'
   or v.brand_id is distinct from v_brand or v.app_id is distinct from p_config->>'appId'
   or v.phone_number_id is distinct from p_config->>'phoneNumberId' or v.account_id is distinct from p_config->>'accountId'
   or v.messaging_account_id is distinct from nullif(p_config->>'messagingAccountId','');
  update public.sv_wa_connections set brand_id=v_brand,app_id=p_config->>'appId',account_id=p_config->>'accountId',
   messaging_account_id=nullif(p_config->>'messagingAccountId',''),phone_number_id=p_config->>'phoneNumberId',display_phone=p_config->>'displayPhone',
   encrypted_credentials=p_config->'encryptedCredentials',verify_token_hash=p_config->>'verifyTokenHash',
   state=case when v_changed then 'configured' else state end,webhook_verified_at=case when v_changed then null else webhook_verified_at end,
   last_inbound_at=case when v_changed then null else last_inbound_at end,updated_at=now() where id=v_id returning * into v;
 else
  insert into public.sv_wa_connections(id,company_id,brand_id,app_id,account_id,messaging_account_id,phone_number_id,display_phone,encrypted_credentials,verify_token_hash)
  values(v_id,p_company,v_brand,p_config->>'appId',p_config->>'accountId',nullif(p_config->>'messagingAccountId',''),p_config->>'phoneNumberId',
   p_config->>'displayPhone',p_config->'encryptedCredentials',p_config->>'verifyTokenHash') returning * into v;
 end if;
 return to_jsonb(v)-'encrypted_credentials'-'verify_token_hash';
end;$$;

create function public.sv_wa_verify_webhook(p_connection uuid,p_verify_hash text) returns void
 language plpgsql security invoker set search_path='' as $$
declare v_company uuid;
begin
 select company_id into v_company from public.sv_wa_connections where id=p_connection;
 perform smartvolt_private.wa_require_company(v_company);
 update public.sv_wa_connections set webhook_verified_at=now(),updated_at=now(),
 state=case when last_inbound_at is null then 'configured' else 'active' end
 where id=p_connection and verify_token_hash=p_verify_hash and state<>'disabled';
 if not found then raise exception 'verification_failed';end if;
end;$$;

-- Delivery proof outranks transport errors. For sent/failed attempts, provider
-- time prevents a delayed older notification from reversing newer evidence.
create function smartvolt_private.wa_receipt_state(p_old text,p_old_at bigint,p_new text,p_new_at bigint) returns text
 language sql immutable security invoker set search_path='' as $$
 select case
 when p_old='read' or p_new in ('read','played') then 'read'
 when p_old='delivered' or p_new='delivered' then 'delivered'
 when p_new='failed' and p_old in ('sent','failed') and coalesce(p_old_at,0)>p_new_at then p_old
 when p_new='sent' and p_old='failed' and coalesce(p_old_at,0)>=p_new_at then 'failed'
 else p_new end
$$;
revoke all on function smartvolt_private.wa_receipt_state(text,bigint,text,bigint) from public,anon,authenticated;
grant execute on function smartvolt_private.wa_receipt_state(text,bigint,text,bigint) to service_role;

create function public.sv_wa_ingest(p_connection uuid,p_events jsonb,p_envelope jsonb default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare c public.sv_wa_connections;cv public.sv_wa_conversations;m public.sv_wa_messages;
 e jsonb;v_key text;v_id uuid;v_contact uuid;v_phone text;v_remote text;v_name text;v_at bigint;
 v_reply uuid;v_state text;v_error text;v_new_state text;v_inserted integer:=0;v_duplicates integer:=0;v_statuses integer:=0;v_changed boolean;
 v_now bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>1000 then raise exception 'invalid_event_batch';end if;
 if p_envelope is not null and (jsonb_typeof(p_envelope)<>'object' or octet_length(p_envelope::text)>3500000) then raise exception 'invalid_envelope';end if;
 if octet_length(p_events::text)>7000000 then raise exception 'invalid_event_batch';end if;
 select company_id into v_id from public.sv_wa_connections where id=p_connection;
 perform smartvolt_private.wa_require_company(v_id);
 select * into c from public.sv_wa_connections where id=p_connection for update;
 if not found or c.state='disabled' then raise exception 'connection_unavailable';end if;
 if p_envelope is not null then
  insert into public.sv_wa_events(company_id,connection_id,event_key,kind,payload)
  values(c.company_id,c.id,'envelope:'||encode(sha256(convert_to(p_envelope::text,'UTF8')),'hex'),'envelope',p_envelope)
  on conflict(connection_id,event_key) do nothing;
 end if;
 -- A shared customer can occur on several company connections. Acquire phone
 -- contact updates in a stable order so opposite provider batches do not deadlock.
 for e in select value from jsonb_array_elements(p_events)
  order by coalesce(value#>>'{identity,phone}',value#>>'{identity,id}',''),value->>'providerId',value->>'kind' loop
  if jsonb_typeof(e)<>'object' or e->>'kind' not in ('message','status') or e->>'kind' is null
   or e->>'phoneNumberId' is distinct from c.phone_number_id
   or not coalesce(e->>'accountId'=c.account_id or e->>'accountId'=c.messaging_account_id,false)
   or char_length(coalesce(e->>'providerId','')) not between 1 and 512
   or jsonb_typeof(e->'raw') is distinct from 'object' then raise exception 'invalid_provider_scope';end if;
  v_at:=(e->>'providerAt')::bigint;
  if v_at is null or v_at<=0 or v_at>v_now+300000 then raise exception 'invalid_provider_time';end if;
  v_key:=case when e->>'kind'='message' then 'message:'||(e->>'providerId') else 'status:'||encode(sha256(convert_to(e::text,'UTF8')),'hex') end;
  insert into public.sv_wa_events(company_id,connection_id,event_key,kind,provider_id,provider_at,payload)
  values(c.company_id,c.id,v_key,e->>'kind',e->>'providerId',v_at,e)
  on conflict(connection_id,event_key) do nothing;
  if not found then v_duplicates:=v_duplicates+1;continue;end if;
  if e->>'kind'='message' then
   v_remote:=e#>>'{identity,id}';v_phone:=nullif(e#>>'{identity,phone}','');
   if char_length(coalesce(v_remote,'')) not between 1 and 200 or (v_phone is not null and v_phone !~ '^[0-9]{5,20}$')
    or (e#>>'{identity,kind}'='phone' and v_remote !~ '^[0-9]{5,20}$')
    or e#>>'{identity,kind}' not in ('phone','bsuid') or e#>>'{identity,kind}' is null
    or char_length(coalesce(e->>'body',''))>12000 or char_length(coalesce(e->>'messageType','')) not between 1 and 80 then raise exception 'invalid_incoming_message';end if;
   v_name:=left(coalesce(nullif(btrim(e->>'profileName'),''),v_phone,v_remote),200);
   select * into cv from public.sv_wa_conversations where connection_id=c.id and remote_id=v_remote for update;
   if not found then
    if v_phone is not null then
     insert into public.sv_wa_contacts(company_id,display_name,phone) values(c.company_id,v_name,v_phone)
     on conflict(company_id,phone) where phone is not null do update set display_name=excluded.display_name,updated_at=now() returning id into v_contact;
    else
     insert into public.sv_wa_contacts(company_id,display_name) values(c.company_id,v_name) returning id into v_contact;
    end if;
    insert into public.sv_wa_conversations(company_id,connection_id,contact_id,brand_id,remote_id,remote_kind,last_message_at)
    values(c.company_id,c.id,v_contact,c.brand_id,v_remote,e#>>'{identity,kind}',v_at) returning * into cv;
   else
    if cv.remote_kind is distinct from e#>>'{identity,kind}' then raise exception 'identity_kind_conflict';end if;
    update public.sv_wa_contacts set display_name=v_name,updated_at=now() where id=cv.contact_id and company_id=c.company_id;
   end if;
   v_reply:=null;
   select id into v_reply from public.sv_wa_messages where company_id=c.company_id and connection_id=c.id and conversation_id=cv.id and provider_id=e->>'replyToProviderId';
   insert into public.sv_wa_messages(company_id,connection_id,conversation_id,provider_id,fingerprint,direction,body,message_type,provider_at,author_name,reply_to,state)
   values(c.company_id,c.id,cv.id,e->>'providerId',encode(sha256(convert_to(e::text,'UTF8')),'hex'),'incoming',coalesce(e->>'body',''),e->>'messageType',v_at,v_name,v_reply,'delivered')
   on conflict(connection_id,provider_id) do nothing returning * into m;
   if not found then v_duplicates:=v_duplicates+1;continue;end if;
   update public.sv_wa_conversations set status='open',unread_count=unread_count+1,last_inbound_at=greatest(last_inbound_at,v_at),
    last_message_at=greatest(last_message_at,v_at),revision=revision+1,updated_at=now(),
    has_ad_referral=has_ad_referral or coalesce(e#>>'{referral,source_type}'='ad' or e#>>'{referral,ctwa_clid}' is not null,false)
   where id=cv.id;
   update public.sv_wa_connections set last_inbound_at=greatest(last_inbound_at,v_at),updated_at=now(),
    state=case when webhook_verified_at is not null then 'active' else state end where id=c.id;
   v_inserted:=v_inserted+1;
  else
   if e->>'status' not in ('sent','delivered','read','failed','played') or e->>'status' is null then raise exception 'invalid_provider_status';end if;
   -- The callback UUID was placed on the original durable send claim. A signed
   -- status can reconcile a lost HTTP response without making a second send.
   select * into m from public.sv_wa_messages where connection_id=c.id and provider_id=e->>'providerId' and direction='outgoing';
   if not found and coalesce(e->>'opaqueCallbackData','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select * into m from public.sv_wa_messages where company_id=c.company_id and connection_id=c.id and id=(e->>'opaqueCallbackData')::uuid and direction='outgoing';
   end if;
   if found then
    select * into cv from public.sv_wa_conversations where company_id=c.company_id and id=m.conversation_id for update;
    select * into m from public.sv_wa_messages where id=m.id for update;
    if m.provider_id is not null and m.provider_id<>e->>'providerId' then raise exception 'provider_id_conflict';end if;
    -- Failures never reverse proof of delivery/read; later delivery can correct
    -- an earlier failed attempt. Every original status remains immutable above.
    v_state:=case when e->>'status'='played' then 'read' else e->>'status' end;
    v_new_state:=smartvolt_private.wa_receipt_state(m.state,m.status_at,v_state,v_at);
    v_error:=case when v_new_state<>'failed' then null
     when v_state='failed' and (m.state<>'failed' or v_at>=coalesce(m.status_at,0)) then left(e->>'errorCode',100)
     else m.error_code end;
    v_changed:=m.state is distinct from v_new_state or m.provider_id is null or m.error_code is distinct from v_error;
    update public.sv_wa_messages set provider_id=e->>'providerId',state=v_new_state,error_code=v_error,status_at=greatest(status_at,v_at) where id=m.id;
    if v_changed then update public.sv_wa_conversations set revision=revision+1,updated_at=now() where id=cv.id;end if;
   end if;
   v_statuses:=v_statuses+1;
  end if;
 end loop;
 return jsonb_build_object('inserted',v_inserted,'duplicates',v_duplicates,'statuses',v_statuses);
end;$$;

create function public.sv_wa_claim_send(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_body text,p_reply_to uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare c public.sv_wa_connections;cv public.sv_wa_conversations;m public.sv_wa_messages;cmd public.sv_wa_commands;v_fp text;v_conn uuid;v_name text;
 v_now bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 perform smartvolt_private.wa_require_actor(p_company,p_actor);
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

create function public.sv_wa_finish_send(p_company uuid,p_message uuid,p_disposition text,p_provider_id text default null,p_error_code text default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare m public.sv_wa_messages;v_conn uuid;v_conv uuid;v_state text;v_error text;e jsonb;v_at bigint;v_receipt text;
begin
 if p_disposition is null or p_disposition not in ('accepted','ambiguous','definitive') or (p_disposition='accepted' and coalesce(char_length(p_provider_id),0) not between 1 and 512) then raise exception 'invalid_send_result';end if;
 select connection_id,conversation_id into v_conn,v_conv from public.sv_wa_messages where company_id=p_company and id=p_message and direction='outgoing';
 if not found then raise exception 'message_missing';end if;
 -- Completion records an already-authorized provider attempt even if the actor
 -- or purchase was suspended while the external request was in flight.
 perform 1 from public.sv_wa_connections where company_id=p_company and id=v_conn for update;
 perform 1 from public.sv_wa_conversations where company_id=p_company and id=v_conv for update;
 select * into m from public.sv_wa_messages where company_id=p_company and id=p_message for update;
 if p_provider_id is not null and m.provider_id is not null and m.provider_id<>p_provider_id then raise exception 'provider_id_conflict';end if;
 v_state:=case when m.state in ('sent','delivered','read','failed') then m.state
  when m.state='accepted' and p_disposition<>'accepted' then 'accepted'
  when p_disposition='accepted' then 'accepted' when p_disposition='ambiguous' then 'unknown' else 'failed' end;
 v_error:=case when v_state='failed' then coalesce(m.error_code,left(p_error_code,100)) else null end;
 update public.sv_wa_messages set provider_id=coalesce(m.provider_id,p_provider_id),state=v_state,error_code=v_error where id=m.id returning * into m;
 -- A provider receipt can beat the HTTP response and omit the callback UUID.
 -- Reconcile retained, already authenticated evidence when its wamid is bound.
 for e in select payload from public.sv_wa_events where company_id=p_company and connection_id=v_conn
  and kind='status' and provider_id=m.provider_id order by provider_at,recorded_at,id loop
  v_at:=(e->>'providerAt')::bigint;v_receipt:=case when e->>'status'='played' then 'read' else e->>'status' end;
  v_state:=smartvolt_private.wa_receipt_state(m.state,m.status_at,v_receipt,v_at);
  v_error:=case when v_state<>'failed' then null
   when v_receipt='failed' and (m.state<>'failed' or v_at>=coalesce(m.status_at,0)) then left(e->>'errorCode',100)
   else m.error_code end;
  update public.sv_wa_messages set state=v_state,error_code=v_error,status_at=greatest(status_at,v_at) where id=m.id returning * into m;
 end loop;
 update public.sv_wa_conversations set revision=revision+1,updated_at=now() where id=v_conv;
 return to_jsonb(m);
end;$$;

create function public.sv_wa_conversation_command(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_kind text,p_body text default null,p_through_message uuid default null) returns jsonb
 language plpgsql security invoker set search_path='' as $$
declare cv public.sv_wa_conversations;cmd public.sv_wa_commands;v_conn uuid;v_fp text;v_seq bigint;v_message uuid;v_name text;
 v_now bigint:=floor(extract(epoch from statement_timestamp())*1000)::bigint;
begin
 perform smartvolt_private.wa_require_actor(p_company,p_actor);
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

revoke all on function public.sv_wa_save_connection(uuid,uuid,jsonb),public.sv_wa_verify_webhook(uuid,text),public.sv_wa_ingest(uuid,jsonb,jsonb),public.sv_wa_claim_send(uuid,uuid,uuid,bigint,uuid,text,uuid),public.sv_wa_finish_send(uuid,uuid,text,text,text),public.sv_wa_conversation_command(uuid,uuid,uuid,bigint,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.sv_wa_save_connection(uuid,uuid,jsonb),public.sv_wa_verify_webhook(uuid,text),public.sv_wa_ingest(uuid,jsonb,jsonb),public.sv_wa_claim_send(uuid,uuid,uuid,bigint,uuid,text,uuid),public.sv_wa_finish_send(uuid,uuid,text,text,text),public.sv_wa_conversation_command(uuid,uuid,uuid,bigint,uuid,text,text,uuid) to service_role;


-- Each deployment callback is scoped to one dedicated Meta App and phone.
-- The global App identity constraint above prevents a second company/phone from
-- sharing a default callback before an app-scoped dispatcher is implemented.
-- Keep unfinished capabilities visible for both current and newly provisioned
-- companies without replacing or copying the existing provisioning function.
create function smartvolt_private.wa_seed_system_cards(p_company uuid) returns void
 language sql security invoker set search_path='' as $$
 insert into public.sv_system_cards(company_id,id,title,category,status,detail) values
 (p_company,'wa-live-acceptance','WhatsApp 真實收發驗收','connections','blocked','為公司專用 Meta App／電話完成 messages 欄位與帳戶 subscribed_apps 訂閱，再由真實 Owner 核實客人主動來訊、人工回覆及實際 delivered 回執；部署與儲存密鑰不代表完成驗收。'),
 (p_company,'wa-app-routing','WhatsApp 多電話與授權流程','connections','planned','目前每個專用 Meta App 只接一個電話；後續建立按 App 分派多電話 webhook 與 Embedded Signup，保持公司與帳戶隔離。'),
 (p_company,'wa-media','WhatsApp 媒體與附件','crm','planned','接入受保護媒體下載、預覽、保存與附件回覆；現時只顯示來訊媒體種類提示，不宣稱已讀取附件內容。'),
 (p_company,'wa-customer-bridge','WhatsApp 與共用客戶資料連接','crm','planned','把獨立 WhatsApp 聯絡人連到共用 POS 客戶目錄、預約與客戶旅程；目前沒有自動同步，不能按顯示名稱合併客人。'),
 (p_company,'wa-templates','WhatsApp 範本與視窗外回覆','crm','planned','接入已審批範本與 24 小時服務視窗外回覆；行銷 opt-in、廣播與批量發送需另行設計及驗收，未在本輪啟用。'),
 (p_company,'wa-operations','WhatsApp 連接維運與復原','admin','planned','完成 Owner 斷線、密鑰輪換與復原操作，訂立資料保存、監察與異常提醒；目前未提供完整自助維運流程。')
 on conflict(company_id,id) do nothing;
$$;
revoke all on function smartvolt_private.wa_seed_system_cards(uuid) from public,anon,authenticated;
grant execute on function smartvolt_private.wa_seed_system_cards(uuid) to service_role;
create function smartvolt_private.wa_company_system_cards() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 perform smartvolt_private.wa_seed_system_cards(new.id);
 return new;
end;$$;
revoke all on function smartvolt_private.wa_company_system_cards() from public,anon,authenticated;
create trigger sv_wa_company_system_cards after insert on public.sv_companies
 for each row execute function smartvolt_private.wa_company_system_cards();
select smartvolt_private.wa_seed_system_cards(id) from public.sv_companies;
