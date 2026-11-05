-- QA Hub — administrador com convite de uso único.
-- Não coloque emails, senhas ou tokens pessoais neste arquivo público.
-- Para convidar: INSERT INTO app_private.qa_admin_invites(email)
--   VALUES (lower('<email>')) ON CONFLICT (email) DO NOTHING;
-- O convite é consumido somente após Supabase Auth confirmar o email.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table if not exists public.qa_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.qa_admins enable row level security;
revoke all on public.qa_admins from public, anon, authenticated;
grant select on public.qa_admins to authenticated;
create policy qa_admins_read_self on public.qa_admins
  for select to authenticated using (user_id = (select auth.uid()));

create table if not exists app_private.qa_admin_invites (
  email text primary key check (email = lower(email)),
  claimed_by uuid unique references auth.users(id) on delete set null,
  claimed_at timestamptz
);
revoke all on app_private.qa_admin_invites from public, anon, authenticated;
alter table app_private.qa_admin_invites enable row level security;
create policy qa_admin_invites_deny_client on app_private.qa_admin_invites
  for all to anon, authenticated using (false) with check (false);

create or replace function app_private.activate_qa_admin_after_confirmation()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is not null and new.email_confirmed_at is not null and
     coalesce(new.is_anonymous, false) = false then
    with claimed as (
      update app_private.qa_admin_invites
         set claimed_at = now(), claimed_by = new.id
       where email = lower(new.email)
         and claimed_at is null
      returning email
    )
    insert into public.qa_admins(user_id)
    select new.id from claimed
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.activate_qa_admin_after_confirmation() from public, anon, authenticated;
create trigger qa_admin_activate_on_auth_verify
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function app_private.activate_qa_admin_after_confirmation();

create policy qa_admin_tarefas_full_access on public.qa_tarefas
  for all to authenticated
  using (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())));
create policy qa_admin_cenarios_full_access on public.qa_cenarios
  for all to authenticated
  using (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())));
create policy qa_admin_diagramas_full_access on public.qa_diagramas
  for all to authenticated
  using (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.qa_admins a where a.user_id = (select auth.uid())));
