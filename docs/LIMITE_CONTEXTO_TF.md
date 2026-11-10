# Limite de entrada na criação e regeração de TF

## Conclusão da investigação

O limite fixo de **20.000 caracteres era uma regra do QA Hub**. Ele não foi identificado como uma exigência da API NVIDIA. O frontend rejeitava o texto por comprimento e a Edge Function `qa-ai` repetia essa validação antes de chamar o provedor. A função também rejeitava requisições com Content-Length acima de 80.000 bytes.

Referência oficial consultada em 10/11/2026: [NVIDIA — Chat Completions](https://docs.api.nvidia.com/nim/reference/create_chat_completion_v1_chat_completions_post). A API recebe mensagens e expõe parâmetros em tokens, incluindo `max_tokens` para o orçamento de **saída**. Esse parâmetro não é um teto de caracteres da entrada. A janela de contexto de entrada/saída depende do modelo e do serviço utilizado.

A existência do bloqueio local está demonstrada pelo código anterior; ela não requer atribuir ao provedor um limite que não foi comprovado. Não foi executada uma chamada NVIDIA real com credenciais nesta verificação. Os testes funcionais utilizam respostas simuladas.

## Alteração

- A criação de TF aceita colar contexto acima de 20 mil caracteres e não trunca a entrada pelo antigo maxLength do formulário.
- A regeração aceita fontes arquivadas longas.
- O cliente e a Edge Function deixaram de impor os limites fixos de caracteres/bytes ao relatório da TF.
- O rascunho opcional e o arquivo do texto original deixam de exigir até 30 mil caracteres.
- O texto continua sendo limpo de rótulos de interface copiados. Isso não é um resumo nem um corte por tamanho.
- Não foi adicionado botão de resumo para 20 mil caracteres: ele havia sido solicitado somente se esse fosse um limite NVIDIA.
- Se todos os modelos disponíveis rejeitarem a janela de contexto em tokens, a função retorna uma mensagem específica, sem truncar o texto nem apresentar o erro como um limite universal de caracteres.

Não existe promessa de entrada literalmente infinita: memória do navegador, transporte, execução da função e janelas dos modelos continuam finitos. Os limites dos campos salvos, da geração de casos/posts e das partes do pipeline de diagramas são contratos distintos e não foram removidos como efeito desta alteração.

## Publicação

1. Aplicar `supabase/qa_task_source_unbounded.sql`, após a migração existente de requisitos/fontes. Ela amplia somente fontes textuais; mantém a restrição das extrações de arquivos. É transacional e reaplicável.
2. Publicar `supabase/functions/qa-ai`, incluindo o novo módulo `input.mjs`.
3. Publicar o frontend.

Sem atualizar a Edge Function, o backend antigo continuará rejeitando relatórios acima de 20 mil caracteres. Sem a migração, o arquivamento integral de originais acima de 30 mil continuará sendo rejeitado pelo banco.

## Evidências de teste

- Contrato da entrada da função: relatório acima de 80 mil caracteres aceito; partes de diagramas mantêm seu contrato separado.
- Teste do cliente: payload completo, incluindo o marcador final, enviado para `qa-ai`.
- Chromium: criar TF a partir de contexto acima de 80 mil caracteres, revisar e finalizar, arquivando o texto original completo.
- Chromium: regerar sugestões a partir de fonte arquivada longa, mantendo aprovação e salvamento explícitos.
- SQL local: migração reaplicada e fonte textual de 110 mil caracteres armazenada sem truncamento.
