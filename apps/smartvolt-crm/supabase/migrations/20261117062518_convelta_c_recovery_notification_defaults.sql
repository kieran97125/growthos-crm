-- Product Learning Sync checked: source-owned recovery, truthful effective preferences and bounded delivery acceptance.
-- No existing overall push setting or device subscription is enabled by this migration.
create function smartvolt_private.effective_notification_preferences(p_data jsonb)returns jsonb language sql immutable security invoker set search_path=''as $$
 select coalesce(p_data,'{}'::jsonb)||jsonb_build_object(
 'website',coalesce((p_data->>'website')::boolean,true),
 'observation',coalesce((p_data->>'observation')::boolean,true),
 'push',coalesce((p_data->>'push')::boolean,false))
$$;
alter table public.sv_notification_preferences alter column data set default '{"assignment":true,"followup":true,"sla":true,"observation":true,"website":true,"push":false,"quietStart":21,"quietEnd":9}'::jsonb;

create or replace function public.sv_web_chat_c_claim(p_company uuid,p_message uuid,p_model text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_web_chat_threads;c public.sv_web_chat_configs;j public.sv_web_chat_c_turns;s public.sv_ai_settings;articles jsonb;profile jsonb;history jsonb;body text;reason text;day_start timestamptz:=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';begin
 select * into s from public.sv_ai_settings where company_id=p_company for update;
 select * into strict j from public.sv_web_chat_c_turns where company_id=p_company and message_id=p_message for update;
 if j.state<>'queued'and not(j.state='running'and j.admitted_at<now()-interval'2 minutes')then return jsonb_build_object('dispatch',false,'state',j.state);end if;
 select * into strict t from public.sv_web_chat_threads where company_id=p_company and id=j.thread_id for update;
 select * into strict c from public.sv_web_chat_configs where company_id=p_company and id=t.config_id;
 if not c.enabled or not(t.origin=any(c.origins)) or not(t.origin=any(c.verified_origins)) or(j.state='queued'and j.created_at<now()-interval'5 minutes') or t.status<>'open' or t.expires_at<=now() or t.revision<>j.source_revision or not c.ai_enabled or t.c_paused or t.visitor_preference='human_only' or(j.state='running'and j.context_hash is distinct from smartvolt_private.web_chat_c_context_hash(c))then reason='context_changed';
 elsif not exists(select 1 from public.sv_companies where id=p_company and status='active') or not exists(select 1 from public.sv_company_products where company_id=p_company and product='crm'and status='active'and starts_at<=now()and(ends_at is null or ends_at>now())) then reason='context_changed';
 elsif not coalesce(s.enabled,false) or p_model is null or not exists(select 1 from public.sv_ai_runtime where id='platform'and model=p_model and status='ready') then reason='ai_unavailable';
 elsif (select count(*)from public.sv_ai_requests where company_id=p_company and created_at>=day_start and created_at<day_start+interval'1 day')+(select count(*)from public.sv_web_chat_c_turns where company_id=p_company and admitted_at>=day_start and admitted_at<day_start+interval'1 day')>=s.daily_limit then reason='ai_daily_limit';
 elsif(select count(*)from public.sv_web_chat_c_turns where company_id=p_company and thread_id=t.id and admitted_at>=now()-interval'1 hour')>=20 then reason='ai_rate_limited';end if;
 -- Recovery shares the same locked, current thread checks as admission.
 -- A timed-out provider result is never redispatched or allowed to undo staff.
 if j.state='running'then
  if reason='context_changed'or not coalesce(s.enabled,false)then
   update public.sv_web_chat_c_turns set state='superseded',error_code='context_changed',finished_at=now()where company_id=p_company and message_id=p_message;
   return jsonb_build_object('dispatch',false,'state','superseded');
  end if;
  update public.sv_web_chat_c_turns set state='failed',error_code='worker_interrupted',finished_at=now()where company_id=p_company and message_id=p_message;
  if not t.human_waiting then perform smartvolt_private.web_chat_append_c(p_company,t.id,'暫時未能完成呢個問題，我已將查詢交到客服工作台，客服會盡快喺呢度回覆你。');end if;
  update public.sv_web_chat_threads set human_waiting=true,human_requested_at=case when not human_waiting then now()else human_requested_at end where company_id=p_company and id=t.id;
  perform smartvolt_private.web_chat_notify(p_company,t.id);
  return jsonb_build_object('dispatch',false,'state','failed');
 end if;
 articles=smartvolt_private.web_chat_public_articles(c);
 select b into profile from public.sv_workspaces w,jsonb_array_elements(w.payload#>'{studio,bots}')b where w.company_id=p_company and b->>'brandId'=c.brand_id;
 if reason is null and(jsonb_array_length(articles)=0 or profile is null)then reason='knowledge_required';end if;
 if reason is not null then
  update public.sv_web_chat_c_turns set state='skipped',error_code=reason,finished_at=now()where company_id=p_company and message_id=p_message;
  if reason<>'context_changed'then
   if not t.human_waiting then perform smartvolt_private.web_chat_append_c(p_company,t.id,'呢個問題需要同事再核實，我已將問題交到客服工作台，客服會盡快喺呢度回覆你。');end if;
   update public.sv_web_chat_threads set human_waiting=true,human_requested_at=case when not human_waiting then now()else human_requested_at end where company_id=p_company and id=t.id;
  end if;perform smartvolt_private.web_chat_notify(p_company,t.id);return jsonb_build_object('dispatch',false,'state','skipped');
 end if;
 select m.body into strict body from public.sv_web_chat_messages m where m.company_id=p_company and m.thread_id=t.id and m.id=p_message and m.sender='visitor';
 select coalesce(jsonb_agg(jsonb_build_object('role',case when direction='incoming'then'user'else'assistant'end,'content',left(m.body,1500))order by m.sequence),'[]')into history from(select *from public.sv_web_chat_messages where company_id=p_company and thread_id=t.id and sequence<j.source_revision order by sequence desc limit 12)m;
 update public.sv_web_chat_c_turns set state='running',admitted_at=now(),model=p_model,context_hash=smartvolt_private.web_chat_c_context_hash(c)where company_id=p_company and message_id=p_message;
 return jsonb_build_object('dispatch',true,'companyId',p_company,'brandId',t.brand_id,'companyName',(select name from public.sv_companies where id=p_company),'name',t.visitor_name,'message',body,'profile',profile,'articles',articles,'history',history);
end;$$;

create or replace function public.sv_notification_read(p_company uuid,p_actor uuid,p_before timestamptz default null,p_id uuid default null)returns jsonb language plpgsql security invoker set search_path='' as $$declare r jsonb;begin
 r=smartvolt_private.sv_notification_read_before_web_chat(p_company,p_actor,p_before,p_id);
 r=jsonb_set(r,'{preferences,data}',smartvolt_private.effective_notification_preferences(r#>'{preferences,data}'));
 return jsonb_set(r,'{rows}',coalesce((select jsonb_agg(v||case when t.id is not null then jsonb_build_object('website',smartvolt_private.web_chat_attention(t)||jsonb_build_object('visitorName',coalesce(nullif(t.visitor_name,''),'網站訪客'),'site',t.origin))else'{}'::jsonb end order by(v->>'created_at')desc,v->>'id')from jsonb_array_elements(r->'rows')v left join public.sv_notifications n on n.company_id=p_company and n.user_id=p_actor and n.id=(v->>'id')::uuid left join public.sv_web_chat_threads t on t.company_id=p_company and n.kind='website'and n.source_key='website:'||t.id||':'||t.attention_sequence and smartvolt_private.member_brand_allowed(p_company,p_actor,t.brand_id)),'[]'));
end;$$;

create or replace function public.sv_notification_sync(p_company uuid,p_actor uuid)returns void language plpgsql security invoker set search_path=''as $$begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 update public.sv_push_attempts set state='unknown',reason='worker_interrupted'where company_id=p_company and user_id=p_actor and state='dispatching'and created_at<statement_timestamp()-interval '2 minutes';
 insert into public.sv_notification_preferences(company_id,user_id)values(p_company,p_actor)on conflict do nothing;
 insert into public.sv_notifications(company_id,user_id,source_key,brand_id,kind,title,href)
 select p_company,p_actor,c.source_key,c.brand_id,c.kind,c.title,c.href from smartvolt_private.notification_candidates(p_company,p_actor)c where not exists(select 1 from public.sv_notifications n where n.company_id=p_company and n.user_id=p_actor and n.source_key=c.source_key)and coalesce((select(smartvolt_private.effective_notification_preferences(data)->>c.kind)::boolean from public.sv_notification_preferences where company_id=p_company and user_id=p_actor),true)order by c.source_key limit 200 on conflict do nothing;
 update public.sv_notifications n set state='expired',revision=revision+1 where n.company_id=p_company and n.user_id=p_actor and n.state='open'and not exists(select 1 from smartvolt_private.notification_candidates(p_company,p_actor)c where c.source_key=n.source_key);
end;$$;

create or replace function smartvolt_private.sv_notification_action_before_web_chat(p_company uuid,p_actor uuid,p_command uuid,p_kind text,p_data jsonb)returns jsonb language plpgsql security invoker set search_path=''as $$declare r jsonb;rev bigint;begin
 perform public.sv_authorize(p_company,p_actor,'crm');
 r=smartvolt_private.action_replay(p_company,p_actor,p_command,'notification:'||p_kind,p_data);if r is not null then return r;end if;
 if p_kind='preferences'then
  insert into public.sv_notification_preferences(company_id,user_id)values(p_company,p_actor)on conflict do nothing;
  update public.sv_notification_preferences set data=smartvolt_private.effective_notification_preferences(data)||(p_data->'data'),revision=revision+1 where company_id=p_company and user_id=p_actor and revision=(p_data->>'revision')::bigint;if not found then raise exception 'revision_conflict';end if;
 elsif p_kind in('done','snooze')then
  update public.sv_notifications set state=case when p_kind='done'then 'done'else state end,snoozed_until=case when p_kind='snooze'then(p_data->>'until')::timestamptz else snoozed_until end,revision=revision+1 where company_id=p_company and user_id=p_actor and id=(p_data->>'id')::uuid and revision=(p_data->>'revision')::bigint and smartvolt_private.member_brand_allowed(p_company,p_actor,brand_id);if not found then raise exception 'revision_conflict';end if;
 elsif p_kind='device'then
  if p_data->>'endpoint'!~'^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com)/'then raise exception 'invalid_push_endpoint';end if;
  if exists(select 1 from public.sv_push_devices where endpoint=p_data->>'endpoint'and(company_id,user_id)<>(p_company,p_actor)and active)then raise exception 'device_owner_changed';end if;
  if(select count(*)from public.sv_push_devices where company_id=p_company and user_id=p_actor and active)>=10 and not exists(select 1 from public.sv_push_devices where company_id=p_company and user_id=p_actor and endpoint=p_data->>'endpoint')then raise exception 'device_limit';end if;
  insert into public.sv_push_devices(company_id,user_id,endpoint,p256dh,auth,label)values(p_company,p_actor,p_data->>'endpoint',p_data->>'p256dh',p_data->>'auth',p_data->>'label')on conflict(company_id,user_id,endpoint)do update set active=true,p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label;
  insert into public.sv_notification_preferences(company_id,user_id,data)values(p_company,p_actor,'{"assignment":true,"followup":true,"sla":true,"observation":true,"website":true,"push":true,"quietStart":21,"quietEnd":9}')on conflict(company_id,user_id)do update set data=jsonb_set(sv_notification_preferences.data,'{push}','true'),revision=sv_notification_preferences.revision+1;
 elsif p_kind='revoke'then update public.sv_push_devices set active=false where company_id=p_company and user_id=p_actor and id=(p_data->>'id')::uuid;if not found then raise exception 'device_missing';end if;
 else raise exception 'invalid_action';end if;
 r='{"saved":true}';insert into public.sv_action_receipts(company_id,command_id,actor_id,kind,data,result)values(p_company,p_command,p_actor,'notification:'||p_kind,p_data,r);return r;end;$$;

create or replace function public.sv_push_claim(p_company uuid,p_actor uuid)returns jsonb language plpgsql security invoker set search_path=''as $$declare p jsonb;result jsonb;hour integer:=extract(hour from statement_timestamp()at time zone 'Asia/Hong_Kong');begin
 perform public.sv_authorize(p_company,p_actor,'crm');select smartvolt_private.effective_notification_preferences(data)into p from public.sv_notification_preferences where company_id=p_company and user_id=p_actor;
 if not coalesce((p->>'push')::boolean,false)or((p->>'quietStart')::integer<>(p->>'quietEnd')::integer and(case when(p->>'quietStart')::integer<(p->>'quietEnd')::integer then hour>=(p->>'quietStart')::integer and hour<(p->>'quietEnd')::integer else hour>=(p->>'quietStart')::integer or hour<(p->>'quietEnd')::integer end))then return '[]';end if;
 with candidates as(select n.id notification_id,d.id device_id from public.sv_notifications n join public.sv_push_devices d on d.company_id=n.company_id and d.user_id=n.user_id and d.active where n.company_id=p_company and n.user_id=p_actor and n.state='open'and n.created_at>statement_timestamp()-interval '1 day'and coalesce(n.snoozed_until,'epoch')<=statement_timestamp()and coalesce((p->>n.kind)::boolean,false)and smartvolt_private.member_brand_allowed(p_company,p_actor,n.brand_id)and exists(select 1 from smartvolt_private.notification_candidates(p_company,p_actor)c where c.source_key=n.source_key)and not exists(select 1 from public.sv_push_attempts a where a.company_id=n.company_id and a.user_id=n.user_id and a.notification_id=n.id and a.device_id=d.id)order by n.created_at,n.id,d.id limit 20 for update of n skip locked),claimed as(insert into public.sv_push_attempts(company_id,user_id,notification_id,device_id,state)select p_company,p_actor,notification_id,device_id,'dispatching'from candidates on conflict do nothing returning *)select coalesce(jsonb_agg(jsonb_build_object('notificationId',a.notification_id,'deviceId',a.device_id,'endpoint',d.endpoint,'p256dh',d.p256dh,'auth',d.auth)), '[]')into result from claimed a join public.sv_push_devices d on d.company_id=a.company_id and d.user_id=a.user_id and d.id=a.device_id;return result;
end;$$;

revoke all on function smartvolt_private.effective_notification_preferences(jsonb)from public,anon,authenticated;
grant execute on function smartvolt_private.effective_notification_preferences(jsonb)to service_role;
