-- Cover the native-thread foreign keys used to reconcile SLA episode history.
create index sv_sla_episodes_thread_fk on public.sv_sla_episodes(company_id,provider,thread_id);
create index sv_sla_events_thread_fk on public.sv_sla_events(company_id,provider,thread_id);
