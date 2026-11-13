-- Company AI is independent of provider-channel authorization. Drafts only.
create table public.sv_ai_settings(
 company_id uuid primary key references public.sv_companies(id),enabled boolean not null default false,
 daily_limit integer not null default 30 check(daily_limit between 1 and 100),updated_at timestamptz not null default now()
);
create table public.sv_ai_runtime(
 id text primary key check(id='platform'),model text not null,status text not null check(status in ('ready','blocked')),
 error_code text,checked_at timestamptz not null
);
create table public.sv_ai_requests(
 company_id uuid not null,request_id uuid not null,actor_id uuid not null,brand_id text not null,
 source text not null check(source in ('playground','conversation','meta')),source_id text,
 workspace_revision bigint not null check(workspace_revision>=0),source_revision bigint,
 model text not null check(length(model) between 3 and 150),request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'running' check(status in ('running','completed','failed')),
 result jsonb,error_code text,input_tokens integer,output_tokens integer,
 created_at timestamptz not null default now(),finished_at timestamptz,
 primary key(company_id,request_id),foreign key(company_id,actor_id) references public.sv_memberships(company_id,user_id),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=50000)),
 check(input_tokens is null or input_tokens>=0),check(output_tokens is null or output_tokens>=0)
);
create index sv_ai_requests_daily on public.sv_ai_requests(company_id,created_at desc);
create index sv_ai_requests_actor on public.sv_ai_requests(company_id,actor_id);
create function public.sv_ai_request_guard()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status<>'running' or new.status='running' or new.finished_at is null or
 (to_jsonb(new)-array['status','result','error_code','input_tokens','output_tokens','finished_at']) is distinct from
 (to_jsonb(old)-array['status','result','error_code','input_tokens','output_tokens','finished_at'])
 then raise exception 'ai_receipt_immutable';end if;
 return new;
end;$$;
create trigger sv_ai_request_guard before update on public.sv_ai_requests for each row execute function public.sv_ai_request_guard();
create function public.sv_ai_authorize(p_company uuid,p_actor uuid,p_owner boolean default false)returns void
language plpgsql security invoker set search_path='' as $$
declare r text;
begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active' for share of m,c;
 if r is null or r='viewer' or (p_owner and r<>'owner') then raise exception 'ai_access_denied';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company and p.product='crm' and p.status='active' and p.starts_at<=now() and (p.ends_at is null or p.ends_at>now())for share;
 if not found then raise exception 'ai_product_required';end if;
end;$$;
create function public.sv_ai_configure(p_company uuid,p_actor uuid,p_enabled boolean)returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform public.sv_ai_authorize(p_company,p_actor,true);
 if p_enabled is null then raise exception 'ai_invalid';end if;
 insert into public.sv_ai_settings(company_id,enabled)values(p_company,p_enabled)
 on conflict(company_id)do update set enabled=excluded.enabled,updated_at=now();
end;$$;
create function public.sv_ai_claim(p_company uuid,p_actor uuid,p_request uuid,p_brand text,p_source text,p_source_id text,p_workspace_revision bigint,p_source_revision bigint,p_model text,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare settings public.sv_ai_settings;doc public.sv_workspaces;r public.sv_ai_requests;t public.sv_meta_threads;day_start timestamptz;
begin
 perform public.sv_ai_authorize(p_company,p_actor);
 select * into settings from public.sv_ai_settings where company_id=p_company for update;
 if not found or not settings.enabled then raise exception 'ai_disabled';end if;
 select * into strict doc from public.sv_workspaces where company_id=p_company for share;
 if doc.revision is distinct from p_workspace_revision then raise exception 'ai_context_changed';end if;
 if p_request is null or p_source is null or p_source not in ('playground','conversation','meta') or
 p_model is null or length(p_model)not between 3 and 150 or p_hash is null or p_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'ai_invalid';end if;
 if not exists(select 1 from jsonb_array_elements(doc.payload #> '{scope,brands}')b where b->>'id'=p_brand)then raise exception 'ai_brand_scope';end if;
 if p_source='meta' then
  select * into strict t from public.sv_meta_threads where company_id=p_company and id=p_source_id::uuid for share;
  if t.revision is distinct from p_source_revision or not exists(select 1 from public.sv_meta_connections where company_id=p_company and id=t.connection_id and brand_id=p_brand)then raise exception 'ai_context_changed';end if;
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
create function public.sv_ai_finish(p_company uuid,p_actor uuid,p_request uuid,p_result jsonb,p_error text,p_input integer,p_output integer)returns jsonb
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
 elsif r.source='meta' then
  perform 1 from public.sv_meta_threads where company_id=p_company and id=r.source_id::uuid and revision=r.source_revision for share;
  if not found then err='context_changed';end if;
 end if;
 if err is null and (p_result is null or jsonb_typeof(p_result)<>'object')then raise exception 'ai_invalid';end if;
 update public.sv_ai_requests set status=case when err is null then 'completed' else 'failed' end,result=case when err is null then p_result else null end,
 error_code=err,input_tokens=p_input,output_tokens=p_output,finished_at=now() where company_id=p_company and request_id=p_request returning * into r;
 return jsonb_build_object('status',r.status,'result',r.result,'error_code',r.error_code);
end;$$;
alter table public.sv_ai_settings enable row level security;
alter table public.sv_ai_runtime enable row level security;
alter table public.sv_ai_requests enable row level security;
revoke all on public.sv_ai_settings,public.sv_ai_runtime,public.sv_ai_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_ai_settings,public.sv_ai_runtime,public.sv_ai_requests to service_role;
revoke all on function public.sv_ai_request_guard(),public.sv_ai_authorize(uuid,uuid,boolean),public.sv_ai_configure(uuid,uuid,boolean),public.sv_ai_claim(uuid,uuid,uuid,text,text,text,bigint,bigint,text,text),public.sv_ai_finish(uuid,uuid,uuid,jsonb,text,integer,integer) from public,anon,authenticated;
grant execute on function public.sv_ai_authorize(uuid,uuid,boolean),public.sv_ai_configure(uuid,uuid,boolean),public.sv_ai_claim(uuid,uuid,uuid,text,text,text,bigint,bigint,text,text),public.sv_ai_finish(uuid,uuid,uuid,jsonb,text,integer,integer) to service_role;
