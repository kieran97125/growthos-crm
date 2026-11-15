-- Product Learning Sync checked: 07-17 regression, 07-26 CRM final execution,
-- 07-29 truthful readiness, 08-10 permission scope, 10-06 concise disclosure.
-- A comment permits one private reply only. It never becomes marketing consent
-- or a fabricated inbound message / 24-hour conversation window.
create table public.sv_social_comment_rules(
 company_id uuid not null references public.sv_companies(id),id uuid not null,
 brand_id text not null,connection_id uuid not null,name text not null check(length(name)between 1 and 100),
 post_id text not null check(post_id~'^[1-9][0-9]{0,49}(_[1-9][0-9]{0,49})?$'),
 keywords jsonb not null check(jsonb_typeof(keywords)='array'and jsonb_array_length(keywords)between 1 and 20),
 match text not null check(match in('any','all')),body text not null check(length(body)between 1 and 1000),
 enabled boolean not null default false,revision bigint not null default 1,created_by uuid not null,
 permalink text,verified_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),foreign key(company_id,connection_id)references public.sv_meta_connections(company_id,id)
);
create table public.sv_social_rule_versions(
 company_id uuid not null,rule_id uuid not null,revision bigint not null,actor_id uuid not null,
 definition jsonb not null,created_at timestamptz not null default now(),primary key(company_id,rule_id,revision),
 foreign key(company_id,rule_id)references public.sv_social_comment_rules(company_id,id)
);
create table public.sv_social_comment_events(
 company_id uuid not null,connection_id uuid not null,event_key text not null check(event_key~'^[0-9a-f]{64}$'),
 comment_id text not null,event jsonb not null,received_at timestamptz not null default now(),
 primary key(company_id,connection_id,event_key),foreign key(company_id,connection_id)references public.sv_meta_connections(company_id,id)
);
create table public.sv_social_comments(
 company_id uuid not null,connection_id uuid not null,comment_id text not null,
 post_id text,peer_id text,body text not null,provider_created_at timestamptz,event_at timestamptz not null,
 deleted boolean not null default false,live boolean not null default false,revision bigint not null default 1,
 primary key(company_id,connection_id,comment_id),foreign key(company_id,connection_id)references public.sv_meta_connections(company_id,id)
);
create table public.sv_social_comment_jobs(
 company_id uuid not null,id uuid not null default gen_random_uuid(),seq bigint generated always as identity,
 connection_id uuid not null,brand_id text not null,rule_id uuid not null,rule_revision bigint not null,
 comment_id text not null,comment_revision bigint not null,post_id text not null,peer_id text not null,
 body text not null,comment_body text not null,permalink text,actor_id uuid not null,
 state text not null default 'queued'check(state in('queued','checking','sending','accepted','failed','uncertain','skipped')),
 reason text,attempt_token uuid,attempted_at timestamptz,checked_at timestamptz,
 provider_id text,provider_peer_id text,next_attempt_at timestamptz not null default now(),checks integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(company_id,id),unique(company_id,connection_id,comment_id),unique(company_id,connection_id,post_id,peer_id),
 foreign key(company_id,connection_id,comment_id)references public.sv_social_comments(company_id,connection_id,comment_id),
 foreign key(company_id,rule_id)references public.sv_social_comment_rules(company_id,id)
);
create index sv_social_comment_due on public.sv_social_comment_jobs(company_id,next_attempt_at,seq)where state='queued';
create index sv_social_comment_history on public.sv_social_comment_jobs(company_id,seq desc);
create index sv_social_comment_peer on public.sv_social_comment_jobs(company_id,connection_id,provider_peer_id)where state='accepted';
create table public.sv_social_comment_attempts(
 id bigint generated always as identity primary key,company_id uuid not null,job_id uuid not null,
 attempt_token uuid,state text not null,reason text,provider_id text,created_at timestamptz not null default now(),
 foreign key(company_id,job_id)references public.sv_social_comment_jobs(company_id,id)
);

create function smartvolt_private.social_normalize(p_text text)returns text language sql immutable security invoker set search_path=''as $$
 select btrim(regexp_replace(lower(normalize(p_text,NFKC)),'[[:space:]]+',' ','g'))
