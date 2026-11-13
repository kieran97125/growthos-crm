-- Public website content remains unapproved until a company manager reviews its knowledge drafts.
create table public.sv_website_imports (
 company_id uuid not null, id uuid not null, brand_id text not null, actor_id uuid not null,
 status text not null default 'queued' check(status in('queued','running','ready','imported','failed')),
 state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=1200000),
 lease_token uuid, lease_until timestamptz, import_command uuid, selection jsonb,
 added integer not null default 0, skipped integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id), foreign key(company_id)references public.sv_companies(id),
 foreign key(company_id,actor_id)references public.sv_memberships(company_id,user_id)
);
create index sv_website_imports_brand on public.sv_website_imports(company_id,brand_id,created_at desc);
create index sv_website_imports_actor on public.sv_website_imports(company_id,actor_id);
create unique index sv_website_imports_active on public.sv_website_imports(company_id,brand_id) where status in('queued','running');
alter table public.sv_website_imports enable row level security;
revoke all on public.sv_website_imports from public,anon,authenticated,service_role;
grant select,insert,update on public.sv_website_imports to service_role;
create function public.sv_website_preserve_evidence()returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.company_id is distinct from old.company_id or new.id is distinct from old.id or new.brand_id is distinct from old.brand_id or new.actor_id is distinct from old.actor_id or new.created_at is distinct from old.created_at then raise exception 'website_identity_immutable';end if;
 if old.status='imported'and new is distinct from old then raise exception 'website_receipt_immutable';end if;
 if old.status in('ready','failed')and new.state is distinct from old.state then raise exception 'website_evidence_immutable';end if;
 return new;
end;$$;
create trigger sv_website_evidence before update on public.sv_website_imports for each row execute function public.sv_website_preserve_evidence();
revoke all on function public.sv_website_preserve_evidence()from public,anon,authenticated;
grant execute on function public.sv_website_preserve_evidence()to service_role;

create function public.sv_website_access(p_company uuid,p_actor uuid,p_brand text)returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.sv_memberships m join public.sv_companies c on c.id=m.company_id
 where m.company_id=p_company and m.user_id=p_actor and m.status='active'and m.role in('owner','manager')and c.status='active'for share of m,c;
 if not found then raise exception 'website_access_denied';end if;
 perform 1 from public.sv_company_products where company_id=p_company for share;
 if not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm'and status='active'and starts_at<=statement_timestamp()and(ends_at is null or ends_at>statement_timestamp()))then raise exception 'website_product_required';end if;
 if not exists(select 1 from public.sv_workspaces w cross join lateral jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and b->>'id'=p_brand)then raise exception 'website_brand_scope';end if;
end;$$;

create function public.sv_website_start(p_company uuid,p_actor uuid,p_id uuid,p_brand text,p_state jsonb)returns uuid
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;
begin
 perform public.sv_website_access(p_company,p_actor,p_brand);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('website:'||p_company::text,0));
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if found then
  if j.actor_id<>p_actor or j.brand_id<>p_brand or j.state->>'inputUrl' is distinct from p_state->>'inputUrl'then raise exception 'website_command_conflict';end if;
  return j.id;
 end if;
 update public.sv_website_imports set status='failed',lease_token=null,lease_until=null,updated_at=now()where company_id=p_company and status in('queued','running')and created_at<now()-interval '1 day';
 select * into j from public.sv_website_imports where company_id=p_company and brand_id=p_brand and status in('queued','running');
 if found then
  if j.state->>'inputUrl'=p_state->>'inputUrl'then return j.id;end if;
  raise exception 'website_active_scan';
 end if;
 if(select count(*)from public.sv_website_imports where company_id=p_company and created_at>now()-interval '1 hour')>=5
 or(select count(*)from public.sv_website_imports where company_id=p_company and created_at>now()-interval '1 day')>=30 then raise exception 'website_scan_limit';end if;
 if jsonb_array_length(p_state->'pages')<>0 or jsonb_array_length(p_state->'candidates')<>0 then raise exception 'website_invalid_initial_state';end if;
 insert into public.sv_website_imports(company_id,id,brand_id,actor_id,state)values(p_company,p_id,p_brand,p_actor,p_state);
 return p_id;
end;$$;

create function public.sv_website_claim(p_company uuid,p_actor uuid,p_id uuid,p_token uuid)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;
begin
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if not found then raise exception 'website_missing';end if;
 perform public.sv_website_access(p_company,p_actor,j.brand_id);
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id for update;
 if j.created_at<now()-interval '1 day'then raise exception 'website_expired';end if;
 if j.status not in('queued','running')or(j.status='running'and j.lease_until>now())then return null;end if;
 -- A replayed in-flight HTTP request does not dispatch another fetch, even with the same token.
 update public.sv_website_imports set status='running',lease_token=p_token,lease_until=now()+interval '45 seconds',updated_at=now()where company_id=p_company and id=p_id;
 return jsonb_build_object('state',j.state,'brandId',j.brand_id);
