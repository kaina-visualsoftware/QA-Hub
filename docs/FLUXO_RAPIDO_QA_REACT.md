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
| QF09 | Nova TF: Salvar e adicionar cenário | Abre a TF e o primeiro formulário sem criar caso vazio |
| QF10 | Salvar e criar outro | Caso fica pendente; campos limpos; foco volta ao título |
| QF11 | Nova TF: Salvar e abrir TF | Abre detalhes sem apresentar editor automaticamente |
| QF12 | Atualizar a página após cadastro | Não duplica TF/casos nem reabre formulário |

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

## Continuação direta após criar uma TF

O cadastro oferece **Salvar e abrir TF** (comportamento anterior) ou
**Salvar e adicionar cenário**. O segundo destino abre o formulário
do primeiro caso na TF recém-criada, com foco no título. O cadastro
da TF não cria casos em branco nem registra execuções. A intenção
de abrir o formulário é consumida pelo roteador com replace: atualizar
a página ou voltar no navegador não reabre o editor. O passo é
permitido apenas para o proprietário da TF.

No editor de cenário, **Adicionar cenário** salva e fecha como antes;
**Salvar e criar outro** grava o caso como não executado, limpa os
campos e devolve o foco ao título sem sair da edição. **Cancelar**
não persiste um caso vazio. Nenhuma dessas ações altera o estado
da TF automaticamente.

O teste de navegador `frontend/tests/browser-quick-create.mjs` cobre
submissão inválida, os dois destinos, persistência explícita, casos
consecutivos, cancelamento, foco, refresh e tela de 390 px. Utiliza
respostas Supabase sintéticas; permissões reais continuam pendentes.


## Continuação de preenchimento após atualização (QF13–QF16)

A nova TF agora pode guardar opcionalmente uma cópia dos seis campos
essenciais na **aba atual**. Sem consentimento, nenhum texto é
persistido por esse mecanismo. A recuperação é explícita e separada
por usuário; salvar a TF, descartar a cópia, desativar a opção ou
sair da conta apaga o rascunho. O conteúdo permanece no navegador,
não é criptografado nem enviado ao Supabase. Para evitar reter
informações desnecessárias, casos extraídos não são incluídos.

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF13 | Digitar TF e recarregar sem marcar a opção | Sem rascunho guardado; campos não persistem |
| QF14 | Marcar Guardar rascunho, preencher e atualizar | Banner de recuperação; dados restaurados somente ao confirmar |
| QF15 | Desativar guarda ou descartar rascunho | Nenhuma restauração após novo refresh |
| QF16 | Salvar TF ou sair da conta | Cópia da aba removida; texto não reaparece para outra conta |

Teste: `frontend/tests/browser-draft-recovery.mjs` e
`frontend/tests/local-draft.test.ts`. A limpeza por logout está
implementada no AuthProvider, mas a autenticação real ainda requer
homologação assistida. Não confundir o rascunho local com uma TF
já salva, um backup ou armazenamento criptografado.


## Fluxo contínuo de pendências (QF17–QF21)

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF17 | Abrir uma TF com dois pendentes e selecionar Testar pendentes | Foco vai ao primeiro caso, sem gravar resultado |
| QF18 | Marcar Funcionou e receber confirmação do servidor | Resultado aprovado e foco no próximo pendente |
| QF19 | Falhar a persistência por rede/RLS | Erro visível, sem avançar ou marcar cenário executado |
| QF20 | Registrar o último pendente | Foco retorna ao filtro Pendentes; situação da TF não muda automaticamente |
| QF21 | Aprovar cenário previamente reprovado com observação | Pedir confirmação antes de limpar a observação antiga; cancelar preserva dados; confirmar não reaproveita texto da falha |

**Execução automatizada:** `frontend/tests/browser-execution-next.mjs`
com interceptação de Supabase e `frontend/tests/quick-result.test.ts`
com exemplos de mudanças de estado. Homologar também navegação por
teclado e leitura de status em equipamentos usados pelos QAs. As
mudanças não substituem o histórico de auditoria do banco.


## Conclusão sem redigitação — QF22 a QF26

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF22 | Na TF, clicar Conferir relatório | Painel de documentos abre sem mudar de TF; foco vai ao título do painel |
| QF23 | Misturar cenários aprovados, reprovados, bloqueados e pendentes | O que foi testado mostra apenas os três estados executados; os pendentes aparecem apenas como pendências nos detalhes e contadores |
| QF24 | Aprovar cenário sem observação escrita | Resumo identifica a aprovação registrada, sem inventar uma observação |
| QF25 | Editar relatório manualmente e registrar outra execução | Edição fica preservada; Atualizar prévia solicita confirmação antes de substituí-la |
| QF26 | Salvar uma versão do relatório | Documento é salvo na mesma TF; situação da TF não é alterada automaticamente |

**Implementação:** reutiliza `buildExecutionReport` e
`saveTfDocument` de `qa-phase2.mjs`; adiciona
`buildTestedSummary` e `suggestedExecutionConclusion` à mesma
função de composição. Nenhum conteúdo é enviado à IA por essa ação.
Os cenários e resultados devem estar persistidos pelo backend para
entrarem no resumo.

