-- Operational ownership belongs to the tenant inbox, separate from immutable
-- provider evidence. No client identity or sample conversation is seeded.
alter table public.sv_meta_threads
 add column customer_name text not null default '' check(length(customer_name)<=100),
 add column assignee_id uuid,
 add column priority text not null default 'normal' check(priority in ('normal','high','urgent')),
 add column follow_up_at timestamptz,
 add column next_step text not null default '' check(length(next_step)<=500),
 add constraint sv_meta_assignee_tenant foreign key(company_id,assignee_id)
 references public.sv_memberships(company_id,user_id);
create index sv_meta_threads_assignee on public.sv_meta_threads(company_id,assignee_id,updated_at desc,id desc);
create index sv_meta_threads_connection on public.sv_meta_threads(company_id,connection_id);
create index sv_meta_threads_follow_up on public.sv_meta_threads(company_id,follow_up_at) where status='open' and follow_up_at is not null;

create table public.sv_meta_thread_activity(
 company_id uuid not null,command_id uuid not null,thread_id uuid not null,
 actor_id uuid not null,actor_name text not null,
 request jsonb not null,previous jsonb not null,next jsonb not null,
 created_at timestamptz not null default now(),
 primary key(company_id,command_id),
 foreign key(company_id,thread_id) references public.sv_meta_threads(company_id,id),
 foreign key(company_id,actor_id) references public.sv_memberships(company_id,user_id)
);
create index sv_meta_thread_activity_history on public.sv_meta_thread_activity(company_id,thread_id,created_at desc,command_id desc);
create index sv_meta_thread_activity_actor on public.sv_meta_thread_activity(company_id,actor_id);
create trigger sv_meta_thread_activity_immutable before update or delete on public.sv_meta_thread_activity
 for each row execute function public.sv_meta_event_immutable();
alter table public.sv_meta_thread_activity enable row level security;
revoke all on public.sv_meta_thread_activity from public,anon,authenticated;
grant select,insert on public.sv_meta_thread_activity to service_role;

create function public.sv_meta_manage_thread(p_company uuid,p_actor uuid,p_thread uuid,p_command uuid,p_expected bigint,p_data jsonb)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare t public.sv_meta_threads; prior jsonb; target jsonb; receipt public.sv_meta_thread_activity; assignee uuid; actor_name text;
begin
 perform public.sv_meta_authorize(p_company,p_actor,true,false);
 -- Immutable receipts can be confirmed after an assignee has left the company.
 select * into receipt from public.sv_meta_thread_activity where company_id=p_company and command_id=p_command;
 if found then
  if receipt.thread_id<>p_thread or receipt.actor_id<>p_actor or receipt.request is distinct from jsonb_build_object('revision',p_expected,'data',p_data)
  then raise exception 'meta_idempotency_conflict';end if;
  return jsonb_build_object('saved',true,'replayed',true);
 end if;
 if p_command is null or p_expected is null or p_expected<0 or jsonb_typeof(p_data) is distinct from 'object'
 or (select count(*) from jsonb_object_keys(p_data))<>6
 or not (p_data ?& array['customer_name','assignee_id','priority','follow_up_at','next_step','status'])
 or jsonb_typeof(p_data->'customer_name')<>'string' or length(p_data->>'customer_name')>100
 or jsonb_typeof(p_data->'next_step')<>'string' or length(p_data->>'next_step')>500
 or p_data->>'priority' not in ('normal','high','urgent') or p_data->>'status' not in ('open','resolved')
 or jsonb_typeof(p_data->'priority')<>'string' or jsonb_typeof(p_data->'status')<>'string'
 or jsonb_typeof(p_data->'assignee_id') not in ('string','null') or jsonb_typeof(p_data->'follow_up_at') not in ('string','null')
 then raise exception 'meta_operations_invalid';end if;
 assignee=(p_data->>'assignee_id')::uuid;
 -- Lock memberships before the thread, consistently with access authorization.
 -- A removed/view-only assignee must be explicitly reassigned or cleared.
 if assignee is not null then
  perform 1 from public.sv_memberships where company_id=p_company and user_id=assignee and status='active' and role<>'viewer' for share;
  if not found then raise exception 'meta_assignee_invalid';end if;
 end if;
 select * into strict t from public.sv_meta_threads where company_id=p_company and id=p_thread for update;
 select * into receipt from public.sv_meta_thread_activity where company_id=p_company and command_id=p_command;
 if found then
  if receipt.thread_id<>p_thread or receipt.actor_id<>p_actor or receipt.request is distinct from jsonb_build_object('revision',p_expected,'data',p_data)
  then raise exception 'meta_idempotency_conflict';end if;
  return jsonb_build_object('saved',true,'replayed',true);
 end if;
 if t.revision<>p_expected then raise exception 'meta_revision_conflict';end if;
 prior=jsonb_build_object('customer_name',t.customer_name,'assignee_id',t.assignee_id,'priority',t.priority,'follow_up_at',t.follow_up_at,'next_step',t.next_step,'status',t.status);
 target=jsonb_build_object('customer_name',btrim(p_data->>'customer_name'),'assignee_id',assignee,'priority',p_data->>'priority','follow_up_at',(p_data->>'follow_up_at')::timestamptz,'next_step',btrim(p_data->>'next_step'),'status',p_data->>'status');
 if not isfinite((target->>'follow_up_at')::timestamptz) then raise exception 'meta_operations_invalid';end if;
 select display_name into strict actor_name from public.sv_memberships where company_id=p_company and user_id=p_actor;
 update public.sv_meta_threads set customer_name=target->>'customer_name',assignee_id=assignee,priority=target->>'priority',
 follow_up_at=(target->>'follow_up_at')::timestamptz,next_step=target->>'next_step',status=target->>'status',revision=revision+1,updated_at=now() where id=t.id;
 insert into public.sv_meta_thread_activity(company_id,command_id,thread_id,actor_id,actor_name,request,previous,next)
 values(p_company,p_command,t.id,p_actor,actor_name,jsonb_build_object('revision',p_expected,'data',p_data),prior,target);
 return jsonb_build_object('saved',true,'replayed',false);
