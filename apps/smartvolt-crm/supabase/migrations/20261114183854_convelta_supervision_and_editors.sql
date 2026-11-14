-- Product Learning Sync checked: current brand grants, durable source ownership,
-- immutable observed event times. Active editors participate in real send admission.
create table public.sv_thread_editors(
 company_id uuid not null,provider text not null check(provider in('whatsapp','meta')),thread_id uuid not null,actor_id uuid not null,
 token uuid not null,revision bigint not null default 0,expires_at timestamptz not null,
 primary key(company_id,provider,thread_id),foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create table public.sv_editor_events(
 company_id uuid not null,provider text not null,thread_id uuid not null,id uuid not null default gen_random_uuid(),actor_id uuid not null,kind text not null,revision bigint not null,created_at timestamptz not null default now(),primary key(company_id,id),
 foreign key(company_id,provider,thread_id)references public.sv_customer_threads(company_id,provider,thread_id),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create function smartvolt_private.editor_lock_thread(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_write boolean default true)returns void language plpgsql security invoker set search_path=''as $$
declare conn uuid;begin
 if p_provider='whatsapp'and p_write then perform smartvolt_private.wa_require_actor(p_company,p_actor);end if;
 perform public.sv_authorize(p_company,p_actor,'crm',p_write);
 perform public.sv_thread_scope(p_company,p_actor,p_provider,p_thread);
 if p_provider='whatsapp'then
  select connection_id into strict conn from public.sv_wa_conversations where company_id=p_company and id=p_thread;
  perform 1 from public.sv_wa_connections where company_id=p_company and id=conn for update;
  perform 1 from public.sv_wa_conversations where company_id=p_company and id=p_thread for update;
 else
  select connection_id into strict conn from public.sv_meta_threads where company_id=p_company and id=p_thread;
  perform 1 from public.sv_meta_connections where company_id=p_company and id=conn for update;
  perform 1 from public.sv_meta_threads where company_id=p_company and id=p_thread for update;
 end if;end;$$;
create function smartvolt_private.editor_admit(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_token uuid,p_required boolean default false)returns void language plpgsql security invoker set search_path=''as $$
declare e public.sv_thread_editors;begin
 select * into e from public.sv_thread_editors where company_id=p_company and provider=p_provider and thread_id=p_thread for update;
 if e.expires_at>statement_timestamp()then
  if e.actor_id<>p_actor or p_token is distinct from e.token then raise exception 'editor_conflict';end if;
 elsif p_required or p_token is not null then raise exception 'editor_expired';end if;end;$$;
create function public.sv_editor_action(p_company uuid,p_actor uuid,p_provider text,p_thread uuid,p_token uuid,p_mode text,p_expected bigint default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare e public.sv_thread_editors;r record;changed boolean:=false;label text;begin
 if p_mode not in('read','acquire','heartbeat','takeover','release')or p_token is null then raise exception 'invalid_editor';end if;
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,p_provider,p_thread,p_mode<>'read');
 select * into e from public.sv_thread_editors where company_id=p_company and provider=p_provider and thread_id=p_thread for update;
 if p_mode='takeover'and coalesce(e.revision,0)is distinct from p_expected and not(e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp())then raise exception 'editor_conflict';end if;
 if p_mode='release'and e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp()then
  update public.sv_thread_editors set expires_at=statement_timestamp(),revision=revision+1 where company_id=p_company and provider=p_provider and thread_id=p_thread returning * into e;
 elsif p_mode in('acquire','heartbeat','takeover')then
  if(p_mode='takeover'and not coalesce(e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp(),false))or(p_mode='acquire'and(e.expires_at is null or e.expires_at<=statement_timestamp()))then
   insert into public.sv_thread_editors(company_id,provider,thread_id,actor_id,token,revision,expires_at)values(p_company,p_provider,p_thread,p_actor,p_token,coalesce(e.revision,0)+1,statement_timestamp()+interval '45 seconds')
   on conflict(company_id,provider,thread_id)do update set actor_id=excluded.actor_id,token=excluded.token,revision=excluded.revision,expires_at=excluded.expires_at returning * into e;changed=true;
  elsif e.actor_id=p_actor and e.token=p_token and e.expires_at>statement_timestamp()then
   update public.sv_thread_editors set expires_at=statement_timestamp()+interval '45 seconds'where company_id=p_company and provider=p_provider and thread_id=p_thread returning * into e;
  end if;
 end if;
 if changed then
  insert into public.sv_editor_events(company_id,provider,thread_id,actor_id,kind,revision)values(p_company,p_provider,p_thread,p_actor,p_mode,e.revision);
  for r in select id from public.sv_journey_runs where company_id=p_company and provider=p_provider and thread_id=p_thread and status='active'order by id loop perform smartvolt_private.journey_stop(p_company,r.id,'human_takeover');end loop;
  update public.sv_journey_sources set active=false where company_id=p_company and provider=p_provider and thread_id=p_thread and recipe='unanswered';
 end if;
 select display_name into label from public.sv_memberships where company_id=p_company and user_id=e.actor_id;
 return jsonb_build_object('held',coalesce(e.expires_at>statement_timestamp()and e.actor_id=p_actor and e.token=p_token,false),'occupied',coalesce(e.expires_at>statement_timestamp(),false),
 'actorName',case when e.expires_at>statement_timestamp()then label end,'revision',coalesce(e.revision,0),'expiresAt',e.expires_at);
end;$$;

-- Keep existing receipt semantics; no active editor can be bypassed through a
-- legacy inbox. A receipt replay reads an earlier outcome without a new POST.
alter function public.sv_wa_claim_send(uuid,uuid,uuid,bigint,uuid,text,uuid)rename to sv_wa_claim_send_core;
create function public.sv_wa_claim_send(p_company uuid,p_actor uuid,p_conversation uuid,p_expected bigint,p_client_id uuid,p_body text,p_reply_to uuid default null,p_editor_token uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,'whatsapp',p_conversation);
 if exists(select 1 from public.sv_wa_commands where company_id=p_company and client_id=p_client_id)then return public.sv_wa_claim_send_core(p_company,p_actor,p_conversation,p_expected,p_client_id,p_body,p_reply_to);end if;
 perform smartvolt_private.editor_admit(p_company,p_actor,'whatsapp',p_conversation,p_editor_token);
 if exists(select 1 from public.sv_wa_messages where company_id=p_company and conversation_id=p_conversation and direction='outgoing'and state in('dispatching','unknown'))then raise exception 'send_unresolved';end if;
 return public.sv_wa_claim_send_core(p_company,p_actor,p_conversation,p_expected,p_client_id,p_body,p_reply_to);end;$$;
alter function public.sv_meta_claim(uuid,uuid,uuid,uuid,bigint,text)rename to sv_meta_claim_core;
create function public.sv_meta_claim(p_company uuid,p_actor uuid,p_thread uuid,p_client uuid,p_expected bigint,p_body text,p_editor_token uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform smartvolt_private.editor_lock_thread(p_company,p_actor,'meta',p_thread);
 if exists(select 1 from public.sv_meta_messages where company_id=p_company and client_id=p_client)then return public.sv_meta_claim_core(p_company,p_actor,p_thread,p_client,p_expected,p_body);end if;
 perform smartvolt_private.editor_admit(p_company,p_actor,'meta',p_thread,p_editor_token);
 return public.sv_meta_claim_core(p_company,p_actor,p_thread,p_client,p_expected,p_body);end;$$;

create or replace function smartvolt_private.delivery_editor_admit(p_job public.sv_delivery_jobs)returns text language plpgsql volatile security invoker set search_path=''as $$begin
 if p_job.origin='manual'then
  begin perform smartvolt_private.editor_admit(p_job.company_id,p_job.actor_id,p_job.provider,p_job.thread_id,p_job.editor_token,true);exception when others then return 'human_takeover';end;
 elsif exists(select 1 from public.sv_thread_editors where company_id=p_job.company_id and provider=p_job.provider and thread_id=p_job.thread_id and expires_at>statement_timestamp())then return 'human_takeover';end if;
 if p_job.provider='whatsapp'and exists(select 1 from public.sv_wa_messages where company_id=p_job.company_id and conversation_id=p_job.thread_id and direction='outgoing'and state in('dispatching','unknown'))then return 'send_unresolved';end if;
 return null;end;$$;
alter table public.sv_thread_editors enable row level security;
revoke all on public.sv_thread_editors from public,anon,authenticated,service_role;grant select,insert,update on public.sv_thread_editors to service_role;
alter table public.sv_editor_events enable row level security;
revoke all on public.sv_editor_events from public,anon,authenticated,service_role;grant select,insert on public.sv_editor_events to service_role;
create trigger sv_editor_events_immutable before update or delete on public.sv_editor_events for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_editor_events_no_truncate before truncate on public.sv_editor_events for each statement execute function smartvolt_private.wa_reject_rewrite();
do $$declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('editor_lock_thread','editor_admit','sv_editor_action','sv_wa_claim_send','sv_meta_claim','delivery_editor_admit')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;
