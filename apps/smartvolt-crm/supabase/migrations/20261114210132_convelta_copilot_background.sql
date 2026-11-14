-- Product Learning Sync checked: fresh per-brand facts, existing C quiet feedback,
-- deterministic observations only. No AI request or customer send is created.
create table public.sv_copilot_background(
 company_id uuid not null,user_id uuid not null,brand_id text not null,signal_key text not null,
 family text not null,subject text not null,title text not null,detail jsonb not null,
 active boolean not null default true,checked_at timestamptz not null,
 primary key(company_id,user_id,brand_id,signal_key),
 foreign key(company_id,user_id)references public.sv_memberships(company_id,user_id),
 check(length(signal_key)between 1 and 120 and length(title)between 1 and 200 and octet_length(detail::text)<=12000)
);
create table public.sv_copilot_background_cursor(
 company_id uuid not null,user_id uuid not null,after_brand text,watermarks jsonb not null default '{}',
 primary key(company_id,user_id),foreign key(company_id,user_id)references public.sv_memberships(company_id,user_id)
);
alter table public.sv_notifications drop constraint sv_notifications_kind_check;
alter table public.sv_notifications add constraint sv_notifications_kind_check check(kind in('assignment','followup','sla','observation'));
alter table public.sv_notifications add column evidence jsonb;

create function public.sv_copilot_background_context(p_company uuid,p_actor uuid)returns jsonb
language plpgsql security invoker set search_path=''as $$declare cursor text;brands text[];begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 if exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='viewer')then return jsonb_build_object('brands','[]'::jsonb,'feedback','[]'::jsonb);end if;
 insert into public.sv_copilot_background_cursor(company_id,user_id)values(p_company,p_actor)on conflict do nothing;
 select after_brand into cursor from public.sv_copilot_background_cursor where company_id=p_company and user_id=p_actor for update;
 select array_agg(id order by id)into brands from(
  select b->>'id'id from public.sv_workspaces w cross join lateral jsonb_array_elements(w.payload#>'{scope,brands}')b
  where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')and(cursor is null or b->>'id'>cursor)
  order by b->>'id'limit 5
 )q;
 update public.sv_copilot_background_cursor set after_brand=case when cardinality(brands)=5 then brands[5]end where company_id=p_company and user_id=p_actor;
 return jsonb_build_object('brands',coalesce(to_jsonb(brands),'[]'),
 'feedback',coalesce((select jsonb_agg(q)from(select signal_key,family,subject,status,until from public.sv_copilot_feedback where company_id=p_company and actor_id=p_actor and until>statement_timestamp()order by updated_at desc limit 200)q),'[]'));
end;$$;

create function public.sv_copilot_background_record(p_company uuid,p_actor uuid,p_brand text,p_checked timestamptz,p_rows jsonb)returns void
language plpgsql security invoker set search_path=''as $$declare item jsonb;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 if not smartvolt_private.member_brand_allowed(p_company,p_actor,p_brand)or not exists(select 1 from public.sv_workspaces w cross join lateral jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=p_brand)then raise exception 'brand_scope';end if;
 if exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='viewer')then raise exception 'access_denied';end if;
 if p_checked is null or p_rows is null or p_checked<statement_timestamp()-interval '2 minutes'or p_checked>statement_timestamp()+interval '5 seconds'or jsonb_typeof(p_rows)<>'array'or jsonb_array_length(p_rows)>3 then raise exception 'stale_observation';end if;
 perform pg_advisory_xact_lock(hashtextextended('copilot-background:'||p_company||':'||p_actor||':'||p_brand,0));
 -- An older worker cannot overwrite a newer completed observation snapshot.
 insert into public.sv_copilot_background_cursor(company_id,user_id)values(p_company,p_actor)on conflict do nothing;
 if exists(select 1 from public.sv_copilot_background_cursor where company_id=p_company and user_id=p_actor and(watermarks->>p_brand)::timestamptz>p_checked)then return;end if;
 update public.sv_copilot_background_cursor set watermarks=jsonb_set(watermarks,array[p_brand],to_jsonb(p_checked))where company_id=p_company and user_id=p_actor;
 update public.sv_copilot_background set active=false,checked_at=p_checked where company_id=p_company and user_id=p_actor and brand_id=p_brand;
 for item in select value from jsonb_array_elements(p_rows)loop
  if item->>'family'not in('overdue','reactivation','conversion')or length(item->>'key')not between 1 and 120 or jsonb_typeof(item->'evidence')<>'array'or jsonb_typeof(item->'facts')<>'array'then raise exception 'invalid_observation';end if;
  insert into public.sv_copilot_background(company_id,user_id,brand_id,signal_key,family,subject,title,detail,checked_at)
  values(p_company,p_actor,p_brand,item->>'key',item->>'family',item->>'subject',item->>'title',item,p_checked)
  on conflict(company_id,user_id,brand_id,signal_key)do update set active=true,title=excluded.title,detail=excluded.detail,checked_at=excluded.checked_at;
 end loop;
 perform public.sv_notification_sync(p_company,p_actor);
 update public.sv_notifications n set evidence=b.detail||jsonb_build_object('checkedAt',b.checked_at)from public.sv_copilot_background b
 where b.company_id=p_company and b.user_id=p_actor and b.brand_id=p_brand and b.active and n.company_id=b.company_id and n.user_id=b.user_id and n.source_key='observation:'||b.brand_id||':'||b.signal_key;
