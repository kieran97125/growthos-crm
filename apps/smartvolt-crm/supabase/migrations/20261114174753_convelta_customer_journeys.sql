-- Product Learning Sync checked: immutable publication, actual source outcomes,
-- company/brand grants and one shared durable send ledger.
create table public.sv_journeys(
 company_id uuid not null references public.sv_companies(id),id uuid not null,brand_id text not null,name text not null check(length(name)between 1 and 100),
 recipe text not null check(recipe in('unanswered','appointment','completed')),provider text not null check(provider in('whatsapp','meta')),connection_id uuid not null,
 purpose text not null check(purpose in('marketing','service')),enabled boolean not null default false,revision bigint not null default 0,published_version integer not null,
 created_by uuid not null,created_at timestamptz not null default now(),primary key(company_id,id)
);
create table public.sv_journey_versions(
 company_id uuid not null,journey_id uuid not null,version integer not null,steps jsonb not null check(jsonb_typeof(steps)='array'and jsonb_array_length(steps)between 1 and 4),
 created_by uuid not null,created_at timestamptz not null default now(),primary key(company_id,journey_id,version),foreign key(company_id,journey_id)references public.sv_journeys(company_id,id)
);
create table public.sv_journey_sources(
 company_id uuid not null,source_key text not null,source_version text not null,customer_id text not null,brand_id text not null,
 recipe text not null,anchor_at timestamptz not null,active boolean not null,provider text,thread_id uuid,product text not null check(product in('crm','pos')),
 created_at timestamptz not null default now(),primary key(company_id,source_key),foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id)
);
create index sv_journey_sources_pending on public.sv_journey_sources(company_id,recipe,brand_id,anchor_at)where active;
create table public.sv_journey_runs(
 company_id uuid not null,id uuid not null default gen_random_uuid(),journey_id uuid not null,version integer not null,source_key text not null,source_version text not null,
 customer_id text not null,brand_id text not null,provider text not null,thread_id uuid not null,status text not null default 'active'check(status in('active','stopped','completed')),reason text,
 created_at timestamptz not null default now(),primary key(company_id,id),unique(company_id,journey_id,version,source_key,source_version),
 foreign key(company_id,journey_id,version)references public.sv_journey_versions(company_id,journey_id,version)
);
create index sv_journey_runs_source on public.sv_journey_runs(company_id,source_key,source_version);
create index sv_journey_runs_thread on public.sv_journey_runs(company_id,provider,thread_id)where status='active';
create function smartvolt_private.journey_stop(p_company uuid,p_run uuid,p_reason text)returns void language plpgsql security invoker set search_path=''as $$begin
 update public.sv_delivery_jobs set state='cancelled',reason=p_reason,updated_at=now()where company_id=p_company and origin='journey'and source_id=p_run and state='scheduled';
 update public.sv_journey_runs set status='stopped',reason=p_reason where company_id=p_company and id=p_run and status='active';end;$$;
