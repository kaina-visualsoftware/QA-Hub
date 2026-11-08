# Liberação incremental da issue #37 — React QA Hub

**Data:** 07/11/2026  
**Objetivo desta entrega:** integrar código React com CI verde **sem alterar o QA Hub legado publicado**, sem executar SQL de produção e sem mudar o roteamento do GitHub Pages.

## Estado real, verificado em 07/11/2026

- O código React + TS/Vite/Tailwind/HeroUI está na PR #39 com testes sintéticos de Auth, CRUD, geração, diagramas, relatórios, RLS offline e WCAG.
- O projeto Supabase de produção `pqadmlhcsimlcclpkyov` continua sem as RPCs `qa_public_tasks_v1` e `qa_public_task_v1` (catálogo SQL consultado em leitura).
- O esquema de produção ainda possui políticas públicas de leitura e `SELECT` concedido a `anon` nas tabelas operacionais `qa_tarefas`, `qa_cenarios` e `qa_diagramas`. Por isso, o corte da API pública exige trabalho de segurança adicional.
- Na conta Supabase que hospeda este QA Hub, há apenas o projeto `SIA` e **nenhuma branch staging**. Projetos de outras contas não devem ser usados como staging sem definição explícita de proprietário/ambiente.
- Os arquivos de entrada do site legado `public.js`, `qa.html`, `index.html`, `qa.js`, `qa-config.js` e `public.html` devem ficar preservados nesta integração. A alteração do leitor `public.js` para as RPCs foi RETIRADA do escopo de integração para não quebrar a experiência pública no Pages.
- Nenhum `supabase/qa_public_read_*.sql` desta PR foi aplicado na base real.
- O artefato `qa-hub-react-rc-isolado` da workflow `QA Hub React foundation` é uma build **não funcional para login**, explicitamente compilada com um endpoint `.invalid` e chave inerte. É um candidato técnico para inspeção dos assets, **não** um ambiente de testes real. Os testes Chromium em CI usam mocks in-memory, não banco de produção.

## Fase 1 — integrar o código, sem cortar o site (permitida)

1. Verificar que a PR #39 não modifica os arquivos de entrada do site legado; conferir o diff.
2. Exigir CI verde (React foundation, React browser, SQL descartável, legacy checks, legacy browser).
3. Integrar o código React e os testes em `main` **sem configurar Pages para publicar `frontend/dist`**, sem alterar `qa.html` e sem usar SQL de produção.
4. Confirmar que a URL pública existente continua carregando o QA Hub legado e os links públicos existentes; se não, reverter o merge de código.
5. Manter a issue #37 **aberta**, pois a interface React ainda não está em produção e critérios de aceite completos exigem homologação.

Esta integração é de código-fonte; não é uma liberação de funcionalidades React para usuários finais.

## Fase 2 — staging real (bloqueada até existir ambiente separado)

1. Definir um projeto/branch Supabase exclusivo para QA, diferente de `pqadmlhcsimlcclpkyov`. Consultar custo por organização e obter autorização explícita **antes** de criar recursos cobrados.
2. Aplicar schema e migrações do QA Hub em staging, com fixtures sintéticas e duas contas reais de teste não-admin.
3. Executar em staging a API pública permitida `supabase/qa_public_read_api.sql` e, só depois de adaptar leitores, validar `supabase/qa_public_read_lockdown.sql`.
4. Testar autenticação, rotas de callback, autorização cruzada A/B, Storage privado, CRUD, documentos, diagramas, publicações/despublicações e resultados de TFs sob RLS.
5. Executar o validador `frontend/scripts/staging-rls.mjs` e a checklist de `docs/HOMOLOGACAO_SUPABASE_STAGING.md`. Registrar evidências sem credenciais ou conteúdo pessoal.
6. Gerar uma build apontando **explicitamente** para o endpoint/chave públicos de staging; não usar a build isolada da Fase 1 como se estivesse conectada.

## Fase 3 — mudança de dados e cutover (NÃO autorizada por CI sintética)

Gates obrigatórios antes de qualquer implantação: backup e plano de rollback testados; contratos RPC inspecionados; teste das permissões anônimas e autenticadas em staging; janela de corte; revisão de segurança da API pública; validação dos fluxos do frontend legado e React; aprovação humana dos casos de teste e acessibilidade.

Ordem operacional coordenada (somente após os gates):

1. Disponibilizar as RPCs de saída pública limitadas em staging e depois preparar a mesma mudança aditiva de forma controlada em produção; validar que retornam somente as colunas pretendidas.
2. Atualizar e validar o leitor legado `public.js` e React para usar exclusivamente RPCs. Não atualizar o legado antes de as RPCs existirem.
3. Executar o lockdown RLS/grants apenas quando ambas as páginas funcionarem com RPC; repetir os testes negativos de exposição de `user_id` e colunas internas.
4. Publicar React com rota/redirect de Auth e comportamento de retorno compatíveis, mantendo o HTML legado e plano de rollback executável.
5. Verificar login, criação/edição, execução, relatório, evidências/Storage, página pública, links antigos, leitura anônima e isolamento entre usuários no endereço real.
6. Documentar o fechamento da issue #37 somente após observação e homologação.

**Não usar rollback que restabeleça grants públicos amplos sem avaliação de segurança.** Um rollback funcional deve contemplar frontend, chamadas de API e permissões coordenadamente.

## Evidência da fase 1

- PR: https://github.com/kaina-visualsoftware/QA-Hub/pull/39
- CI e artifact: Actions da workflow `QA Hub React foundation`.
- Matriz UX: `docs/FLUXO_RAPIDO_QA_REACT.md`.
- Pré-requisito RLS: `docs/HOMOLOGACAO_SUPABASE_STAGING.md`.
- Ratificação de acessibilidade: `docs/HOMOLOGACAO_ASSISTIVA_REACT.md`.

**Separação fundamental:** código integrado ≠ site React publicado ≠ banco migrado ≠ homologação concluída.
