-- Product Learning Sync checked: neutral invitation, grant, identity and evidence contracts.
-- Dedicated Convelta only. No provider/customer/enterprise pilot data is imported.
alter table public.sv_memberships add column brand_ids text[],add column product_ids text[],
 add column access_revision bigint not null default 0,add column access_updated_at timestamptz not null default now();
alter table public.sv_memberships add constraint sv_member_products_valid check(product_ids is null or(cardinality(product_ids)>0 and product_ids<@array['crm','pos']::text[]));
create table public.sv_action_receipts(
 company_id uuid not null references public.sv_companies(id),command_id uuid not null,actor_id uuid not null,
 kind text not null,data jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 primary key(company_id,command_id),foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create table public.sv_staff_invitations(
 company_id uuid not null references public.sv_companies(id),id uuid not null,email text not null,display_name text not null,
 role text not null check(role in('manager','agent','viewer')),brand_ids text[],product_ids text[]not null,
 token_hash text not null check(token_hash~'^[a-f0-9]{64}$'),expires_at timestamptz not null,
 status text not null default 'invited'check(status in('invited','accepted','revoked')),
 mail_state text not null default 'not_sent'check(mail_state in('not_sent','submitting','submitted','failed')),
 invited_by uuid not null,accepted_by uuid,accepted_at timestamptz,created_at timestamptz not null default now(),
 primary key(company_id,id),foreign key(company_id,invited_by)references public.sv_memberships(company_id,user_id)
);
create unique index sv_invitation_pending_email on public.sv_staff_invitations(company_id,email)where status='invited';
create index sv_invitation_id on public.sv_staff_invitations(id,token_hash);
create table public.sv_access_audit(
 company_id uuid not null references public.sv_companies(id),id uuid not null default gen_random_uuid(),actor_id uuid not null,
 kind text not null,target_user uuid,detail jsonb not null,created_at timestamptz not null default now(),primary key(company_id,id)
);
create function smartvolt_private.member_has_product(p_company uuid,p_actor uuid,p_product text)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id join public.sv_company_products p on p.company_id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active'and c.status='active'and p.product=p_product and p.status='active'
 and p.starts_at<=statement_timestamp()and(p.ends_at is null or p.ends_at>statement_timestamp())and(m.product_ids is null or p_product=any(m.product_ids)))