create function smartvolt_private.journey_enroll(p_company uuid,p_key text,p_journey uuid default null)returns integer language plpgsql security invoker set search_path=''as $$
declare s public.sv_journey_sources;j public.sv_journeys;v public.sv_journey_versions;t record;run_id uuid;step jsonb;position integer;stamp timestamptz;name text;n integer:=0;begin
 select * into s from public.sv_journey_sources where company_id=p_company and source_key=p_key;if not found or not s.active then return 0;end if;
 select c.name into strict name from public.sv_customers c where c.company_id=p_company and c.id=s.customer_id;
 for j in select *from public.sv_journeys where company_id=p_company and brand_id=s.brand_id and recipe=s.recipe and enabled and(p_journey is null or id=p_journey)loop
  if not smartvolt_private.member_has_product(p_company,j.created_by,'crm')or not smartvolt_private.member_brand_allowed(p_company,j.created_by,s.brand_id)or(s.product='pos'and not smartvolt_private.member_has_product(p_company,j.created_by,'pos'))then continue;end if;
  select * into t from smartvolt_private.ops_inquiries i where i.company_id=p_company and i.customer_id=s.customer_id and i.brand_id=s.brand_id and i.provider=j.provider
  and(s.thread_id is null or i.thread_id=s.thread_id)and((j.provider='whatsapp'and exists(select 1 from public.sv_wa_conversations c where c.company_id=p_company and c.id=i.thread_id and c.connection_id=j.connection_id))or(j.provider='meta'and exists(select 1 from public.sv_meta_threads c where c.company_id=p_company and c.id=i.thread_id and c.connection_id=j.connection_id)))order by i.updated_at desc,i.thread_id limit 1;
  if not found then continue;end if;
  select * into strict v from public.sv_journey_versions where company_id=p_company and journey_id=j.id and version=j.published_version;
  if not exists(select 1 from jsonb_array_elements(v.steps)sx where(case when s.recipe='appointment'then s.anchor_at-make_interval(mins=>(sx->>'delayMinutes')::integer)else s.anchor_at+make_interval(mins=>(sx->>'delayMinutes')::integer)end)>statement_timestamp())then continue;end if;
  insert into public.sv_journey_runs(company_id,journey_id,version,source_key,source_version,customer_id,brand_id,provider,thread_id)values(p_company,j.id,j.published_version,s.source_key,s.source_version,s.customer_id,s.brand_id,j.provider,t.thread_id)on conflict do nothing returning id into run_id;
  if run_id is null then continue;end if;position=0;
  for step in select value from jsonb_array_elements(v.steps)loop
   position=position+1;stamp=case when s.recipe='appointment'then s.anchor_at-make_interval(mins=>(step->>'delayMinutes')::integer)else s.anchor_at+make_interval(mins=>(step->>'delayMinutes')::integer)end;if stamp<=statement_timestamp()then continue;end if;
   insert into public.sv_delivery_jobs(company_id,brand_id,customer_id,provider,channel,connection_id,thread_id,purpose,origin,source_id,source_key,actor_id,payload,due_at)
   values(p_company,s.brand_id,s.customer_id,j.provider,t.channel,j.connection_id,t.thread_id,j.purpose,'journey',run_id,'journey:'||run_id||':'||position,j.created_by,smartvolt_private.delivery_render(step->'definition',name),stamp);n=n+1;
  end loop;
 end loop;return n;end;$$;
create function smartvolt_private.journey_source(p_company uuid,p_key text,p_version text,p_customer text,p_brand text,p_recipe text,p_anchor timestamptz,p_active boolean,p_provider text default null,p_thread uuid default null,p_product text default 'crm')returns void
language plpgsql security invoker set search_path=''as $$declare old public.sv_journey_sources;r record;begin
 select * into old from public.sv_journey_sources where company_id=p_company and source_key=p_key;if found and(old.source_version,old.active)=(p_version,p_active)then return;end if;
 for r in select id from public.sv_journey_runs where company_id=p_company and source_key=p_key and status='active'order by id loop perform smartvolt_private.journey_stop(p_company,r.id,'source_changed');end loop;
 insert into public.sv_journey_sources(company_id,source_key,source_version,customer_id,brand_id,recipe,anchor_at,active,provider,thread_id,product)values(p_company,p_key,p_version,p_customer,p_brand,p_recipe,p_anchor,p_active,p_provider,p_thread,p_product)
 on conflict(company_id,source_key)do update set source_version=excluded.source_version,customer_id=excluded.customer_id,brand_id=excluded.brand_id,anchor_at=excluded.anchor_at,active=excluded.active;
 if p_active then perform smartvolt_private.journey_enroll(p_company,p_key);end if;end;$$;
