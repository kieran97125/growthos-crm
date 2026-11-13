-- Preserve concurrent profile edits during the first POS handoff.
create or replace function public.sv_customer_update(p_company uuid,p_actor uuid,p_customer text,p_expected bigint,p_command uuid,p_data jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.sv_customers;r public.sv_inquiry_commands;req jsonb;outcome jsonb;doc public.sv_workspaces;cs jsonb;
begin
 perform public.sv_customer_authorize(p_company,p_actor,true);
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
