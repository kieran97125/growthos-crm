-- READ ONLY. Run separately after all four migrations; no customer/config/credential content.
-- Fingerprints compare pg_proc.prosrc to the locally applied exact SQL source.
BEGIN READ ONLY;
WITH expected(schema_name,function_name,identity_arguments,expected_md5)AS(VALUES
('smartvolt_private','delivery_editor_admit','p_job sv_delivery_jobs','d25410f8494e2369acf03a398eb079db'),
('public','sv_flow_action','p_company uuid, p_actor uuid, p_command uuid, p_action text, p_data jsonb, p_request jsonb','f60c834cf4fe8aec7f715cd80db0a738'),
('public','sv_flow_catchup','p_company uuid','d24354586f7a0c9962cb2c5897b5dcdf'),
('public','sv_flow_read','p_company uuid, p_actor uuid, p_flow text, p_before timestamp with time zone, p_before_id uuid','7afdf84cc186a61a3ae150c1875933cd'),
('public','sv_flow_receipt','p_company uuid, p_actor uuid, p_command uuid, p_request jsonb','bf7ea2828f77453bb6c47b1435e8ad79'),
('public','sv_media_cancel','p_company uuid, p_actor uuid, p_id uuid','8c1f83362b5e7b03f0d466779cc9dc63'),
('public','sv_media_claim','p_company uuid, p_actor uuid, p_id uuid, p_client uuid, p_expected bigint, p_caption text, p_editor uuid','3b5ed1bdcc4cc89d810434014b25c7e0'),
('public','sv_media_cleanup_ack','p_company uuid, p_ids uuid[]','f1151176bad8b95e612f0275d56f8c17'),
('public','sv_media_expire','p_company uuid','a8cce170be97c6d6b88b037fe976dcbb'),
('public','sv_media_native','p_company uuid, p_actor uuid, p_id uuid, p_data jsonb','facfb1a64a1b93914970c440c5e28b3c'),
('public','sv_media_reserve','p_company uuid, p_actor uuid, p_id uuid, p_data jsonb','b9b9b89a134a2470bedf7f24c914ef79'),
('public','sv_media_verify','p_company uuid, p_actor uuid, p_id uuid, p_data jsonb','bfad06945f962ca4248d70025575af93'),
('public','sv_social_comment_action','p_company uuid, p_actor uuid, p_kind text, p_data jsonb, p_proof jsonb','bdc4acfa66aa0ba80c6e4dd0ac829824'),
('public','sv_social_comment_admit','p_company uuid, p_job uuid, p_token uuid, p_evidence jsonb','30c5fd8d607bb9e3fefe887cae70bd4f'),
('public','sv_social_comment_finish','p_company uuid, p_job uuid, p_token uuid, p_state text, p_provider text, p_peer text, p_reason text','092f256f1576cbc6abaaf7bf0e3403a0'),
('public','sv_social_comment_replay','p_company uuid, p_actor uuid, p_kind text, p_data jsonb','f5544d0887c604769a09e83751a595b2'),
('public','sv_social_comments_claim','p_company uuid','71c9f9c3d235ae912757b57c2b4203c7'),
('public','sv_social_comments_ingest','p_connection uuid, p_events jsonb','ef6aefb20ddbf5fa2850bb3bc1234302'),
('public','sv_social_comments_read','p_company uuid, p_actor uuid, p_brand text, p_before bigint','20d8deb57160915a150fc52b3b9b141c'),
('public','sv_web_chat_configure','p_company uuid, p_actor uuid, p_command uuid, p_data jsonb, p_verification text','87c1c08306601d00e6fae9ae4e0415fa'),
('public','sv_web_chat_public_config','p_id uuid, p_origin text','a7052a9f689eab5008b04e19e5f7f472'),
('public','sv_web_chat_settings','p_company uuid, p_actor uuid','85458c2abcf48364400489b869cd8c24'),
('public','sv_web_chat_staff_action','p_company uuid, p_actor uuid, p_command uuid, p_data jsonb','7a62792f69e0cbc82401b33740ab2ffe'),
('public','sv_web_chat_staff_read','p_company uuid, p_actor uuid, p_query jsonb','55a95a515a4726c9be77ac5ff9fd5b0b'),
('public','sv_web_chat_start','p_id uuid, p_origin text, p_thread uuid, p_hash text, p_name text, p_rate text','94f1d6c383d14301f6b27c25127336d9'),
('public','sv_web_chat_verify','p_company uuid, p_actor uuid, p_command uuid, p_config uuid, p_revision bigint, p_origin text, p_proof text','1ecb70d85f13b51d295cd86bd35b412b'),
('public','sv_web_chat_visitor_read','p_id uuid, p_origin text, p_thread uuid, p_hash text, p_after bigint','c4eb9138b7585a2b2a9fb7758799c0eb'),
('public','sv_web_chat_visitor_send','p_id uuid, p_origin text, p_thread uuid, p_hash text, p_command uuid, p_body text','e993f86522079c4fe8b7a1934f663ed6'),
('smartvolt_private','flow_delivery_admit','j sv_delivery_jobs','18cfb3af2813f332c8151ab0e98efd5a'),
('smartvolt_private','flow_delivery_changed','','ca8f7ad9b90227b9f9d6a4a74bd81f47'),
('smartvolt_private','flow_enroll','p_company uuid, p_flow text, p_source text, p_version text, p_customer text, p_brand text, p_provider text, p_thread uuid, p_product text, p_context jsonb','8e4edd843d0f4254e72fbb4f2af267f1'),
('smartvolt_private','flow_event','p_company uuid, p_run uuid, p_node text, p_kind text, p_state text, p_detail jsonb','1c6a69f187d85b34e96db550b4dc7156'),
('smartvolt_private','flow_existing_editor_admit','p_job sv_delivery_jobs','977b6960d651af0b04df0c53d4e77459'),
('smartvolt_private','flow_graph_check','g jsonb','ac30360ff916c467f0f092b8ca827f19'),
('smartvolt_private','flow_guard','r sv_flow_runs','f574a262c7d620c731e994503b1d6edd'),
('smartvolt_private','flow_handoff_changed','','fc49401e1fb4627c9f3527e41f62ad6a'),
('smartvolt_private','flow_inbound','p_company uuid, p_provider text, p_thread uuid','dbc6681c0f2a3f17c2026489bb67de6d'),
('smartvolt_private','flow_message_changed','','a5a076560bd822df0ef80127de0d98a1'),
('smartvolt_private','flow_source_event','','159e798b2bbd74e82fbd3ea5b27747d5'),
('smartvolt_private','flow_step','p_company uuid, p_run uuid','6bc18a84b40ba997d057eeaed315073d'),
('smartvolt_private','flow_stop','p_company uuid, p_run uuid, p_reason text','e7ea5d0a61ec67046b666f763a68b679'),
('smartvolt_private','media_asset_guard','','e78a16a52d2a3f8d529c9a27cb01de78'),
('smartvolt_private','social_admission','j sv_social_comment_jobs','3be269ec89a43ba55517b616fce6e2b6'),
('smartvolt_private','social_matches','p_text text, p_words jsonb, p_match text','20bed28179f6e842f62cec8e80d885f8'),
('smartvolt_private','social_normalize','p_text text','3c3208931ae1039fe3f5c49c4ae54cd8'),
('smartvolt_private','social_rule_json','r sv_social_comment_rules','b6a4ea0f1a43b6f098fca83728632b85'),
('smartvolt_private','web_chat_config','p_id uuid, p_origin text','bb40d9b5569c123c9c2fdd7320df24e1'),
('smartvolt_private','web_chat_limit','p_config uuid, p_bucket text, p_window interval, p_cap integer','092e5aa4c1e16fc2b2ebaf6f46f0ac4b'),
('smartvolt_private','web_chat_session','p_id uuid, p_origin text, p_thread uuid, p_hash text','e3966080bc4ca70e8e1a4049b1ffaa80'),
('smartvolt_private','web_chat_thread_json','t sv_web_chat_threads','e52ff1daed1b028d986e81823d70f2e3')
)
SELECT e.schema_name,e.function_name,e.identity_arguments,e.expected_md5,md5(p.prosrc)AS actual_md5,coalesce(md5(p.prosrc)=e.expected_md5,false)AS source_matches,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE')AS anon_execute,has_function_privilege('authenticated',p.oid,'EXECUTE')AS authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE')AS service_execute
FROM expected e LEFT JOIN pg_namespace n ON n.nspname=e.schema_name LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name AND pg_get_function_identity_arguments(p.oid)=e.identity_arguments ORDER BY 1,2,3;
-- All new private tables should have RLS enabled, no browser grants/policies.
SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,
 coalesce((SELECT jsonb_agg(jsonb_build_object('role',g.grantee,'privilege',g.privilege_type))FROM information_schema.role_table_grants g WHERE g.table_schema='public'AND g.table_name=c.relname AND g.grantee IN('anon','authenticated','PUBLIC')),'[]'::jsonb)AS browser_grants,
 (SELECT count(*)FROM pg_policy p WHERE p.polrelid=c.oid)AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relkind='r'AND(c.relname LIKE'sv_social_%'OR c.relname LIKE'sv_web_chat_%'OR c.relname LIKE'sv_flow_%'OR c.relname LIKE'sv_media_%')ORDER BY c.relname;
-- Catalog only: no signed URL, storage object listing, or file content.
SELECT id,public,file_size_limit,cardinality(allowed_mime_types)AS allowed_mime_count FROM storage.buckets WHERE id='convelta-attachments';
SELECT policyname,roles,cmd FROM pg_policies WHERE schemaname='storage'AND tablename='objects'AND(concat(qual,' ',with_check)LIKE'%convelta-attachments%');
SELECT table_name,privilege_type FROM information_schema.role_table_grants WHERE table_schema='storage'AND table_name='objects'AND grantee IN('anon','authenticated')ORDER BY 1,2;
ROLLBACK;