create function smartvolt_private.journey_message()returns trigger language plpgsql security invoker set search_path=''as $$
declare v_provider text;thread uuid;link public.sv_customer_threads;r record;incoming boolean;automated boolean;stamp timestamptz;begin
 v_provider=case when tg_table_name='sv_wa_messages'then 'whatsapp'else 'meta'end;
 if v_provider='whatsapp'then thread=new.conversation_id;incoming=new.direction='incoming';else thread=new.thread_id;incoming=new.direction='inbound';end if;
 if new.direction='note'then return new;end if;
 select exists(select 1 from public.sv_delivery_jobs where company_id=new.company_id and id=new.client_id and origin<>'manual')into automated;if automated then return new;end if;
 select * into link from public.sv_customer_threads where company_id=new.company_id and provider=v_provider and thread_id=thread;if not found then return new;end if;
 for r in select id from public.sv_journey_runs where company_id=new.company_id and provider=v_provider and thread_id=thread and status='active'order by id loop perform smartvolt_private.journey_stop(new.company_id,r.id,case when incoming then 'customer_replied'else 'human_replied'end);end loop;
 if incoming and not smartvolt_private.delivery_optout(new.body)then
  stamp=case when new.provider_at is null then new.created_at else to_timestamp(new.provider_at::double precision/1000)end;stamp=least(stamp,statement_timestamp());
  perform smartvolt_private.journey_source(new.company_id,'unanswered:'||v_provider||':'||thread,new.id::text,link.customer_id,link.brand_id,'unanswered',stamp,true,v_provider,thread);
 else update public.sv_journey_sources set active=false where company_id=new.company_id and source_key='unanswered:'||v_provider||':'||thread;end if;
 return new;end;$$;
create trigger sv_journey_wa_message after insert on public.sv_wa_messages for each row execute function smartvolt_private.journey_message();
create trigger sv_journey_meta_message after insert on public.sv_meta_messages for each row execute function smartvolt_private.journey_message();

create function smartvolt_private.journey_booking()returns trigger language plpgsql security invoker set search_path=''as $$
declare key text;version text;customer text;brand text;anchor timestamptz;active boolean;product text;provider text;thread uuid;status text;r record;begin
 if tg_table_name='sv_pos_appointments'then
  key='pos-appointment:'||new.id;customer=new.contact_id;brand=new.brand_id;anchor=to_timestamp(new.starts_at::double precision/1000);active=new.status='confirmed';product='pos';status=new.status;
  version=encode(sha256(convert_to(jsonb_build_array(new.contact_id,new.brand_id,new.starts_at,new.ends_at,new.status)::text,'UTF8')),'hex');
 else
  key='crm-booking:'||new.id;customer=new.customer_id;brand=new.brand_id;anchor=new.desired_at;active=new.status='confirmed'and new.pos_appointment_id is null;product='crm';provider=new.provider;thread=new.thread_id;status=new.status;
  version=encode(sha256(convert_to(jsonb_build_array(new.customer_id,new.brand_id,new.desired_at,new.status,new.pos_appointment_id)::text,'UTF8')),'hex');
 end if;
 if not exists(select 1 from public.sv_customer_brands where company_id=new.company_id and customer_id=customer and brand_id=brand)then return new;end if;
 perform smartvolt_private.journey_source(new.company_id,key,version,customer,brand,'appointment',anchor,active,provider,thread,product);
 if tg_table_name='sv_pos_appointments'then perform smartvolt_private.journey_source(new.company_id,'completed:'||key,version,customer,brand,'completed',statement_timestamp(),status='completed',null,null,'pos');end if;
 if status in('confirmed','linked','completed','checked_in')then
  for r in select run.id from public.sv_journey_runs run join public.sv_journeys j on j.company_id=run.company_id and j.id=run.journey_id where run.company_id=new.company_id and run.customer_id=customer and run.brand_id=brand and run.status='active'and j.recipe='unanswered'order by run.id loop perform smartvolt_private.journey_stop(new.company_id,r.id,'customer_booked');end loop;
 end if;return new;end;$$;
