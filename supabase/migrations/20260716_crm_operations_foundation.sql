-- Growth OS CRM operations foundation
-- Product-neutral extraction from Alyssa Enterprise validation.
-- Review and validate in a disposable environment before Production.

begin;

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  tag_key text not null,
  label text not null,
  color_key text not null default 'slate',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, brand_id, tag_key)
);

create table if not exists public.crm_contact_tags (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  added_by uuid,
  created_at timestamptz not null default now(),
  unique (contact_id, tag_id)
);

alter table public.crm_contacts
  add column if not exists assigned_to uuid,
  add column if not exists priority text not null default 'normal',
  add column if not exists lifecycle_status text not null default 'new',
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists duplicate_review_status text not null default 'clear';

alter table public.crm_contacts drop constraint if exists crm_contacts_priority_check;
alter table public.crm_contacts add constraint crm_contacts_priority_check
  check (priority in ('low','normal','high','urgent'));

alter table public.crm_contacts drop constraint if exists crm_contacts_lifecycle_status_check;
alter table public.crm_contacts add constraint crm_contacts_lifecycle_status_check
  check (lifecycle_status in (
    'new','contacting','waiting_customer','waiting_internal','booked',
    'payment_pending','paid','showed','no_show','lost'
  ));

alter table public.crm_contacts drop constraint if exists crm_contacts_duplicate_review_status_check;
alter table public.crm_contacts add constraint crm_contacts_duplicate_review_status_check
  check (duplicate_review_status in ('clear','possible_duplicate','reviewed','merged'));

create table if not exists public.crm_template_mappings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  mapping_key text not null,
  template_name text not null,
  use_case text not null,
  language_code text not null default 'zh_HK',
  variable_map jsonb not null default '{}'::jsonb,
  preview_body text,
  enabled boolean not null default true,
  approval_status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, brand_id, mapping_key),
  check (approval_status in ('draft','pending_provider','approved','rejected','paused'))
);

create table if not exists public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  rule_name text not null,
  trigger_key text not null,
  conditions_json jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  mode text not null default 'simulation',
  enabled boolean not null default false,
  last_simulated_at timestamptz,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode in ('simulation','live'))
);

create table if not exists public.crm_payment_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  case_id uuid references public.crm_lead_cases(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  source_lead_id uuid references public.leads(id) on delete set null,
  payment_required boolean not null default false,
  payment_type text not null default 'full',
  amount numeric(12,2),
  currency text not null default 'HKD',
  status text not null default 'not_requested',
  method text,
  external_reference text,
  proof_url text,
  customer_submitted_at timestamptz,
  cs_verified_at timestamptz,
  finance_verified_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (payment_type in ('full','deposit','manual')),
  check (status in (
    'not_required','not_requested','pending','proof_submitted','verifying',
    'paid','failed','expired','refunded','cancelled'
  ))
);

create table if not exists public.crm_sla_policies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  brand_id uuid references public.brands(id),
  policy_key text not null,
  label text not null,
  threshold_minutes integer not null check (threshold_minutes > 0),
  queue_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, brand_id, policy_key)
);

create index if not exists crm_contacts_assignment_idx
  on public.crm_contacts(assigned_to, next_follow_up_at);
create index if not exists crm_contacts_lifecycle_idx
  on public.crm_contacts(lifecycle_status, priority);
create index if not exists crm_contact_tags_scope_idx
  on public.crm_contact_tags(client_id, brand_id, contact_id);
create index if not exists crm_automation_rules_scope_idx
  on public.crm_automation_rules(client_id, brand_id, enabled);
create index if not exists crm_payment_records_queue_idx
  on public.crm_payment_records(client_id, brand_id, status, due_at);
create index if not exists crm_template_mappings_scope_idx
  on public.crm_template_mappings(client_id, brand_id, enabled);
create index if not exists crm_sla_policies_scope_idx
  on public.crm_sla_policies(client_id, brand_id, enabled);

alter table public.crm_tags enable row level security;
alter table public.crm_contact_tags enable row level security;
alter table public.crm_template_mappings enable row level security;
alter table public.crm_automation_rules enable row level security;
alter table public.crm_payment_records enable row level security;
alter table public.crm_sla_policies enable row level security;

comment on table public.crm_automation_rules is
  'Growth OS CRM automation definitions. New rules must default to simulation until live execution is explicitly approved.';
comment on table public.crm_payment_records is
  'Configurable CRM payment and proof-verification state; not a payment gateway ledger.';

commit;
