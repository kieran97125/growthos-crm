-- Runs inside the caller's BEGIN...ROLLBACK, after setting convelta.verify.company.
-- The caller provisions a synthetic company with synthetic-customer and owner.
do $segments_verify$
declare c uuid:=current_setting('convelta.verify.company')::uuid;actor uuid;s uuid:=gen_random_uuid();command uuid:=gen_random_uuid();request jsonb;r jsonb;replay jsonb;blocked boolean:=false;begin
 select user_id into strict actor from public.sv_memberships where company_id=c and role='owner'and status='active'limit 1;
 request=jsonb_build_object('commandId',command,'id',s,'brandId','main','name','Synthetic native segment','mode','all','rules',jsonb_build_array(jsonb_build_object('kind','tag','value','verify-segment')),'includePos',false,'enabled',true,'revision',0);
 r=public.sv_segment_action(c,actor,'upsert',request);replay=public.sv_segment_action(c,actor,'upsert',request);
 if r is distinct from replay then raise exception 'segment_native_replay';end if;
 perform public.sv_segments_catchup(c);
 -- Shared inbox writes queue a full refresh; they do not synchronously scan all customers.
 update public.sv_workspaces set payload=jsonb_set(payload,'{inbox}',(payload->'inbox')||jsonb_build_object('selectedConversationId','synthetic-queue-entry'))where company_id=c;
 if not exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_workspace_not_queued';end if;
 update public.sv_customers set tags='["verify-segment"]',revision=revision+1 where company_id=c and id='synthetic-customer';
 if not smartvolt_private.segment_customer_allowed(c,actor,'main',s,'synthetic-customer')then raise exception 'segment_native_live_predicate';end if;
 if not exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_entry_not_queued';end if;
 perform public.sv_segments_catchup(c);
 if exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_entry_catchup_pending';end if;
 if not exists(select 1 from public.sv_segment_members where company_id=c and segment_id=s and customer_id='synthetic-customer'and active)then raise exception 'segment_native_automatic_entry';end if;
 update public.sv_workspaces set payload=jsonb_set(payload,'{inbox}',(payload->'inbox')||jsonb_build_object('selectedConversationId','synthetic-queue-exit'))where company_id=c;
 if not exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_exit_workspace_not_queued';end if;
 update public.sv_customers set tags='[]',revision=revision+1 where company_id=c and id='synthetic-customer';
 if smartvolt_private.segment_customer_allowed(c,actor,'main',s,'synthetic-customer')then raise exception 'segment_native_live_exit_predicate';end if;
 if not exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_exit_not_queued';end if;
 perform public.sv_segments_catchup(c);
 if exists(select 1 from public.sv_segment_dirty where company_id=c)then raise exception 'segment_native_exit_catchup_pending';end if;
 if exists(select 1 from public.sv_segment_members where company_id=c and segment_id=s and active)then raise exception 'segment_native_automatic_exit';end if;
 if(select count(*)from public.sv_segment_events where company_id=c and segment_id=s)<>2 then raise exception 'segment_native_event_dedup';end if;
 begin perform public.sv_segment_action(c,actor,'upsert',jsonb_set(request,'{name}','"Different"'));exception when raise_exception then if sqlerrm='idempotency_conflict'then blocked=true;else raise;end if;end;
 if not blocked then raise exception 'segment_native_command_immutable';end if;
 if not smartvolt_private.segment_matches('all','[{"kind":"inactive","days":1}]','{"lastInbound":"2026-11-14T00:00:00+08:00"}','2026-11-15T00:00:00+08:00')or smartvolt_private.segment_matches('all','[{"kind":"recent_inbound","days":1}]','{"lastInbound":"2026-11-14T00:00:00+08:00"}','2026-11-15T00:00:00+08:00')then raise exception 'segment_native_hkt_boundary';end if;
 perform public.sv_segments_catchup(c);
 if exists(select 1 from information_schema.role_table_grants where table_schema='public'and table_name in('sv_dynamic_segments','sv_segment_members','sv_segment_events','sv_segment_dirty')and grantee in('anon','authenticated','PUBLIC'))then raise exception 'segment_native_browser_grants';end if;
 perform set_config('convelta.verify.segment',s::text,true);
end;$segments_verify$;
