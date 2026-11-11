-- Product Learning Sync checked: existing standalone CRM/POS contract; neutral
-- booking/payment/consumption separation, cents, first-payment snapshots and
-- append-only corrections. Apply only to the dedicated SmartVolt project.
-- The aggregate remains the command model. These companion records are written
-- in its transaction and are suitable for bounded, company-scoped ledger reads.
create schema if not exists smartvolt_private;
revoke all on schema smartvolt_private from public, anon, authenticated;
grant usage on schema smartvolt_private to service_role;

create table public.sv_pos_appointments (
 company_id uuid not null references public.sv_companies(id),
 id text not null check(char_length(id) between 1 and 100),
 brand_id text not null, contact_id text not null, service_id text not null,
 starts_at bigint not null, ends_at bigint not null,
 status text not null check(status in ('pending','confirmed','checked_in','completed','no_show','cancelled')),
 guests integer not null check(guests between 1 and 30),
 workspace_revision bigint not null check(workspace_revision>=0),
 snapshot jsonb not null,
 primary key(company_id,id), check(ends_at>starts_at)
);
create table public.sv_pos_orders (
 company_id uuid not null references public.sv_companies(id),
 id text not null check(char_length(id) between 1 and 100),
 number text not null check(char_length(number) between 1 and 50),
 brand_id text not null, contact_id text not null, appointment_id text,
 subtotal_cents bigint not null check(subtotal_cents between 0 and 100000000),
 discount_cents bigint not null check(discount_cents between 0 and subtotal_cents),
 total_cents bigint not null check(total_cents=subtotal_cents-discount_cents),
 voided boolean not null, created_at bigint not null,
 workspace_revision bigint not null check(workspace_revision>=0),
 snapshot jsonb not null,
 primary key(company_id,id),
 foreign key(company_id,appointment_id) references public.sv_pos_appointments(company_id,id)
);
create index sv_pos_orders_by_created on public.sv_pos_orders(company_id,created_at desc,id desc);
create index sv_pos_orders_by_brand_created on public.sv_pos_orders(company_id,brand_id,created_at desc,id desc);
create index sv_pos_orders_by_appointment on public.sv_pos_orders(company_id,appointment_id);
create table public.sv_pos_order_versions (
 company_id uuid not null, order_id text not null,
 workspace_revision bigint not null check(workspace_revision>=0),
 snapshot jsonb not null, recorded_at timestamptz not null default now(),
 primary key(company_id,order_id,workspace_revision),
 foreign key(company_id,order_id) references public.sv_pos_orders(company_id,id)
);
create table public.sv_pos_payments (
 company_id uuid not null, id text not null check(char_length(id) between 1 and 100),
 order_id text not null,
 amount_cents bigint not null check(amount_cents between 1 and 100000000),
 method text not null check(method in ('cash','fps','card')),
 reference text not null check(char_length(reference)<=160 and (method='cash' or char_length(btrim(reference))>0)),
 occurred_at bigint not null, actor text not null check(char_length(actor)<=80),
 source text not null check(source='manual_verified'),
 workspace_revision bigint not null check(workspace_revision>=0), snapshot jsonb not null,
 primary key(company_id,id),
 foreign key(company_id,order_id) references public.sv_pos_orders(company_id,id)
);
create index sv_pos_payments_by_order on public.sv_pos_payments(company_id,order_id);
create index sv_pos_payments_by_date on public.sv_pos_payments(company_id,occurred_at desc,id desc);
create table public.sv_pos_refunds (
 company_id uuid not null, id text not null check(char_length(id) between 1 and 100),
 order_id text not null,
 amount_cents bigint not null check(amount_cents between 1 and 100000000),
 reason text not null check(char_length(btrim(reason)) between 1 and 300),
 occurred_at bigint not null, actor text not null check(char_length(actor)<=80),
 source text not null check(source='manual_verified'),
 workspace_revision bigint not null check(workspace_revision>=0), snapshot jsonb not null,
 primary key(company_id,id),
 foreign key(company_id,order_id) references public.sv_pos_orders(company_id,id)
);
create index sv_pos_refunds_by_order on public.sv_pos_refunds(company_id,order_id);
create index sv_pos_refunds_by_date on public.sv_pos_refunds(company_id,occurred_at desc,id desc);
create table public.sv_pos_entitlements (
 company_id uuid not null, id text not null check(char_length(id) between 1 and 100),
 order_id text not null, line_id text not null,
 contact_id text not null, brand_id text not null, service_id text not null,
 units integer not null check(units between 1 and 200), expires_at bigint not null,
 revoked boolean not null, workspace_revision bigint not null check(workspace_revision>=0), snapshot jsonb not null,
 primary key(company_id,id),
 foreign key(company_id,order_id) references public.sv_pos_orders(company_id,id)
);
create index sv_pos_entitlements_by_order on public.sv_pos_entitlements(company_id,order_id);
create index sv_pos_entitlements_by_contact on public.sv_pos_entitlements(company_id,contact_id,id);
create table public.sv_pos_redemptions (
 company_id uuid not null, id text not null check(char_length(id) between 1 and 100),
 entitlement_id text not null, appointment_id text not null,
 delta integer not null check(delta in (-1,1)), reverse_of text,
 occurred_at bigint not null, actor text not null check(char_length(actor)<=80),
 reason text not null check(char_length(reason)<=300),
 workspace_revision bigint not null check(workspace_revision>=0), snapshot jsonb not null,
 primary key(company_id,id),
 foreign key(company_id,entitlement_id) references public.sv_pos_entitlements(company_id,id),
 foreign key(company_id,appointment_id) references public.sv_pos_appointments(company_id,id),
 foreign key(company_id,reverse_of) references public.sv_pos_redemptions(company_id,id),
 unique(company_id,reverse_of),
 check((delta=-1 and reverse_of is null) or (delta=1 and reverse_of is not null and reverse_of<>id))
);
create index sv_pos_redemptions_by_entitlement on public.sv_pos_redemptions(company_id,entitlement_id);
create index sv_pos_redemptions_by_appointment on public.sv_pos_redemptions(company_id,appointment_id);

