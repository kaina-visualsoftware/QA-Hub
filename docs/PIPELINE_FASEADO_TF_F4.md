# F4 — Pipeline faseado da criação de TF (QA Hub)

**Base:** PR #92 (F3), ainda dependente de PR #91 (F2), #90 (F1) e #89 (F0). Integrar nessa ordem. Não existe deploy ou migração de banco nesta fase.

## Problema

Antes, a criação de uma tarefa no assistente fazia uma única requisição NVIDIA com todos os campos e até 20 cenários. Chamadas grandes disputavam orçamento de saída, tempo e quota. Falha ou truncamento podiam descartar os cenários e exigir que o QA repetisse o envio inteiro.

## Implementação

1. **Campos**: `qa-ai` aceita o modo `task-fields`, com orçamento de saída de 1.800 tokens e saída exclusiva de campos da TF. Não gera cenários.
2. **Cenários**: o parser determinístico local identifica cenários explicitamente presentes na fonte. O cliente envia grupos de até quatro para `task-scenarios`, com orçamento de saída de 2.600 tokens por lote. Cada item contém um `source_index` e seus passos/resultados de referência. Não há criação de casos não documentados; novos casos de cobertura continuam disponíveis separadamente na etapa 3.
3. **Execução**: no máximo duas requisições de cenários em paralelo por criação. Cada solicitação conta normalmente na quota compartilhada da RPC (`qa_ai_claim_minute_request`), com 429 e espera controlados pela F2. Os modelos e a verificação de orçamento F3 continuam na camada compartilhada.
4. **Retomada**: `task-ai-phased.ts` conserva em memória da aba, somente enquanto o assistente estiver aberto, os campos e lotes já concluídos. Após cancelamento ou falha de um lote, só os pendentes são reenviados na próxima análise. Não se salva texto ou token nos logs.
5. **Fallback e revisão**: dados locais originais preenchem lacunas; falhas parciais ficam **visíveis** como pendentes. O QA pode editar campos, marcar quais cenários usar e somente ao concluir o assistente salva a TF e os casos em estado **não executado**. Reanálises não sobrescrevem títulos/campos já ajustados manualmente nem eliminam cenários existentes.

## Limites explícitos

- Entrada do modo faseado: até 30.000 caracteres preparados, preservando o original completo para arquivo após confirmação humana.
- Lotes: 4 cenários por chamada, no máximo 2 em voo; a primeira versão processa com IA até **20 cenários locais** (mais casos permanecem preservados localmente e sujeitos à revisão, sem afirmar cobertura completa).
- Se o parser local não extrair cenários explícitos, não se inventam casos: o QA pode usar a etapa independente de geração de casos posteriormente.
- A retomada funciona apenas na mesma instância aberta do assistente, não entre recargas, navegadores ou computadores. Uma fila distribuída exigiria persistência segura e nova fase.
- Erros de autenticação, cota não resolvida ou problemas de permissão não viram sucesso local silencioso. Quando o provedor falha temporariamente, a interface identifica os dados locais e as etapas incompletas.
- A F5 trará confirmação estrita de citações e schema; a F4 só vincula cenários por índice de origem e exige revisão humana, não garante que o modelo reescreveu o texto exatamente.

## Segurança, validação e rollback

Preservados JWT, RLS, origem CORS, cabeçalhos, formato legado sem `mode`, limites de tokens da F3, chave NVIDIA apenas no servidor e cota de 15 solicitações/minuto. Os novos modos passam pelas mesmas verificações de autenticação. Sem gravação de dados pelo backend.

Testes simulados sem API NVIDIA real: `node --test tests/ai-f4-stages.test.mjs`; frontend `npm run typecheck`, `lint`, `test`, `build` e CI Deno nas quatro funções. O conjunto cobre payload inválido, índices inventados/duplicados, truncamento, lotes, concorrência, fallback e retomada.

Publicar apenas após integrar F0–F3 e homologar as chamadas NVIDIA reais em staging. **Rollback:** revertendo o PR F4, o modo legado monolítico permanece disponível e não é necessária migração de banco.
