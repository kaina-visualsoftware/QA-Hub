# QA Hub — Verificação objetiva para encerramento das issues #31, #33 e #37

Data da revisão: 12/11/2026. Este relatório diferencia **implementado**, **testado com dados simulados** e **homologado com usuários reais**. Nenhum cenário sintético é prova de acesso real ao Supabase ou de redução de tempo de trabalho.

## #31 — Casos com contexto da TF

**Entregue:** ação contextual de geração, contexto consolidado da TF escolhida, requisitos selecionados, saída independente do post, revisão antes de anexar e tratamento de fonte ausente. O usuário precisa confirmar a inclusão; a IA não altera a execução de testes.

**Evidência automatizada adicional:** `frontend/tests/task-context-isolation.test.ts` confere duas TFs com cenários, eventos, documentos e evidências misturados, máscara de dados pessoais, bloqueio de usuário não proprietário e descarte de linhas estrangeiras retornadas indevidamente pelo serviço.

**Antes do fechamento definitivo**, fazer homologação em conta de QA com duas TFs reais autorizadas; verificar um caso gerado para cada uma, histórico e cenários já existentes, envio de requisitos de uma única tarefa e ausência de contaminação cruzada. Verificar separadamente metadados de imagens/anexos e confirmar que o sistema **não alega interpretar bytes de arquivos não processados**. Guardar apenas IDs fictícios nos resultados publicados.

## #33 — Jornada do QA

**Entregue:** criação rápida via texto e revisão, geração e anexação de casos, execução rápida por cenário, navegação contextual, evidências, diagramas e relatório/post a partir dos dados efetivos. Testes sintéticos exercitam os fluxos e regressões de falha/refresh.

**Bloqueio de aceite humano:** pesquisa real com QA. Medir no fluxo antigo/baseline e no novo, para a mesma TF de teste:
- tempo até criar TF e executar três cenários;
- quantidade de cliques, campos digitados e trocas de tela;
- capacidade de registrar falha com evidência e retornar ao cenário pendente;
- percepção de clareza e pontos de retrabalho.
A comparação deve informar tamanho da amostra, dispositivo, tipo de tarefa e resultados observados. Não atribuir eficiência percentual sem dados. Registrar acessibilidade manual no teclado e em leitor de tela.

## #37 — Migração React

**Entregue:** produção em React + TypeScript + Vite, HeroUI, Tailwind, Zustand, Zod, TanStack Query e React Router, com fallback legado documentado. Os testes automatizados verificam compilação, tipos, componentes, uso de RPCs e navegação em Chromium com serviços simulados.

**Bloqueio de aceite operacional:** aplicar `docs/HOMOLOGACAO_SUPABASE_STAGING.md` com projeto separado, duas contas comuns A/B e um visitante anônimo; executar `frontend/scripts/staging-rls.mjs` com credenciais fornecidas apenas pelos segredos do ambiente. Conferir Auth, callback, recuperação de senha, leitura e escrita RLS, Storage, upload/download, publicação/despublicação, cenários, requisitos, diagramas e relatórios com dados sintéticos. Não cadastrar chaves de serviço no frontend, não copiar dados pessoais para a CI e não tratar build simulado como prova de isolamento real.

## Regra de fechamento

Marcar uma issue como **completed** somente quando a implementação estiver integrada, sua CI relevante estiver verde, os critérios de homologação correspondentes tiverem evidências e não houver regressão conhecida sem encaminhamento. Se faltar teste real, manter aberta com comentário objetivo; não reclassificar como entregue apenas para zerar a lista.
