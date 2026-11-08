-- F5 follow-up (safe policy hardening and invitation lifecycle).
-- Owners can read a just-created team before the AFTER INSERT member seed fires,
-- so INSERT ... RETURNING works without bypassing RLS.
alter policy qa_f5_teams_select on public.qa_equipes
 using(owner_id=(select auth.uid()) or qa_private.f5_team_member(id));
-- Only the team owner can clear a historical accepted/refused invitation.
-- This enables a fresh invitation after a revoked membership, while membership
-- removal itself remains a separate explicitly authorized action.
alter policy qa_f5_invites_delete on public.qa_equipe_convites
 using(qa_private.f5_team_owner(equipe_id));
