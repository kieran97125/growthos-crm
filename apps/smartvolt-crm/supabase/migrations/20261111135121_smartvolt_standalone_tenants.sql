-- SmartVolt CRM owns its companies, identity memberships and operational state.
-- Apply ONLY to a dedicated SmartVolt Supabase project. No Growth OS tables are referenced.
create table public.sv_companies (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  status text not null default 'active' check (status in ('active','suspended')),
  plan_key text not null default 'managed',
  seat_limit integer not null default 5 check (seat_limit between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.sv_memberships (
  company_id uuid not null references public.sv_companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','manager','agent','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key(company_id,user_id)
);
create index sv_memberships_by_user on public.sv_memberships(user_id,status,company_id);
create table public.sv_workspaces (
  company_id uuid primary key references public.sv_companies(id),
  revision bigint not null default 0 check (revision >= 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  check (payload #>> '{scope,companyId}' is not null and payload #>> '{scope,companyId}' = company_id::text),
  check (octet_length(payload::text) <= 4000000)
);
create table public.sv_commands (
  company_id uuid not null references public.sv_companies(id),
  command_id uuid not null,
  actor_id uuid not null references auth.users(id),
  kind text not null,
  revision bigint not null,
  created_at timestamptz not null default now(),
  primary key(company_id,command_id)
);
create index sv_commands_by_actor on public.sv_commands(actor_id,created_at);
create table public.sv_workspace_versions (
  company_id uuid not null references public.sv_companies(id),
  revision bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(company_id,revision)
);
create table public.sv_system_cards (
  company_id uuid not null references public.sv_companies(id),
  id text not null,
  title text not null,
  category text not null,
  status text not null default 'planned' check(status in ('planned','in_progress','blocked','complete')),
  detail text not null,
  primary key(company_id,id)
);

-- Browser identities receive no raw workspace, command, version or system-card table grants.
-- Application reads and writes re-validate Auth + stored membership on every request.
revoke all on public.sv_companies, public.sv_memberships, public.sv_workspaces,
 public.sv_commands, public.sv_workspace_versions, public.sv_system_cards from public, anon, authenticated;
grant all on public.sv_companies, public.sv_memberships, public.sv_workspaces,
 public.sv_commands, public.sv_workspace_versions, public.sv_system_cards to service_role;
alter table public.sv_companies enable row level security;
alter table public.sv_memberships enable row level security;
alter table public.sv_workspaces enable row level security;
alter table public.sv_commands enable row level security;
alter table public.sv_workspace_versions enable row level security;
alter table public.sv_system_cards enable row level security;

-- Defense in depth if a future migration adds table privileges. Membership reads never recurse.
create policy sv_membership_self on public.sv_memberships for select to authenticated
 using(user_id = (select auth.uid()) and status = 'active');
create policy sv_company_member on public.sv_companies for select to authenticated using (
 status = 'active' and exists (select 1 from public.sv_memberships m where m.company_id=id and m.user_id=(select auth.uid()) and m.status='active')
);
create policy sv_workspace_member on public.sv_workspaces for select to authenticated using (
 exists (select 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=sv_workspaces.company_id and m.user_id=(select auth.uid()) and m.status='active' and c.status='active')
);

create function public.sv_commit_workspace(p_company uuid, p_actor uuid, p_expected bigint,
 p_command_id uuid, p_payload jsonb, p_kind text) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare doc public.sv_workspaces; member_role text;
begin
 -- Lock the membership/company as well as the document so suspension cannot race a write.
 select m.role into member_role from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active'
 for share of m,c;
 if member_role is null or member_role='viewer' then raise exception 'access_denied'; end if;
 if p_kind in ('studio','campaign-save','campaign-pause','import') and member_role not in ('owner','manager') then
  raise exception 'manager_required';
 end if;
 if p_kind not in ('inbox','studio','import','campaign-save','campaign-pause','consent','active-recipient') then
  raise exception 'unknown_command';
 end if;
 select * into doc from public.sv_workspaces where company_id=p_company for update;
 if not found then raise exception 'workspace_missing'; end if;
 if exists(select 1 from public.sv_commands where company_id=p_company and command_id=p_command_id) then
  return jsonb_build_object('state',doc.payload,'revision',doc.revision);
 end if;
 if doc.revision <> p_expected then raise exception 'revision_conflict'; end if;
 if p_payload #>> '{scope,companyId}' is distinct from p_company::text then raise exception 'invalid_company_scope'; end if;
 if p_payload->'scope' is distinct from doc.payload->'scope' then raise exception 'scope_is_server_owned'; end if;
 insert into public.sv_workspace_versions(company_id,revision,payload) values(p_company,doc.revision,doc.payload);
 update public.sv_workspaces set payload=p_payload, revision=revision+1, updated_at=now()
 where company_id=p_company returning * into doc;
 insert into public.sv_commands(company_id,command_id,actor_id,kind,revision)
 values(p_company,p_command_id,p_actor,p_kind,doc.revision);
 delete from public.sv_workspace_versions where company_id=p_company and revision < doc.revision-30;
 return jsonb_build_object('state',doc.payload,'revision',doc.revision);
end;
$$;
revoke all on function public.sv_commit_workspace(uuid,uuid,bigint,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.sv_commit_workspace(uuid,uuid,bigint,uuid,jsonb,text) to service_role;

-- Company creation is an operator action; payloads are prepared by the standalone domain factory.
create function public.sv_provision_company(p_id uuid,p_name text,p_owner uuid,p_owner_name text,p_payload jsonb)
 returns uuid language plpgsql security invoker set search_path = '' as $$
begin
 if p_payload #>> '{scope,companyId}' is distinct from p_id::text then raise exception 'invalid_company_scope'; end if;
 insert into public.sv_companies(id,name) values(p_id,p_name);
 insert into public.sv_memberships(company_id,user_id,role,display_name) values(p_id,p_owner,'owner',p_owner_name);
 insert into public.sv_workspaces(company_id,payload) values(p_id,p_payload);
 insert into public.sv_system_cards(company_id,id,title,category,status,detail) values
  (p_id,'meta-channel','連接公司通訊渠道','connections','planned','登記此公司專用 WhatsApp／IG／Messenger 連線、驗證 webhook、收發及供應商回執。'),
  (p_id,'ai-activation','啟用公司 AI 回覆','ai','blocked','完成公司用量與成本配額、模型帳戶啟用及同品牌知識驗證，才開放真實模型。'),
  (p_id,'staff-invitations','員工邀請及權限管理','admin','planned','加入邀請、接受、停用、復原及品牌權限；尚未提供自助邀請。'),
  (p_id,'billing','訂閱與席位收費','finance','planned','接入付款供應商前，由營運方管理方案及公司啟用狀態。'),
  (p_id,'domain-projections','營運資料分頁與報表索引','build','planned','現時使用版本化公司聚合及指令；大量對話前建立按公司隔離嘅分頁、訊息及報表讀模型。');
 return p_id;
end;
$$;
revoke all on function public.sv_provision_company(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.sv_provision_company(uuid,text,uuid,text,jsonb) to service_role;

