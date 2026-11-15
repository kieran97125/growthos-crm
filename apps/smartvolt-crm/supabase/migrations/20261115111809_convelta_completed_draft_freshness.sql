-- Applying a completed suggestion only verifies current evidence. It never
-- reserves AI usage, creates a request or dispatches a provider.
create function public.sv_memory_ai_validate(p_company uuid,p_actor uuid,p_request uuid,p_expected_stamp text)returns boolean
language plpgsql security invoker set search_path=''as $$
declare prior public.sv_memory_ai_contexts;ctx jsonb;state text;begin
 perform public.sv_ai_authorize(p_company,p_actor);
 -- Context receipts are immutable; SELECT needs no broader UPDATE privilege.
 select *into prior from public.sv_memory_ai_contexts where company_id=p_company and request_id=p_request and actor_id=p_actor;
 if not found or prior.stamp is distinct from p_expected_stamp then raise exception 'ai_context_changed';end if;
 select status into state from public.sv_ai_requests where company_id=p_company and request_id=p_request and actor_id=p_actor and feature='reply'and product='crm'for share;
 if state is distinct from 'completed'then raise exception 'ai_context_changed';end if;
 begin ctx=public.sv_customer_memory_context(p_company,p_actor,prior.brand_id,prior.source,prior.source_id);
 exception when no_data_found then raise exception 'ai_context_changed';end;
 if ctx->>'stamp'is distinct from prior.stamp then raise exception 'ai_context_changed';end if;
 return true;
end;$$;
revoke all on function public.sv_memory_ai_validate(uuid,uuid,uuid,text)from public,anon,authenticated;
grant execute on function public.sv_memory_ai_validate(uuid,uuid,uuid,text)to service_role;
