-- QA Hub: posts e roteiros de teste pertencem exclusivamente ao usuário.
-- Ferramentas de release, XML/diff e segredos não são persistidos no servidor.
create table if not exists public.qa_generator_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts bigint not null,
  titulo text not null default '',
  tarefa text not null default '',
  requisito text not null default '',
  md text not null default '',
  created_at timestamptz not null default now(),
  constraint qa_generator_posts_length check (
    length(titulo)<=300 and length(tarefa)<=40000 and length(requisito)<=25000
    and length(md)<=120000)
);
create table if not exists public.qa_generator_tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ts bigint not null,
  titulo text not null default '',
  tarefa text not null default '',
  requisito text not null default '',
  md text not null default '',
  exec jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint qa_generator_tests_length check (
    length(titulo)<=300 and length(tarefa)<=40000 and length(requisito)<=25000
    and length(md)<=120000 and jsonb_typeof(exec)='object')
);
create index if not exists qa_generator_posts_owner_time on public.qa_generator_posts(user_id,ts desc);
create index if not exists qa_generator_tests_owner_time on public.qa_generator_tests(user_id,ts desc);
alter table public.qa_generator_posts enable row level security;
alter table public.qa_generator_tests enable row level security;
grant select,insert,update,delete on public.qa_generator_posts,public.qa_generator_tests to authenticated;
revoke all on public.qa_generator_posts,public.qa_generator_tests from anon;
create policy qa_generator_posts_owner_select on public.qa_generator_posts for select to authenticated using (user_id=(select auth.uid()));
create policy qa_generator_posts_owner_insert on public.qa_generator_posts for insert to authenticated with check (user_id=(select auth.uid()));
create policy qa_generator_posts_owner_update on public.qa_generator_posts for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy qa_generator_posts_owner_delete on public.qa_generator_posts for delete to authenticated using (user_id=(select auth.uid()));
create policy qa_generator_tests_owner_select on public.qa_generator_tests for select to authenticated using (user_id=(select auth.uid()));
create policy qa_generator_tests_owner_insert on public.qa_generator_tests for insert to authenticated with check (user_id=(select auth.uid()));
create policy qa_generator_tests_owner_update on public.qa_generator_tests for update to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy qa_generator_tests_owner_delete on public.qa_generator_tests for delete to authenticated using (user_id=(select auth.uid()));