**Testes:** `frontend/tests/execution-summary.test.ts` verifica
seleção dos status, fidelidade dos campos e conclusão sugerida,
sem confundir pendências com aprovações. O Chromium em
`frontend/tests/browser-report-summary.mjs` valida a UX e a versão
com Supabase inteiramente simulado. Homologação real de RLS e acesso
a documentos continua necessária antes do corte.


## Lista operacional com progresso e retomada — QF27 a QF32

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF27 | Abrir a lista com TF contendo 1 aprovado e 1 pendente | Mostra 1/2 executados e ação Continuar testes |
| QF28 | Abrir TF sem cenários | Mostra 0/0 executados e Adicionar primeiro caso, sem registrar cenário vazio |
| QF29 | Consultar TF de outra pessoa como admin | Mostra dados permitidos, mas não oferece atalho de execução |
| QF30 | Consultar TF com mais de 500 cenários | Soma todos após paginação do PostgREST, sem subcontagem silenciosa |
| QF31 | Clicar Continuar testes, voltar ou atualizar | Abre filtro Pendentes e foca primeiro caso; intenção consumida; nunca salva automaticamente |
| QF32 | Forçar falha da API de progresso e procurar uma TF | Alerta de progresso indisponível; lista e navegação continuam funcionais |

A UI consulta somente `qa_cenarios(tarefa_id,status)` para os IDs
das TFs já carregadas. A própria RLS deve garantir a autorização no
servidor: filtro de IDs no frontend **não** substitui RLS. Para
evitar chamadas excessivas, a lista inicial limita-se a 30 TFs,
com paginação incremental de 30. Uma alteração de execução invalida
o progresso, que será atualizado ao retornar à lista.

Testes: `frontend/tests/task-progress.test.ts` (cálculo,
separação por TF, sem inferir execução) e
`frontend/tests/browser-home-progress.mjs` (lotes, paginação real,
contas fictícias, foco acessível e zero gravações no atalho).


## Assistentes de IA e workspace redesenhado — QF33 a QF40

| Caso | Procedimento | Resultado esperado |
|---|---|---|
| QF33 | Abrir uma TF, procurar as ações de IA | Post, roteiro/casos e diagramas estão visíveis sem abrir Mais ferramentas |
| QF34 | Clicar Gerar diagrama com IA | Painel Mermaid abre e recebe o foco; não chama IA automaticamente |
| QF35 | Selecionar cenários e requisitos na opção Dados da TF | Somente IDs vinculados à mesma TF participam do contexto e no máximo 18 cenários |
| QF36 | Informar texto livre e autorizar o envio | Preview do contexto é inspecionável; envio depende de consentimento |
| QF37 | Gerar Mermaid válido | Código normalizado, prévia isolada, nada gravado no banco sem Salvar diagrama |
| QF38 | Receber código inseguro ou serviço indisponível | Código perigoso é rejeitado; fallback local é identificado, nunca salvo automaticamente |
| QF39 | Editar um diagrama e tentar substituí-lo por IA | Pede confirmação antes de sobrescrever o rascunho atual |
| QF40 | Abrir tela a 390px e registrar cenários | Sem overflow horizontal; contagens derivadas somente de resultados salvos |

**Arquitetura:** conserva a `qa-ai` implantada para geração de
diagramas, os geradores `qa-generators` para posts e casos,
o serviço de documentos privados, `qa_diagramas` sob RLS e
o editor Mermaid existente. Nenhuma mudança SQL necessária.
O comportamento de acesso de outras contas continua read-only.

**Observação de homologação:** os testes automatizados utilizam
Supabase/Edge Functions simulados. Validar manualmente uma
geração real em conta proprietária, consentimento, revisão e
gravação em TF da própria conta antes de encerrar o item.


## Mermaid — sintaxe inválida e reparo assistido (QF41–QF46)

| Caso | Ação | Esperado |
|---|---|---|
| QF41 | Gerar Mermaid válido | Parser valida antes do código entrar no editor |
| QF42 | A IA retorna Mermaid com sintaxe inválida | Código e erro preservados; não é salvo automaticamente |
| QF43 | Escolher Corrigir com IA após erro | Solicita consentimento e envia o Mermaid incorreto junto com a mensagem real do parser |
| QF44 | Escolher Gerar novamente | Faz nova tentativa com a origem original, sem incluir código inválido de tentativa anterior |
| QF45 | Editar manualmente um código inválido e clicar Salvar | Gravação bloqueada; erro explicado e atalho para correção disponível |
| QF46 | Corrigir código, visualizar e salvar | Somente a versão sintaticamente válida entra em `qa_diagramas`; status da TF não muda |

**Cotas:** cada tentativa de correção ou regeneração requer uma
nova chamada à função `qa-ai`; as regras de rate limit não
devem ser removidas. Nunca tratar um erro de parser como sucesso.
