-- Compose inside the existing synthetic BEGIN...ROLLBACK verification transaction.
-- No Storage object or model request is issued; only synthetic metadata/receipts.
do $voice_verify$
declare c uuid:=current_setting('convelta.verify.company')::uuid;actor uuid;viewer uuid;asset uuid:=gen_random_uuid();asset2 uuid:=gen_random_uuid();req uuid:=gen_random_uuid();cmd uuid:=gen_random_uuid();r jsonb;data jsonb;blocked boolean;old_limit integer;current_used integer;
begin
 select user_id into strict actor from public.sv_memberships where company_id=c and role='owner';
 select user_id into strict viewer from public.sv_memberships where company_id=c and role='viewer';
 if not exists(select 1 from storage.buckets where id='convelta-voice'and not public and file_size_limit=4194304 and allowed_mime_types @>array['audio/ogg','audio/webm','audio/wav'])then raise exception 'voice_private_bucket_missing';end if;
 data=jsonb_build_object('brandId','main','source','conversation','sourceId','synthetic-conversation','messageId',asset,'origin','staff_upload','contentHash',repeat('a',64),'mimeType','audio/wav','audioBytes',16044,'durationSeconds',1);
 blocked=false;begin perform public.sv_voice_register(c,viewer,asset,data);exception when raise_exception then if sqlerrm='access_denied'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_viewer_registered';end if;
 blocked=false;begin perform public.sv_voice_register(c,actor,asset,jsonb_set(data,'{origin}','"provider"'));exception when raise_exception then if sqlerrm='voice_source_missing'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_fake_provider_registered';end if;
 blocked=false;begin perform public.sv_voice_register(c,actor,asset,jsonb_set(data,'{brandId}','"other"'));exception when raise_exception then if sqlerrm='voice_source_missing'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_wrong_brand_registered';end if;
 perform public.sv_voice_register(c,actor,asset,data);perform public.sv_voice_register(c,actor,asset,data);
 r=public.sv_voice_claim(c,actor,req,asset,'synthetic/audio',repeat('b',64));if not(r->>'dispatch')::boolean then raise exception 'voice_claim_failed';end if;
 r=public.sv_voice_claim(c,actor,req,asset,'synthetic/audio',repeat('b',64));if(r->>'dispatch')::boolean then raise exception 'voice_duplicate_dispatch';end if;
 r=public.sv_voice_claim(c,actor,gen_random_uuid(),asset,'synthetic/audio',repeat('b',64));if(r->>'dispatch')::boolean or r->>'status'<>'running'then raise exception 'voice_reload_duplicate_dispatch';end if;
 blocked=false;begin perform public.sv_voice_finish(c,actor,req,'{"text":"想預約星期六","language":"cantonese","extractions":[{"kind":"date","text":"已付訂金","quote":"已付訂金"}]}'::jsonb,null);exception when raise_exception then if sqlerrm='voice_invalid'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_invented_extraction';end if;
 r=public.sv_voice_finish(c,actor,req,'{"text":"想預約星期六","language":"cantonese","extractions":[{"kind":"date","text":"想預約星期六","quote":"想預約星期六"}]}'::jsonb,null);if r->>'status'<>'completed'then raise exception 'voice_finish_failed';end if;
 r=public.sv_voice_claim(c,actor,gen_random_uuid(),asset,'synthetic/audio',repeat('b',64));if(r->>'dispatch')::boolean or r->>'status'<>'completed'then raise exception 'voice_completed_reused';end if;
 perform public.sv_voice_correct(c,actor,req,cmd,0,'想預約星期日','Synthetic audio review','[]');perform public.sv_voice_correct(c,actor,req,cmd,0,'想預約星期日','Synthetic audio review','[]');
 if(select original_text from public.sv_voice_transcripts where company_id=c and id=req)<>'想預約星期六'or(select count(*)from public.sv_voice_corrections where company_id=c and transcript_id=req)<>1 then raise exception 'voice_original_or_replay_changed';end if;
 blocked=false;begin perform public.sv_voice_correct(c,actor,req,gen_random_uuid(),0,'stale','Synthetic stale','[]');exception when raise_exception then if sqlerrm='voice_revision_conflict'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_stale_correction';end if;
 select daily_limit into old_limit from public.sv_ai_settings where company_id=c;
 select count(*)into current_used from public.sv_ai_requests where company_id=c and created_at>=date_trunc('day',now()at time zone'Asia/Hong_Kong')at time zone'Asia/Hong_Kong';
 update public.sv_ai_settings set daily_limit=current_used where company_id=c;
 perform public.sv_voice_register(c,actor,asset2,jsonb_set(data,'{messageId}',to_jsonb(asset2::text)));
 blocked=false;begin perform public.sv_voice_claim(c,actor,gen_random_uuid(),asset2,'synthetic/audio',repeat('c',64));exception when raise_exception then if sqlerrm='ai_daily_limit'then blocked=true;else raise;end if;end;if not blocked then raise exception 'voice_bypassed_shared_quota';end if;
 update public.sv_ai_settings set daily_limit=old_limit where company_id=c;
 if exists(select 1 from information_schema.role_table_grants where table_schema='public'and table_name in('sv_voice_assets','sv_voice_transcripts','sv_voice_corrections')and grantee in('anon','authenticated','PUBLIC'))then raise exception 'voice_browser_grants';end if;
end;$voice_verify$;
