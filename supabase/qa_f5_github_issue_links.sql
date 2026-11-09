-- F5 completion: persist GitHub issue links without storing GitHub tokens.
-- The GitHub status lookup uses only the public REST API on user request.
create table if not exists public.qa_tarefa_github_issues (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  repositorio text not null check (
    char_length(repositorio) between 3 and 180
    and repositorio=lower(repositorio)
    and repositorio ~ '^[a-z0-9][a-z0-9_.-]*/[a-z0-9][a-z0-9_.-]*$'
    and repositorio not like '%/..'
  ),
  numero integer not null check (numero between 1 and 999999999),
  created_at timestamptz not null default now(),
  unique (tarefa_id,repositorio,numero)
);

create index if not exists qa_f5_github_task_idx
  on public.qa_tarefa_github_issues(tarefa_id,created_at desc);

alter table public.qa_tarefa_github_issues enable row level security;
revoke all on public.qa_tarefa_github_issues from anon,authenticated;
grant select,insert,delete on public.qa_tarefa_github_issues to authenticated;

create policy qa_f5_github_read on public.qa_tarefa_github_issues
  for select to authenticated
  using (qa_private.f5_view_task(tarefa_id));

create policy qa_f5_github_insert on public.qa_tarefa_github_issues
  for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

create policy qa_f5_github_delete on public.qa_tarefa_github_issues
  for delete to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.qa_tarefas t
      where t.id=tarefa_id and t.user_id=(select auth.uid())
    )
  );

comment on table public.qa_tarefa_github_issues is
  'Private references to external issues; no tokens, webhook secrets or mutable issue states.';
