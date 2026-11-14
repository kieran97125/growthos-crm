-- Bounded, paged catch-up and a private scheduled recovery path.
create table public.sv_execution_checkpoint(
 name text primary key,after_company uuid,updated_at timestamptz not null default now(),last_error text
);
create table public.sv_journey_scan_state(
 company_id uuid primary key references public.sv_companies(id),after_source text not null default '',after_booking text not null default '',backfill_complete boolean not null default false
);
create function public.sv_execution_tenants()returns jsonb language plpgsql security invoker set search_path=''as $$
declare cursor uuid;ids uuid[];begin
 insert into public.sv_execution_checkpoint(name)values('maintenance')on conflict do nothing;
 select after_company into cursor from public.sv_execution_checkpoint where name='maintenance'for update;
 select array_agg(id order by id)into ids from(select c.id from public.sv_companies c where c.status='active'and(cursor is null or c.id>cursor)order by c.id limit 50)q;
 if ids is null then update public.sv_execution_checkpoint set after_company=null,updated_at=now()where name='maintenance';return '[]';end if;
 update public.sv_execution_checkpoint set after_company=case when cardinality(ids)<50 then null else ids[cardinality(ids)]end,updated_at=now()where name='maintenance';return to_jsonb(ids);end;$$;
create function public.sv_journey_catchup(p_company uuid)returns integer language plpgsql security invoker set search_path=''as $$
declare cursor public.sv_journey_scan_state;r record;n integer:=0;seen integer:=0;last_key text;begin
 insert into public.sv_journey_scan_state(company_id)values(p_company)on conflict do nothing;
 select * into strict cursor from public.sv_journey_scan_state where company_id=p_company for update;
 if not cursor.backfill_complete then
  for r in select *from(
   select 'pos-appointment:'||p.id source_key,encode(sha256(convert_to(jsonb_build_array(p.contact_id,p.brand_id,p.starts_at,p.ends_at,p.status)::text,'UTF8')),'hex')version,
   p.contact_id customer,p.brand_id brand,to_timestamp(p.starts_at::double precision/1000)anchor,null::text provider,null::uuid thread,'pos'product
   from public.sv_pos_appointments p where p.company_id=p_company and p.status='confirmed'and p.starts_at>extract(epoch from now())*1000
   union all select 'crm-booking:'||p.id,encode(sha256(convert_to(jsonb_build_array(p.customer_id,p.brand_id,p.desired_at,p.status,p.pos_appointment_id)::text,'UTF8')),'hex'),p.customer_id,p.brand_id,p.desired_at,p.provider,p.thread_id,'crm'
   from public.sv_booking_requests p where p.company_id=p_company and p.status='confirmed'and p.pos_appointment_id is null and p.desired_at>now())q
   where source_key>cursor.after_booking order by source_key limit 100 loop
   last_key=r.source_key;seen=seen+1;
   if exists(select 1 from public.sv_customer_brands where company_id=p_company and customer_id=r.customer and brand_id=r.brand)then
    perform smartvolt_private.journey_source(p_company,r.source_key,r.version,r.customer,r.brand,'appointment',r.anchor,true,r.provider,r.thread,r.product);
   end if;
  end loop;
  update public.sv_journey_scan_state set after_booking=coalesce(last_key,after_booking),backfill_complete=seen<100 where company_id=p_company;
 end if;
 seen=0;last_key=null;
 for r in select source_key from public.sv_journey_sources s where s.company_id=p_company and s.active and s.recipe<>'unanswered'and s.source_key>cursor.after_source order by s.source_key limit 100 loop
  n=n+smartvolt_private.journey_enroll(p_company,r.source_key);seen=seen+1;last_key=r.source_key;
 end loop;
 update public.sv_journey_scan_state set after_source=case when seen<100 then ''else last_key end where company_id=p_company;return n;end;$$;
create function smartvolt_private.journey_delivery_status()returns trigger language plpgsql security invoker set search_path=''as $$begin
 if new.origin<>'journey'or new.state='scheduled'then return new;end if;
 if new.state='cancelled'then update public.sv_journey_runs set status='stopped',reason=new.reason where company_id=new.company_id and id=new.source_id and status='active';
 elsif new.state not in('dispatching','unknown')and not exists(select 1 from public.sv_delivery_jobs d where d.company_id=new.company_id and d.source_id=new.source_id and d.origin='journey'and d.state in('scheduled','dispatching','unknown'))then
  update public.sv_journey_runs set status='completed'where company_id=new.company_id and id=new.source_id and status='active';end if;return new;end;$$;
create trigger sv_journey_delivery_status after update of state on public.sv_delivery_jobs for each row execute function smartvolt_private.journey_delivery_status();
do $$declare t text;f record;begin
 foreach t in array array['sv_execution_checkpoint','sv_journey_scan_state']loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);execute format('grant select,insert,update on public.%I to service_role',t);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and proname in('sv_execution_tenants','sv_journey_catchup','journey_delivery_status')loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;
end;$$;