end;$$;

-- All filtering and queue totals operate on the tenant's complete dataset,
-- before keyset pagination. Search is literal, never interpolated SQL/filters.
create function public.sv_meta_inbox_list(p_company uuid,p_actor uuid,p_queue text default 'all',p_channel text default 'all',p_search text default '',p_before timestamptz default null,p_before_id uuid default null)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare output jsonb;
begin
 perform public.sv_meta_authorize(p_company,p_actor,false,false);
 if p_queue is null or p_queue not in ('all','mine','unassigned','overdue','priority','unread','resolved')
 or p_channel is null or p_channel not in ('all','messenger','instagram') or p_search is null or length(p_search)>100
 or (p_before is null)<>(p_before_id is null) then raise exception 'meta_query_invalid';end if;
 with scoped as materialized(
  select t.*,coalesce(a.status='active' and a.role<>'viewer',false) as assignee_active,
   (select count(*)::integer from public.sv_meta_messages m where m.company_id=t.company_id and m.thread_id=t.id and m.direction='inbound' and m.seq>t.read_seq) as unread_count
  from public.sv_meta_threads t join public.sv_meta_connections c on c.company_id=t.company_id and c.id=t.connection_id
  left join public.sv_memberships a on a.company_id=t.company_id and a.user_id=t.assignee_id
  where t.company_id=p_company and (p_channel='all' or c.channel=p_channel)
  and (p_search='' or strpos(lower(t.customer_name||' '||t.peer_id),lower(p_search))>0)
 ), filtered as(
  select * from scoped where case p_queue
   when 'resolved' then status='resolved'
   when 'mine' then status='open' and assignee_id=p_actor
   when 'unassigned' then status='open' and not assignee_active
   when 'overdue' then status='open' and follow_up_at<=now()
   when 'priority' then status='open' and priority in ('high','urgent')
   when 'unread' then status='open' and unread_count>0
   else status='open' end
 ), page as(
  select * from filtered where p_before is null or (updated_at,id)<(p_before,p_before_id)
  order by updated_at desc,id desc limit 101
 )
 select jsonb_build_object('threads',coalesce((select jsonb_agg(to_jsonb(page) order by updated_at desc,id desc) from page),'[]'::jsonb),
 'counts',(select jsonb_build_object(
  'all',count(*)filter(where status='open'),
  'mine',count(*)filter(where status='open' and assignee_id=p_actor),
  'unassigned',count(*)filter(where status='open' and not assignee_active),
  'overdue',count(*)filter(where status='open' and follow_up_at<=now()),
  'priority',count(*)filter(where status='open' and priority in ('high','urgent')),
  'unread',count(*)filter(where status='open' and unread_count>0),
  'resolved',count(*)filter(where status='resolved')) from scoped)) into output;
 return output;
end;$$;
revoke all on function public.sv_meta_manage_thread(uuid,uuid,uuid,uuid,bigint,jsonb),public.sv_meta_inbox_list(uuid,uuid,text,text,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.sv_meta_manage_thread(uuid,uuid,uuid,uuid,bigint,jsonb),public.sv_meta_inbox_list(uuid,uuid,text,text,text,timestamptz,uuid) to service_role;