end;$$;

create function public.sv_website_finish(p_company uuid,p_actor uuid,p_id uuid,p_token uuid,p_state jsonb,p_status text)returns void
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;
begin
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if not found then raise exception 'website_missing';end if;
 perform public.sv_website_access(p_company,p_actor,j.brand_id);
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id for update;
 if j.status<>'running'or j.lease_token is distinct from p_token or j.lease_until<=clock_timestamp()then raise exception 'website_lease_lost';end if;
 if p_status not in('queued','ready','failed')or p_state->>'inputUrl'is distinct from j.state->>'inputUrl'
 or jsonb_array_length(p_state->'pages')>8 or jsonb_array_length(p_state->'candidates')>24 then raise exception 'website_invalid_result';end if;
 update public.sv_website_imports set state=p_state,status=p_status,lease_token=null,lease_until=null,updated_at=now()where company_id=p_company and id=p_id;
end;$$;

create function public.sv_website_import(p_company uuid,p_actor uuid,p_id uuid,p_command uuid,p_expected bigint,p_selected jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;w public.sv_workspaces;items jsonb; payload jsonb;receipt jsonb;chosen integer;added_count integer;
begin
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if not found then raise exception 'website_missing';end if;
 perform public.sv_website_access(p_company,p_actor,j.brand_id);
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id for update;
 if j.status='imported'then
  if j.import_command is distinct from p_command or j.selection is distinct from p_selected then raise exception 'website_command_conflict';end if;
  select * into w from public.sv_workspaces where company_id=p_company;
  return jsonb_build_object('state',w.payload,'revision',w.revision,'added',j.added,'skipped',j.skipped);
 end if;
 if j.status<>'ready'then raise exception 'website_not_ready';end if;
 if j.created_at<now()-interval '1 day'then raise exception 'website_expired';end if;
 if jsonb_typeof(p_selected)<>'array'or jsonb_array_length(p_selected)not between 1 and 24 then raise exception 'website_selection';end if;
 chosen:=jsonb_array_length(p_selected);
 if chosen<>(select count(distinct s)from jsonb_array_elements_text(p_selected)s)or chosen<>(select count(*)from jsonb_array_elements(j.state->'candidates')a where p_selected? (a->>'id'))then raise exception 'website_selection';end if;
 select * into w from public.sv_workspaces where company_id=p_company for update;
 if w.revision<>p_expected then raise exception 'revision_conflict';end if;
 if exists(select 1 from public.sv_commands where company_id=p_company and command_id=p_command)then raise exception 'website_command_conflict';end if;
 if exists(select 1 from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id')and(a->>'clientId'<>p_company::text or a->>'brandId'<>j.brand_id or a->>'status'<>'draft' or a#>>'{website,importId}'<>p_id::text))then raise exception 'website_result_scope';end if;
 select coalesce(jsonb_agg(a),'[]'::jsonb)into items from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id')and not exists(
  select 1 from jsonb_array_elements(w.payload#>'{studio,articles}')old where old->>'brandId'=j.brand_id and old#>>'{website,url}'=a#>>'{website,url}'and old#>>'{website,contentHash}'=a#>>'{website,contentHash}'
 );
 added_count:=jsonb_array_length(items);
 if jsonb_array_length(w.payload#>'{studio,articles}')+added_count>100 then raise exception 'website_knowledge_limit';end if;
 payload:=jsonb_set(w.payload,'{studio,articles}',(w.payload#>'{studio,articles}')||items);
 receipt:=public.sv_commit_workspace(p_company,p_actor,p_expected,p_command,payload,'studio');
 update public.sv_website_imports set status='imported',import_command=p_command,selection=p_selected,added=added_count,skipped=chosen-added_count,updated_at=now()where company_id=p_company and id=p_id;
 return receipt||jsonb_build_object('added',added_count,'skipped',chosen-added_count);
end;$$;

revoke all on function public.sv_website_access(uuid,uuid,text),public.sv_website_start(uuid,uuid,uuid,text,jsonb),public.sv_website_claim(uuid,uuid,uuid,uuid),public.sv_website_finish(uuid,uuid,uuid,uuid,jsonb,text),public.sv_website_import(uuid,uuid,uuid,uuid,bigint,jsonb)from public,anon,authenticated;
grant execute on function public.sv_website_access(uuid,uuid,text),public.sv_website_start(uuid,uuid,uuid,text,jsonb),public.sv_website_claim(uuid,uuid,uuid,uuid),public.sv_website_finish(uuid,uuid,uuid,uuid,jsonb,text),public.sv_website_import(uuid,uuid,uuid,uuid,bigint,jsonb)to service_role;

insert into public.sv_system_cards(company_id,id,title,category,status,detail)
select id,'brand-website-import','網站匯入品牌知識','ai','in_progress','公開網站掃描、來源預覽及選取草稿；待程式、權限、桌面手機、實際網站及正式部署驗收。網站內容核准前不供 C 引用。'from public.sv_companies on conflict(company_id,id)do nothing;
