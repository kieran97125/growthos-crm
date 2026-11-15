-- Product Learning Sync checked: Convelta own-site intake only, stable source identity; no inferred channel consent.
create table public.sv_sales_intake_settings(company_id uuid primary key references public.sv_companies(id),brand_id text not null,enabled boolean not null default false,revision bigint not null default 1,configured_by uuid not null);
create table public.sv_sales_enquiries(company_id uuid not null references public.sv_companies(id),source_id uuid not null,customer_id text not null,brand_id text not null,reference text not null,source_snapshot jsonb not null,source_created_at timestamptz not null,source_revision bigint not null,status text not null default 'new'check(status in('new','contacted','demo_scheduled','closed')),owner_id uuid,follow_up_at timestamptz,note text not null default ''check(length(note)<=2000),revision bigint not null default 0,primary key(company_id,source_id),foreign key(company_id,customer_id,brand_id)references public.sv_customer_brands(company_id,customer_id,brand_id),foreign key(company_id,owner_id)references public.sv_memberships(company_id,user_id));
create index sv_sales_enquiries_page on public.sv_sales_enquiries(company_id,source_created_at desc,source_id desc);
create function smartvolt_private.sales_ingest(p_row jsonb)returns void language plpgsql security invoker set search_path=''as $$
declare company uuid:=(p_row->>'company_id')::uuid;id uuid:=(p_row->>'id')::uuid;setting public.sv_sales_intake_settings;customer text:='website:'||id;begin
 select *into setting from public.sv_sales_intake_settings where company_id=company and enabled;
 if not found or coalesce((p_row->>'is_test')::boolean,true)then return;end if;
 if not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=company and b->>'id'=setting.brand_id)then return;end if;
 insert into public.sv_customers(company_id,id,name,phone,email,source)values(company,customer,p_row->>'name',p_row->>'phone',case when length(p_row->>'email')<=160 then p_row->>'email'else ''end,'Convelta 官網查詢')on conflict do nothing;
 insert into public.sv_customer_brands(company_id,customer_id,brand_id)values(company,customer,setting.brand_id)on conflict do nothing;
 insert into public.sv_sales_enquiries(company_id,source_id,customer_id,brand_id,reference,source_snapshot,source_created_at,source_revision)
 values(company,id,customer,setting.brand_id,p_row->>'reference',p_row-'fingerprint'-'payload_hash',(p_row->>'created_at')::timestamptz,(p_row->>'revision')::bigint)on conflict(company_id,source_id)do update set source_snapshot=excluded.source_snapshot,source_revision=excluded.source_revision;
 insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,detail,created_at)values(company,customer,setting.brand_id,'website-enquiry:'||id,'website-enquiry',jsonb_build_object('reference',p_row->>'reference','sourceId',id,'interest',p_row->>'interest','consentVersion',p_row->>'consent_version','marketingConsent',p_row->'marketing_consent','channelConsentInferred',false),(p_row->>'created_at')::timestamptz)on conflict(company_id,event_key)do nothing;
end;$$;
create function smartvolt_private.sales_trigger()returns trigger language plpgsql security invoker set search_path=''as $$begin perform smartvolt_private.sales_ingest(to_jsonb(new));return new;end;$$;
create function public.sv_sales_catchup(p_company uuid)returns integer language plpgsql security invoker set search_path=''as $$declare r jsonb;n integer:=0;begin
 if to_regclass('website_private.enquiries')is null or not exists(select 1 from public.sv_sales_intake_settings where company_id=p_company and enabled)then return 0;end if;
 for r in execute 'select to_jsonb(e)from website_private.enquiries e join website_private.intake_settings i on i.company_id=e.company_id and i.singleton and i.active where e.company_id=$1 and not e.is_test and not exists(select 1 from public.sv_sales_enquiries s where s.company_id=e.company_id and s.source_id=e.id and s.source_revision>=e.revision)order by e.created_at,e.id limit 100'using p_company loop perform smartvolt_private.sales_ingest(r);n=n+1;end loop;return n;