create trigger sv_journey_crm_booking after insert or update on public.sv_booking_requests for each row execute function smartvolt_private.journey_booking();
create trigger sv_journey_pos_booking after insert or update on public.sv_pos_appointments for each row execute function smartvolt_private.journey_booking();

create function smartvolt_private.journey_admit(p_job public.sv_delivery_jobs)returns text language plpgsql security invoker set search_path=''as $$declare r public.sv_journey_runs;s public.sv_journey_sources;j public.sv_journeys;begin
 select * into r from public.sv_journey_runs where company_id=p_job.company_id and id=p_job.source_id;
 select * into s from public.sv_journey_sources where company_id=p_job.company_id and source_key=r.source_key;
 select * into j from public.sv_journeys where company_id=p_job.company_id and id=r.journey_id;
 if r.id is null or r.status<>'active'or not s.active or s.source_version<>r.source_version or not j.enabled or j.published_version<>r.version then return 'source_changed';end if;
 if s.product='pos'and not smartvolt_private.member_has_product(p_job.company_id,p_job.actor_id,'pos')then return 'authority_changed';end if;return null;end;$$;

create function public.sv_journey_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb,p_request jsonb default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare j public.sv_journeys;ident uuid:=(p_data->>'id')::uuid;r jsonb;step jsonb;last_delay integer;delay integer;row record;v integer;begin
 select * into j from public.sv_journeys where company_id=p_company and id=ident;
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,coalesce(j.brand_id,p_data->>'brandId'));
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'journey:'||p_kind,coalesce(p_request,p_data));if r is not null then return r;end if;
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
  insert into public.sv_journeys(company_id,id,brand_id,name,recipe,provider,connection_id,purpose,enabled,published_version,created_by)
  values(p_company,ident,p_data->>'brandId',p_data->>'name',p_data->>'recipe',p_data->>'provider',(p_data->>'connectionId')::uuid,p_data->>'purpose',(p_data->>'enabled')::boolean,v,p_actor)
  on conflict(company_id,id)do update set name=excluded.name,purpose=excluded.purpose,enabled=excluded.enabled,published_version=v,created_by=p_actor,revision=sv_journeys.revision+1;
  insert into public.sv_journey_versions(company_id,journey_id,version,steps,created_by)values(p_company,ident,v,p_data->'steps',p_actor);
 elsif p_kind='toggle'then
  if j.id is null then raise exception 'journey_missing';end if;
  update public.sv_journeys set enabled=(p_data->>'enabled')::boolean,revision=revision+1 where company_id=p_company and id=ident and revision=(p_data->>'revision')::bigint;if not found then raise exception 'revision_conflict';end if;
  if(p_data->>'enabled')::boolean then
   insert into public.sv_journey_versions(company_id,journey_id,version,steps,created_by)select p_company,ident,j.published_version+1,steps,p_actor from public.sv_journey_versions where company_id=p_company and journey_id=ident and version=j.published_version;
   update public.sv_journeys set published_version=j.published_version+1,created_by=p_actor where company_id=p_company and id=ident;
  end if;
 else raise exception 'invalid_action';end if;
 for row in select id from public.sv_journey_runs where company_id=p_company and journey_id=ident and status='active'order by id loop perform smartvolt_private.journey_stop(p_company,row.id,'journey_changed');end loop;
 -- Catch-up is keyset paged by the watchdog; publication handles the first page.
 for row in select source_key from public.sv_journey_sources s where s.company_id=p_company and s.active and s.recipe<>'unanswered'and exists(select 1 from public.sv_journeys jj where jj.company_id=p_company and jj.id=ident and jj.enabled and jj.recipe=s.recipe and jj.brand_id=s.brand_id)order by s.anchor_at,s.source_key limit 200 loop perform smartvolt_private.journey_enroll(p_company,row.source_key,ident);end loop;
 r=jsonb_build_object('saved',true,'id',ident);insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'journey:'||p_kind,coalesce(p_request,p_data),r);return r;end;$$;

