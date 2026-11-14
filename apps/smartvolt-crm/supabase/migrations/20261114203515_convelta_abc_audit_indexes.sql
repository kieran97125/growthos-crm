-- Cover new foreign keys and source lookups; raw tables remain private.
create index sv_delivery_customer_fk on public.sv_delivery_jobs(company_id,customer_id,brand_id);
create index sv_journey_source_customer_fk on public.sv_journey_sources(company_id,customer_id,brand_id);
create index sv_editor_actor_fk on public.sv_thread_editors(company_id,actor_id);
create index sv_editor_events_thread_fk on public.sv_editor_events(company_id,provider,thread_id);
create index sv_editor_events_actor_fk on public.sv_editor_events(company_id,actor_id);
create index sv_sla_state_episode_fk on public.sv_sla_states(company_id,episode_id);
create index sv_routing_requirement_branch_fk on public.sv_routing_requirements(company_id,branch_id);
create index sv_sales_customer_fk on public.sv_sales_enquiries(company_id,customer_id,brand_id);
create index sv_sales_owner_due on public.sv_sales_enquiries(company_id,owner_id,follow_up_at);
create index sv_push_attempt_device_fk on public.sv_push_attempts(company_id,user_id,device_id);
create index sv_feedback_outcome_fk on public.sv_feedback_jobs(company_id,outcome_id);
create index sv_feedback_events_job_fk on public.sv_feedback_events(company_id,job_id,created_at);
create index sv_business_outcome_source on public.sv_business_outcomes(company_id,source_key,kind,observed_at);
create index sv_preference_events_customer_time on public.sv_preference_events(company_id,customer_id,brand_id,created_at);
