# QA Hub React — fluxo rápido para criar, gerar e executar casos

**Issue:** #37 · **PR:** #39 (draft) · **Estado:** implementado na branch, aguardando homologação de usuários.

## Problema e objetivo

O QA precisa criar uma TF, gerar ou escrever os cenários, executar
cada caso, registrar evidências e preparar o relatório. A apresentação
de muitos botões no mesmo nível aumenta o custo de localizar as três
ações mais frequentes: criar caso, executar pendentes e gerar casos.

**Objetivo:** reduzir passos de navegação **sem reduzir** a rastreabilidade,
as validações, os níveis de acesso ou os campos disponíveis.

## Fluxo atualizado

1. Abrir uma TF na listagem. O bloco **Fluxo de QA** aparece no início
   da página, antes das opções administrativas.
2. **Adicionar cenário:** abre formulário com foco no título. Preencher
   título, passos e resultado esperado. Salvar grava somente um cenário,
   inicialmente não executado.
3. **Testar pendentes:** seleciona o filtro de não executados e posiciona
   o foco na ação do primeiro caso pendente. Esse clique **não grava
   execução**, não muda situação da TF e não gera evidências.
4. Dentro do cenário, escolher **Funcionou**, **Não funcionou** ou
   **Bloqueado** conforme a execução real. Em caso de falha/bloqueio,
   descrever o observado no diálogo antes de salvar.
5. **Gerar casos com IA:** abre o gerador preservando consentimento
   explícito e revisão dos casos. Sugestões não são executadas nem
   anexadas automaticamente.
6. **Outras ferramentas:** a seção expandível mantém post técnico,
   requisitos/cobertura, evidências/auditoria, releases/referências,
   documentos/relatórios e diagramas. Os recursos existentes continuam
   acessíveis; expandir/fechar não modifica o banco.

## Estados e regras

- O contador de pendentes lê cenários já carregados via Supabase.
- Com a lista vazia, **Testar pendentes** destaca o filtro e informa
  que não há casos para executar; não cria um cenário fictício.
- O botão de filtro usa **aria-pressed** para leitura assistiva.
- A criação e a edição têm foco inicial no campo **Título** e
  rolagem para o formulário; o gerador tem região identificada.
- Ferramentas secundárias usam \`<details>/<summary>\`, com operação
  por teclado sem biblioteca ou menu customizado.
- **Sem automação implícita de status:** a ação de teste existente
  só grava um resultado mediante clique específico do QA; falha e
  bloqueio exigem resultado observado.

## Critérios de aceite (homologação humana)

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF01 | Abrir TF com cenários pendentes | Três ações principais visíveis sem abrir menu |
| QF02 | Selecionar Adicionar cenário | Foco em Título; formulário visível no viewport |
| QF03 | Selecionar Testar pendentes | Filtro Pendentes ativo; foco no primeiro caso |
| QF04 | Selecionar Testar pendentes com zero pendentes | Mensagem informativa; nenhum dado gravado |
| QF05 | Selecionar Gerar casos com IA | Gerador acessível e consentimento preservado |
| QF06 | Expandir Outras ferramentas e abrir cada recurso | Recursos originais funcionam, sem regressão |
| QF07 | Abrir/fechar recurso e navegar por teclado | Ordem de foco previsível e sem perda de contexto |
| QF08 | Abrir cenário e cancelar diálogo de falha | Nenhum resultado salvo; foco retorna ao acionador |

## Evidência automatizada

- \`frontend/tests/browser-qa-flow.mjs\`: mantém o E2E original com IA,
  publicação, requisitos, evidências, releases, comparação e extração
  PDF/DOCX. Passou a expandir Outras ferramentas antes de escolher
  operações secundárias.
- \`frontend/tests/browser-accessibility.mjs\`: confere foco ao criar
  cenário, filtro e foco em Testar pendentes e auditoria WCAG com
  \`axe-core\` nos viewports CSS 320/390/1366px, além das ações
  de teclado dos diálogos.
- \`frontend/scripts/check-bundle-budget.mjs\`: mantém limite de 350 KiB
  gzip na navegação inicial e impede inclusão estática das ferramentas
  pesadas de IA, PDFs e Mermaid.

**Limitações:** o teste usa Supabase simulado e viewport CSS; não mede
tempo real de conclusão da tarefa, acessibilidade manual, consumo em
dispositivos físicos nem RLS. Registrar uma comparação cronometrada
**antes/depois** com QAs reais antes de afirmar ganho quantitativo.

## Controle de mudança

Implementação isolada em \`feat/issue-37-react-foundation\`, com PR draft.
Não fazer merge, deploy ou troca de dados/RLS antes do plano de
homologação e autorização de rollout.