create function public.sv_journey_read(p_company uuid,p_actor uuid,p_after timestamptz default null,p_after_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm');return jsonb_build_object('journeys',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(select j.*,v.steps,
 (select count(*)from public.sv_journey_runs r where r.company_id=p_company and r.journey_id=j.id and r.status='active')active_runs,
 (select count(*)from public.sv_delivery_jobs d join public.sv_journey_runs r on r.company_id=d.company_id and r.id=d.source_id where d.company_id=p_company and r.journey_id=j.id and d.state in('accepted','sent','delivered','read'))accepted
 from public.sv_journeys j join public.sv_journey_versions v on v.company_id=j.company_id and v.journey_id=j.id and v.version=j.published_version where j.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)and(p_after is null or(j.created_at,j.id)<(p_after,p_after_id))order by j.created_at desc,j.id desc limit 31)q),'[]'));end;$$;

do $$declare t text;f record;begin
 foreach t in array array['sv_journeys','sv_journey_versions','sv_journey_sources','sv_journey_runs']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);end loop;
 revoke update on public.sv_journey_versions from service_role;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('journey_stop','journey_enroll','journey_source','journey_message','journey_booking','journey_admit','sv_journey_action','sv_journey_read')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;
create trigger sv_journey_versions_immutable before update or delete on public.sv_journey_versions for each row execute function smartvolt_private.wa_reject_rewrite();
create trigger sv_journey_versions_no_truncate before truncate on public.sv_journey_versions for each statement execute function smartvolt_private.wa_reject_rewrite();

create function smartvolt_private.journey_handoff()returns trigger language plpgsql security invoker set search_path=''as $$declare p text;r record;begin
 if new.previous->'assignee_id'is not distinct from new.next->'assignee_id'and new.next->>'status'<>'resolved'then return new;end if;
 p=case when tg_table_name='sv_wa_thread_activity'then 'whatsapp'else 'meta'end;
 for r in select id from public.sv_journey_runs where company_id=new.company_id and provider=p and thread_id=new.thread_id and status='active'order by id loop perform smartvolt_private.journey_stop(new.company_id,r.id,'human_takeover');end loop;
 update public.sv_journey_sources set active=false where company_id=new.company_id and provider=p and thread_id=new.thread_id and recipe='unanswered';return new;end;$$;
revoke all on function smartvolt_private.journey_handoff()from public,anon,authenticated;grant execute on function smartvolt_private.journey_handoff()to service_role;
create trigger sv_journey_wa_handoff after insert on public.sv_wa_thread_activity for each row execute function smartvolt_private.journey_handoff();
create trigger sv_journey_meta_handoff after insert on public.sv_meta_thread_activity for each row execute function smartvolt_private.journey_handoff();

create function public.sv_journey_receipt(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare brand text;begin
 select brand_id into brand from public.sv_journeys where company_id=p_company and id=(p_data->>'id')::uuid;
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,coalesce(brand,p_data->>'brandId'));
 if p_kind='publish'then
  if not exists(select 1 from public.sv_wa_connections where p_data->>'provider'='whatsapp'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=p_data->>'brandId'
  union all select 1 from public.sv_meta_connections where p_data->>'provider'='meta'and company_id=p_company and id=(p_data->>'connectionId')::uuid and brand_id=p_data->>'brandId')then raise exception 'brand_scope';end if;
 end if;
 return smartvolt_private.action_replay(p_company,p_actor,p_command,'journey:'||p_kind,p_data);end;$$;
revoke all on function public.sv_journey_receipt(uuid,uuid,uuid,text,jsonb)from public,anon,authenticated;grant execute on function public.sv_journey_receipt(uuid,uuid,uuid,text,jsonb)to service_role;
