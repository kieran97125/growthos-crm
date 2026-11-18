-- COMPLETE SQL MESSAGE: anonymous DO + one final JSON SELECT. No schema DDL.
-- No explicit SQL BEGIN/COMMIT and no transaction can be left open by this file.
-- Synthetic writes are isolated in an exception subtransaction, intentionally
-- rolled back with private SQLSTATE PZ001 before the final SELECT runs.
-- All failures are reported, not hidden: require passed=5,failed=0 AND zero
-- synthetic company/auth absence counts. No network/provider/model/storage IO.
-- PostgreSQL identity counters can retain gaps after rollback; no fixture rows persist.
-- Sequential functional evidence only; this does NOT claim native contention.
DO $verify$
DECLARE
 c uuid:='0490256a-8931-4601-804b-b5823b73ec77'; actor uuid:='eaf5b780-5b32-4322-9b47-9070d154cfb7'; conn uuid:='6ccd3687-2713-4bf6-be7a-a157d19a324d';
 account text:=('99'||(abs(hashtextextended(c::text,17))::text));
 inbound_at bigint:=ceil(extract(epoch from statement_timestamp())*1000)::bigint;
 t uuid; media_thread uuid; customer text; post text; comment_id text; event jsonb;
 rule_data jsonb; pub jsonb; cmd uuid; cmd2 uuid; result jsonb; replay jsonb;
 flow_run uuid; job uuid; token uuid; asset uuid:=gen_random_uuid(); editor uuid:=gen_random_uuid();
 widget uuid:=gen_random_uuid(); chat_thread uuid:=gen_random_uuid(); chat_cmd uuid:=gen_random_uuid();
 staff_cmd uuid:=gen_random_uuid(); chat_data jsonb; before_customers integer; rev bigint;
 e text; failed boolean; fixture_ok boolean:=false;v_results jsonb:='[]'::jsonb;
