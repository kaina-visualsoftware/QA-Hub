# F1 — Camada compartilhada NVIDIA Build

A F1 é construída sobre o PR da F0 e migra **somente \`qa-ai\`**. Os demais endpoints continuam com suas chamadas atuais, mantidas por compatibilidade, até F7.

## Arquivos e contrato

- \`_shared/llm/models.mjs\`: registro declarativo da prioridade GLM-5.3 Flash → Nemotron-3.5 Lightning, parâmetros por modelo/modo, \`discoverModels()\` com cache TTL de 3 min e deduplicação de GET concorrente. **\`contextTokens\` e \`maxOutputTokens\` são \`null\` até confirmação**: não confundir teto do app com especificação do endpoint NVIDIA.
- \`_shared/llm/errors.mjs\`: \`ProviderError\` com \`kind\` seguro (\`timeout\`, \`length\`, \`empty\`, \`rate_limited\`, \`auth\`, \`context_exceeded\`, \`upstream\`, \`aborted\`, \`schema_invalid\`, \`breaker_open\`, \`quota_unavailable\`). Não propaga texto bruto do provedor.
- \`_shared/llm/call-model.mjs\`: \`callModel({apiKey,model,messages,mode,stream,deadlineAt,timeoutMs,firstTokenTimeoutMs,idleTimeoutMs,reserveAttempt,onAttempt,...})\`. SSE é padrão; a migração de \`qa-ai\` usa explicitamente \`stream:false\` para conservar o formato JSON existente.

## Tempo e recuperação

Cada chamada usa prazo global \`deadlineAt\`, timeout por modelo, limite até o primeiro token e entre chunks SSE. Repetições apenas em falhas transitórias (\`timeout\`, \`empty\`, \`upstream\` 5xx), com backoff exponencial e jitter; \`429\` só é repetido quando \`retryOnRateLimit:true\`, usando \`Retry-After\`. \`401\`, \`400\` de schema e janela excedida não são repetidos com o mesmo prompt.

\`qa-ai\` mantém \`maxRetries:0\` **nesta fase** para não aumentar silenciosamente o número de tentativas frente à cota compartilhada e para preservar o contrato externo. O módulo suporta tentativas adicionais com a função \`reserveAttempt\`, que precisa chamar a RPC \`qa_ai_claim_minute_request\` **antes de cada tentativa**, não apenas no início do job. O plano sugeriu reservar várias vagas antecipadamente; isso **não foi implementado** porque a RPC atual reserva uma vaga por chamada e uma reserva múltipla exigiria mudanças no SQL e na semântica da cota. Não burlamos o limite de 15/minuto.

Circuit breaker leve: após três falhas transitórias, suspende o modelo por dois minutos **na mesma instância**. Não é um estado distribuído entre Edge Function isolates; não altera RLS ou saldo da cota. Modelo pulado por breaker não chama a RPC. Um modelo seguinte pode ser tentado.

## Compatibilidade e limites

- \`qa-ai\`: mantém validações, autorização JWT, CORS, modelos gratuitos, retorno \`{draft|mermaid|summary,model,provider}\`, fallback local, erros HTTP e diálogos existentes. Sem streaming para a UI nesta etapa.
- \`qa-generators\`, \`qa-context\`, \`qa-revisions\`: não migram em F1; F7.
- Cache de modelos: em memória do isolate e por URL/lista de modelos; nenhum token ou texto da TF é gravado nele. Falha na descoberta mantém a lista explícita de modelos autorizados sem cachear erro.
- O registro de modelos é \`.mjs\` para ser testado com Node e importado diretamente pelo Deno, sem transpilar TypeScript; a função \`models.ts\` solicitada no plano é implementada como módulo ESM tipável na F1. Tipagem de runtime ocorre na validação das chamadas.
- Não foi criada tabela ou migração. Nenhuma chamada NVIDIA real faz parte dos testes sem credenciais dedicadas.
- A F0 fornece \`correlation_id\` e telemetria sem conteúdo sensível. Toda tentativa continua consumindo a cota por RPC.

## Testes e rollback

\`node --test tests/ai-f1-provider.test.mjs\` cobre cache, modelos, erro estruturado, 429/Retry-After, 503/retry, deadline, breaker, SSE fragmentado/incompleto, token de autenticação e preservação de quota. Execute também \`node --test tests/ai-f0-*.test.mjs tests/nvidia-*.test.mjs\` e frontend \`typecheck\`, \`lint\`, \`test\`, \`build\`. Publicar em staging antes de produção.

Rollback: voltar \`qa-ai\` à implementação anterior e manter os módulos F1 sem uso. O rollback não altera dados, RLS, tabela de cota ou contratos externos.
