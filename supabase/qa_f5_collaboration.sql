-- F5: team collaboration, explicitly accepted invitations, private comments,
-- scoped assignment, and review-only integration metadata. Additive migration.
-- Existing owner/admin write permissions remain unchanged.
create table if not exists public.qa_equipes (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 nome text not null check (char_length(btrim(nome)) between 2 and 90),
 created_at timestamptz not null default now()
);
create index if not exists qa_f5_teams_owner_idx on public.qa_equipes(owner_id);
create table if not exists public.qa_equipe_membros (
 equipe_id uuid not null references public.qa_equipes(id) on delete cascade,
 usuario_id uuid not null references auth.users(id) on delete cascade,
 papel text not null check(papel in ('gestor','qa','leitor')),
 aceito_em timestamptz not null default now(),
 primary key(equipe_id,usuario_id)
);
create index if not exists qa_f5_member_user_idx on public.qa_equipe_membros(usuario_id,equipe_id);
create table if not exists public.qa_equipe_convites (
 id uuid primary key default gen_random_uuid(),
 equipe_id uuid not null references public.qa_equipes(id) on delete cascade,
 email text not null check (char_length(email) between 3 and 254 and email=lower(btrim(email))),
 papel text not null check(papel in ('qa','leitor')),
 criado_por uuid not null references auth.users(id) on delete cascade,
 estado text not null default 'pendente' check(estado in ('pendente','aceito','recusado')),
 created_at timestamptz not null default now(),
 unique(equipe_id,email)
);
create index if not exists qa_f5_invite_email_idx on public.qa_equipe_convites(email,estado);
create table if not exists public.qa_tarefa_equipes (
 tarefa_id uuid primary key references public.qa_tarefas(id) on delete cascade,
 equipe_id uuid not null references public.qa_equipes(id) on delete cascade,
 vinculado_por uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists qa_f5_task_team_idx on public.qa_tarefa_equipes(equipe_id,tarefa_id);

-- Keep all permission helpers in a non-API schema. They reveal booleans only,
-- derive identity from auth.uid(), and are safe to call from RLS.
create or replace function qa_private.f5_team_owner(p_team uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.qa_equipes e
   where e.id=p_team and e.owner_id=(select auth.uid()))
$$;
create or replace function qa_private.f5_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.qa_equipe_membros m
   where m.equipe_id=p_team and m.usuario_id=(select auth.uid()))
$$;
create or replace function qa_private.f5_invitee(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=(select auth.uid())
   and u.email_confirmed_at is not null and lower(u.email)=p_email)
