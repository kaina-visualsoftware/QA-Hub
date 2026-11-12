# F6 — Posts e casos por lotes, SSE e retomada

**Ordem:** PR #89 (F0) → #90 (F1) → #91 (F2) → #92 (F3) → #93 (F4) → #94 (F5) → PR F6. Sem merge automático e sem migração SQL.

## Diagnóstico

O gerador `qa-generators` produzia o post ou roteiro completo em uma única resposta SSE. Se o modelo atingisse `finish_reason=length` ou a conexão caísse após enviar texto, a geração era tratada como parcial e precisava ser refeita, desperdiçando o conteúdo anterior e a quota de 15 chamadas por minuto.

## Divisão determinística e compatibilidade

- Endpoint mantém o corpo legado e acrescenta `batch` opcional: `{version:1,index,total,stage,continuation,previousTail}`.
- Post: três seções — `overview` (título, comparação, caminho e imagem), `details` (comportamento detalhado), `closing` (TAREFA, JUSTIFICATIVA).
- Testes: cinco seções — `setup`, `positive`, `negative`, `regression`, `closing`. Categorias sem dados devem sinalizar ausência, não inventar testes.
- Servidor valida versão, etapa, índice, total, continuidade 0–2, comprimento da cauda (até 900 caracteres) e rejeita campos adicionais **antes** da consulta à NVIDIA ou da reserva da quota.
- Chamadas antigas sem `batch` continuam usando o prompt e o limite anteriores. Cada seção usa 2.300–3.500 tokens reservados para saída.

## Continuação e preservação

- O SSE mantém eventos `chunk`, `done`, `error`. `done.truncated=true` exige continuação; fechar sem `[DONE]` e sem `finish_reason` também é tratado como incompleto.
- O frontend mantém apenas **na memória da aba** as seções concluídas, a seção em andamento e a cauda de no máximo 900 caracteres, nunca em banco nem logs. Até duas continuidades automáticas por seção.
- Trechos já concluídos não são reenviados. Se a conexão cair depois de enviar dados, a parte recebida entra no checkpoint e a próxima solicitação continua daquela cauda.
- A junção elimina apenas sobreposição exata de prefixo/sufixo, não apaga conteúdo com semelhança semântica. Se não for possível concluir, o rascunho anterior permanece intacto. O QA pode retomar sem repetir seções finalizadas.
- Há contagem real de seções concluídas/total, botão de cancelar e espera da cota compartilhada da F2; continuações são cobradas por tentativa na RPC existente de 15/min. A divisão não contorna limites do serviço.
- A montagem só é entregue após todas as etapas. Posts passam pelo formatador e verificador já existente. Casos passam pelo parser, checagem de duplicados e só são anexados por ação expressa, iniciando **não executados**.

## Limites

- Processamento **sequencial**, evitando picos da cota gratuita; duas continuidades automáticas por seção. Não existe fila distribuída nem recuperação entre recargas ou dispositivos.
- Repetições não idênticas e cobertura incompleta ainda exigem revisão humana. Os testes F6 **não** substituem a validação de evidências F5 no extrator de TF; a geração de testes permanece uma proposta, não comprovação de execução.
- O gerador F6 ainda usa seu endpoint SSE original. A migração para o provedor compartilhado de F1 fica para F7.
- Não altera autenticação, RLS, armazenamento, chaves, scripts SQL ou publicação.

## Validação e rollback

CI: contratos Node F0–F6, Deno check das quatro Edge Functions e testes de schema F5, TypeScript, ESLint, Vitest de lote/continuação/cancelamento/regressão SSE, suíte frontend completa e build. Testes NVIDIA simulados; staging autenticado necessário antes de publicar.

Rollback: reverter o PR F6, reimplantar `qa-generators` e frontend anteriores. Não requer migração de dados.
