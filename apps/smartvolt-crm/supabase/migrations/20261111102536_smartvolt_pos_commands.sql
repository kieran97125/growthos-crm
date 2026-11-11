-- Standalone SmartVolt only. Authoring this migration does not connect or modify a hosted project.
create or replace function public.sv_commit_workspace(p_company uuid, p_actor uuid, p_expected bigint,
 p_command_id uuid, p_payload jsonb, p_kind text) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare doc public.sv_workspaces; member_role text;
begin
 -- Lock the membership/company as well as the document so suspension cannot race a write.
 select m.role into member_role from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active' and c.status='active'
 for share of m,c;
 if member_role is null or member_role='viewer' then raise exception 'access_denied'; end if;
 if p_kind in ('studio','campaign-save','campaign-pause','import','pos-admin') and member_role not in ('owner','manager') then
  raise exception 'manager_required';
 end if;
 if p_kind not in ('inbox','studio','import','campaign-save','campaign-pause','consent','active-recipient','pos','pos-admin','customer-create') then
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


create or replace function public.sv_provision_company(p_id uuid,p_name text,p_owner uuid,p_owner_name text,p_payload jsonb)
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
 insert into public.sv_system_cards(company_id,id,title,category,status,detail) values
(p_id,'pos-acquiring','POS 收款服務接駁','finance','planned','接駁公司專用收單帳戶、簽名 webhook、交易對帳及退款；目前只作人工核實收款登記。'),
(p_id,'pos-ledger','交易帳簿與營運分頁','build','planned','將訂單、付款、退款及套票流水抽成按公司隔離嘅不可變關聯表、約束及索引，完成稽核與恢復演練後先上線真實收款。'),
(p_id,'pos-classes','班課與週期會員','build','planned','加入班課名額、候補、重複排程、週期扣款與多次數會員；目前提供單次服務預約及預付套票。'),
(p_id,'pos-retail-stock','商品庫存與成本','finance','planned','目前可記錄零售商品銷售；庫存異動、進貨、成本、供應商及銷貨成本待完成。'),
(p_id,'pos-acquisition','營運至增長歸因','crm','planned','把來源、預約、到店、首購、退款及回訪事件連成客戶旅程；資料不足時不推算療程 ROAS。');
 return p_id;
end;
$$;
revoke all on function public.sv_provision_company(uuid,text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.sv_provision_company(uuid,text,uuid,text,jsonb) to service_role;

insert into public.sv_system_cards(company_id,id,title,category,status,detail) select id,'pos-acquiring','POS 收款服務接駁','finance','planned','接駁公司專用收單帳戶、簽名 webhook、交易對帳及退款；目前只作人工核實收款登記。' from public.sv_companies on conflict(company_id,id) do nothing;
insert into public.sv_system_cards(company_id,id,title,category,status,detail) select id,'pos-ledger','交易帳簿與營運分頁','build','planned','將訂單、付款、退款及套票流水抽成按公司隔離嘅不可變關聯表、約束及索引，完成稽核與恢復演練後先上線真實收款。' from public.sv_companies on conflict(company_id,id) do nothing;
insert into public.sv_system_cards(company_id,id,title,category,status,detail) select id,'pos-classes','班課與週期會員','build','planned','加入班課名額、候補、重複排程、週期扣款與多次數會員；目前提供單次服務預約及預付套票。' from public.sv_companies on conflict(company_id,id) do nothing;
insert into public.sv_system_cards(company_id,id,title,category,status,detail) select id,'pos-retail-stock','商品庫存與成本','finance','planned','目前可記錄零售商品銷售；庫存異動、進貨、成本、供應商及銷貨成本待完成。' from public.sv_companies on conflict(company_id,id) do nothing;
insert into public.sv_system_cards(company_id,id,title,category,status,detail) select id,'pos-acquisition','營運至增長歸因','crm','planned','把來源、預約、到店、首購、退款及回訪事件連成客戶旅程；資料不足時不推算療程 ROAS。' from public.sv_companies on conflict(company_id,id) do nothing;
