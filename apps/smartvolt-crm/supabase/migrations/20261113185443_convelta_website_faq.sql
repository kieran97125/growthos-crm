-- Owner-requested publication policy: scanning publishes source-backed FAQ immediately.
-- Terminal source evidence and ordinary company revision/audit boundaries remain intact.
alter table public.sv_website_imports add column refreshed integer not null default 0;

create or replace function public.sv_website_finish(p_company uuid,p_actor uuid,p_id uuid,p_token uuid,p_state jsonb,p_status text)returns void
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;
begin
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if not found then raise exception 'website_missing';end if;
 perform public.sv_website_access(p_company,p_actor,j.brand_id);
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id for update;
 if j.status<>'running'or j.lease_token is distinct from p_token or j.lease_until<=clock_timestamp()then raise exception 'website_lease_lost';end if;
 if p_status not in('queued','ready','failed')or p_state->>'inputUrl'is distinct from j.state->>'inputUrl'
 or jsonb_array_length(p_state->'pages')>8 or jsonb_array_length(p_state->'candidates')>60 then raise exception 'website_invalid_result';end if;
 update public.sv_website_imports set state=p_state,status=p_status,lease_token=null,lease_until=null,updated_at=now()where company_id=p_company and id=p_id;
end;$$;

create or replace function public.sv_website_import(p_company uuid,p_actor uuid,p_id uuid,p_command uuid,p_expected bigint,p_selected jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.sv_website_imports;w public.sv_workspaces;items jsonb;candidate jsonb;prior jsonb;original jsonb;payload jsonb;receipt jsonb;chosen integer;added_count integer:=0;updated_count integer:=0;skipped_count integer:=0;
begin
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id;
 if not found then raise exception 'website_missing';end if;
 perform public.sv_website_access(p_company,p_actor,j.brand_id);
 select * into j from public.sv_website_imports where company_id=p_company and id=p_id for update;
 if j.status='imported'then
  if j.import_command is distinct from p_command or j.selection is distinct from p_selected then raise exception 'website_command_conflict';end if;
  select * into w from public.sv_workspaces where company_id=p_company;
  return jsonb_build_object('state',w.payload,'revision',w.revision,'added',j.added,'skipped',j.skipped,'refreshed',j.refreshed);
 end if;
 if j.status<>'ready'then raise exception 'website_not_ready';end if;
 if j.created_at<now()-interval '1 day'then raise exception 'website_expired';end if;
 if jsonb_typeof(p_selected)<>'array'or jsonb_array_length(p_selected)not between 1 and 60 then raise exception 'website_selection';end if;
 chosen:=jsonb_array_length(p_selected);
 if chosen<>(select count(distinct s)from jsonb_array_elements_text(p_selected)s)or chosen<>(select count(*)from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id'))then raise exception 'website_selection';end if;
 select * into w from public.sv_workspaces where company_id=p_company for update;
 if w.revision<>p_expected then raise exception 'revision_conflict';end if;
 if exists(select 1 from public.sv_commands where company_id=p_company and command_id=p_command)then raise exception 'website_command_conflict';end if;
 if exists(select 1 from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id')and(a->>'clientId'<>p_company::text or a->>'brandId'<>j.brand_id or a#>>'{website,importId}'<>p_id::text))then raise exception 'website_result_scope';end if;
 items:=w.payload#>'{studio,articles}';
 -- Replace only untouched legacy page dumps whose URL was actually read by this scan.
 -- The original import rows remain immutable; manually edited titles/answers survive.
 if j.state->>'format'='faq'then
  select coalesce(jsonb_agg(old order by ordinal),'[]'::jsonb)into items
  from jsonb_array_elements(items)with ordinality x(old,ordinal)
  where not(old->>'brandId'=j.brand_id and old?'website'and not(old->'website'?'faqKey')
   and exists(select 1 from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id')and a#>>'{website,url}'=old#>>'{website,url}')
   and exists(select 1 from public.sv_website_imports src cross join lateral jsonb_array_elements(src.state->'candidates')a
    where src.company_id=p_company and src.id::text=old#>>'{website,importId}'and a->>'id'=old->>'id'and a->>'title'=old->>'title'and a->>'content'=old->>'content'));
 end if;
 for candidate in select a from jsonb_array_elements(j.state->'candidates')a where p_selected?(a->>'id')loop
  candidate:=candidate||jsonb_build_object('status','approved','validUntil','9999-12-31');
  select a into prior from jsonb_array_elements(items)a where a->>'brandId'=j.brand_id and a#>>'{website,url}'=candidate#>>'{website,url}'and(
   (candidate#>>'{website,faqKey}'is not null and a#>>'{website,faqKey}'=candidate#>>'{website,faqKey}')
   or a#>>'{website,contentHash}'=candidate#>>'{website,contentHash}')limit 1;
  if found then
   select a into original from public.sv_website_imports src cross join lateral jsonb_array_elements(src.state->'candidates')a
   where src.company_id=p_company and src.id::text=prior#>>'{website,importId}'and(a->>'id'=prior->>'id'or(a#>>'{website,faqKey}'is not null and a#>>'{website,faqKey}'=prior#>>'{website,faqKey}'and a#>>'{website,url}'=prior#>>'{website,url}'))limit 1;
   if prior->>'content'is distinct from original->>'content'or prior->>'title'is distinct from original->>'title'
    or prior#>>'{website,contentHash}'=candidate#>>'{website,contentHash}'then
    skipped_count:=skipped_count+1;continue;
   end if;
   candidate:=candidate||jsonb_build_object('id',prior->>'id','revision',(prior->>'revision')::integer+1);
   select jsonb_agg(case when a->>'id'=prior->>'id'then candidate else a end order by ordinal)into items from jsonb_array_elements(items)with ordinality x(a,ordinal);
   updated_count:=updated_count+1;
  else
   items:=items||jsonb_build_array(candidate);added_count:=added_count+1;
  end if;
 end loop;
 if jsonb_array_length(items)>100 then raise exception 'website_knowledge_limit';end if;
 payload:=jsonb_set(w.payload,'{studio,articles}',items);
 receipt:=public.sv_commit_workspace(p_company,p_actor,p_expected,p_command,payload,'studio');
 update public.sv_website_imports set status='imported',import_command=p_command,selection=p_selected,added=added_count,skipped=skipped_count,refreshed=updated_count,updated_at=now()where company_id=p_company and id=p_id;
 return receipt||jsonb_build_object('added',added_count,'skipped',skipped_count,'refreshed',updated_count);
end;$$;

revoke all on function public.sv_website_finish(uuid,uuid,uuid,uuid,jsonb,text),public.sv_website_import(uuid,uuid,uuid,uuid,bigint,jsonb)from public,anon,authenticated;
grant execute on function public.sv_website_finish(uuid,uuid,uuid,uuid,jsonb,text),public.sv_website_import(uuid,uuid,uuid,uuid,bigint,jsonb)to service_role;

insert into public.sv_system_cards(company_id,id,title,category,status,detail)
select id,'brand-website-faq','一鍵網站 FAQ 知識庫','ai','in_progress','網站掃描即時可用、一問一答列表及直接修改；待桌面／手機、更新去重、手動修改保留及正式部署驗收。'from public.sv_companies on conflict(company_id,id)do nothing;
