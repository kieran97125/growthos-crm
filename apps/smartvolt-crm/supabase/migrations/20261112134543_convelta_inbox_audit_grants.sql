-- Hosted projects may automatically grant ALL to service_role for new tables.
-- Revoke those defaults explicitly; allow only the operations used by the
-- authorized inbox RPCs. Immutable evidence must also reject TRUNCATE.
revoke all on public.sv_meta_connections,public.sv_meta_threads,public.sv_meta_messages,
 public.sv_meta_events,public.sv_meta_thread_activity from service_role;
grant select,insert,update on public.sv_meta_connections,public.sv_meta_threads,
 public.sv_meta_messages to service_role;
grant select,insert on public.sv_meta_events,public.sv_meta_thread_activity to service_role;