-- Browser roles cannot select evidence or call trigger helpers, even if a public
-- Data API schema is enabled. All application reads recheck membership/products.
revoke all on public.sv_pos_appointments, public.sv_pos_orders, public.sv_pos_order_versions,
 public.sv_pos_payments, public.sv_pos_refunds, public.sv_pos_entitlements, public.sv_pos_redemptions
 from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_pos_appointments, public.sv_pos_orders, public.sv_pos_entitlements to service_role;
grant select,insert on public.sv_pos_order_versions,public.sv_pos_payments,public.sv_pos_refunds,public.sv_pos_redemptions to service_role;
alter table public.sv_pos_appointments enable row level security;
alter table public.sv_pos_orders enable row level security;
alter table public.sv_pos_order_versions enable row level security;
alter table public.sv_pos_payments enable row level security;
alter table public.sv_pos_refunds enable row level security;
alter table public.sv_pos_entitlements enable row level security;
alter table public.sv_pos_redemptions enable row level security;

create function smartvolt_private.reject_ledger_rewrite() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 raise exception 'pos_ledger_evidence_immutable';
end;$$;
revoke all on function smartvolt_private.reject_ledger_rewrite() from public,anon,authenticated;
create trigger sv_pos_payment_immutable before update or delete on public.sv_pos_payments for each row execute function smartvolt_private.reject_ledger_rewrite();
create trigger sv_pos_refund_immutable before update or delete on public.sv_pos_refunds for each row execute function smartvolt_private.reject_ledger_rewrite();
create trigger sv_pos_redemption_immutable before update or delete on public.sv_pos_redemptions for each row execute function smartvolt_private.reject_ledger_rewrite();
create trigger sv_pos_order_version_immutable before update or delete on public.sv_pos_order_versions for each row execute function smartvolt_private.reject_ledger_rewrite();

create function smartvolt_private.guard_pos_order() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'pos_ledger_evidence_immutable'; end if;
 if new.company_id is distinct from old.company_id or new.id is distinct from old.id then raise exception 'pos_ledger_scope_immutable'; end if;
 if (old.voided or exists(select 1 from public.sv_pos_payments p where p.company_id=old.company_id and p.order_id=old.id)) and (to_jsonb(new)-'workspace_revision') is distinct from (to_jsonb(old)-'workspace_revision') then
  raise exception 'pos_paid_order_immutable';
 end if;
 return new;