$$;
create function smartvolt_private.member_brand_allowed(p_company uuid,p_actor uuid,p_brand text)returns boolean language sql stable security invoker set search_path=''as $$
 select exists(select 1 from public.sv_memberships m join public.sv_workspaces w on w.company_id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active'and(m.brand_ids is null or p_brand=any(m.brand_ids))
 and exists(select 1 from jsonb_array_elements(w.payload#>'{scope,brands}')b where b->>'id'=p_brand))
$$;
create function public.sv_authorize(p_company uuid,p_actor uuid,p_product text default null,p_write boolean default false,p_manage boolean default false,p_brand text default null)returns text
language plpgsql security invoker set search_path=''as $$
declare r text;begin
 select m.role into r from public.sv_memberships m join public.sv_companies c on c.id=m.company_id where m.company_id=p_company and m.user_id=p_actor and m.status='active'and c.status='active'for share of m,c;
 if r is null or(p_write and r='viewer')or(p_manage and r not in('owner','manager'))then raise exception 'access_denied';end if;
 perform 1 from public.sv_company_products p where p.company_id=p_company for share;
 if p_product is not null then
  if not smartvolt_private.member_has_product(p_company,p_actor,p_product)then raise exception 'product_required';end if;
 elsif not(smartvolt_private.member_has_product(p_company,p_actor,'crm')or smartvolt_private.member_has_product(p_company,p_actor,'pos'))then raise exception 'product_required';end if;
 if p_brand is not null and not smartvolt_private.member_brand_allowed(p_company,p_actor,p_brand)then raise exception 'brand_scope';end if;
 return r;
end;$$;
create function public.sv_member_scope(p_company uuid,p_actor uuid,p_brand text,p_product text default 'crm')returns void language plpgsql security invoker set search_path=''as $$
begin perform public.sv_authorize(p_company,p_actor,p_product,false,false,p_brand);if p_brand is null then raise exception 'brand_scope';end if;end;$$;
create function public.sv_thread_scope(p_company uuid,p_actor uuid,p_provider text,p_thread uuid)returns void language plpgsql security invoker set search_path=''as $$
declare brand text;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 select brand_id into strict brand from public.sv_customer_threads where company_id=p_company and provider=p_provider and thread_id=p_thread;
 perform public.sv_member_scope(p_company,p_actor,brand,'crm');
end;$$;
create function public.sv_customer_scope(p_company uuid,p_actor uuid,p_customer text,p_all boolean default false)returns void language plpgsql security invoker set search_path=''as $$
begin
 perform public.sv_authorize(p_company,p_actor);
 if not exists(select 1 from public.sv_customer_brands b where b.company_id=p_company and b.customer_id=p_customer and smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id))
 or(p_all and exists(select 1 from public.sv_customer_brands b where b.company_id=p_company and b.customer_id=p_customer and not smartvolt_private.member_brand_allowed(p_company,p_actor,b.brand_id)))then raise exception 'brand_scope';end if;
end;$$;
create function smartvolt_private.action_replay(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare r public.sv_action_receipts;begin
 if p_command is null then raise exception 'command_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('command:'||p_company::text||p_command::text,0));
 select *into r from public.sv_action_receipts where company_id=p_company and command_id=p_command;
 if not found then return null;end if;
 if r.actor_id<>p_actor or r.kind<>p_kind or r.data<>p_data then raise exception 'idempotency_conflict';end if;return r.result;
end;$$;
create function smartvolt_private.team_scope_valid(p_company uuid,p_brands text[],p_products text[])returns void language plpgsql security invoker set search_path=''as $$
begin
 if p_products is null or cardinality(p_products)not between 1 and 2 or exists(select 1 from unnest(p_products)v where v is null or v not in('crm','pos')or not exists(select 1 from public.sv_company_products p where p.company_id=p_company and p.product=v and p.status='active'and p.starts_at<=now()and(p.ends_at is null or p.ends_at>now())))then raise exception 'team_product_invalid';end if;
 if p_brands is not null and(cardinality(p_brands)not between 1 and 30 or exists(select 1 from unnest(p_brands)v where v is null or not exists(select 1 from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=v)))then raise exception 'brand_scope';end if;
end;$$;
create function smartvolt_private.team_projection(p_company uuid)returns void language plpgsql security invoker set search_path=''as $$
declare team jsonb;begin
 select jsonb_agg(jsonb_build_object('id',user_id,'name',display_name,'initials',left(display_name,2))order by(role='owner')desc,display_name,user_id)into team from public.sv_memberships where company_id=p_company and status='active';
 if team is not null then update public.sv_workspaces set payload=jsonb_set(payload,'{scope,team}',team),revision=revision+1,updated_at=now()where company_id=p_company and payload#>'{scope,team}'is distinct from team;end if;
end;$$;
create function public.sv_team_action(p_company uuid,p_actor uuid,p_command uuid,p_action text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare result jsonb;m public.sv_memberships;v_id uuid;v_brand_ids text[];v_products text[];v_role text;seats integer;v_email text;
begin
 perform pg_advisory_xact_lock(hashtextextended('team:'||p_company::text,0));
 if public.sv_authorize(p_company,p_actor,null,true)<>'owner'then raise exception 'access_denied';end if;
 select seat_limit into strict seats from public.sv_companies where id=p_company for update;
 result=smartvolt_private.action_replay(p_company,p_actor,p_command,'team:'||p_action,p_data);if result is not null then return result;end if;
 if p_action in('invite','member')then
  v_products=array(select jsonb_array_elements_text(p_data->'productIds'));v_brand_ids=case when p_data->'brandIds'='null'::jsonb then null else array(select jsonb_array_elements_text(p_data->'brandIds'))end;
  perform smartvolt_private.team_scope_valid(p_company,v_brand_ids,v_products);v_role=p_data->>'role';
  if v_role not in('manager','agent','viewer')or length(btrim(p_data->>'name'))not between 1 and 80 then raise exception 'team_member_invalid';end if;
 end if;
 if p_action='invite'then
  v_id=(p_data->>'id')::uuid;v_email=lower(btrim(p_data->>'email'));
  if v_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'or length(v_email)>160 or p_data->>'tokenHash'!~'^[a-f0-9]{64}$'then raise exception 'invite_invalid';end if;
  update public.sv_staff_invitations set status='revoked'where company_id=p_company and email=v_email and status='invited';
  if(select count(*)from public.sv_memberships where company_id=p_company and status in('active','invited'))+(select count(*)from public.sv_staff_invitations where company_id=p_company and status='invited'and expires_at>now())>=seats then raise exception 'seat_limit';end if;
  insert into public.sv_staff_invitations(company_id,id,email,display_name,role,brand_ids,product_ids,token_hash,expires_at,invited_by)
  values(p_company,v_id,v_email,btrim(p_data->>'name'),v_role,v_brand_ids,v_products,p_data->>'tokenHash',now()+interval '7 days',p_actor);
  result=jsonb_build_object('saved',true,'id',v_id);
 elsif p_action='member'then
  v_id=(p_data->>'userId')::uuid;select *into strict m from public.sv_memberships where company_id=p_company and user_id=v_id for update;
  if m.role='owner'or v_id=p_actor then raise exception 'owner_protected';end if;
  if m.access_revision<>(p_data->>'revision')::bigint then raise exception 'revision_conflict';end if;
  if p_data->>'status'not in('active','suspended','removed')then raise exception 'team_member_invalid';end if;
  if p_data->>'status'='active'and m.status<>'active'and(select count(*)from public.sv_memberships where company_id=p_company and status='active')+(select count(*)from public.sv_staff_invitations where company_id=p_company and status='invited'and expires_at>now())>=seats then raise exception 'seat_limit';end if;
  update public.sv_memberships set role=v_role,status=p_data->>'status',display_name=btrim(p_data->>'name'),brand_ids=v_brand_ids,product_ids=v_products,access_revision=access_revision+1,access_updated_at=clock_timestamp()where company_id=p_company and user_id=v_id;
  perform smartvolt_private.team_projection(p_company);result=jsonb_build_object('saved',true);
 elsif p_action='revoke'then
  update public.sv_staff_invitations set status='revoked'where company_id=p_company and id=(p_data->>'id')::uuid and status='invited';result=jsonb_build_object('saved',true);
 else raise exception 'team_action_invalid';end if;
 insert into public.sv_access_audit(company_id,actor_id,kind,target_user,detail)values(p_company,p_actor,p_action,case when p_action='member'then v_id end,p_data-'tokenHash');
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'team:'||p_action,p_data,result);return result;
end;$$;
create function public.sv_team_mail_claim(p_company uuid,p_actor uuid,p_id uuid)returns boolean language plpgsql security invoker set search_path=''as $$
begin
 if public.sv_authorize(p_company,p_actor,null,true)<>'owner'then raise exception 'access_denied';end if;
 update public.sv_staff_invitations set mail_state='submitting'where company_id=p_company and id=p_id and invited_by=p_actor and status='invited'and mail_state='not_sent'and expires_at>now();return found;
end;$$;
create function public.sv_team_accept(p_invitation uuid,p_actor uuid,p_email text,p_hash text)returns uuid language plpgsql security invoker set search_path=''as $$
declare inv public.sv_staff_invitations;m public.sv_memberships;seats integer;begin
 select *into strict inv from public.sv_staff_invitations where id=p_invitation and token_hash=p_hash and email=lower(p_email);
 perform pg_advisory_xact_lock(hashtextextended('team:'||inv.company_id::text,0));
 select seat_limit into strict seats from public.sv_companies where id=inv.company_id and status='active'for update;
 select *into strict inv from public.sv_staff_invitations where company_id=inv.company_id and id=p_invitation for update;
 if inv.status='accepted'and inv.accepted_by=p_actor then return inv.company_id;end if;
 if inv.status<>'invited'or inv.expires_at<=now()then raise exception 'invitation_expired';end if;
 perform 1 from public.sv_memberships where company_id=inv.company_id and user_id=inv.invited_by and status='active'and role='owner'for share;
 if not found then raise exception 'invitation_context_changed';end if;
 select *into m from public.sv_memberships where company_id=inv.company_id and user_id=p_actor for update;
 if m.role='owner'then raise exception 'owner_protected';end if;
 if m.user_id is not null and m.access_updated_at>inv.created_at then raise exception 'invitation_context_changed';end if;
 perform smartvolt_private.team_scope_valid(inv.company_id,inv.brand_ids,inv.product_ids);
 if m.status is distinct from'active'and(select count(*)from public.sv_memberships where company_id=inv.company_id and status='active')>=seats then raise exception 'seat_limit';end if;
 if m.status is distinct from'active'then
  insert into public.sv_memberships(company_id,user_id,role,status,display_name,brand_ids,product_ids)values(inv.company_id,p_actor,inv.role,'active',inv.display_name,inv.brand_ids,inv.product_ids)
  on conflict(company_id,user_id)do update set role=excluded.role,status='active',display_name=excluded.display_name,brand_ids=excluded.brand_ids,product_ids=excluded.product_ids,access_revision=sv_memberships.access_revision+1,access_updated_at=clock_timestamp();
 end if;
 update public.sv_staff_invitations set status='accepted',accepted_by=p_actor,accepted_at=clock_timestamp()where company_id=inv.company_id and id=inv.id;
 perform smartvolt_private.team_projection(inv.company_id);
 insert into public.sv_access_audit(company_id,actor_id,kind,target_user,detail)values(inv.company_id,p_actor,'accepted',p_actor,jsonb_build_object('invitationId',inv.id));return inv.company_id;
end;$$;
do $$declare t text;f record;begin
 foreach t in array array['sv_action_receipts','sv_staff_invitations','sv_access_audit']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['sv_action_receipts','sv_access_audit']loop
  execute format('create trigger %I before update or delete on public.%I for each row execute function smartvolt_private.wa_reject_rewrite()',t||'_immutable',t);
  execute format('create trigger %I before truncate on public.%I for each statement execute function smartvolt_private.wa_reject_rewrite()',t||'_no_truncate',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='public'and p.proname in('sv_authorize','sv_member_scope','sv_thread_scope','sv_customer_scope','sv_team_action','sv_team_mail_claim','sv_team_accept'))or(n.nspname='smartvolt_private'and p.proname in('member_has_product','member_brand_allowed','action_replay','team_scope_valid','team_projection'))loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end;$$;
