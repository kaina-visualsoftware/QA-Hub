# F7 — Unificação das chamadas NVIDIA nas Edge Functions

**PR empilhado:** #89 F0 → #90 F1 → #91 F2 → #92 F3 → #93 F4 → #94 F5 → #95 F6 → F7. Não integrar F7 antes das fases anteriores. Sem merge/deploy automático.

## Objetivo e escopo

Remover os três clientes HTTP NVIDIA duplicados de `qa-generators`, `qa-context` e `qa-revisions`, mantendo a API do navegador e o contrato funcional de cada função. Todas as quatro funções usam agora o registro de modelos e o executor `callModel()` da F1, por meio de um adaptador de Edge Function que centraliza observabilidade, reserva de cota, erros e transporte SSE.

## Alterações

- `_shared/llm/edge-runtime.mjs`: `edgeModels()` (descoberta cacheada), `edgeHooks()` (reserva RPC antes de cada tentativa, telemetria sanitizada e circuit breaker), `edgeErrorHttp()` (erros e Retry-After), `edgeJsonModels()` (modelos JSON, timeout, fallback e parsing do endpoint) e `edgeStreamingModels()` (SSE incremental, cancelamento e HTTP 429 antes do streaming).
- `qa-context`: mantém validação de `chunkId`, parser `parseModelFacts()` e contrato `{chunkId,source,goal,facts,unverified,model,provider}`. JSON com `response_format: json_object` e orçamento F3.
- `qa-revisions`: mantém validação da operação, parser `normalizeRevision()` e `{operation,proposal,model,provider}`. Não altera rascunhos sem aprovação.
- `qa-generators`: preserva modo legado e F6 (`batch` opcional), eventos `chunk/done/error`, `done.truncated`, CORS e `X-Request-ID`. Espera o primeiro delta antes de assumir HTTP 200. Erros antes do primeiro trecho retornam HTTP 429/503 quando cabível; depois, erros via SSE sem trocar de modelo para evitar duplicação do texto já enviado.
- A RPC `qa_ai_claim_minute_request` permanece com 15 chamadas/min por usuário para cada tentativa HTTP real, inclusive fallback e continuações. Modelo ignorado pelo circuit breaker não consome cota.
- O mecanismo F1 fornece timeout, first-token timeout, idle timeout, breaker por isolate, controle de token F3 e configuração por modelo.

## Segurança e limites

- JWT, rejeição de usuários anônimos, CORS allowlist e mensagens de erro sanitizadas permanecem nas funções. Nenhum prompt/resposta é registrado nos logs; chaves continuam no Edge.
- Status HTTP não pode mudar após o primeiro byte de SSE; falhas posteriores produzem evento `error` e não um falso `done`. A F6 pode preservar a parte recebida.
- Descoberta e breaker são caches locais à instância, não globais. Não garantem disponibilidade dos modelos nem cobertura semântica. Revisão do QA é obrigatória.
- Não há novas chaves obrigatórias nos contratos do navegador, nem alteração de SQL, RLS ou frontend.

## Testes, homologação e rollback

CI Node F0–F7 com mocks de HTTP e RPC para fallback JSON, cota, provider 429, chunks SSE, truncamento e perda de conexão; Deno check nas quatro Edge Functions e Deno test F5; TypeScript, lint, Vitest, testes frontend completos e build.

**Homologação pendente:** validar SSE real, cota, modelos e frontend autenticado em staging após integrar F0–F6. Testes sintéticos não confirmam disponibilidade NVIDIA.

**Rollback:** revert da F7 e reimplantação das versões anteriores de `qa-generators`, `qa-context` e `qa-revisions`. A F7 não exige migração de dados.
