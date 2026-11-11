# F3 — Orçamento de contexto por tokens estimados

**Ordem de integração:** PR #89 (F0) → #90 (F1) → #91 (F2) → F3. A F3 é um PR separado baseado na branch da F2.

## Fontes oficiais e o que elas confirmam

- NVIDIA Build GLM-5.3-Flash: https://build.nvidia.com/z-ai/glm-5-3-flash/build — **1M** na ficha publicada; cartão cita 1.048.576 tokens.
- NVIDIA Build Nemotron-3.5 Lightning: https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b/build — **1M** na ficha publicada.
- API NVIDIA NIM de instâncias próprias: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html — descreve `/tokenize` e `/v1/messages/count_tokens` para containers próprios; **não confirma** esses endpoints de contagem no gateway gratuito compartilhado `integrate.api.nvidia.com`.

**Importante:** os modelos anunciam até 1M tokens, mas não há garantia de que o serviço gratuito aceitará esse tamanho, de que a janela inteira estará liberada por requisição, nem de quantidade de tokens reservados à saída. `contextTokens` no catálogo representa somente a *ficha do modelo*, e `maxOutputTokens` segue desconhecido. Não atribuir uma capacidade observada a um endpoint sem testar.

## Estratégia de medição

Sem tokenizador específico dos dois modelos nem endpoint autenticado de contagem confirmado, a F3 implementa **estimativa local** baseada em `ceil(bytesUTF8/3)` mais overhead fixo das mensagens. Isto não é uma contagem exata nem um limite superior matemático; português, emojis, SQL e strings repetidas podem produzir erros de estimação. O usuário vê explicitamente o aviso. Logs de chamada registram **somente números**, sem textos ou credenciais.

## Orçamento operacional QA Hub (não é limite NVIDIA)

| Modo | Contexto operacional estimado |
| --- | ---: |
| task (criação TF) | 150.000 |
| post / teste | 90.000 |
| revision | 90.000 |
| diagram / summary | 60.000 |
| semantic | 32.000 |

Para cada envio, o sistema reserva o `max_tokens` da saída, subtrai margem adicional de 18% do contexto operacional e compara **todas as mensagens (inclusive system)** ao orçamento disponível. Se exceder, `callModel()` retorna erro `context_exceeded` **antes da RPC que desconta o limite de 15 chamadas/min**. A API retorna erro `model_context_exceeded`, sem cortar texto.

No frontend, o compactador conserva os limites existentes de **30.000 caracteres da TF e 20.000 dos requisitos**, mas acrescenta limites estimados separados de `floor(caracteres/3)`. Texto muito denso em tokens, embora dentro do limite de caracteres, exige seleção extrativa com linhas identificadas, contagem de omissões e aprovação explícita do QA. A fonte original é preservada.

## Escopo e limites de entrega

- **F3 não implementa um tokenizador oficial** de GLM/Nemotron ou uma API de contagem remota que não foi confirmada no gateway gratuito.
- A seleção rápida continua heurística e não substitui a análise semântica por blocos já disponível. O QA pode escolher essa modalidade para cobrir partes da fonte antes de gerar.
- A F3 não faz chamadas adicionais NVIDIA e não modifica a RPC de cota, RLS, schema ou fluxos de aprovação.
- Um provedor ainda pode responder `context_exceeded` se o tokenizador real exceder o que a estimativa sugere. A validação real exige staging.

## Testes e rollback

CI: Node F0–F3, Deno 2 nas quatro funções, TypeScript/lint/Vitest/build frontend. Novos testes cobrem unicode, saída reservada, recusa antes da cota, logs sem prompt e contextualização na UI.

Rollback simples: reverter o PR F3 e reimplantar a versão anterior do frontend e da Edge Function `qa-ai`. Nenhuma migração de dados.
