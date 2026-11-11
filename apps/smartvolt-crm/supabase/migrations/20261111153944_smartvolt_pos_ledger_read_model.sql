-- Read-only, bounded relational ledger. No customer identity or raw snapshots leave this RPC.
create function public.sv_read_pos_ledger(
 p_company uuid,p_actor uuid,p_brand text,p_from bigint,p_to bigint,p_limit integer,
 p_before_at bigint default null,p_before_id text default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
   where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active')
 then raise exception 'access_denied'; end if;
 if not exists(select 1 from public.sv_company_products where company_id=p_company and product='pos'
   and status='active' and starts_at<=now() and (ends_at is null or ends_at>now()))
 then raise exception 'product_not_purchased'; end if;
 if p_from is null or p_to is null or p_limit is null or p_from<0 or p_to<=p_from
  or p_to-p_from>31622400000 or p_limit<1 or p_limit>100
  or (p_before_at is null)<>(p_before_id is null)
  or (p_before_id is not null and (length(p_before_id)<1 or length(p_before_id)>100))
  or (p_before_at is not null and p_before_at<0)
  or (p_brand is not null and (length(p_brand)<1 or length(p_brand)>100))
 then raise exception 'invalid_ledger_filter'; end if;
 -- The date range selects order creation dates; receipts/refunds are lifetime values for that cohort.
 -- All aggregates share one database snapshot. Pagination never changes the totals.
 with cohort as materialized (
  select o.*,coalesce(p.paid,0)::bigint paid,coalesce(r.refunded,0)::bigint refunded
  from public.sv_pos_orders o
  left join lateral(select sum(amount_cents) paid from public.sv_pos_payments p
    where p.company_id=o.company_id and p.order_id=o.id) p on true
  left join lateral(select sum(amount_cents) refunded from public.sv_pos_refunds r
    where r.company_id=o.company_id and r.order_id=o.id) r on true
  where o.company_id=p_company and (p_brand is null or o.brand_id=p_brand)
    and o.created_at>=p_from and o.created_at<p_to
 ), windowed as materialized (
  select * from cohort where p_before_at is null or (created_at,id)<(p_before_at,p_before_id)
  order by created_at desc,id desc limit p_limit+1
 ), page as (select * from windowed order by created_at desc,id desc limit p_limit)
 select jsonb_build_object(
  'revision',(select revision from public.sv_workspaces where company_id=p_company),
  'totals',(select jsonb_build_object('orders',count(*),
    'orderedCents',coalesce(sum(case when voided then 0 else total_cents end),0),
    'paidCents',coalesce(sum(paid),0),'refundedCents',coalesce(sum(refunded),0),
    'netCents',coalesce(sum(paid-refunded),0)) from cohort),
  'rows',coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'number',number,'brandId',brand_id,'createdAt',created_at,
    'totalCents',total_cents,'paidCents',paid,'refundedCents',refunded,
    'netCents',paid-refunded,'voided',voided,'revision',workspace_revision
   ) order by created_at desc,id desc) from page),'[]'::jsonb),
  'hasMore',(select count(*)>p_limit from windowed)
 ) into result;
 return result;
end;
$$;
revoke all on function public.sv_read_pos_ledger(uuid,uuid,text,bigint,bigint,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.sv_read_pos_ledger(uuid,uuid,text,bigint,bigint,integer,bigint,text) to service_role;