$$;
create or replace function qa_private.f5_task_team(p_task uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select l.equipe_id from public.qa_tarefa_equipes l
 join public.qa_tarefas t on t.id=l.tarefa_id
 join public.qa_equipes e on e.id=l.equipe_id and e.owner_id=t.user_id
 where l.tarefa_id=p_task
$$;
create or replace function qa_private.f5_view_task(p_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and
 (exists(select 1 from public.qa_tarefas t
  where t.id=p_task and t.user_id=(select auth.uid()))
  or exists(select 1 from public.qa_equipe_membros m
   where m.equipe_id=qa_private.f5_task_team(p_task)
     and m.usuario_id=(select auth.uid())))
$$;
create or replace function qa_private.f5_comment_task(p_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and (
  exists(select 1 from public.qa_tarefas t
   where t.id=p_task and t.user_id=(select auth.uid()))
  or exists(select 1 from public.qa_equipe_membros m
    where m.equipe_id=qa_private.f5_task_team(p_task)
      and m.usuario_id=(select auth.uid()) and m.papel in ('gestor','qa'))
 )
$$;

create table if not exists public.qa_tarefa_responsaveis (
 tarefa_id uuid primary key references public.qa_tarefas(id) on delete cascade,
 responsavel_id uuid not null references auth.users(id) on delete cascade,
 atribuido_por uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create index if not exists qa_f5_assignee_idx
 on public.qa_tarefa_responsaveis(responsavel_id,tarefa_id);
create or replace function qa_private.f5_assignable(p_task uuid,p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.qa_tarefas t where t.id=p_task
  and t.user_id=(select auth.uid())
  and (p_user=t.user_id
   or exists(select 1 from public.qa_equipe_membros m
     where m.equipe_id=qa_private.f5_task_team(p_task)
     and m.usuario_id=p_user and m.papel in ('qa','gestor'))))
$$;
create or replace function qa_private.f5_execute_task(p_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and (
  exists(select 1 from public.qa_tarefas t where t.id=p_task
    and t.user_id=(select auth.uid()))
  or exists(select 1 from public.qa_equipe_membros m
     where m.equipe_id=qa_private.f5_task_team(p_task)
       and m.usuario_id=(select auth.uid())
       and (m.papel='gestor'
        or (m.papel='qa' and exists(
          select 1 from public.qa_tarefa_responsaveis r
          where r.tarefa_id=p_task and r.responsavel_id=m.usuario_id))))
 )
$$;
revoke all on function qa_private.f5_team_owner(uuid),
 qa_private.f5_team_member(uuid),qa_private.f5_invitee(text),
 qa_private.f5_task_team(uuid),qa_private.f5_view_task(uuid),
 qa_private.f5_comment_task(uuid),qa_private.f5_assignable(uuid,uuid),
 qa_private.f5_execute_task(uuid) from public,anon;
grant usage on schema qa_private to authenticated;
grant execute on function qa_private.f5_team_owner(uuid),
 qa_private.f5_team_member(uuid),qa_private.f5_invitee(text),
 qa_private.f5_task_team(uuid),qa_private.f5_view_task(uuid),
 qa_private.f5_comment_task(uuid),qa_private.f5_assignable(uuid,uuid),
 qa_private.f5_execute_task(uuid) to authenticated;

create table if not exists public.qa_tarefa_comentarios (
 id uuid primary key default gen_random_uuid(),
 tarefa_id uuid not null references public.qa_tarefas(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 texto text not null check (char_length(btrim(texto)) between 1 and 3000),
 created_at timestamptz not null default now()
);
create index if not exists qa_f5_comment_task_idx
 on public.qa_tarefa_comentarios(tarefa_id,created_at desc);

-- Trigger-generated owner membership; never trust client-supplied role.
create or replace function qa_private.f5_team_seed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.qa_equipe_membros(equipe_id,usuario_id,papel)
 values(new.id,new.owner_id,'gestor');
 return new;
end;
$$;
revoke all on function qa_private.f5_team_seed() from public,anon,authenticated;
create trigger qa_f5_team_seed after insert on public.qa_equipes
 for each row execute function qa_private.f5_team_seed();

-- Only the status column is updateable by invitees. Membership insertion
-- happens in the same DB transaction, and checks confirmed email server-side.
create or replace function qa_private.f5_accept_invite()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if old.estado <> 'pendente' or new.estado not in ('aceito','recusado')
   or new.id<>old.id or new.equipe_id<>old.equipe_id
   or new.email<>old.email or new.papel<>old.papel
   or new.criado_por<>old.criado_por then
   raise exception 'Transição de convite inválida';
 end if;
 select id into v_user from auth.users
 where id=(select auth.uid()) and email_confirmed_at is not null
   and lower(email)=new.email;
 if v_user is null then raise exception 'Convite não autorizado'; end if;
 if new.estado='aceito' then
   insert into public.qa_equipe_membros(equipe_id,usuario_id,papel)
   values(new.equipe_id,v_user,new.papel)
   on conflict(equipe_id,usuario_id) do nothing;
 end if;
 return new;
end;
$$;
revoke all on function qa_private.f5_accept_invite() from public,anon,authenticated;
create trigger qa_f5_accept_invite before update of estado
 on public.qa_equipe_convites for each row
 execute function qa_private.f5_accept_invite();

-- The executor role is permitted to update ONLY execution fields on
-- scenarios, even if they bypass the UI and call the Data API manually.
create or replace function qa_private.f5_guard_scenario_edit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new is not distinct from old then return new; end if;
 if exists(select 1 from public.qa_tarefas t
   where t.id=old.tarefa_id and t.user_id=(select auth.uid()))
   or exists(select 1 from public.qa_admins a
     where a.user_id=(select auth.uid())) then
   return new;
 end if;
 if not qa_private.f5_execute_task(old.tarefa_id) then
   raise exception 'Sem permissão para executar este cenário';
 end if;
 if (to_jsonb(new) - 'status' - 'obtido' - 'updated_at')
   is distinct from (to_jsonb(old) - 'status' - 'obtido' - 'updated_at') then
   raise exception 'Colaboradores só podem registrar resultado de execução';
 end if;
 return new;
end;
$$;
revoke all on function qa_private.f5_guard_scenario_edit() from public,anon,authenticated;
create trigger qa_f5_scenario_edit before update on public.qa_cenarios
 for each row execute function qa_private.f5_guard_scenario_edit();

do $$
declare tbl text;
begin
 foreach tbl in array array['qa_equipes','qa_equipe_membros','qa_equipe_convites',
   'qa_tarefa_equipes','qa_tarefa_responsaveis','qa_tarefa_comentarios'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from anon,authenticated',tbl);
 end loop;
end $$;
grant select,insert,delete on public.qa_equipes to authenticated;
grant select,delete on public.qa_equipe_membros to authenticated;
grant update(papel) on public.qa_equipe_membros to authenticated;
grant select,insert,delete on public.qa_equipe_convites to authenticated;
grant update(estado) on public.qa_equipe_convites to authenticated;
grant select,insert,delete on public.qa_tarefa_equipes to authenticated;
grant select,insert,update,delete on public.qa_tarefa_responsaveis to authenticated;
grant select,insert on public.qa_tarefa_comentarios to authenticated;

create policy qa_f5_teams_select on public.qa_equipes for select to authenticated
 using(owner_id=(select auth.uid()) or qa_private.f5_team_member(id));
create policy qa_f5_teams_insert on public.qa_equipes for insert to authenticated
 with check(owner_id=(select auth.uid()));
create policy qa_f5_teams_delete on public.qa_equipes for delete to authenticated
 using(qa_private.f5_team_owner(id));
create policy qa_f5_members_read on public.qa_equipe_membros for select to authenticated
 using(qa_private.f5_team_member(equipe_id));
create policy qa_f5_members_update on public.qa_equipe_membros for update to authenticated
 using(qa_private.f5_team_owner(equipe_id) and usuario_id<>(select auth.uid()))
 with check(qa_private.f5_team_owner(equipe_id) and usuario_id<>(select auth.uid())
   and papel in ('qa','leitor'));
create policy qa_f5_members_delete on public.qa_equipe_membros for delete to authenticated
 using(qa_private.f5_team_owner(equipe_id) and usuario_id<>(select auth.uid()));
create policy qa_f5_invites_read on public.qa_equipe_convites for select to authenticated
 using(qa_private.f5_team_owner(equipe_id) or qa_private.f5_invitee(email));
create policy qa_f5_invites_create on public.qa_equipe_convites for insert to authenticated
 with check(qa_private.f5_team_owner(equipe_id)
   and criado_por=(select auth.uid()) and estado='pendente');
create policy qa_f5_invites_respond on public.qa_equipe_convites for update to authenticated
 using(estado='pendente' and qa_private.f5_invitee(email))
 with check(estado in ('aceito','recusado') and qa_private.f5_invitee(email));
create policy qa_f5_invites_delete on public.qa_equipe_convites for delete to authenticated
 using(qa_private.f5_team_owner(equipe_id));
create policy qa_f5_links_read on public.qa_tarefa_equipes for select to authenticated
 using(qa_private.f5_view_task(tarefa_id));
create policy qa_f5_links_insert on public.qa_tarefa_equipes for insert to authenticated
 with check(vinculado_por=(select auth.uid()) and
  exists(select 1 from public.qa_tarefas t join public.qa_equipes e
  on e.owner_id=t.user_id where t.id=tarefa_id
  and e.id=equipe_id and t.user_id=(select auth.uid())));
create policy qa_f5_links_delete on public.qa_tarefa_equipes for delete to authenticated
 using(exists(select 1 from public.qa_tarefas t
  where t.id=tarefa_id and t.user_id=(select auth.uid())));
create policy qa_f5_assignee_read on public.qa_tarefa_responsaveis for select to authenticated
 using(qa_private.f5_view_task(tarefa_id));
create policy qa_f5_assignee_insert on public.qa_tarefa_responsaveis for insert to authenticated
 with check(atribuido_por=(select auth.uid()) and
  qa_private.f5_assignable(tarefa_id,responsavel_id));
create policy qa_f5_assignee_update on public.qa_tarefa_responsaveis for update to authenticated
 using(exists(select 1 from public.qa_tarefas t where t.id=tarefa_id
  and t.user_id=(select auth.uid())))
 with check(atribuido_por=(select auth.uid()) and
  qa_private.f5_assignable(tarefa_id,responsavel_id));
create policy qa_f5_assignee_delete on public.qa_tarefa_responsaveis for delete to authenticated
 using(exists(select 1 from public.qa_tarefas t where t.id=tarefa_id
  and t.user_id=(select auth.uid())));
create policy qa_f5_comments_read on public.qa_tarefa_comentarios for select to authenticated
 using(qa_private.f5_view_task(tarefa_id));
create policy qa_f5_comments_insert on public.qa_tarefa_comentarios for insert to authenticated
 with check(user_id=(select auth.uid()) and qa_private.f5_comment_task(tarefa_id));

-- Share read access ONLY; preserve owner writes and do not expose private files
-- or other user's personal libraries, generated model prompts, or secrets.
create policy qa_f5_tasks_shared_read on public.qa_tarefas for select to authenticated
 using(qa_private.f5_view_task(id));
create policy qa_f5_scenarios_shared_read on public.qa_cenarios for select to authenticated
 using(qa_private.f5_view_task(tarefa_id));
create policy qa_f5_scenarios_assigned_execute on public.qa_cenarios
 for update to authenticated
 using(qa_private.f5_execute_task(tarefa_id))
 with check(qa_private.f5_execute_task(tarefa_id));
do $$
declare tbl text;
begin
 foreach tbl in array array['qa_diagramas','qa_documentos','qa_requisitos',
  'qa_requisito_revisoes','qa_requisito_cenarios','qa_evidencias','qa_eventos',
  'qa_execucao_historico','qa_tarefa_mudancas','qa_artefatos'] loop
  execute format('create policy qa_f5_shared_read on public.%I for select to authenticated using (qa_private.f5_view_task(tarefa_id))',tbl);
 end loop;
end $$;