end;$$;
revoke all on function smartvolt_private.guard_pos_order() from public,anon,authenticated;
create trigger sv_pos_order_guard before update or delete on public.sv_pos_orders for each row execute function smartvolt_private.guard_pos_order();
create function smartvolt_private.guard_pos_entitlement() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'pos_ledger_evidence_immutable'; end if;
 if new.company_id is distinct from old.company_id or new.id is distinct from old.id or (to_jsonb(new)-array['workspace_revision','revoked','snapshot']) is distinct from (to_jsonb(old)-array['workspace_revision','revoked','snapshot']) or (new.snapshot-'revoked') is distinct from (old.snapshot-'revoked') or new.revoked is distinct from (new.snapshot->>'revoked')::boolean or (old.revoked and not new.revoked) then
  raise exception 'pos_entitlement_terms_immutable';
 end if;
 if new.revoked and not old.revoked and not exists(select 1 from public.sv_pos_refunds r where r.company_id=old.company_id and r.order_id=old.order_id) then raise exception 'pos_entitlement_revocation_requires_refund';end if;
 return new;
end;$$;
revoke all on function smartvolt_private.guard_pos_entitlement() from public,anon,authenticated;
create trigger sv_pos_entitlement_guard before update or delete on public.sv_pos_entitlements for each row execute function smartvolt_private.guard_pos_entitlement();

create function smartvolt_private.guard_pos_appointment() returns trigger
 language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'pos_ledger_evidence_immutable';end if;
 if new.company_id is distinct from old.company_id or new.id is distinct from old.id then raise exception 'pos_ledger_scope_immutable';end if;
 if (exists(select 1 from public.sv_pos_orders o where o.company_id=old.company_id and o.appointment_id=old.id and not o.voided and jsonb_array_length(o.snapshot->'lines')>0)
  or exists(select 1 from public.sv_pos_redemptions r where r.company_id=old.company_id and r.appointment_id=old.id))
  and (new.brand_id is distinct from old.brand_id or new.contact_id is distinct from old.contact_id or new.service_id is distinct from old.service_id or new.guests is distinct from old.guests) then
  raise exception 'pos_ledger_appointment_identity_immutable';
 end if;
 return new;
end;$$;
revoke all on function smartvolt_private.guard_pos_appointment() from public,anon,authenticated;
create trigger sv_pos_appointment_guard before update or delete on public.sv_pos_appointments for each row execute function smartvolt_private.guard_pos_appointment();

create function smartvolt_private.project_pos_ledger() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare
 p jsonb:=new.payload->'pos'; item jsonb; line jsonb; field text; total bigint; paid bigint; refunded bigint;
 ord public.sv_pos_orders; pack public.sv_pos_entitlements; appt public.sv_pos_appointments;
 original public.sv_pos_redemptions; remaining bigint;