end;$$;
create function public.sv_sales_read(p_company uuid,p_actor uuid,p_before timestamptz default null,p_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$declare configured uuid;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 if to_regclass('website_private.intake_settings')is not null then execute 'select company_id from website_private.intake_settings where singleton and active'into configured;end if;
 return jsonb_build_object('available',configured=p_company,'canConfigure',exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner'and brand_ids is null),
 'setting',(select jsonb_build_object('brandId',brand_id,'enabled',enabled,'revision',revision)from public.sv_sales_intake_settings where company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)),
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'total',(select count(*)from public.sv_sales_enquiries e where company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)),
 'rows',coalesce((select jsonb_agg(q order by q.source_created_at desc,q.source_id desc)from(select e.*,m.display_name owner_name from public.sv_sales_enquiries e left join public.sv_memberships m on m.company_id=e.company_id and m.user_id=e.owner_id where e.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,e.brand_id)and(p_before is null or(e.source_created_at,e.source_id)<(p_before,p_id))order by e.source_created_at desc,e.source_id desc limit 31)q),'[]'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',user_id,'name',display_name))from public.sv_memberships where company_id=p_company and status='active'and role<>'viewer'and smartvolt_private.member_has_product(p_company,user_id,'crm')),'[]'));
end;$$;
create function public.sv_sales_action(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;e public.sv_sales_enquiries;configured uuid;rev bigint;begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,p_kind='setting');
 if p_kind='setting'then
  if not exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner'and brand_ids is null)then raise exception 'access_denied';end if;
  if to_regclass('website_private.intake_settings')is not null then execute 'select company_id from website_private.intake_settings where singleton and active'into configured;end if;
  if configured is distinct from p_company then raise exception 'access_denied';end if;
  perform public.sv_member_scope(p_company,p_actor,p_data->>'brandId');
 else select *into strict e from public.sv_sales_enquiries where company_id=p_company and source_id=(p_data->>'id')::uuid;perform public.sv_member_scope(p_company,p_actor,e.brand_id);end if;
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'sales:'||p_kind,p_data);if r is not null then return r;end if;
 if p_kind='setting'then
  perform pg_advisory_xact_lock(hashtextextended('sales-setting:'||p_company,0));
  select revision into rev from public.sv_sales_intake_settings where company_id=p_company for update;if coalesce(rev,0)<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  if exists(select 1 from public.sv_sales_enquiries where company_id=p_company)and exists(select 1 from public.sv_sales_intake_settings where company_id=p_company and brand_id<>p_data->>'brandId')then raise exception 'brand_identity_changed';end if;
  insert into public.sv_sales_intake_settings(company_id,brand_id,enabled,configured_by)values(p_company,p_data->>'brandId',(p_data->>'enabled')::boolean,p_actor)on conflict(company_id)do update set enabled=excluded.enabled,brand_id=excluded.brand_id,revision=sv_sales_intake_settings.revision+1;
  perform public.sv_sales_catchup(p_company);
 elsif p_kind='update'then
  if p_data->>'ownerId'is not null and(not smartvolt_private.member_has_product(p_company,(p_data->>'ownerId')::uuid,'crm')or not smartvolt_private.member_brand_allowed(p_company,(p_data->>'ownerId')::uuid,e.brand_id)or not exists(select 1 from public.sv_memberships where company_id=p_company and user_id=(p_data->>'ownerId')::uuid and status='active'and role<>'viewer'))then raise exception 'assignee_invalid';end if;
  update public.sv_sales_enquiries set status=p_data->>'status',owner_id=(p_data->>'ownerId')::uuid,follow_up_at=(p_data->>'followUpAt')::timestamptz,note=p_data->>'note',revision=revision+1 where company_id=p_company and source_id=e.source_id and revision=(p_data->>'revision')::bigint;if not found then raise exception 'revision_conflict';end if;
  insert into public.sv_customer_events(company_id,customer_id,brand_id,event_key,kind,actor_id,detail)values(p_company,e.customer_id,e.brand_id,'sales:'||p_command,'website-followup',p_actor,p_data-'note');
 else raise exception 'invalid_action';end if;
 r='{"saved":true}';insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'sales:'||p_kind,p_data,r);return r;
end;$$;
do $$declare t text;f record;begin
 foreach t in array array['sv_sales_intake_settings','sv_sales_enquiries']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('sales_ingest','sales_trigger','sv_sales_catchup','sv_sales_read','sv_sales_action')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
 if to_regclass('website_private.enquiries')is not null then execute 'create trigger convelta_sales_handoff after insert or update on website_private.enquiries for each row execute function smartvolt_private.sales_trigger()';end if;
end;$$;
do $$begin if to_regclass('website_private.enquiries')is not null then execute 'grant usage on schema website_private to service_role';execute 'grant select on website_private.enquiries,website_private.intake_settings to service_role';end if;end;$$;