$$;
create function smartvolt_private.social_matches(p_text text,p_words jsonb,p_match text)returns boolean language sql immutable security invoker set search_path=''as $$
 select jsonb_array_length(p_words)>0 and case when p_match='all'then bool_and(position(smartvolt_private.social_normalize(w#>>'{}')in smartvolt_private.social_normalize(p_text))>0)else bool_or(position(smartvolt_private.social_normalize(w#>>'{}')in smartvolt_private.social_normalize(p_text))>0)end from jsonb_array_elements(p_words)w
$$;
create function smartvolt_private.social_rule_json(r public.sv_social_comment_rules)returns jsonb language sql stable security invoker set search_path=''as $$
 select jsonb_build_object('id',r.id,'revision',r.revision,'connectionId',r.connection_id,'brandId',r.brand_id,'name',r.name,'postId',r.post_id,'keywords',r.keywords,'match',r.match,'body',r.body,'enabled',r.enabled,'permalink',r.permalink,'verifiedAt',r.verified_at,'createdAt',r.created_at,'channel',(select channel from public.sv_meta_connections where company_id=r.company_id and id=r.connection_id))
$$;
create function public.sv_social_comments_read(p_company uuid,p_actor uuid,p_brand text default null,p_before bigint default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare role text;history jsonb;begin
 role=public.sv_authorize(p_company,p_actor,'crm',false,false,p_brand);
 select coalesce(jsonb_agg(x order by x.seq::bigint desc),'[]')into history from(
 select j.id,j.brand_id as "brandId",j.seq::text,j.rule_id as "ruleId",r.name as "ruleName",c.channel,j.comment_body as comment,j.post_id as "postId",j.permalink,j.state,j.reason,j.body,j.provider_id as "providerId",j.created_at as "createdAt",j.attempted_at as "attemptedAt",
 (role in('owner','manager')and j.state='failed'and r.enabled and r.revision=j.rule_revision and c.enabled)as "canRetry"
 from public.sv_social_comment_jobs j join public.sv_social_comment_rules r on r.company_id=j.company_id and r.id=j.rule_id
 join public.sv_meta_connections c on c.company_id=j.company_id and c.id=j.connection_id
 where j.company_id=p_company and(p_brand is null or j.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,j.brand_id)and(p_before is null or j.seq<p_before)order by j.seq desc limit 51)x;
 return jsonb_build_object('canManage',role in('owner','manager'),'automationsPaused',coalesce((select automations_paused from public.sv_delivery_policies where company_id=p_company),false),
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',b->>'id','name',b->>'name'))from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{scope,brands}')b where w.company_id=p_company and smartvolt_private.member_brand_allowed(p_company,p_actor,b->>'id')),'[]'),
 'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'brandId',c.brand_id,'channel',c.channel,'label',c.label,'enabled',c.enabled)order by c.created_at)from public.sv_meta_connections c where c.company_id=p_company and(p_brand is null or c.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,c.brand_id)),'[]'),
 'rules',coalesce((select jsonb_agg(smartvolt_private.social_rule_json(r)order by r.updated_at desc,r.id)from public.sv_social_comment_rules r where r.company_id=p_company and(p_brand is null or r.brand_id=p_brand)and smartvolt_private.member_brand_allowed(p_company,p_actor,r.brand_id)),'[]'),
 'deliveries',case when jsonb_array_length(history)>50 then history-50 else history end,'nextCursor',case when jsonb_array_length(history)>50 then history#>>'{49,seq}'end);
end;$$;

create function public.sv_social_comment_action(p_company uuid,p_actor uuid,p_kind text,p_data jsonb,p_proof jsonb default null)returns jsonb language plpgsql security invoker set search_path=''as $$
declare d jsonb:=coalesce(p_data->'definition',p_data);r public.sv_social_comment_rules;j public.sv_social_comment_jobs;c public.sv_meta_connections;
 ident uuid:=(d->>'id')::uuid;command uuid:=(p_data->>'commandId')::uuid;brand text;result jsonb;begin
 if p_kind not in('save','toggle','retry')or command is null then raise exception 'social_invalid';end if;
 if p_kind='retry'then select *into strict j from public.sv_social_comment_jobs where company_id=p_company and id=ident;brand=j.brand_id;
 elsif p_kind='toggle'then select *into strict r from public.sv_social_comment_rules where company_id=p_company and id=ident;brand=r.brand_id;
 else brand=d->>'brandId';end if;
 if brand is null then raise exception 'social_invalid';end if;
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,brand);
 perform pg_advisory_xact_lock(hashtextextended('social-comment-rule:'||p_company::text,0));
 result=smartvolt_private.action_replay(p_company,p_actor,command,'social:'||p_kind,p_data);if result is not null then return result;end if;
 if p_kind='retry'then
  select *into strict j from public.sv_social_comment_jobs where company_id=p_company and id=ident for update;
  select *into strict r from public.sv_social_comment_rules where company_id=p_company and id=j.rule_id;
  if j.state<>'failed'or not r.enabled or r.revision<>j.rule_revision then raise exception 'social_retry_unavailable';end if;
  update public.sv_social_comment_jobs set state='queued',reason=null,next_attempt_at=statement_timestamp(),attempt_token=null,updated_at=statement_timestamp()where company_id=p_company and id=ident;
  insert into public.sv_social_comment_attempts(company_id,job_id,state,reason)values(p_company,ident,'queued','operator_retry');
  result=jsonb_build_object('saved',true,'id',ident);
 else
  if p_kind='save'then
   select *into r from public.sv_social_comment_rules where company_id=p_company and id=ident for update;
   if r.id is not null and(r.brand_id<>brand or r.connection_id<>(d->>'connectionId')::uuid or r.post_id<>d->>'postId')then raise exception 'social_identity_changed';end if;
   if coalesce(r.revision,0)<>(d->>'revision')::bigint then raise exception 'social_revision_conflict';end if;
   if ident is null or coalesce(length(btrim(d->>'name')),0)not between 1 and 100 or coalesce(length(btrim(d->>'body')),0)not between 1 and 1000 or coalesce(d->>'postId','')!~'^[1-9][0-9]{0,49}(_[1-9][0-9]{0,49})?$'or coalesce(d->>'match','')not in('any','all')or jsonb_typeof(d->'keywords')is distinct from 'array'or jsonb_array_length(d->'keywords')not between 1 and 20 or jsonb_typeof(d->'enabled')is distinct from 'boolean'then raise exception 'social_invalid';end if;
   if exists(select 1 from jsonb_array_elements(d->'keywords')w where jsonb_typeof(w)<>'string'or length(btrim(w#>>'{}'))not between 1 and 80)then raise exception 'social_invalid';end if;
   if r.id is null and(select count(*)from public.sv_social_comment_rules where company_id=p_company)>=100 then raise exception 'social_capacity';end if;
   select *into strict c from public.sv_meta_connections where company_id=p_company and id=(d->>'connectionId')::uuid and brand_id=brand;
  else
   select *into strict r from public.sv_social_comment_rules where company_id=p_company and id=ident for update;
   if r.revision<>(d->>'revision')::bigint or jsonb_typeof(d->'enabled')is distinct from 'boolean'then raise exception 'social_revision_conflict';end if;
   select *into strict c from public.sv_meta_connections where company_id=p_company and id=r.connection_id;
   d=smartvolt_private.social_rule_json(r)||jsonb_build_object('enabled',(d->>'enabled')::boolean);
  end if;
  if(d->>'enabled')::boolean and(not c.enabled or p_proof is null or(p_proof->>'connectionId')is distinct from c.id::text or(p_proof->>'postId')is distinct from(d->>'postId')or(p_proof->>'accountId')is distinct from c.account_id or coalesce((p_proof->>'verified')::boolean,false)is not true)then raise exception 'social_post_unverified';end if;
  insert into public.sv_social_comment_rules(company_id,id,brand_id,connection_id,name,post_id,keywords,match,body,enabled,created_by,permalink,verified_at)
   values(p_company,ident,brand,c.id,btrim(d->>'name'),d->>'postId',d->'keywords',d->>'match',btrim(d->>'body'),(d->>'enabled')::boolean,p_actor,p_proof->>'permalink',case when p_proof is not null then statement_timestamp()end)
  on conflict(company_id,id)do update set name=excluded.name,keywords=excluded.keywords,match=excluded.match,body=excluded.body,enabled=excluded.enabled,created_by=p_actor,permalink=coalesce(excluded.permalink,sv_social_comment_rules.permalink),verified_at=coalesce(excluded.verified_at,sv_social_comment_rules.verified_at),revision=sv_social_comment_rules.revision+1,updated_at=statement_timestamp()returning *into r;
  result=smartvolt_private.social_rule_json(r)||jsonb_build_object('saved',true);
  insert into public.sv_social_rule_versions(company_id,rule_id,revision,actor_id,definition)values(p_company,ident,r.revision,p_actor,result-'saved');
  update public.sv_social_comment_jobs set state='skipped',reason=case when r.enabled then 'rule_changed'else 'rule_paused'end,updated_at=statement_timestamp()where company_id=p_company and rule_id=ident and state in('queued','checking');
 end if;
 insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,command,p_actor,'social:'||p_kind,p_data,result);return result;
end;$$;

create function public.sv_social_comment_replay(p_company uuid,p_actor uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$
declare brand text;ident uuid:=coalesce(p_data#>>'{definition,id}',p_data->>'id')::uuid;begin
 if p_kind='save'then brand=p_data#>>'{definition,brandId}';
 elsif p_kind='retry'then select brand_id into brand from public.sv_social_comment_jobs where company_id=p_company and id=ident;
 elsif p_kind='toggle'then select brand_id into brand from public.sv_social_comment_rules where company_id=p_company and id=ident;
 else raise exception 'social_invalid';end if;
 if brand is null then raise exception 'social_invalid';end if;
 perform public.sv_authorize(p_company,p_actor,'crm',true,true,brand);
 return smartvolt_private.action_replay(p_company,p_actor,(p_data->>'commandId')::uuid,'social:'||p_kind,p_data);
end;$$;

create function public.sv_social_comments_ingest(p_connection uuid,p_events jsonb)returns integer language plpgsql security invoker set search_path=''as $$
declare c public.sv_meta_connections;e jsonb;s public.sv_social_comments;r public.sv_social_comment_rules;at timestamptz;stamp timestamptz;n integer:=0;begin
 select *into c from public.sv_meta_connections where id=p_connection and enabled for update;if not found then return 0;end if;
 if jsonb_typeof(p_events)<>'array'or jsonb_array_length(p_events)>100 then raise exception 'social_invalid';end if;
 perform pg_advisory_xact_lock(hashtextextended('social-comment-ingest:'||p_connection::text,0));
 for e in select *from jsonb_array_elements(p_events)loop
  if(e->>'accountId')is distinct from c.account_id or(e->>'channel')is distinct from c.channel or coalesce(e->>'key','')!~'^[0-9a-f]{64}$'or coalesce(e->>'commentId','')!~'^[1-9][0-9]{0,49}(_[1-9][0-9]{0,49})?$'then raise exception 'social_source_mismatch';end if;
  at=to_timestamp((e->>'eventAt')::double precision/1000);if at is null or at>statement_timestamp()+interval '5 minutes'then raise exception 'social_invalid_time';end if;
  insert into public.sv_social_comment_events(company_id,connection_id,event_key,comment_id,event)values(c.company_id,c.id,e->>'key',e->>'commentId',e)on conflict do nothing;if not found then continue;end if;
  select *into s from public.sv_social_comments where company_id=c.company_id and connection_id=c.id and comment_id=e->>'commentId'for update;
  if s.comment_id is not null and(s.deleted or s.event_at>at)then continue;end if;
  stamp=case when e->>'createdAt'is not null then to_timestamp((e->>'createdAt')::double precision/1000)end;
  -- Meta may duplicate the same comment with a different delivery envelope.
  -- Preserve the admitted source revision if its actual content did not change.
  if s.comment_id is not null and s.post_id is not distinct from(e->>'postId')and s.peer_id is not distinct from(e->>'peerId')and s.body=left(coalesce(e->>'text',''),10000)and s.deleted=coalesce((e->>'deleted')::boolean,false)and s.live=coalesce((e->>'live')::boolean,false)then
   update public.sv_social_comments set event_at=greatest(event_at,at),provider_created_at=coalesce(provider_created_at,stamp)where company_id=c.company_id and connection_id=c.id and comment_id=s.comment_id;continue;
  end if;
  insert into public.sv_social_comments(company_id,connection_id,comment_id,post_id,peer_id,body,provider_created_at,event_at,deleted,live)
   values(c.company_id,c.id,e->>'commentId',e->>'postId',e->>'peerId',left(coalesce(e->>'text',''),10000),stamp,at,coalesce((e->>'deleted')::boolean,false),coalesce((e->>'live')::boolean,false))
  on conflict(company_id,connection_id,comment_id)do update set post_id=coalesce(excluded.post_id,sv_social_comments.post_id),peer_id=coalesce(excluded.peer_id,sv_social_comments.peer_id),body=excluded.body,event_at=excluded.event_at,provider_created_at=coalesce(sv_social_comments.provider_created_at,excluded.provider_created_at),deleted=excluded.deleted,live=excluded.live,revision=sv_social_comments.revision+1 returning *into s;
  update public.sv_social_comment_jobs set state='skipped',reason=case when s.deleted then 'comment_deleted'else 'comment_changed'end,updated_at=statement_timestamp()where company_id=c.company_id and connection_id=c.id and comment_id=s.comment_id and state in('queued','checking');
  if s.deleted or s.live or s.post_id is null or s.peer_id is null or s.peer_id in(c.page_id,c.account_id)then continue;end if;
  -- Only comments received after a rule was activated are eligible. No historic
  -- mass backfill is generated on publish, and a known old creation time fails closed.
  for r in select *from public.sv_social_comment_rules where company_id=c.company_id and connection_id=c.id and post_id=s.post_id and enabled and updated_at<=at and(stamp is null or updated_at<=stamp)and smartvolt_private.social_matches(s.body,keywords,match)order by created_at,id limit 1 loop
   insert into public.sv_social_comment_jobs(company_id,connection_id,brand_id,rule_id,rule_revision,comment_id,comment_revision,post_id,peer_id,body,comment_body,permalink,actor_id)
    values(c.company_id,c.id,c.brand_id,r.id,r.revision,s.comment_id,s.revision,s.post_id,s.peer_id,r.body,s.body,r.permalink,r.created_by)on conflict do nothing;if found then n=n+1;end if;
  end loop;
 end loop;return n;
end;$$;

create function smartvolt_private.social_admission(j public.sv_social_comment_jobs)returns text language plpgsql stable security invoker set search_path=''as $$
declare r public.sv_social_comment_rules;c public.sv_meta_connections;s public.sv_social_comments;begin
 if not exists(select 1 from public.sv_companies where id=j.company_id and status='active')then return 'company_inactive';end if;
 if coalesce((select automations_paused from public.sv_delivery_policies where company_id=j.company_id),false)then return 'automations_paused';end if;
 select *into r from public.sv_social_comment_rules where company_id=j.company_id and id=j.rule_id;
 if not found or not r.enabled or r.revision<>j.rule_revision then return 'rule_changed';end if;
 if not exists(select 1 from public.sv_memberships where company_id=j.company_id and user_id=r.created_by and status='active'and role in('owner','manager'))or not smartvolt_private.member_has_product(j.company_id,r.created_by,'crm')or not smartvolt_private.member_brand_allowed(j.company_id,r.created_by,j.brand_id)then return 'authority_changed';end if;
 select *into c from public.sv_meta_connections where company_id=j.company_id and id=j.connection_id and enabled and brand_id=j.brand_id;
 if not found then return 'connection_disabled';end if;
 select *into s from public.sv_social_comments where company_id=j.company_id and connection_id=j.connection_id and comment_id=j.comment_id;
 if not found or s.deleted or s.live or s.revision<>j.comment_revision or s.post_id is distinct from j.post_id or s.peer_id is distinct from j.peer_id or not smartvolt_private.social_matches(s.body,r.keywords,r.match)then return 'comment_changed';end if;
 if s.provider_created_at is not null and(s.provider_created_at<=statement_timestamp()-interval '7 days'or s.provider_created_at<r.updated_at)then return 'comment_expired';end if;
 return null;
end;$$;
create function public.sv_social_comments_claim(p_company uuid)returns jsonb language plpgsql security invoker set search_path=''as $$
declare j public.sv_social_comment_jobs;why text;token uuid;begin
 perform pg_advisory_xact_lock(hashtextextended('social-comment-dispatch:'||p_company::text,0));
 update public.sv_social_comment_jobs set state='uncertain',reason='worker_interrupted',updated_at=statement_timestamp()where company_id=p_company and state='sending'and attempted_at<statement_timestamp()-interval '5 minutes';
 update public.sv_social_comment_jobs set state='queued',attempt_token=null,next_attempt_at=statement_timestamp()where company_id=p_company and state='checking'and checked_at<statement_timestamp()-interval '5 minutes';
 for j in select *from public.sv_social_comment_jobs where company_id=p_company and state='queued'and next_attempt_at<=statement_timestamp()order by seq for update skip locked limit 20 loop
  why=smartvolt_private.social_admission(j);
  if why='automations_paused'then return null;end if;
  if why is not null then update public.sv_social_comment_jobs set state='skipped',reason=why,updated_at=statement_timestamp()where company_id=p_company and id=j.id;continue;end if;
  if(select count(*)from public.sv_social_comment_jobs where company_id=p_company and connection_id=j.connection_id and attempted_at>statement_timestamp()-interval '1 minute')>=5 or(select count(*)from public.sv_social_comment_jobs where company_id=p_company and connection_id=j.connection_id and attempted_at>statement_timestamp()-interval '1 hour')>=100 then return null;end if;
  token=gen_random_uuid();update public.sv_social_comment_jobs set state='checking',attempt_token=token,checked_at=statement_timestamp(),checks=checks+1,updated_at=statement_timestamp()where company_id=p_company and id=j.id;
  return jsonb_build_object('id',j.id,'token',token,'connectionId',j.connection_id,'commentId',j.comment_id,'postId',j.post_id,'peerId',j.peer_id,'body',j.body,'commentBody',j.comment_body);
 end loop;return null;
end;$$;
create function public.sv_social_comment_admit(p_company uuid,p_job uuid,p_token uuid,p_evidence jsonb)returns boolean language plpgsql security invoker set search_path=''as $$
declare j public.sv_social_comment_jobs;c public.sv_meta_connections;why text;created timestamptz;begin
 select *into j from public.sv_social_comment_jobs where company_id=p_company and id=p_job;if not found then return false;end if;
 -- Match ingest's connection -> comment/job lock order. Re-read the job after
 -- admission acquires the connection lock so a concurrent delete/edit wins.
 select *into c from public.sv_meta_connections where company_id=p_company and id=j.connection_id for update;
 select *into j from public.sv_social_comment_jobs where company_id=p_company and id=p_job for update;if j.state<>'checking'or j.attempt_token<>p_token then return false;end if;
 why=smartvolt_private.social_admission(j);
 created=case when p_evidence->>'createdAt'is not null then to_timestamp((p_evidence->>'createdAt')::double precision/1000)end;
 if why is null and((p_evidence->>'commentId')is distinct from j.comment_id or(p_evidence->>'postId')is distinct from j.post_id or(p_evidence->>'accountId')is distinct from c.account_id or(p_evidence->>'peerId')is distinct from j.peer_id or(p_evidence->>'text')is distinct from j.comment_body or coalesce((p_evidence->>'eligible')::boolean,false)is not true or created is null or created<=statement_timestamp()-interval '7 days'or created>statement_timestamp()+interval '1 minute'or created<(select updated_at from public.sv_social_comment_rules where company_id=p_company and id=j.rule_id))then why='provider_source_changed';end if;
 if why is not null then update public.sv_social_comment_jobs set state=case when why='automations_paused'then 'queued'else 'skipped'end,reason=why,attempt_token=null,updated_at=statement_timestamp()where company_id=p_company and id=p_job;return false;end if;
 if(select count(*)from public.sv_social_comment_jobs where company_id=p_company and connection_id=j.connection_id and attempted_at>statement_timestamp()-interval '1 minute')>=5 or(select count(*)from public.sv_social_comment_jobs where company_id=p_company and connection_id=j.connection_id and attempted_at>statement_timestamp()-interval '1 hour')>=100 then
  update public.sv_social_comment_jobs set state='queued',reason='rate_limit',attempt_token=null,next_attempt_at=statement_timestamp()+interval '1 minute'where company_id=p_company and id=p_job;return false;end if;
 update public.sv_social_comments set provider_created_at=created where company_id=p_company and connection_id=j.connection_id and comment_id=j.comment_id;
 update public.sv_social_comment_jobs set state='sending',attempted_at=statement_timestamp(),reason=null,updated_at=statement_timestamp()where company_id=p_company and id=p_job;
 insert into public.sv_social_comment_attempts(company_id,job_id,attempt_token,state)values(p_company,p_job,p_token,'sending');return true;
end;$$;
create function public.sv_social_comment_finish(p_company uuid,p_job uuid,p_token uuid,p_state text,p_provider text default null,p_peer text default null,p_reason text default null)returns void language plpgsql security invoker set search_path=''as $$
declare j public.sv_social_comment_jobs;begin
 select *into j from public.sv_social_comment_jobs where company_id=p_company and id=p_job for update;if not found or j.attempt_token<>p_token then return;end if;
 if j.state='checking'then
  if p_state not in('queued','failed','skipped')then raise exception 'social_invalid_state';end if;
  update public.sv_social_comment_jobs set state=case when p_state='queued'and checks>=5 then 'failed'else p_state end,reason=left(p_reason,100),attempt_token=null,next_attempt_at=statement_timestamp()+least(300,checks*30)*interval '1 second',updated_at=statement_timestamp()where company_id=p_company and id=p_job;
 elsif j.state in('sending','uncertain')then
  if p_state not in('accepted','failed','uncertain','skipped')or(p_state='accepted'and(coalesce(length(p_provider),0)not between 1 and 512 or coalesce(p_peer,'')!~'^[1-9][0-9]{0,49}$'))then raise exception 'social_invalid_state';end if;
  if j.state='uncertain'and p_state<>'accepted'then return;end if;
  update public.sv_social_comment_jobs set state=p_state,reason=left(p_reason,100),provider_id=p_provider,provider_peer_id=p_peer,updated_at=statement_timestamp()where company_id=p_company and id=p_job;
 else return;end if;
 insert into public.sv_social_comment_attempts(company_id,job_id,attempt_token,state,reason,provider_id)values(p_company,p_job,p_token,p_state,left(p_reason,100),p_provider);
end;$$;

do $$declare t text;f record;begin
 foreach t in array array['sv_social_comment_rules','sv_social_rule_versions','sv_social_comment_events','sv_social_comments','sv_social_comment_jobs','sv_social_comment_attempts']loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select,insert on public.%I to service_role',t);
 end loop;
 grant update on public.sv_social_comment_rules,public.sv_social_comments,public.sv_social_comment_jobs to service_role;
 revoke all on sequence public.sv_social_comment_jobs_seq_seq,public.sv_social_comment_attempts_id_seq from public,anon,authenticated,service_role;
 grant usage,select on sequence public.sv_social_comment_jobs_seq_seq,public.sv_social_comment_attempts_id_seq to service_role;
 foreach t in array array['sv_social_rule_versions','sv_social_comment_events','sv_social_comment_attempts']loop execute format('create trigger %I before update or delete on public.%I for each row execute function smartvolt_private.wa_reject_rewrite()',t||'_immutable',t);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace in('public'::regnamespace,'smartvolt_private'::regnamespace)and(proname like 'sv_social_comment%'or proname in('social_normalize','social_matches','social_rule_json','social_admission'))loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;$$;
