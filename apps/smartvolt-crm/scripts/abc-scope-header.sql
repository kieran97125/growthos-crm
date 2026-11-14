-- Current stored brand/product grants, before paging, aggregation, replay or mutation.
create function smartvolt_private.copilot_thread_allowed(p_company uuid,p_actor uuid,p_thread uuid)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_copilot_threads t where t.company_id=p_company and t.id=p_thread and t.actor_id=p_actor)
 and not exists(select 1 from public.sv_ai_requests r where r.company_id=p_company and r.source='copilot'and r.source_id=p_thread::text
 and(not smartvolt_private.member_has_product(p_company,p_actor,r.product)or not smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)))
$$;
-- Return retained data that this member may not modify. Compare old/new under the document lock.
create function smartvolt_private.protected_workspace(p_company uuid,p_actor uuid,p jsonb)returns jsonb language plpgsql stable security invoker set search_path=''as $$
declare result jsonb='{}';path text[];paths text[];item jsonb;denied jsonb;brand text;entity text;brands text[];crm boolean;pos boolean;
begin
 select brand_ids into brands from public.sv_memberships where company_id=p_company and user_id=p_actor;
 crm=smartvolt_private.member_has_product(p_company,p_actor,'crm');pos=smartvolt_private.member_has_product(p_company,p_actor,'pos');
 if brands is null and crm and pos then return result;end if;
 foreach paths slice 1 in array array[
  ['inbox','contacts'],['inbox','conversations'],['inbox','messages'],['inbox','bookings'],['studio','flows'],['studio','versions'],['studio','bots'],['studio','articles'],
  ['broadcasts','templates'],['broadcasts','profiles'],['broadcasts','campaigns'],['broadcasts','recipients'],['broadcasts','events'],
  ['pos','catalog'],['pos','resources'],['pos','appointments'],['pos','orders'],['pos','payments'],['pos','refunds'],['pos','entitlements'],['pos','redemptions'],['pos','audit']
 ]loop
  if brands is null and(paths=array['inbox','contacts']or(paths[1]='pos'and pos)or(paths[1]<>'pos'and crm))then continue;end if;
  denied='[]';
  for item in select value from jsonb_array_elements(coalesce(p#>paths,'[]'))loop
   brand=item->>'brandId';
   if paths=array['studio','versions']then brand=item#>>'{flow,brandId}';end if;
   if paths[1]='inbox'and paths[2]in('messages','bookings')then select c->>'brandId'into brand from jsonb_array_elements(p#>'{inbox,conversations}')c where c->>'id'=item->>'conversationId';end if;
   if paths=array['broadcasts','recipients']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{broadcasts,campaigns}')c where c->>'id'=item->>'campaignId';end if;
   if paths=array['broadcasts','events']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{broadcasts,campaigns}')c join jsonb_array_elements(p#>'{broadcasts,recipients}')r on r->>'campaignId'=c->>'id'where r->>'id'=item->>'recipientId';end if;
   if paths[1]='pos'and paths[2]in('payments','refunds')then select c->>'brandId'into brand from jsonb_array_elements(p#>'{pos,orders}')c where c->>'id'=item->>'orderId';end if;
   if paths=array['pos','redemptions']then select c->>'brandId'into brand from jsonb_array_elements(p#>'{pos,entitlements}')c where c->>'id'=item->>'entitlementId';end if;
   if paths=array['pos','audit']then
    select c->>'brandId'into brand from(
     select value c from jsonb_array_elements(coalesce(p#>'{pos,orders}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,appointments}','[]'))union all
     select value from jsonb_array_elements(coalesce(p#>'{pos,catalog}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,resources}','[]'))union all select value from jsonb_array_elements(coalesce(p#>'{pos,entitlements}','[]'))
    )q where c->>'id'=item->>'entityId';
   end if;
   if paths=array['inbox','contacts']then
    if brands is not null and(not exists(select 1 from jsonb_array_elements_text(item->'brandIds')b where b=any(brands))or exists(select 1 from jsonb_array_elements_text(item->'brandIds')b where not b=any(brands)))then denied=denied||jsonb_build_array(item);end if;
   elsif(paths[1]='pos'and not pos)or(paths[1]<>'pos'and not crm)or(brands is not null and(brand is null or not brand=any(brands)))then denied=denied||jsonb_build_array(item);end if;
  end loop;
  result=result||jsonb_build_object(array_to_string(paths,'.'),denied);
 end loop;
 return result;
end;$$;
create function public.sv_copilot_thread_list(p_company uuid,p_actor uuid,p_product text)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb)into r from(select id,title,created_at,updated_at from public.sv_copilot_threads where company_id=p_company and actor_id=p_actor and product=p_product and smartvolt_private.copilot_thread_allowed(p_company,p_actor,id)order by updated_at desc,id limit 30)t;return r;
end;$$;
create function public.sv_copilot_thread_read(p_company uuid,p_actor uuid,p_product text,p_thread uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;begin
 perform public.sv_copilot_authorize(p_company,p_actor,p_product);
 if not smartvolt_private.copilot_thread_allowed(p_company,p_actor,p_thread)or not exists(select 1 from public.sv_copilot_threads where company_id=p_company and id=p_thread and product=p_product)then raise exception 'brand_scope';end if;
 select coalesce(jsonb_agg(to_jsonb(t)order by created_at,id),'[]'::jsonb)into r from(select id,role,body,result,created_at from public.sv_copilot_messages where company_id=p_company and thread_id=p_thread order by created_at desc,id desc limit 100)t;return r;
end;$$;
revoke all on function smartvolt_private.copilot_thread_allowed(uuid,uuid,uuid),smartvolt_private.protected_workspace(uuid,uuid,jsonb),public.sv_copilot_thread_list(uuid,uuid,text),public.sv_copilot_thread_read(uuid,uuid,text,uuid)from public,anon,authenticated;
grant execute on function smartvolt_private.copilot_thread_allowed(uuid,uuid,uuid),smartvolt_private.protected_workspace(uuid,uuid,jsonb),public.sv_copilot_thread_list(uuid,uuid,text),public.sv_copilot_thread_read(uuid,uuid,text,uuid)to service_role;