end;$$;

alter function smartvolt_private.notification_candidates(uuid,uuid)rename to notification_task_candidates;
create function smartvolt_private.notification_candidates(p_company uuid,p_actor uuid)
returns table(source_key text,brand_id text,kind text,title text,href text)language sql stable security invoker set search_path=''as $$
 select * from smartvolt_private.notification_task_candidates(p_company,p_actor)
 union all
 select 'observation:'||b.brand_id||':'||b.signal_key,b.brand_id,'observation',b.title,'/company/'||p_company||'/crm/reports'
 from public.sv_copilot_background b
 where b.company_id=p_company and b.user_id=p_actor and b.active and b.checked_at>statement_timestamp()-interval '45 minutes'
 and smartvolt_private.member_has_product(p_company,p_actor,'crm')and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)
 and exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and status='active'and role<>'viewer')
 and coalesce((select(data->>'observation')::boolean from public.sv_notification_preferences where company_id=p_company and user_id=p_actor),true)
 and not exists(select 1 from public.sv_copilot_feedback f where f.company_id=p_company and f.actor_id=p_actor and f.status<>'seen'and f.until>statement_timestamp()and(f.signal_key=b.signal_key or f.signal_key=b.detail->>'feedbackKey'or(f.family=b.family and f.subject=b.subject)or f.family='quiet'))
$$;

create or replace function public.sv_notification_read(p_company uuid,p_actor uuid,p_before timestamptz default null,p_id uuid default null)returns jsonb language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_notification_sync(p_company,p_actor);
 return jsonb_build_object('preferences',(select jsonb_build_object('data',data,'revision',revision)from public.sv_notification_preferences where company_id=p_company and user_id=p_actor),
 'total',(select count(*)from public.sv_notifications where company_id=p_company and user_id=p_actor and state='open'and coalesce(snoozed_until,'epoch')<=statement_timestamp()and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)),
 'rows',coalesce((select jsonb_agg(q order by q.created_at desc,q.id desc)from(select id,kind,title,href,state,snoozed_until,revision,created_at,evidence from public.sv_notifications where company_id=p_company and user_id=p_actor and state='open'and coalesce(snoozed_until,'epoch')<=statement_timestamp()and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id)and(p_before is null or(created_at,id)<(p_before,p_id))order by created_at desc,id desc limit 31)q),'[]'),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active,'created_at',created_at))from public.sv_push_devices where company_id=p_company and user_id=p_actor),'[]'));
end;$$;
do $$declare t text;f record;begin
 foreach t in array array['sv_copilot_background','sv_copilot_background_cursor']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('sv_copilot_background_context','sv_copilot_background_record','notification_candidates')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;
