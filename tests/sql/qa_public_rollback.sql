-- Verify transactional fail-closed behavior after deliberately injecting an
-- extra anonymous read policy and expecting lockdown to abort.
-- Run as fixture database owner after the failed lockdown process exits.
select public.qa_assert(
  pg_catalog.has_table_privilege('anon','public.qa_tarefas','SELECT')
  and pg_catalog.has_table_privilege('anon','public.qa_cenarios','SELECT')
  and pg_catalog.has_table_privilege('anon','public.qa_diagramas','SELECT'),
  'Failed lockdown must roll back all three revoked grants');
select public.qa_assert(
  (select count(*) from pg_catalog.pg_policies
   where schemaname='public'
     and policyname in ('qa_tarefas_public_read',
       'qa_cenarios_public_read','qa_diagramas_public_read'))=3,
  'Failed lockdown must roll back removal of all three legacy policies');
select public.qa_assert(
  (select count(*) from pg_catalog.pg_policies
   where schemaname='public' and policyname='qa_unexpected_anon_read')=1,
  'Unknown public policy should remain for explicit review');
\echo 'PASS: unexpected public policy caused an atomic rollback'
