# F0 — Diagnóstico e observabilidade do pipeline de IA

**Data:** 11/11/2026. **Estado:** diagnóstico baseado no código \`main\` anterior a esta fase e em testes locais simulados. Nenhuma hipótese abaixo constitui confirmação de uma falha da NVIDIA em produção.

## Objetivo e critérios de aceite

Instrumentar **qa-ai**, **qa-generators**, **qa-context** e **qa-revisions** com rastreio por requisição e tentativa, sem alterar a lógica de seleção de modelos, a cota ou a saída funcional. Toda tentativa upstream precisa produzir exatamente um evento com **metadados apenas**, inclusive em timeout, resposta truncada e erro HTTP. Uma chamada que nem chegou à NVIDIA (cota negada) deve ter \`stage=quota\`.

O registro deve permitir comparar falhas e latência por modo/modelo, e correlacionar tentativas de uma mesma requisição. F0 **não** implementa fila, retry, breaker, tokenizador, \`callModel()\` ou novo contrato HTTP; são fases posteriores.

## Fatos verificados no código

| Função | Implementação atual | Limitações observadas |
| --- | --- | --- |
| \`qa-ai\` | Descoberta via \`/models\`, modelos GLM e Nemotron, 35 s por modelo, resposta única em JSON para criação de TF e fallback local no cliente | A criação permanece uma chamada monolítica com campos + cenários, e \`fallback:true\` não classifica a falha |
| \`qa-generators\` | SSE para posts/casos, timeout de 110 s, \`max_tokens\` 3.500/11.000, \`done.truncated\` quando \`finish_reason=length\` | A saída é grande por chamada, sem divisão e sem continuação automática |
| \`qa-context\` | Blocos de até 9.000 caracteres, 30 s por modelo, citações exatas, progresso no cliente | 429 encerra o lote atual; não há espera automática pelo Retry-After |
| \`qa-revisions\` | Regeração isolada autenticada, 52 s por modelo | Sem componente compartilhado de provedor ou telemetria estruturada |
| Todas | RPC \`qa_ai_claim_minute_request\` (15 tentativas/minuto compartilhadas), modelo reserva quando a tentativa falha | Cada fallback consome sua própria vaga; não há deadline global nem comparação confiável de latência |
| Frontend | \`task-ai.ts\` usa timeout de 95 s e extração local recuperável; contexto rápido e semântico podem exigir revisão antes do envio | A disponibilidade da NVIDIA e os dados estruturados não são garantidos |

A validação de \`finish_reason=length\` existe em \`qa-ai/response.mjs\` e \`qa-context/facts.mjs\`, mas não evita o consumo de tempo e cota antes do erro. Os orçamentos do contexto atual são **caracteres**, não tokens específicos dos modelos.

## Hipóteses a confirmar após publicar a F0 (não são diagnósticos fechados)

1. **Timeout:** a combinação de 35 s por modelo e de um payload grande aumenta o risco de esgotar a chamada; comparar \`elapsed_ms\`, \`outcome=timeout\` e \`mode\`.
2. **Reasoning e truncamento:** GLM pode consumir o orçamento de saída com raciocínio, elevando \`finish_reason=length\`. Confirmar com \`usage.reasoning_tokens\` **se** o provedor retornar esse campo.
3. **Cota por fallback:** duas tentativas por TF e lotes da análise semântica podem elevar a taxa de \`rate_limited\`. Filtrar por \`stage=quota\` e \`fallback_model\`.
4. **Tokens vs. caracteres:** mesmo dentro do limite de caracteres, um texto pode ultrapassar a janela em tokens. Nesta fase \`prompt_tokens_est = ceil(prompt_chars / 4)\` é somente uma **estimativa heurística**; comparar com \`usage.prompt_tokens\` quando disponível.

Não concluir que houve mudança da API NVIDIA sem logs do provedor ou evidência documental.

## Contrato dos eventos F0

Evento \`console.info("qa_ai_attempt", {...})\` com:
\`event\`, \`version\`, \`correlation_id\`, \`stage\` (\`discovery|quota|provider\`), \`mode\`, \`model\`, \`prompt_chars\`, \`prompt_tokens_est\`, \`max_tokens\`, \`elapsed_ms\`, \`http_status\`, \`finish_reason\`, \`usage\` (contagens, se informadas), \`outcome\`, \`attempt\`, \`fallback_model\`.

**Privacidade:** todos os campos são reconstituídos por lista de permissão no módulo \`supabase/functions/_shared/ai-observability.mjs\`. Nenhum texto de tarefa, fonte, resposta de IA, SQL, cabeçalho Authorization ou token passa ao logger. IDs de correlação recebidos do cliente são aceitos somente se forem UUIDs válidos; do contrário, o servidor gera um novo UUID. Eventos de cota negada usam \`stage=quota\` e não significam consumo de vaga. Quando a NVIDIA não envia \`usage\` ou \`finish_reason\`, os valores são \`null\` ou \`unknown\`.

**Interpretação:** \`outcome=ok\` refere-se ao contrato local da resposta; quando o SSE fecha em \`length\`, o resultado pode ser parcialmente exibido mas o evento fica \`length\`. \`http_status=0\` significa que não houve resposta HTTP. \`elapsed_ms\` mede a tentativa, não necessariamente o tempo total do job.

## Fixtures de testes (100% sintéticas)

Arquivos em \`frontend/tests/fixtures/ia/\`: TF curta, média, longa (80k+), só requisito, só roteiro, rótulos de interface, injeção de prompt e tabela/SQL. Os exemplos não vieram de produção; qualquer ocorrência de nome, usuário, código, documento ou senha é inventada. A fixture longa preserva requisitos em diferentes posições para testar perda silenciosa de contexto.

## Verificação e limites

- Node: \`node --test tests/ai-f0-telemetry.test.mjs tests/ai-f0-contract.test.mjs\`.
- Frontend: \`npm ci\`; \`npm run typecheck\`; \`npm run lint\`; \`npm test\`; \`npm run build\`.
- Edge Functions: testes locais \`*.test.mjs\` existentes; os testes com NVIDIA real, RLS real e desempenho de produção exigem ambiente e credenciais controlados.
- Revisão de logs: coletar apenas campos acima, identificar cada código e comparar p50/p95 por modelo **após implantação autorizada**.

## Segurança, publicação e rollback

Nenhuma alteração de tabela, RLS, origem autorizada, verificação de JWT, chave da NVIDIA ou cota compartilhada é necessária. Não habilitar registro de corpos HTTP na infraestrutura. Implantar somente após revisão do PR e testes. Para rollback, voltar as Edge Functions à versão anterior; a instrumentação não cria dados persistidos e não exige migração. A F1 deve reutilizar o evento e substituir as chamadas diretas pela camada central, sem mudanças abruptas no contrato externo.
