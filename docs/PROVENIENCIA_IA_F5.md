# F5 — Evidência de origem e validação de respostas IA

**Ordem de integração:** PR #89 (F0) → #90 (F1) → #91 (F2) → #92 (F3) → #93 (F4) → #94 (F5). A branch deste PR tem como base a F4. Não realizar merge ou deploy automático.

## Diagnóstico e objetivo

A F4 separou a extração de TF em campos e cenários, mas ainda aceitava saídas sintaticamente válidas que não tinham evidência de origem. A F5 exige prova por valor e vinculação dos cenários aos índices determinísticos do parser local. A verificação é independente no servidor e no navegador. Informação sem prova não pode preencher a TF automaticamente.

## Contrato dos novos modos da função qa-ai

- **Entrada:** o texto previamente preparado e autorizado pelo QA; `task-scenarios` recebe também até quatro seeds com `source_index` exclusivo.
- **Campos do modelo:** `{"fields":{"titulo":{"value":"...","evidence":"trecho literal"}}}`. O mesmo formato vale para cada outro campo permitido. Valores ausentes ficam vazios ou são omitidos.
- **Cenários do modelo:** `{"cenarios":[{"source_index":0,"titulo":"...","passos":"...","esperado":"...","observacoes":"...","evidence":"trecho literal"}]}`.
- **Saída da API:** `draft` contém somente itens com evidência verificada; os demais são separados em `review_fields` ou `review_scenarios`. Cada prova inclui `quote`, `source_line`, `status: verified | needs_review` e `reason`. `repaired: true` sinaliza JSON reparado e impede sua aceitação automática.
- A API calcula a linha da fonte de forma determinística. Nunca aceita número de linha sugerido pelo modelo.
- O contrato legado de extração sem `mode` continua disponível e não deve ser confundido com os dois modos faseados F5.

## Mecanismos de prevenção de conteúdo fabricado

1. `schemas.ts` usa **Zod 4.6.7** para exigir formato e chaves estritas. `jsonrepair 3.15.0` faz reparo apenas quando JSON.parse falha; respostas com `finish_reason=length`, chamadas de ferramenta, chaves extras, índice duplicado ou formato não reconhecido não são aceitas.
2. `grounding.mjs` procura a citação normalizando Unicode, caixa, acentos e espaços e calcula a primeira linha do texto efetivamente enviado. Uma citação inventada ou curta demais não é verificada.
3. Identificadores, números, versões e URLs citados em valores extraídos precisam existir na fonte. Uma sobreposição mínima de termos relevantes entre afirmação e citação é obrigatória; isso é uma heurística **conservadora**, não uma garantia lógica.
4. O frontend repete a conferência com Zod e uma função local independente. Resposta incoerente, reparada ou sem linha verificável é marcada como `needs_review`.
5. Em cenários, o índice precisa corresponder a um seed local. Um lote com cenário não comprovado continua pendente; a versão local não é substituída e os outros lotes já concluídos permanecem disponíveis para retomada.

## Fluxo de revisão do QA

- No segundo passo do assistente, o QA pode expandir os campos para visualizar citação, linha **do contexto enviado**, valor proposto e motivo da pendência.
- Campo com status `needs_review` fica fora do formulário automático. Para utilizá-lo, o QA deve assinalar que conferiu o relatório original e clicar **Aplicar manualmente**. A ação passa a ser edição humana, não dado verificado pela IA.
- No terceiro passo, o QA vê as provas dos cenários. Casos obtidos do parser local continuam sugestões, não resultados executados. Cenários novos começam desmarcados e só são salvos se selecionados na revisão.
- A TF é criada apenas na finalização atual, após ação explícita. A fonte original não é alterada nem substituída pelo extrato.

## Escopo e limitações

- A F5 cobre **a criação de TF faseada** (`task-fields` e `task-scenarios`). Os casos criativos a partir de requisitos, posts e diagramas serão tratados nas próximas fases.
- O parser **legado** `response.mjs` mantém o reparo anterior por regex para compatibilidade. Nos novos modos F5, o reparo utiliza `jsonrepair` e uma validação Zod estrita. O restante do sistema não foi migrado silenciosamente.
- Uma citação localizada comprova que o fragmento estava presente, mas **não prova logicamente** que toda a redação ou inferência da IA é correta. O QA continua responsável pela revisão. A aferição quantitativa de precisão será desenvolvida na F8.
- A verificação é feita contra o texto *enviado* após preparação. Em fonte compactada, a linha pode diferir da linha original; o usuário recebe essa indicação.
- Não foi criada fila distribuída ou persistência adicional de rascunhos/citações. O checkpoint da F4 continua apenas na sessão aberta do assistente.

## Segurança

Auth, JWT, CORS, RLS, RPC de 15 solicitações/minuto e orçamento da F3 foram preservados. A chave NVIDIA e as demais chaves privilegiadas ficam no servidor. Nenhuma saída de IA é executada como HTML/JS, nenhuma URL de modelo é acessada, nenhum valor de TF ou prompt é registrado nos logs e nenhuma autorização humana foi removida. Novas dependências do backend estão com versões fixas: Zod 4.6.7 (MIT) e jsonrepair 3.15.0 (ISC).

## Testes e implantação

Testes Node: `tests/ai-f5-grounding.test.mjs`. Testes Deno: `supabase/functions/qa-ai/schemas.test.ts`. Testes Vitest: `frontend/tests/task-evidence.test.ts` e atualização de `task-ai-phased.test.ts`. Workflow: `.github/workflows/qa-ai-f5-evidence.yml`, que contempla Node F0–F5, Deno check nas quatro Edge Functions, Deno test, TypeScript, lint, testes frontend e build. Respostas de modelo são simuladas; homologação NVIDIA real ainda será necessária.

**Rollback:** reverter a F5 e reimplantar frontend e função `qa-ai` anteriores, sem migração SQL. Integrar F0–F4 antes deste PR. Publicar frontend e Edge Function de forma coordenada e homologar antes de liberar a nova experiência.
