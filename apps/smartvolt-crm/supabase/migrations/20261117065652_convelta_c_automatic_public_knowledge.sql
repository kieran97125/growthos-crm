-- Product Learning Sync checked: progressive setup, public authority and exact-source acceptance.
-- Existing widgets retain their explicitly selected knowledge until an owner opts in.
alter table public.sv_web_chat_configs
 add column ai_knowledge_mode text not null default 'selected' check(ai_knowledge_mode in('selected','brand_public')),
 drop constraint sv_web_chat_public_article_limit,
 add constraint sv_web_chat_public_article_limit check(cardinality(ai_article_ids)<=100);

create function smartvolt_private.web_chat_article_public(a jsonb)returns boolean
language sql immutable security invoker set search_path=''as $$
 select case when a->>'visibility'='internal'then false
 when a->>'visibility'='public'then true
 else jsonb_typeof(a->'website')='object'and a#>>'{website,url}'~'^https://' end
$$;

create or replace function smartvolt_private.web_chat_public_articles(c public.sv_web_chat_configs)returns jsonb
language sql stable security invoker set search_path=''as $$
 select coalesce(jsonb_agg(a order by a->>'id'),'[]')from public.sv_workspaces w,
 jsonb_array_elements(w.payload#>'{studio,articles}')a where w.company_id=c.company_id
 and a->>'clientId'=c.company_id::text and a->>'brandId'=c.brand_id and a->>'status'='approved'
 and a->>'visibility' is distinct from 'internal'and coalesce(a#>>'{coaching,kind}','')<>'pattern'
 and(a->>'id'=any(c.ai_article_ids)or(c.ai_knowledge_mode='brand_public'and smartvolt_private.web_chat_article_public(a)))
 and a->>'validUntil'~'^\d{4}-\d{2}-\d{2}$'
 and a->>'validUntil'>=to_char(statement_timestamp()at time zone'Asia/Hong_Kong','YYYY-MM-DD')
$$;

create or replace function smartvolt_private.web_chat_c_context_hash(c public.sv_web_chat_configs)returns text
language sql stable security invoker set search_path=''as $$
 select md5(jsonb_build_object('articles',smartvolt_private.web_chat_public_articles(c),
 'knowledgeMode',c.ai_knowledge_mode,
 'profile',(select b from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,bots}')b where w.company_id=c.company_id and b->>'brandId'=c.brand_id),
 'name',(select name from public.sv_companies where id=c.company_id))::text)
$$;

create or replace function public.sv_web_chat_settings(p_company uuid,p_actor uuid)returns jsonb
language plpgsql security invoker set search_path=''as $$declare r jsonb;begin
 r=smartvolt_private.sv_web_chat_settings_before_c(p_company,p_actor);
 return r||jsonb_build_object('canManageAI',exists(select 1 from public.sv_memberships where company_id=p_company and user_id=p_actor and role='owner'and status='active'),
 'configs',coalesce((select jsonb_agg(v||jsonb_build_object('aiEnabled',c.ai_enabled,'aiArticleIds',c.ai_article_ids,'aiKnowledgeMode',c.ai_knowledge_mode,'accentColor',c.accent_color))from jsonb_array_elements(r->'configs')v join public.sv_web_chat_configs c on c.company_id=p_company and c.id=(v->>'id')::uuid),'[]'),
 'publicArticles',coalesce((select jsonb_agg(jsonb_build_object('id',a->>'id','brandId',a->>'brandId','title',a->>'title','autoPublic',coalesce(smartvolt_private.web_chat_article_public(a),false))order by a->>'id')from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,articles}')a where w.company_id=p_company and a->>'clientId'=p_company::text and a->>'status'='approved'and a->>'visibility'is distinct from'internal'and coalesce(a#>>'{coaching,kind}','')<>'pattern'and a->>'validUntil'~'^\d{4}-\d{2}-\d{2}$'and a->>'validUntil'>=to_char(statement_timestamp()at time zone'Asia/Hong_Kong','YYYY-MM-DD')and smartvolt_private.member_brand_allowed(p_company,p_actor,a->>'brandId')),'[]'));
end;$$;

create or replace function public.sv_web_chat_configure(p_company uuid,p_actor uuid,p_command uuid,p_data jsonb,p_verification text)returns jsonb
language plpgsql security invoker set search_path=''as $$
declare old public.sv_web_chat_configs;c public.sv_web_chat_configs;r jsonb;want boolean;ids text[];color text;mode text;begin
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,p_data->>'brandId');
 perform pg_advisory_xact_lock(hashtextextended('web-chat-config:'||p_company::text||':'||(p_data->>'id'),0));
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'web-chat-config',p_data);if r is not null then return r;end if;
 select * into old from public.sv_web_chat_configs where company_id=p_company and id=(p_data->>'id')::uuid for update;
 want=coalesce((p_data->>'aiEnabled')::boolean,old.ai_enabled,false);
 ids=case when p_data?'aiArticleIds'then array(select distinct v from jsonb_array_elements_text(p_data->'aiArticleIds')v order by v)else coalesce(old.ai_article_ids,'{}')end;
 mode=coalesce(p_data->>'aiKnowledgeMode',old.ai_knowledge_mode,'selected');
 color=coalesce(p_data->>'accentColor',old.accent_color,'#2457E7');
 if color!~'^#[0-9A-Fa-f]{6}$'or cardinality(ids)>100 or mode not in('selected','brand_public')then raise exception 'chat_settings_invalid';end if;
 if want is distinct from coalesce(old.ai_enabled,false)or ids is distinct from coalesce(old.ai_article_ids,'{}')or mode is distinct from coalesce(old.ai_knowledge_mode,'selected')then perform public.sv_ai_authorize(p_company,p_actor,true);end if;
 if want then
  if not exists(select 1 from public.sv_ai_settings where company_id=p_company and enabled)then raise exception 'chat_ai_disabled';end if;
  c.company_id=p_company;c.brand_id=p_data->>'brandId';c.ai_article_ids=ids;c.ai_knowledge_mode=mode;
  if jsonb_array_length(smartvolt_private.web_chat_public_articles(c))=0 or(mode='selected'and jsonb_array_length(smartvolt_private.web_chat_public_articles(c))<>cardinality(ids))then raise exception 'chat_public_knowledge_required';end if;
 end if;
 r=smartvolt_private.sv_web_chat_configure_before_c(p_company,p_actor,p_command,p_data,p_verification);
 update public.sv_web_chat_configs set ai_enabled=want,ai_article_ids=ids,ai_knowledge_mode=mode,accent_color=upper(color)where company_id=p_company and id=(p_data->>'id')::uuid;
 return r;
end;$$;

revoke all on function smartvolt_private.web_chat_article_public(jsonb)from public,anon,authenticated;
grant execute on function smartvolt_private.web_chat_article_public(jsonb)to service_role;