begin
 if p is null or p='null'::jsonb then
  if exists(select 1 from public.sv_pos_orders where company_id=new.company_id) or exists(select 1 from public.sv_pos_appointments where company_id=new.company_id) then raise exception 'pos_ledger_evidence_missing'; end if;
  return new;
 end if;
 if p->>'companyId' is distinct from new.company_id::text then raise exception 'pos_ledger_invalid_company'; end if;
 foreach field in array array['appointments','orders','payments','refunds','entitlements','redemptions'] loop
  if jsonb_typeof(p->field) is distinct from 'array' then raise exception 'pos_ledger_invalid_array'; end if;
  if exists(select 1 from jsonb_array_elements(p->field) x group by x->>'id' having count(*)>1) then raise exception 'pos_ledger_duplicate_identity'; end if;
 end loop;
 -- Removing or rewriting existing money/consumption cannot hide evidence in an
 -- otherwise valid company aggregate; a failure rolls the whole command back.
 if exists(select 1 from public.sv_pos_payments t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'payments') x where x=t.snapshot))
 or exists(select 1 from public.sv_pos_refunds t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'refunds') x where x=t.snapshot))
 or exists(select 1 from public.sv_pos_redemptions t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'redemptions') x where x=t.snapshot))
 or exists(select 1 from public.sv_pos_orders t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'orders') x where x->>'id'=t.id))
 or exists(select 1 from public.sv_pos_entitlements t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'entitlements') x where x->>'id'=t.id))
 or exists(select 1 from public.sv_pos_appointments t where t.company_id=new.company_id and not exists(select 1 from jsonb_array_elements(p->'appointments') x where x->>'id'=t.id)) then
  raise exception 'pos_ledger_evidence_missing_or_changed';
 end if;
 for item in select value from jsonb_array_elements(p->'appointments') loop
  if not exists(select 1 from jsonb_array_elements(new.payload#>'{scope,brands}') x where x->>'id'=item->>'brandId')
   or not exists(select 1 from jsonb_array_elements(new.payload#>'{inbox,contacts}') x where x->>'id'=item->>'contactId' and x->>'clientId'=new.company_id::text) then raise exception 'pos_ledger_customer_scope';end if;
  insert into public.sv_pos_appointments(company_id,id,brand_id,contact_id,service_id,starts_at,ends_at,status,guests,workspace_revision,snapshot)
  values(new.company_id,item->>'id',item->>'brandId',item->>'contactId',item->>'serviceId',(item->>'startsAt')::bigint,(item->>'endsAt')::bigint,item->>'status',(item->>'guests')::integer,new.revision,item)
  on conflict(company_id,id) do update set brand_id=excluded.brand_id,contact_id=excluded.contact_id,service_id=excluded.service_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status=excluded.status,guests=excluded.guests,workspace_revision=excluded.workspace_revision,snapshot=excluded.snapshot;
 end loop;
 for item in select value from jsonb_array_elements(p->'orders') loop
  if not exists(select 1 from jsonb_array_elements(new.payload#>'{scope,brands}') x where x->>'id'=item->>'brandId')
   or not exists(select 1 from jsonb_array_elements(new.payload#>'{inbox,contacts}') x where x->>'id'=item->>'contactId' and x->>'clientId'=new.company_id::text) then raise exception 'pos_ledger_customer_scope';end if;
  if jsonb_typeof(item->'lines') is distinct from 'array' or exists(select 1 from jsonb_array_elements(item->'lines') x group by x->>'id' having count(*)>1) then raise exception 'pos_ledger_order_lines';end if;
  if exists(select 1 from jsonb_array_elements(item->'lines') x where (x->>'quantity')::integer not between 1 and 50 or (x->>'unitCents')::bigint not between 0 and 100000000 or x->>'kind' not in ('service','package','product')) then raise exception 'pos_ledger_order_lines';end if;
  select coalesce(sum((x->>'unitCents')::bigint*(x->>'quantity')::integer),0) into total from jsonb_array_elements(item->'lines') x;
  if item->>'appointmentId' is not null then
   select * into appt from public.sv_pos_appointments where company_id=new.company_id and id=item->>'appointmentId';
   if not found or appt.contact_id<>item->>'contactId' or appt.brand_id<>item->>'brandId' then raise exception 'pos_ledger_order_appointment_scope';end if;
  end if;
  insert into public.sv_pos_orders(company_id,id,number,brand_id,contact_id,appointment_id,subtotal_cents,discount_cents,total_cents,voided,created_at,workspace_revision,snapshot)
  values(new.company_id,item->>'id',item->>'number',item->>'brandId',item->>'contactId',item->>'appointmentId',total,(item->>'discountCents')::bigint,total-(item->>'discountCents')::bigint,(item->>'voided')::boolean,(item->>'createdAt')::bigint,new.revision,item)
  on conflict(company_id,id) do update set number=excluded.number,brand_id=excluded.brand_id,contact_id=excluded.contact_id,appointment_id=excluded.appointment_id,subtotal_cents=excluded.subtotal_cents,discount_cents=excluded.discount_cents,total_cents=excluded.total_cents,voided=excluded.voided,created_at=excluded.created_at,workspace_revision=excluded.workspace_revision,snapshot=excluded.snapshot;
  if item is distinct from (select v.snapshot from public.sv_pos_order_versions v where v.company_id=new.company_id and v.order_id=item->>'id' order by v.workspace_revision desc limit 1) then
   insert into public.sv_pos_order_versions(company_id,order_id,workspace_revision,snapshot) values(new.company_id,item->>'id',new.revision,item);
  end if;
 end loop;
 for item in select value from jsonb_array_elements(p->'payments') loop
  if not exists(select 1 from public.sv_pos_payments where company_id=new.company_id and id=item->>'id') then
   if exists(select 1 from public.sv_pos_refunds where company_id=new.company_id and order_id=item->>'orderId') then raise exception 'pos_refunded_order_closed';end if;
   insert into public.sv_pos_payments(company_id,id,order_id,amount_cents,method,reference,occurred_at,actor,source,workspace_revision,snapshot)
   values(new.company_id,item->>'id',item->>'orderId',(item->>'amountCents')::bigint,item->>'method',item->>'reference',(item->>'at')::bigint,item->>'actor',item->>'source',new.revision,item);
  end if;
 end loop;
 for item in select value from jsonb_array_elements(p->'refunds') loop
  insert into public.sv_pos_refunds(company_id,id,order_id,amount_cents,reason,occurred_at,actor,source,workspace_revision,snapshot)
  values(new.company_id,item->>'id',item->>'orderId',(item->>'amountCents')::bigint,item->>'reason',(item->>'at')::bigint,item->>'actor',item->>'source',new.revision,item)
  on conflict(company_id,id) do nothing;
 end loop;
 for ord in select * from public.sv_pos_orders where company_id=new.company_id loop
  select coalesce(sum(amount_cents),0) into paid from public.sv_pos_payments where company_id=new.company_id and order_id=ord.id;
  select coalesce(sum(amount_cents),0) into refunded from public.sv_pos_refunds where company_id=new.company_id and order_id=ord.id;
  if paid>ord.total_cents or refunded>paid or (ord.voided and paid>0) then raise exception 'pos_ledger_invalid_balance';end if;
  if refunded>0 and exists(select 1 from jsonb_array_elements(ord.snapshot->'lines') x where x->>'kind'='package') and refunded<>paid then raise exception 'pos_package_refund_must_be_full';end if;
 end loop;
 for item in select value from jsonb_array_elements(p->'entitlements') loop
  select * into ord from public.sv_pos_orders where company_id=new.company_id and id=item->>'orderId';
  if not found then raise exception 'pos_ledger_entitlement_order';end if;
  select value into line from jsonb_array_elements(ord.snapshot->'lines') where value->>'id'=item->>'lineId';
  select coalesce(sum(amount_cents),0) into paid from public.sv_pos_payments where company_id=new.company_id and order_id=ord.id;
  select coalesce(sum(amount_cents),0) into refunded from public.sv_pos_refunds where company_id=new.company_id and order_id=ord.id;
  if line is null or line->>'kind'<>'package' or line->>'serviceId' is distinct from item->>'serviceId' or (line->>'units')::integer is distinct from (item->>'units')::integer
   or ord.contact_id<>item->>'contactId' or ord.brand_id<>item->>'brandId' or paid<>ord.total_cents or paid<=0
   or (refunded>0 and not (item->>'revoked')::boolean) or ((item->>'revoked')::boolean and refunded=0) then raise exception 'pos_ledger_entitlement_purchase';end if;
  insert into public.sv_pos_entitlements(company_id,id,order_id,line_id,contact_id,brand_id,service_id,units,expires_at,revoked,workspace_revision,snapshot)
  values(new.company_id,item->>'id',item->>'orderId',item->>'lineId',item->>'contactId',item->>'brandId',item->>'serviceId',(item->>'units')::integer,(item->>'expiresAt')::bigint,(item->>'revoked')::boolean,new.revision,item)
  on conflict(company_id,id) do update set revoked=excluded.revoked,workspace_revision=excluded.workspace_revision,snapshot=excluded.snapshot;
 end loop;
 if exists(select 1 from public.sv_pos_entitlements e join public.sv_pos_orders o on o.company_id=e.company_id and o.id=e.order_id
  cross join lateral jsonb_array_elements(o.snapshot->'lines') l where e.company_id=new.company_id and l->>'id'=e.line_id
  group by e.order_id,e.line_id,l->>'quantity' having count(*)>(l->>'quantity')::integer) then raise exception 'pos_ledger_duplicate_package_issue';end if;
 -- Process originals before corrections even if a stored array is reordered.
 for item in select value from jsonb_array_elements(p->'redemptions') order by (value->>'delta')::integer loop
  if not exists(select 1 from public.sv_pos_redemptions where company_id=new.company_id and id=item->>'id') then
   select * into pack from public.sv_pos_entitlements where company_id=new.company_id and id=item->>'entitlementId';
   if not found then raise exception 'pos_ledger_redemption_package';end if;
   select * into appt from public.sv_pos_appointments where company_id=new.company_id and id=item->>'appointmentId';
   if not found or appt.brand_id<>pack.brand_id or appt.contact_id<>pack.contact_id or appt.service_id<>pack.service_id then raise exception 'pos_ledger_redemption_scope';end if;
   if (item->>'delta')::integer=-1 then
    -- Backfill historical, subsequently-refunded packages remains possible;
    -- the full final balance below requires every consumed unit be reversed.
    if pack.expires_at<=(item->>'at')::bigint or appt.guests<>1 then raise exception 'pos_ledger_redemption_unavailable';end if;
    if tg_op='UPDATE' and pack.revoked and not exists(select 1 from jsonb_array_elements(coalesce(old.payload#>'{pos,redemptions}','[]'::jsonb)) x where x->>'id'=item->>'id') then raise exception 'pos_ledger_redemption_unavailable';end if;
   else
    select * into original from public.sv_pos_redemptions where company_id=new.company_id and id=item->>'reverseOf';
    if not found or original.delta<>-1 or original.entitlement_id<>pack.id or original.appointment_id<>appt.id or (item->>'at')::bigint<original.occurred_at then raise exception 'pos_ledger_invalid_reversal';end if;
   end if;
   insert into public.sv_pos_redemptions(company_id,id,entitlement_id,appointment_id,delta,reverse_of,occurred_at,actor,reason,workspace_revision,snapshot)
   values(new.company_id,item->>'id',item->>'entitlementId',item->>'appointmentId',(item->>'delta')::integer,item->>'reverseOf',(item->>'at')::bigint,item->>'actor',item->>'reason',new.revision,item);
  end if;
 end loop;
 for pack in select * from public.sv_pos_entitlements where company_id=new.company_id loop
  select pack.units+coalesce(sum(delta),0) into remaining from public.sv_pos_redemptions where company_id=new.company_id and entitlement_id=pack.id;
  if remaining<0 or remaining>pack.units or (pack.revoked and remaining<>pack.units) then raise exception 'pos_ledger_invalid_package_balance';end if;
 end loop;
 if exists(select 1 from public.sv_pos_redemptions r where r.company_id=new.company_id and r.delta=-1
  and not exists(select 1 from public.sv_pos_redemptions x where x.company_id=r.company_id and x.reverse_of=r.id)
  group by r.appointment_id having count(*)>1) then raise exception 'pos_ledger_appointment_redeemed_twice';end if;
 if exists(select 1 from public.sv_pos_redemptions r join public.sv_pos_appointments a on a.company_id=r.company_id and a.id=r.appointment_id
  where r.company_id=new.company_id and r.delta=-1 and not exists(select 1 from public.sv_pos_redemptions x where x.company_id=r.company_id and x.reverse_of=r.id)
  and (a.status<>'completed' or exists(select 1 from public.sv_pos_orders o where o.company_id=a.company_id and o.appointment_id=a.id and not o.voided))) then raise exception 'pos_ledger_redemption_appointment_state';end if;
 return new;
end;$$;
revoke all on function smartvolt_private.project_pos_ledger() from public,anon,authenticated;
create trigger sv_workspace_pos_ledger after insert or update on public.sv_workspaces
 for each row execute function smartvolt_private.project_pos_ledger();

-- The same validator/transaction protects existing state during installation.
-- This does not advance workspace revisions, create customers, or grant products.
update public.sv_workspaces set payload=payload;

