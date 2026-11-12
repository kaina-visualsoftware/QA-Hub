# F8 — Qualidade da IA, goldens, métricas e rollout seguro

**Sequência dos PRs:** F0 #89 → F1 #90 → F2 #91 → F3 #92 → F4 #93 → F5 #94 → F6 #95 → F7 #96 → F8 #97.

A F8 é um PR empilhado na F7. Não executar merge ou deploy sem integrar os anteriores e homologar os contratos do provedor.

## O que foi entregue

A F8 combina uma barreira de regressão de qualidade, diagnóstico operacional local para administradores e flags de liberação configuráveis no servidor. Não adiciona tabela, RLS, secrets, fila ou endpoint de leitura de logs. O modelo NVIDIA não é chamado na CI.

### 1. Golden set offline — NÃO representa precisão da NVIDIA

Os 19 testes de referência em tests/fixtures/ai-f8-goldens.json usam oito relatórios sintéticos existentes em frontend/tests/fixtures/ia: curta, media, longa-80k, apenas-requisito, apenas-roteiro, rotulos-interface, instrucao-maliciosa e tabelas-sql.

O script scripts/ai-f8-evaluate.mjs executa a lógica real de conferência determinística de evidência da F5 e produz relatório JSON, com:

- verified_recall_percent: proporção das afirmações positivas sintéticas corretamente reconhecidas;
- negative_rejection_percent: proporção das propostas inventadas/contraditórias rejeitadas;
- false_accept_count: casos negativos aceitos;
- mismatches: divergências em relação aos resultados esperados.

O resultado passa somente se todos os 19 casos forem corretamente classificados, todas as oito categorias estiverem presentes e nenhuma informação inventada for aceita. O workflow salva o relatório como artifact 'f8-offline-quality-report' por 14 dias.

**Não afirmar que a IA tem 100% de precisão:** o benchmark testa o nosso validador, não gera texto com modelos NVIDIA. A medição da qualidade real de geração precisa de respostas registradas com consentimento, referência revisada por QAs e avaliação qualitativa; não existe coleta automática desse conteúdo nesta fase.

Um defeito real revelado pelo golden foi corrigido: texto que diz 'teste ainda não executado' não pode validar 'teste aprovado'. A regra de contradição foi incluída tanto no servidor como no navegador.

### 2. Diagnóstico do provedor no painel administrativo

A seção 'Diagnóstico do provedor' fica em Administração após getAdminRole confirmar a autorização real no Supabase. A UI importa arquivos JSON/JSONL de até 2 MB com eventos F0 qa_ai_attempt versão 1, em um dos formatos:

- Array JSON de eventos;
- Objeto JSON com uma lista events;
- Uma linha JSON por evento (JSONL);
- Event log com campo event_message contendo a marca qa_ai_attempt seguida de JSON válido.

O processamento ocorre **na memória da aba**, sem upload, sem localStorage e sem consulta de dados privados da plataforma. Qualquer campo desconhecido é descartado: o painel mantém apenas modo, modelo, estágio, resultado, latência, código HTTP, fallback e contagens numéricas de tokens. Não renderiza texto de TF, respostas, tokens de acesso, URL, header ou prompt.

As métricas são somente dos eventos importados:

| Indicador | Cálculo |
| --- | --- |
| Sucesso por tentativa | outcome=ok / eventos com stage=provider |
| Bloqueio de cota | stage=quota e outcome=rate_limited |
| Rate limit NVIDIA | stage=provider e outcome=rate_limited |
| Fallback | Tentativas provider com fallback_model=true |
| Truncamento | outcome=length ou stream_overflow |
| Latência P50/P95 | Percentis nearest-rank de elapsed_ms informado |
| Uso de tokens | Soma de estimativas ou contagens do provedor quando disponíveis |

**Limitações:** o painel não mostra telemetria em tempo real e não prova a conclusão do documento: uma requisição SSE com HTTP 200 pode ter terminado em erro. Eventos faltantes geram viés. Exportações cujo event_message não contenha JSON válido precisam ser normalizadas antes de importar. O painel não acessa a API de gerenciamento do Supabase, não salva os logs e não envia relatórios a outros serviços.

Alertas comparativos só são exibidos com 20 ou mais tentativas do provedor: sucesso abaixo de 90%, P95 acima de 40 segundos ou truncamento acima de 5%. Para amostras menores, exibir 'amostra insuficiente' e não concluir melhora ou piora.

### 3. Flags de implantação controlada (Edge, não frontend)

| Variável de ambiente | Padrão quando ausente | Uso |
| --- | --- | --- |
| QA_AI_F8_ENABLED | true | false desativa toda a IA online |
| QA_AI_F8_GENERAL_PERCENT | 100 | Percentual para todas as chamadas |
| QA_AI_F8_TASK_PERCENT | 100 | Somente task-fields e task-scenarios |
| QA_AI_F8_GENERATOR_BATCH_PERCENT | 100 | Somente solicitações F6 com batch |
| QA_AI_F8_SEMANTIC_PERCENT | 100 | Análise semântica |
| QA_AI_F8_REVISION_PERCENT | 100 | Revisão direcionada |

Percentuais são inteiros de 0 a 100. O bucket é determinístico pelo ID autenticado e pela funcionalidade, usando hash não criptográfico **apenas para distribuição**; não concede acesso ou permissões. Um percentual malformado falha fechado para aquela área. Variáveis ausentes mantêm o comportamento atual da F7 (100%).

As quatro Edge Functions continuam exigindo JWT, validação da sessão, CORS, RLS e reserva de cota RPC de 15 tentativas/minuto. Flags são avaliadas **depois da autenticação**. Não há IDs de usuários/buckets impressos nos logs. O desligamento produz o erro F2 feature_disabled, não retentável; o texto e o rascunho existentes ficam preservados.

O desligamento de uma função não converte automaticamente a resposta da IA em sucesso local. O fluxo corrente permanece sujeito a revisão e, conforme a interface, pode exigir nova tentativa ou a operação sem IA.

### Checklist recomendado de liberação

1. Homologar os PRs F0–F8 em sequência, conferindo modelos reais, CORS, quotas e tipos dos eventos.
2. Estabelecer baseline operacional com exportações de períodos equivalentes; conferir também os casos de referência.
3. Habilitar canário de 5% para a função escolhida, revisar taxa de erro e latência, depois avançar para 25%, 50% e 100%.
4. Se houver regressão, configurar 0% para o recurso afetado ou QA_AI_F8_ENABLED=false para bloqueio geral, sem alterar histórico da TF.
5. Registrar mudanças operacionais fora do repositório com revisão humana. Nunca incluir dados pessoais, relatórios reais, segredos ou URLs assinadas no golden set ou na CI.

## Verificações e rollback

O workflow qa-ai-f8-quality.yml valida golden set e contratos Node F0–F8, TypeScript/ESLint, Vitest, Deno check nas quatro funções, testes de evidência e build de produção. A execução é sintética e não utiliza credenciais NVIDIA reais.

Rollback: desligar os recursos via flags para contenção, depois reverter a F8 e reimplantar frontend e as funções afetadas, após aprovar F7. Não há alteração SQL nem nova estrutura de dados.

**Segurança:** nunca armazenar textos de TF, CPFs, credenciais ou cabeçalhos em logs, fixtures ou artefatos de CI. O dashboard administra exclusivamente metadados permitidos.
