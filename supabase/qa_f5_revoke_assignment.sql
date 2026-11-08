-- F5 hardening: an old assignment must never reactivate on re-invitation.
-- Only an explicitly assigned, currently authorized QA may execute.
create or replace function qa_private.f5_clear_member_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.qa_tarefa_responsaveis r
    using public.qa_tarefa_equipes l
    where r.tarefa_id=l.tarefa_id
      and l.equipe_id=old.equipe_id
      and r.responsavel_id=old.usuario_id;
  return old;
end;
$$;
revoke all on function qa_private.f5_clear_member_assignment()
 from public,anon,authenticated;
create trigger qa_f5_unassign_removed_member
 after delete on public.qa_equipe_membros
 for each row execute function qa_private.f5_clear_member_assignment();

-- A role downgrade also removes the assignment, even while membership remains.
create or replace function qa_private.f5_clear_downgraded_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.papel in ('qa','gestor') and new.papel='leitor' then
    delete from public.qa_tarefa_responsaveis r
      using public.qa_tarefa_equipes l
      where r.tarefa_id=l.tarefa_id
        and l.equipe_id=old.equipe_id
        and r.responsavel_id=old.usuario_id;
  end if;
  return new;
end;
$$;
revoke all on function qa_private.f5_clear_downgraded_assignment()
 from public,anon,authenticated;
create trigger qa_f5_unassign_downgraded_member
 after update of papel on public.qa_equipe_membros
 for each row execute function qa_private.f5_clear_downgraded_assignment();

-- Unlinking the TF from a team removes any old team assignment as well.
create or replace function qa_private.f5_clear_unlinked_assignment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from public.qa_tarefa_responsaveis r where r.tarefa_id=old.tarefa_id;
  return old;
end;
$$;
revoke all on function qa_private.f5_clear_unlinked_assignment()
 from public,anon,authenticated;
create trigger qa_f5_unassign_unlinked_task
 after delete on public.qa_tarefa_equipes
 for each row execute function qa_private.f5_clear_unlinked_assignment();
