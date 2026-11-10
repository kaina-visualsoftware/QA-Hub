# QA Hub React — auditoria de fluxo e padronização da IA

Data: 10/11/2026

Ambiente: CQP-KAINA-72 (Windows, Chromium via Playwright)
Escopo: versão migrada para React, estados de IA, revisão humana, CSS, acessibilidade e regressões.

## Padrão de interação

Todos os recursos de geração assistida seguem o contrato **Configurar e gerar → Revisar o resultado → Finalizar**.

1. **Configurar**: coletar os dados da TF, as fontes permitidas, o modelo e o consentimento específico. A pessoa solicita a geração.
2. **Processar**: mostrar o status real e o tempo decorrido. Para respostas por streaming, mostrar conteúdo recebido e prévia parcial. Nunca exibir porcentagem sem dados da API. Não bloquear o cancelamento quando o serviço oferece sinal de abortamento.
3. **Revisar**: apresentar o que a IA sugeriu numa etapa separada da configuração, com campos editáveis, seleção de resultados, contexto de origem e indicação do que ainda não foi salvo.
4. **Finalizar**: gravação somente após ação explícita do QA, com feedback de sucesso/erro e proteção contra repetição acidental.

O diagrama usa um resumo intermediário obrigatório quando a origem é a TF completa. Este resumo é uma *subfase de preparação*, não substitui a revisão final do Mermaid.

## Implementado nesta revisão

- Componente `AiStepFlow` para padronizar os passos em diagramas, recriação de TF e geração de casos de uma nova TF, preservando o fluxo já existente de posts/casos.
- Componente `AiBusyStatus` com estado e tempo real para respostas não-streaming da IA.
- **Editar TF com IA**: a resposta deixa de preencher o formulário imediatamente. O QA vê pares de valores atual/sugerido em **tela isolada**, seleciona campos e cenários e escolhe **Aplicar sugestões**; só **Salvar alterações** persiste dados. A confirmação fica depois da lista, sem cobrir campos no celular.
- A escolha inicial não marca campos humanos preenchidos para substituição automática. Se o texto de origem mudou após a geração, as sugestões não podem ser aplicadas até nova consulta. Voltar à configuração preserva propostas antigas, que podem ser reabertas sem custo de outra chamada; o fechamento com proposta não aplicada exige confirmação.
- **Diagramas**: configuração e solicitação em uma tela, Mermaid renderizado em outra para revisão, salvamento explícito. O modal bloqueia fechamento desde o instante em que a solicitação à NVIDIA começa, com resumo e geração acompanhados por tempo decorrido. Salvamentos duplicados sem alteração são bloqueados.
- **Nova TF**: na etapa de cenários, um painel de configuração/geração e outro de revisão; possibilidade de voltar ao contexto, preservar casos editados e finalizar com ou sem cenários.
- **Posts e casos de TF existente**: resultado fica fora da configuração; a pessoa pode voltar ao modelo sem perder o texto anterior; falhas da API preservam rascunhos.
- **Acessibilidade móvel**: correção do contraste do resultado esperado em `.qa-wizard-case > p`, reproduzido como 4,44:1 em 320 px, inferior ao mínimo de 4,5:1 para texto comum.

## Matriz de rotas e fluxos

| Área | Verificação |
| --- | --- |
| Acesso | Login, cadastro, recuperação, callbacks e ausência de exposição de tokens |
| Tarefas | Lista, busca, filtros, paginação, histórico, criação manual e assistida |
| TF aberta | Visão geral, cenários, execução guiada, edição, ações contextuais |
| IA na TF | Campos propostos, aprovação manual, posts, casos e diagramas |
| Recursos | Requisitos, cobertura, evidências, documentos, anexos, releases e bibliotecas |
| Administração | Acesso restrito sem permissão e smoke de papéis |
| Painel | Indicadores e andamento |
| Ferramentas | Versões/releases, comparações e utilitários |
| Perfil | Preferências, persistência do menu, colaboração |
| Biblioteca pública | Projeção limitada, publicação/despublicação explícita |
| Responsividade | 320, 390, 768 e 1366 px nos principais estados e modais |
| Acessibilidade | Axe-core WCAG A/AA; foco, nomes acessíveis e overflow |

## Validação técnica

Executar a partir de `frontend/`:

```bash
npm run typecheck
npm run lint
npm test
npm run build
node tests/browser-suites.mjs
```

**Resultado local: 22/22 suítes E2E aprovadas**, 139/139 unitários, ESLint, TypeScript e build aprovados. Após essa rodada, a preservação adicional de sugestões e o bloqueio imediato do modal de diagramas foram retestados de forma direcionada.

As 22 suítes E2E usam um Supabase simulado e resposta NVIDIA simulada. Os testes incluem novas verificações `browser-task-ai-approval.mjs`, `browser-qa-flow.mjs` e `browser-new-tf-source.mjs` para comprovar que **nenhum campo, cenário, post ou diagrama é persistido apenas por ter sido gerado**.

## Limitações e melhorias futuras identificadas

- As validações automatizadas não equivalem a testar todas as combinações de permissões RLS reais, tempo de resposta da NVIDIA na rede, leitores de tela físicos ou aparelhos móveis reais.
- A folha principal de CSS continua grande. Refatorar por componentes/tokens gradualmente, mantendo testes visuais de regressão.
- Mermaid, ELK e arquivos PDF ainda contribuem com bundles pesados. Medir tempo de carregamento e instrumentar performance antes de alterar divisão de chunks.
- Testar usuários com navegação somente por teclado, ampliação de 200% e rede lenta numa homologação adicional.
- As páginas legadas já removidas devem permanecer apenas como redirecionamentos de compatibilidade para links históricos e autenticação, até a expiração dos links enviados.

## Fontes de auditoria

Diretrizes das skills locais Impeccable, frontend-design, accessibility, web-quality-audit e playwright-e2e, junto à revisão das capturas do Chromium e aos 22 roteiros E2E. A skill Impeccable inclui referências, mas o checkout não possui o executável opcional de análise; não foi declarado resultado de execução desse binário.
