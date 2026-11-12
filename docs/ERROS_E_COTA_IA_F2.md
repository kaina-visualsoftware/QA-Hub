# F2 — Contrato de erros e retomada automática de cota

Dependências: PR #89 (F0), PR #90 (F1), depois F2. Não integrar fora de ordem.

## Resumo

As quatro Edge Functions preservam os códigos legados no campo error e adicionam code estável, retryable, request_id e retry_after_seconds somente quando conhecido. O frontend pode aguardar a cota de 15 solicitações por minuto sem perder progresso.

## Códigos

| Condição | Código | Conduta |
| --- | --- | --- |
| 401 ou 403 | unauthorized / forbidden | Solicitar autenticação; nunca repetir automaticamente |
| 400, 413 | input_invalid ou model_context_exceeded | Corrigir entrada |
| 429 da cota RPC | quota_exhausted | Esperar Retry-After da RPC |
| 429 NVIDIA | provider_rate_limited | Esperar Retry-After, se recebido |
| 503/504 | provider_unavailable / provider_timeout | Informar; não repetir indefinidamente |
| Saída inválida | output_invalid | Preservar original e exigir revisão |

## Retomada

O helper frontend/src/lib/ai-retry.ts somente repete operações que receberam HTTP 429 antes de começar a resposta. No máximo duas repetições e até 120 segundos de espera acumulada. Sem Retry-After, aplica espera estimada de 15 segundos identificada na interface (não é disponibilidade confirmada). Um AbortController cancela a espera e impede o novo envio.

Os blocos semânticos concluídos continuam intactos, e apenas o bloco rejeitado é reenviado. No streaming de posts/casos, se uma conexão já entregou texto, não há repetição automática do stream nem duplicação do resultado. Nenhum resultado é salvo ou aprovado automaticamente.

## Segurança e rollback

A RPC qa_ai_claim_minute_request permanece responsável por reservar cada tentativa real. Não há fila distribuída, bypass de limite, alteração de RLS ou migração. Logs são de metadados, sem texto de TF, JWT, prompts ou saída de IA. Restaurar frontend e Edge Functions anteriores reverte a F2 sem migração.

## Testes

Node: node --test tests/ai-f2-error-contract.test.mjs tests/ai-f2-integration.test.mjs
Frontend: npm run typecheck && npm run lint && npm test && npm run build
Edge: deno check nas quatro funções. NVIDIA real requer homologação em staging antes de deploy.