BEGIN
 BEGIN -- exception subtransaction: every synthetic write is below this boundary
 -- IDs are generated for this file only. Never use real company/connection IDs.
 BEGIN
  IF EXISTS(SELECT 1 FROM public.sv_companies WHERE id=c)OR EXISTS(SELECT 1 FROM auth.users WHERE id=actor)THEN RAISE EXCEPTION 'synthetic_id_collision';END IF;
  INSERT INTO auth.users(id)VALUES(actor);
  PERFORM public.sv_provision_company(c,'Convelta rollback-only verification',actor,'Synthetic verifier','{"version":1,"scope":{"companyId":"0490256a-8931-4601-804b-b5823b73ec77","companyName":"Convelta rollback-only verification","brands":[{"id":"main","name":"Synthetic verification","short":"V"}],"team":[{"id":"eaf5b780-5b32-4322-9b47-9070d154cfb7","name":"Synthetic verifier","initials":"V"}]},"pos":{"version":1,"companyId":"0490256a-8931-4601-804b-b5823b73ec77","catalog":[],"resources":[],"appointments":[],"orders":[],"payments":[],"refunds":[],"entitlements":[],"redemptions":[],"audit":[]},"inbox":{"version":2,"contacts":[],"conversations":[],"messages":[],"bookings":[]},"studio":{"version":1,"flows":[{"id":"consultation","clientId":"0490256a-8931-4601-804b-b5823b73ec77","brandId":"main","name":"查詢接待與預約跟進","description":"由客戶查詢開始，收集意向，再由同事核實及安排提醒。","nodes":[{"id":"start","kind":"trigger","title":"觸發事件","description":"收到訊息或預約跟進更新","position":{"x":250,"y":0},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"intent","kind":"intent","title":"關鍵字分流","description":"按公司關鍵字分流，未能確定就交畀真人","position":{"x":250,"y":116},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"faq","kind":"answer","title":"知識庫回覆","description":"只引用有效、已核准資料","position":{"x":0,"y":260},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"intake","kind":"form","title":"收集預約意向","description":"療程、分店、心儀日期及時間","position":{"x":250,"y":260},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"human","kind":"handoff","title":"真人接手","description":"暫停 BOT，附上交接摘要","position":{"x":500,"y":260},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"card","kind":"followup","title":"建立跟進卡","description":"整理資料，等候同事核實","position":{"x":250,"y":400},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"review","kind":"review","title":"CS 核實預約","description":"由同事確認，再繼續流程","position":{"x":500,"y":400},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"remind","kind":"reminder","title":"範本預約提醒","description":"自動填入資料，預覽提醒","position":{"x":500,"y":540},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}}],"edges":[{"id":"start-next-intent","source":"start","target":"intent","sourceHandle":null},{"id":"intent-faq-faq","source":"intent","target":"faq","sourceHandle":"faq"},{"id":"intent-booking-intake","source":"intent","target":"intake","sourceHandle":"booking"},{"id":"intent-handoff-human","source":"intent","target":"human","sourceHandle":"handoff"},{"id":"intake-next-card","source":"intake","target":"card","sourceHandle":null},{"id":"card-next-review","source":"card","target":"review","sourceHandle":null},{"id":"review-next-remind","source":"review","target":"remind","sourceHandle":null}],"revision":1,"updatedAt":0},{"id":"appointment-reminder","clientId":"0490256a-8931-4601-804b-b5823b73ec77","brandId":"main","name":"已核實預約・前一日提醒","description":"只處理已由同事核實嘅跟進記錄。","nodes":[{"id":"r-start","kind":"trigger","title":"觸發事件","description":"收到訊息或預約跟進更新","position":{"x":250,"y":50},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"r-review","kind":"review","title":"CS 核實預約","description":"由同事確認，再繼續流程","position":{"x":250,"y":200},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}},{"id":"r-remind","kind":"reminder","title":"範本預約提醒","description":"自動填入資料，預覽提醒","position":{"x":250,"y":350},"config":{"message":"你好，收到你嘅查詢，我哋會安排同事跟進。","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":3,"reminderHour":10,"template":"你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。","bindings":[{"placeholder":"name","field":"name"},{"placeholder":"service","field":"service"},{"placeholder":"date","field":"date"},{"placeholder":"time","field":"time"},{"placeholder":"branch","field":"branch"},{"placeholder":"fee","field":"fee"}]}}],"edges":[{"id":"r-1","source":"r-start","target":"r-review","sourceHandle":null},{"id":"r-2","source":"r-review","target":"r-remind","sourceHandle":null}],"revision":1,"updatedAt":0}],"versions":[],"bots":[{"brandId":"main","name":"Synthetic verification 接待助手","mode":"assist","tone":"friendly","greeting":"你好，我係接待助手，可以幫你了解服務同收集預約意向。","allowService":true,"allowLocation":true,"allowHours":true,"openingHour":10,"closingHour":19}],"articles":[]},"broadcasts":{"templates":[],"profiles":[],"campaigns":[],"recipients":[],"events":[],"activeRecipientId":null}}'::jsonb,ARRAY['crm','pos']);
  PERFORM public.sv_meta_save(c,actor,jsonb_build_object('id',conn,'brandId','main','channel','messenger','appId',account,'pageId',account,'accountId',account,'label','Rollback-only synthetic','credentials',jsonb_build_object('synthetic',true)));
  -- Policy affects this synthetic company only and is rolled back.
  PERFORM public.sv_engagement_action(c,actor,gen_random_uuid(),'policy','{"marketingEnabled":true,"quietStart":0,"quietEnd":0,"frequencyHours":72,"dailyLimit":1000,"minuteLimit":100,"revision":0}'::jsonb);
  fixture_ok:=true;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','fixture','status','PASS','detail','{"isolated":true}'::jsonb));
 EXCEPTION WHEN OTHERS OR query_canceled OR assert_failure THEN
  GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','fixture','status','FAIL','detail',jsonb_build_object('error',e)));
 END;
 IF NOT fixture_ok THEN RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='convelta_verification_rollback';END IF;

 -- 1. Social comments: overlapping rules + duplicate webhook -> one candidate;
 -- one final admission, then uncertain outcome is retained without retry.
 BEGIN
  post:=account||'_900001';comment_id:=account||'_900002';
  FOR i IN 1..2 LOOP
   rule_data:=jsonb_build_object('id',gen_random_uuid(),'brandId','main','connectionId',conn,'postId',post,'name','Rollback-only rule '||i,'keywords',jsonb_build_array('details'),'match','any','body','Synthetic private reply','enabled',true,'revision',0);
   PERFORM public.sv_social_comment_action(c,actor,'save',jsonb_build_object('commandId',gen_random_uuid(),'definition',rule_data),jsonb_build_object('connectionId',conn,'postId',post,'accountId',account,'verified',true));
  END LOOP;
  event:=jsonb_build_object('key',repeat('c',64),'accountId',account,'channel','messenger','commentId',comment_id,'postId',post,'peerId','990000000001','text','Please send details','createdAt',inbound_at,'eventAt',inbound_at,'deleted',false,'live',false);
  IF public.sv_social_comments_ingest(conn,jsonb_build_array(event))<>1 OR public.sv_social_comments_ingest(conn,jsonb_build_array(event))<>0 THEN RAISE EXCEPTION 'social_ingest_dedup';END IF;
  IF(SELECT count(*)FROM public.sv_social_comment_jobs WHERE company_id=c)<>1 THEN RAISE EXCEPTION 'social_overlap_dedup';END IF;
  result:=public.sv_social_comments_claim(c);job:=(result->>'id')::uuid;token:=(result->>'token')::uuid;
  IF job IS NULL THEN RAISE EXCEPTION 'social_claim_missing';END IF;
  event:=jsonb_build_object('commentId',comment_id,'postId',post,'accountId',account,'peerId','990000000001','text','Please send details','eligible',true,'createdAt',inbound_at);
  IF NOT public.sv_social_comment_admit(c,job,token,event) OR public.sv_social_comment_admit(c,job,token,event)THEN RAISE EXCEPTION 'social_one_admission';END IF;
  PERFORM public.sv_social_comment_finish(c,job,token,'uncertain',NULL,NULL,'rollback_synthetic_unknown');
  IF public.sv_social_comments_claim(c)IS NOT NULL OR public.sv_social_comment_admit(c,job,token,event)THEN RAISE EXCEPTION 'social_unknown_retried';END IF;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','social','status','PASS','detail','{"oneCandidate":true,"oneSequentialAdmission":true,"unknownNoRetry":true,"providerCalled":false}'::jsonb));
 EXCEPTION WHEN OTHERS OR query_canceled OR assert_failure THEN
  GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;v_results:=v_results||jsonb_build_array(jsonb_build_object('module','social','status','FAIL','detail',jsonb_build_object('error',e)));
 END;

 -- 2. Flow: saved exact arbitrary graph, command retry and new-command replay
 -- share one run; catch-up makes one shared outbox job. Unknown cannot retry.
 BEGIN
  INSERT INTO public.sv_meta_threads(company_id,connection_id,peer_id)VALUES(c,conn,'990000000002')RETURNING id INTO t;
  PERFORM public.sv_meta_ingest(conn,jsonb_build_array(jsonb_build_object('kind','inbound','channel','messenger','accountId',account,'peerId','990000000002','at',inbound_at,'key',repeat('d',64),'mid','rollback-graph-inbound','body','Synthetic service request','raw','{}'::jsonb)));
  UPDATE public.sv_workspaces SET payload=jsonb_set(payload,'{studio,flows}',jsonb_build_array('{"id":"hosted-rollback-graph","clientId":"0490256a-8931-4601-804b-b5823b73ec77","brandId":"main","name":"Rollback-only arbitrary graph","description":"Synthetic","revision":1,"updatedAt":1794763578758,"nodes":[{"id":"n0","kind":"trigger","title":"trigger","description":"","position":{"x":0,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}},{"id":"n1","kind":"message","title":"message","description":"","position":{"x":200,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}},{"id":"n2","kind":"end","title":"end","description":"","position":{"x":400,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}}],"edges":[{"id":"e0","source":"n0","target":"n1","sourceHandle":null},{"id":"e1","source":"n1","target":"n2","sourceHandle":null}]}'::jsonb)),revision=revision+1 WHERE company_id=c;
  SELECT customer_id INTO STRICT customer FROM public.sv_customer_threads WHERE company_id=c AND provider='meta'AND thread_id=t;
  PERFORM public.sv_engagement_action(c,actor,gen_random_uuid(),'preference',jsonb_build_object('customerId',customer,'brandId','main','channel','messenger','purpose','service','allowed',true,'source','Rollback-only synthetic request','revision',0));
  cmd:=gen_random_uuid();pub:=jsonb_build_object('commandId',cmd,'action','publish','flow','{"id":"hosted-rollback-graph","clientId":"0490256a-8931-4601-804b-b5823b73ec77","brandId":"main","name":"Rollback-only arbitrary graph","description":"Synthetic","revision":1,"updatedAt":1794763578758,"nodes":[{"id":"n0","kind":"trigger","title":"trigger","description":"","position":{"x":0,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}},{"id":"n1","kind":"message","title":"message","description":"","position":{"x":200,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}},{"id":"n2","kind":"end","title":"end","description":"","position":{"x":400,"y":0},"config":{"message":"Synthetic graph body","owner":"eaf5b780-5b32-4322-9b47-9070d154cfb7","waitHours":1,"reminderHour":9,"template":"Synthetic reminder","bindings":[]}}],"edges":[{"id":"e0","source":"n0","target":"n1","sourceHandle":null},{"id":"e1","source":"n1","target":"n2","sourceHandle":null}]}'::jsonb,'revision',0,'trigger','manual','provider','meta','connectionId',conn,'purpose','service','enabled',true,'deliveries','{}'::jsonb);
  PERFORM public.sv_flow_action(c,actor,cmd,'publish',pub);
  cmd:=gen_random_uuid();pub:=jsonb_build_object('commandId',cmd,'action','enroll','flowId','hosted-rollback-graph','threadId',t);
  result:=public.sv_flow_action(c,actor,cmd,'enroll',pub);replay:=public.sv_flow_action(c,actor,cmd,'enroll',pub);
  IF result IS DISTINCT FROM replay THEN RAISE EXCEPTION 'flow_command_replay';END IF;
  cmd2:=gen_random_uuid();pub:=pub||jsonb_build_object('commandId',cmd2);PERFORM public.sv_flow_action(c,actor,cmd2,'enroll',pub);
  flow_run:=(result->>'runId')::uuid;
  PERFORM public.sv_flow_catchup(c);PERFORM public.sv_flow_catchup(c);
  IF(SELECT count(*)FROM public.sv_flow_runs WHERE company_id=c)<>1 OR(SELECT count(*)FROM public.sv_delivery_jobs WHERE company_id=c AND origin='flow')<>1 THEN RAISE EXCEPTION 'flow_run_job_dedup';END IF;
  SELECT id INTO STRICT job FROM public.sv_delivery_jobs WHERE company_id=c AND origin='flow'AND source_id=flow_run;
  result:=public.sv_delivery_claim(c,job);IF NOT coalesce((result->>'dispatch')::boolean,false)THEN RAISE EXCEPTION 'flow_dispatch_admission:%',result->>'reason';END IF;
  IF coalesce((public.sv_delivery_claim(c,job)->>'dispatch')::boolean,false)THEN RAISE EXCEPTION 'flow_second_admission';END IF;
  PERFORM public.sv_delivery_finish(c,job,'ambiguous',NULL,'rollback_synthetic_unknown');
  UPDATE public.sv_flow_runs SET due_at=now()WHERE company_id=c AND id=flow_run;PERFORM public.sv_flow_catchup(c);
  IF(SELECT state FROM public.sv_flow_runs WHERE company_id=c AND id=flow_run)<>'stopped'OR coalesce((public.sv_delivery_claim(c,job)->>'dispatch')::boolean,false)THEN RAISE EXCEPTION 'flow_unknown_retried';END IF;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','flow','status','PASS','detail','{"savedGraph":true,"oneRun":true,"oneOutboxJob":true,"unknownStops":true,"providerCalled":false}'::jsonb));
 EXCEPTION WHEN OTHERS OR query_canceled OR assert_failure THEN
  GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;v_results:=v_results||jsonb_build_array(jsonb_build_object('module','flow','status','FAIL','detail',jsonb_build_object('error',e)));
 END;

 -- 3. Private media: metadata only; no object upload, download or signed URL.
 -- Shared editor admission + same command reuse exactly the original receipt.
 BEGIN
  INSERT INTO public.sv_meta_threads(company_id,connection_id,peer_id)VALUES(c,conn,'990000000003')RETURNING id INTO media_thread;
  PERFORM public.sv_meta_ingest(conn,jsonb_build_array(jsonb_build_object('kind','inbound','channel','messenger','accountId',account,'peerId','990000000003','at',inbound_at,'key',repeat('e',64),'mid','rollback-media-inbound','body','Synthetic attachment inquiry','raw','{}'::jsonb)));
  PERFORM public.sv_media_reserve(c,actor,asset,jsonb_build_object('brandId','main','source','meta','sourceId',media_thread,'filename','rollback-synthetic.pdf','bytes',128,'mimeType','application/pdf'));
  PERFORM public.sv_media_verify(c,actor,asset,jsonb_build_object('kind','document','mimeType','application/pdf','bytes',128,'contentHash',repeat('f',64)));
  result:=public.sv_editor_action(c,actor,'meta',media_thread,editor,'acquire',NULL);IF NOT(result->>'held')::boolean THEN RAISE EXCEPTION 'media_editor_missing';END IF;
  SELECT revision INTO STRICT rev FROM public.sv_meta_threads WHERE company_id=c AND id=media_thread;
  cmd:=gen_random_uuid();result:=public.sv_media_claim(c,actor,asset,cmd,rev,'Synthetic attachment caption',editor);
  replay:=public.sv_media_claim(c,actor,asset,cmd,rev,'Synthetic attachment caption',editor);
  IF NOT coalesce((result->>'dispatch')::boolean,false)OR coalesce((replay->>'dispatch')::boolean,false)OR result#>>'{message,id}'IS DISTINCT FROM replay#>>'{message,id}'THEN RAISE EXCEPTION 'media_one_receipt';END IF;
  PERFORM public.sv_meta_finish(c,(result#>>'{message,id}')::uuid,'uncertain',NULL,'rollback_synthetic_unknown');
  replay:=public.sv_media_claim(c,actor,asset,cmd,rev,'Synthetic attachment caption',editor);
  IF coalesce((replay->>'dispatch')::boolean,false)OR replay#>>'{message,state}'<>'uncertain'THEN RAISE EXCEPTION 'media_unknown_retried';END IF;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','media','status','PASS','detail','{"privateMetadata":true,"oneReceipt":true,"unknownNoRetry":true,"storageOrProviderCalled":false}'::jsonb));
 EXCEPTION WHEN OTHERS OR query_canceled OR assert_failure THEN
  GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;v_results:=v_results||jsonb_build_array(jsonb_build_object('module','media','status','FAIL','detail',jsonb_build_object('error',e)));
 END;

 -- 4. Website chat: exact verified origin, anonymous isolation, visitor/staff
 -- retries and immutable sequence. Domain proof here is synthetic SQL fixture,
 -- not a claim of live DNS/website verification by an external fetch.
 BEGIN
  chat_data:=jsonb_build_object('id',widget,'brandId','main','name','Rollback synthetic website','greeting','Synthetic greeting','origins',jsonb_build_array('https://example.invalid'),'enabled',false,'revision',0);
  PERFORM public.sv_web_chat_configure(c,actor,gen_random_uuid(),chat_data,repeat('a',48));
  failed:=false;BEGIN PERFORM public.sv_web_chat_public_config(widget,'https://example.invalid');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='chat_unavailable';END;
  IF NOT failed THEN RAISE EXCEPTION 'chat_enabled_before_verification';END IF;
  PERFORM public.sv_web_chat_verify(c,actor,gen_random_uuid(),widget,1,'https://example.invalid',repeat('a',48));
  PERFORM public.sv_web_chat_configure(c,actor,gen_random_uuid(),chat_data||'{"revision":2,"enabled":true}'::jsonb,repeat('a',48));
  SELECT count(*)INTO before_customers FROM public.sv_customers WHERE company_id=c;
  PERFORM public.sv_web_chat_start(widget,'https://example.invalid',chat_thread,repeat('b',64),'Synthetic visitor',repeat('9',64));
  result:=public.sv_web_chat_visitor_send(widget,'https://example.invalid',chat_thread,repeat('b',64),chat_cmd,'Synthetic visitor inquiry');
  replay:=public.sv_web_chat_visitor_send(widget,'https://example.invalid',chat_thread,repeat('b',64),chat_cmd,'Synthetic visitor inquiry');
  IF result IS DISTINCT FROM replay THEN RAISE EXCEPTION 'chat_visitor_replay';END IF;
  failed:=false;BEGIN PERFORM public.sv_web_chat_visitor_send(widget,'https://wrong.invalid',chat_thread,repeat('b',64),gen_random_uuid(),'Wrong origin');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='chat_unavailable';END;
  IF NOT failed THEN RAISE EXCEPTION 'chat_wrong_origin_accepted';END IF;
  failed:=false;BEGIN PERFORM public.sv_web_chat_visitor_send(widget,'https://example.invalid',chat_thread,repeat('c',64),gen_random_uuid(),'Wrong token');EXCEPTION WHEN OTHERS THEN failed:=SQLERRM='chat_session_invalid';END;
  IF NOT failed THEN RAISE EXCEPTION 'chat_wrong_token_accepted';END IF;
  chat_data:=jsonb_build_object('action','reply','threadId',chat_thread,'revision',1,'body','Synthetic staff reply');
  result:=public.sv_web_chat_staff_action(c,actor,staff_cmd,chat_data);replay:=public.sv_web_chat_staff_action(c,actor,staff_cmd,chat_data);
  IF result IS DISTINCT FROM replay OR(SELECT count(*)FROM public.sv_web_chat_messages WHERE company_id=c AND thread_id=chat_thread)<>2 OR(SELECT revision FROM public.sv_web_chat_threads WHERE company_id=c AND id=chat_thread)<>2 THEN RAISE EXCEPTION 'chat_staff_sequence';END IF;
  IF(SELECT count(*)FROM public.sv_customers WHERE company_id=c)<>before_customers OR NOT EXISTS(SELECT 1 FROM public.sv_web_chat_threads WHERE company_id=c AND id=chat_thread AND customer_id IS NULL)THEN RAISE EXCEPTION 'chat_auto_customer_link';END IF;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('module','website-chat','status','PASS','detail','{"verifiedExactOrigin":true,"wrongTokenRejected":true,"anonymousUnlinked":true,"twoMessages":true,"networkCalled":false}'::jsonb));
 EXCEPTION WHEN OTHERS OR query_canceled OR assert_failure THEN
  GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;v_results:=v_results||jsonb_build_array(jsonb_build_object('module','website-chat','status','FAIL','detail',jsonb_build_object('error',e)));
 END;
RAISE EXCEPTION USING ERRCODE='PZ001',MESSAGE='convelta_verification_rollback';
 EXCEPTION
  WHEN SQLSTATE 'PZ001' THEN NULL; -- all inner writes are already rolled back
  WHEN OTHERS OR query_canceled OR assert_failure THEN
   GET STACKED DIAGNOSTICS e=MESSAGE_TEXT;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('module','verification','status','FAIL','detail',jsonb_build_object('error',e)));
 END;
 -- Local variables survive the rolled-back subtransaction; the GUC is set only
 -- after rollback, and LOCAL lifetime ends with this SQL message transaction.
 PERFORM set_config('convelta.verify_results',v_results::text,true);
END;
$verify$;
WITH results AS(SELECT current_setting('convelta.verify_results')::jsonb AS value),
summary AS(SELECT count(*)FILTER(WHERE item.entry->>'status'='PASS')AS passed,count(*)FILTER(WHERE item.entry->>'status'='FAIL')AS failed FROM results,jsonb_array_elements(results.value)AS item(entry)),
absence AS(SELECT(SELECT count(*)FROM public.sv_companies WHERE id='0490256a-8931-4601-804b-b5823b73ec77')AS company_rows,(SELECT count(*)FROM auth.users WHERE id='eaf5b780-5b32-4322-9b47-9070d154cfb7')AS auth_rows)
SELECT jsonb_build_object('results',results.value,'passed',summary.passed,'failed',summary.failed,
 'rollbackAbsence',jsonb_build_object('syntheticCompanyRows',absence.company_rows,'syntheticAuthRows',absence.auth_rows),
 'allSyntheticRowsRolledBack',absence.company_rows=0 AND absence.auth_rows=0,
 'mode','sequential_functional_exception_subtransaction')AS verification
FROM results,summary,absence;
