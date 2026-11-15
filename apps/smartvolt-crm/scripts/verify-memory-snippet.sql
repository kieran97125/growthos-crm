-- Run inside the parent BEGIN/ROLLBACK after verify-coaching's synthetic fixture.
-- No provider/model call; current_setting is set by that private smoke fixture.
do $memory_smoke$
declare c uuid:=current_setting('convelta.verify.company')::uuid;a uuid;mid uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();fix_cmd uuid:=gen_random_uuid();req uuid:=gen_random_uuid();data jsonb;ctx jsonb;r jsonb;v bigint;
begin
 select user_id into strict a from public.sv_memberships where company_id=c and role='owner' and status='active';
 data=jsonb_build_object('brandId','main','action','save','memoryId',mid,'expectedRevision',0,'category','preference','content','Synthetic customer prefers Saturday','reason','Synthetic customer confirmed preference');
 r=public.sv_customer_memory_action(c,a,'synthetic-customer',cmd,data);
 if(r->>'revision')::integer<>1 then raise exception 'memory_smoke_save';end if;
 r=public.sv_customer_memory_action(c,a,'synthetic-customer',cmd,data);
 if(select count(*)from public.sv_customer_memories where company_id=c and id=mid)<>1 then raise exception 'memory_smoke_duplicate';end if;
 ctx=public.sv_customer_memory_context(c,a,'main','conversation','synthetic-conversation');
 if ctx->>'customerId'<>'synthetic-customer'or jsonb_array_length(ctx->'guidance')<>1 then raise exception 'memory_smoke_context';end if;
 select revision into strict v from public.sv_workspaces where company_id=c;
 r=public.sv_memory_ai_claim(c,a,req,'main','conversation','synthetic-conversation',v,null,'synthetic/model',repeat('c',64),ctx->>'stamp');
 if not(r->>'dispatch')::boolean then raise exception 'memory_smoke_claim';end if;
 data=jsonb_set(jsonb_set(jsonb_set(data,'{expectedRevision}','1'),'{content}','"Synthetic customer now prefers Sunday"'),'{reason}','"Synthetic customer corrected preference"');
 r=public.sv_customer_memory_action(c,a,'synthetic-customer',fix_cmd,data);
 r=public.sv_customer_memory_action(c,a,'synthetic-customer',fix_cmd,data);
 if(select count(*)from public.sv_customer_memories where company_id=c and id=mid)<>2 then raise exception 'memory_smoke_correction_replay';end if;
 if(public.sv_customer_memory_context(c,a,'main','conversation','synthetic-conversation')->>'stamp')=ctx->>'stamp'then raise exception 'memory_smoke_unstamped_correction';end if;
 r=public.sv_memory_ai_finish(c,a,req,'{"answer":"Synthetic obsolete suggestion"}'::jsonb,null,2,3);
 if r->>'status'<>'failed'or r->>'error_code'<>'context_changed'or r->'result'<>'null'::jsonb then raise exception 'memory_smoke_stale_publish';end if;
 if(select count(*)from information_schema.role_table_grants where table_schema='public'and table_name in('sv_customer_memories','sv_memory_ai_contexts')and grantee in('anon','authenticated','PUBLIC'))<>0 then raise exception 'memory_smoke_browser_grants';end if;
 if not(select bool_and(relrowsecurity)from pg_class where oid in('public.sv_customer_memories'::regclass,'public.sv_memory_ai_contexts'::regclass))then raise exception 'memory_smoke_rls';end if;
end;$memory_smoke$;
