import { readFileSync } from "node:fs";

/** Generate a rollback-only native PostgreSQL smoke test; never calls a model/provider. */
export function customerIntelligenceVerificationSQL() {
  const read = (name: string) =>
    readFileSync(new URL(name, import.meta.url), "utf8");
  const prior = read("verify-coaching-hosted.sql");
  if (!/\nrollback;\s*$/i.test(prior))
    throw new Error("Expected rollback-only fixture");
  const setup = prior.replace(/\nrollback;\s*$/i, "\n");
  return [
    setup,
    read("verify-voice-snippet.sql"),
    read("verify-memory-snippet.sql"),
    read("verify-segments-snippet.sql"),
    `
rollback;
select jsonb_build_object(
 'passed',true,'nativePostgres',true,'rolledBack',true,
 'retainedSyntheticCompanies',(select count(*)from public.sv_companies where name='Synthetic coaching verification'),
 'browserTableGrants',(select count(*)from information_schema.role_table_grants where table_schema='public'and table_name in('sv_customer_memories','sv_memory_ai_contexts','sv_dynamic_segments','sv_segment_members','sv_segment_events','sv_segment_dirty','sv_voice_assets','sv_voice_transcripts','sv_voice_corrections')and grantee in('PUBLIC','anon','authenticated')),
 'rls',(select bool_and(relrowsecurity)from pg_class where oid in('public.sv_customer_memories'::regclass,'public.sv_memory_ai_contexts'::regclass,'public.sv_dynamic_segments'::regclass,'public.sv_segment_members'::regclass,'public.sv_segment_events'::regclass,'public.sv_segment_dirty'::regclass,'public.sv_voice_assets'::regclass,'public.sv_voice_transcripts'::regclass,'public.sv_voice_corrections'::regclass)),
 'voiceBucketPrivate',(select not public and file_size_limit=4194304 from storage.buckets where id='convelta-voice')
)as customer_intelligence_native_verification;
`,
  ].join("\n");
}
if (process.argv[1]?.endsWith("verify-customer-intelligence-hosted.ts"))
  process.stdout.write(customerIntelligenceVerificationSQL());
