# Padrão de interface e visibilidade da TF

A interface ativa fica em `frontend/src`. Preserve a identidade visual existente: superfícies claras, texto escuro, teal nas ações e navegação, tipografia de sistema e foco visível.

## Fluxos

- Páginas e abas mostram listagens e informações salvas. Não expandir editores ou prévias entre as linhas ao clicar em Visualizar.
- Criar, editar, importar e visualizar usam `QAModal`. O cabeçalho informa o objeto e a ação. Fechar não salva; operações de gravação têm botão explícito e feedback.
- Linhas usam `qa-resource-list`, `qa-resource-row`, `qa-resource-copy` e `qa-resource-actions`: título e metadados à esquerda; ações com texto à direita. Em telas estreitas, ações vão para a linha seguinte com alvos de 44px.
- Diagramas, documentos, fontes, arquivos e imagens usam o mesmo padrão. Passos de cenário e informações auxiliares podem continuar recolhíveis: são leitura, não um editor ou uma prévia de arquivo.
- As ações da biblioteca da TF descrevem o contexto: Gerenciar requisitos, Adicionar arquivo, Adicionar vínculo, Gerenciar equipe. Utilitários locais de comparação e releases continuam na própria página, pois são sua tarefa principal.
- `QAModal` centraliza foco, Escape, retorno ao acionador e bloqueio da página. Uma prévia aberta dentro de outro modal deve fechar sozinha no primeiro Escape e devolver foco ao modal anterior.

## Uma configuração de publicação

`qa_tarefas.publica` determina a leitura pública de todo o conteúdo da TF: cenários e seus resultados, diagramas, evidências e anexos gerais ou de cenário, fontes originais e textos importados, requisitos/cobertura, posts/relatórios, releases vinculadas e contadores de comparações.

Não há permissão ou confirmação individual de publicação por imagem/arquivo. Anexos antigos e novos herdam o estado atual da TF. A confirmação geral explica esse alcance. Validações existentes de formato e integridade de upload continuam funcionando.

Dados da conta, credenciais, integrantes da equipe, identidade de atores e a biblioteca pessoal de referências não são conteúdo da TF e não são expostos pela projeção. As referências pessoais não possuem vínculo com uma TF.

A leitura pública usa RPC com projeção explícita. RLS e buckets privados permanecem ativos. Downloads passam pela função `qa-public-evidence`, que confere a TF em cada requisição; não gera URLs assinadas duradouras. Retirar a publicação bloqueia novas consultas e downloads; não pode apagar cópias já baixadas por visitantes.

## Implantação

1. Aplicar previamente as migrações existentes de documentos, requisitos R1–R4, evidências F3, links, API pública e lockdown.
2. Publicar a função `supabase/functions/qa-public-evidence`, incluindo `handler.mjs`, com acesso anônimo ao endpoint (`--no-verify-jwt`). A autorização de leitura é a publicação da TF, verificada no handler; a chave de serviço permanece exclusivamente no servidor.
3. Aplicar `supabase/qa_public_task_visibility.sql` após `qa_public_evidence_optin.sql`. É transacional e reaplicável; mantém a coluna antiga como compatibilidade, ignorada, e remove sua permissão de edição.
4. Publicar o frontend atualizado. Manter a trava de rollout `VITE_PUBLIC_SHARING_ENABLED` até validar no projeto alvo. Ela controla novas publicações, não permissões por anexo.
5. Homologar em staging com TF privada, pública e despublicada: PDF geral, imagem com flag antiga false, DOCX de requisito, documento, consulta anônima e download direto. Testar também conta diferente e caminho de outro proprietário.

Essas mudanças tornam acessíveis os anexos de TFs que já estão públicas. Não tornar buckets públicos nem conceder SELECT anônimo nas tabelas para obter esse comportamento.

## Verificação local

Na pasta `frontend`: `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build`, `node scripts/check-bundle-budget.mjs`.

Com preview na porta 4173, executar `browser-artifact-workspace.mjs`, `browser-file-workspace.mjs`, `browser-scenario-paste.mjs`, `browser-public-evidence.mjs`, `browser-f0-workspace.mjs`, `browser-f1-guided.mjs` e `browser-accessibility.mjs`. Capturas ficam em `frontend/artifacts/`.

Na raiz: `node --test tests/*.test.mjs`. O teste `public-attachments.test.mjs` exercita o handler real com fetch simulado, incluindo despublicação e negação de acesso.
