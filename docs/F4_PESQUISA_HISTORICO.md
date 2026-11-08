# QA Hub — F4: busca, filtros salvos, histórico e desempenho

## Busca e paginação

A listagem anterior obtinha até 1.000 TFs para depois filtrar no navegador. Agora usa qa_search_tasks (SECURITY INVOKER), consultando o banco por páginas de 30 registros, com filtros de situação e BUILD/RELEASE e busca por termos e partes de título, código, módulo, versão e descrição. A função no banco limita páginas a 50 itens, restringe tamanho de pesquisa e mantém a RLS vigente.

A busca tem debounce de 280 ms, total de resultados calculado no servidor, paginação estável por data e ID, e botão Mostrar mais. A leitura de progresso dos cenários é por página para não exceder limites de IDs. O detalhe de TF faz consulta por ID, não depende das primeiras 1.000 tarefas. Indicadores da listagem e do dashboard usam qa_task_stats: contagens reais, sem download de todas as TFs e sem amostragens de 30 TFs para cobertura.

## Filtros salvos

A seção Filtros salvos fica recolhida por padrão. É possível guardar nome, busca, situação e tipo, aplicar um filtro salvo e excluir com confirmação. Os filtros são registrados por usuário em qa_filtros_salvos com RLS e não ficam na conta de outros usuários. A interface lista no máximo 30 filtros por usuário.

## Histórico e comparações

Gatilhos do banco registram as mudanças reais de status e resultado observado em qa_execucao_historico, na mesma transação da alteração. Dados de identificação da TF (título, código, versão, módulo, tipo, situação) são registrados em qa_tarefa_mudancas. As duas tabelas são de leitura para usuários autenticados autorizados (proprietário ou admin). Não há INSERT/UPDATE/DELETE da API comum.

TF > Entregáveis > Histórico de execuções abre um painel de consultas com seleção de cenário, páginas de 40 eventos, visualização de alterações da TF e comparação local entre duas versões do resultado observado do mesmo cenário. Comparar nunca escreve dados nem aprova automaticamente a TF.

Cenários anteriores à instalação da F4 receberam somente um estado inicial, sem indicar uma execução que não foi registrada. Na aplicação, 35 cenários existentes receberam 35 estados iniciais. Resultados históricos anteriores não podem ser reconstruídos sem logs confiáveis.

Ao excluir definitivamente TFs ou cenários, o modelo atual ainda usa cascata, incluindo snapshots dependentes. Soft-delete/recuperação não faz parte desta F4.

## Banco e segurança

Script aditivo já aplicado: supabase/qa_f4_search_history.sql.

- Novos índices por proprietário/data, situação/data, módulo/versão, GIN de texto, filtros e histórico.
- RLS habilitado nas três tabelas F4.
- Anônimo não pode ler o histórico ou executar a RPC.
- Usuários não conseguem inserir snapshots ou atualizar o registro de alterações.
- A RPC é SECURITY INVOKER e respeita o acesso RLS às TFs, sem service_role no frontend.
- Não houve alteração destrutiva de TFs, cenários, evidências, documentos nem permissões anteriores.

## Validação

- TypeScript, ESLint, Vitest, compilação Vite e regressão completa Chromium.
- Teste com 108 TFs sintéticas, busca por código, módulo e versão, quatro páginas, filtro salvo, acesso direto por ID, snapshots de execução e diff.
- Auditoria de acessibilidade automatizada e revisão responsiva em 320, 390, 768 e 1366 pixels.
- Fluxos anteriores de cadastro, IA, execução guiada, relatórios, segurança e trava de publicação permanecem sob regressão.

Pendências para homologação: acesso real com duas contas distintas, pesquisa em grande volume com plano de execução observado no Supabase, e testes em celular físico e tecnologias assistivas.
