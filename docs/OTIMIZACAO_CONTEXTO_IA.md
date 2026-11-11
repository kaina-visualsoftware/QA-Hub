# QA Hub — preparação de contexto para gerações longas

## Problema e decisão

A criação de TF já aceita fontes textuais extensas, mas os geradores de **post e casos** continuam usando contratos de **30.000 caracteres de TF** e **20.000 caracteres de requisitos**. Também há limites de *tokens* diferentes para cada modelo NVIDIA. O limite em caracteres da aplicação não deve ser apresentado como se fosse uma janela universal do provedor.

Foi adicionada uma etapa local **Compactador de contexto**, anterior ao envio NVIDIA, para preparar contextos longos de forma verificável. O algoritmo não faz chamadas de IA extras.

## Comportamento implementado (fase atual)

1. Textos que já cabem no contrato são enviados sem alteração. Pequena normalização de espaço em branco pode evitar cortes quando é suficiente.
2. Contextos acima do orçamento passam por seleção **extrativa**: linhas são identificadas por sua posição na fonte, a seleção percorre início/meio/fim de cada seção e prioriza requisitos, regras, cenários, negações, valores, IDs e resultados.
3. O painel mostra caracteres originais/enviados, trechos omitidos, omissões potencialmente relevantes, texto preparado e fonte integral. **Se houve seleção parcial, exige uma confirmação específica**, além do consentimento para enviar dados à NVIDIA.
4. Na criação de TF, o relatório original continua arquivado **sem substituição pelo extrato**. O extrato é usado apenas para a chamada de IA.
5. Em posts e roteiros, o contexto recebido pela API é o texto preparado revisado; o histórico, os requisitos aprovados e os documentos da TF não são apagados nem regravados pelo compactador.
6. A preparação é local, transitória, com orçamento independente para contexto da TF e requisitos. Nenhuma informação omitida é descrita como analisada pela IA.

**Atenção:** seleção extrativa não é resumo semântico; pode omitir uma regra importante, especialmente em relatórios com milhares de linhas igualmente relevantes. A revisão é obrigatória nesse caso. A validação do output humano permanece necessária e o compactador não marca testes como aprovados.

## Limites e condições atuais

- Criação de TF: trecho preparado com até **28.000 caracteres** quando a entrada não couber no orçamento.
- Geradores de post e casos: **30.000 de TF** e **20.000 de requisitos**, conforme o contrato da Edge Function `qa-generators`.
- O agregador de fontes da TF permite até 250.000 caracteres antes da seleção; acima desse teto retorna erro visível e não descarta dados silenciosamente.
- Uma entrada única acima de 2 milhões de caracteres deve ser dividida em fontes menores.
- A conversão de caracteres para tokens **não é exata**. Um modelo ainda pode retornar erro de janela de contexto. A aplicação deve reportar o problema sem chamar a geração de sucesso.

## Implementação F2/F3 — compactação semântica opcional (11/11/2026)

O QA pode optar entre **compactação rápida** (extrativa, sem chamadas adicionais) e **semântica por blocos**, disponível quando o contexto excede o orçamento. A opção semântica mantém o texto de cada fonte integralmente segmentado em partes de até 9.000 caracteres, com origem **TF** ou **REQ**, índice e linhas.

A nova função privada `qa-context` autentica o usuário, usa a quota compartilhada de 15 tentativas/minuto e solicita à NVIDIA fatos estruturados com **citações literalmente existentes na parte analisada**. Citações que não existirem são rejeitadas tanto na função quanto no frontend. O resumo livre da IA não é utilizado como prova; apenas o trecho textual verificado é enviado ao gerador final.

A preparação funciona em até oito partes por lote para permitir cancelamento e retomada. O usuário vê quantas partes serão analisadas, quantas já foram concluídas, quais não retornaram evidências, quantas citações foram rejeitadas, os identificadores de requisitos não cobertos e os fatos fora do orçamento. Há reanálise de **um bloco** sem reiniciar as demais partes, com revisão e autorização explícitas antes da geração.

A preparação é direcionada: **posts** recebem prioridade para antes/depois, implementação e permissões; **casos** para critérios, condições negativas, pré-requisitos e dados; **TFs** para problema, causa, alteração e evidências. Isso não garante precisão sem revisão humana nem cobertura integral. O original permanece na TF; os resultados semânticos são transitórios no navegador. Não foi criada tabela nem houve migração do banco.

### Implantação

1. Publicar a Edge Function `qa-context` com `index.ts` e `facts.mjs` e `verify_jwt=true`.
2. Validar os testes de segurança e as citações verificadas; publicar frontend após os checks.
3. Não substituir as funções `qa-ai` e `qa-generators`.

## Evoluções ainda recomendadas

### F2.1 — Consolidação semântica avançada (pendente)

- Dividir o texto em blocos por tópico e fronteiras de documento, preservando IDs, faixas da origem e vínculos de requisitos/cenários.
- Enviar os blocos sequencialmente para gerar **sumários estruturados por fonte**, não um único resumo solto. Cada regra, condição negativa, resultado, caminho e parâmetro deve referenciar o trecho que a originou.
- Consolidar os sumários sem criar requisitos novos e comparar as listas de IDs/critério/cenário **antes e depois**.
- Apresentar ao QA uma matriz de cobertura (origem analisada, omitida, inconsistente), com edição manual e revisão obrigatória.
- Respeitar a quota compartilhada de **15 requisições/minuto**, tempo máximo e cancelamento. Mostrar custo estimado em chamadas **antes** da execução; se atingir a quota, pausar o processo sem perder o que já foi revisado.
- Não armazenar textos ou resumos sensíveis em serviços externos adicionais. Caso seja necessário persistir progresso, usar recursos já protegidos por RLS com escopo de proprietário.

### F3.1 — Geração incremental do artefato e verificações cruzadas (pendente)

- Para **posts**, recuperar primeiro o que mudou, comportamento anterior/posterior, caminho e justificativa; para **casos**, critérios de aceite, exceções, permissões, dados e estados.
- Distribuir orçamento por fonte relevante, sem confundir hipóteses com testes executados.
- Validar o resultado contra os identificadores da fonte e destacar informações ausentes, contraditórias e cobertura parcial.
- Regenerar somente seções afetadas por alterações, com trilha de auditoria; preservar edições do QA.
- Medir taxa de requisitos citados, casos realmente distintos, tamanho de contexto e erros de janela, sem registrar textos/credenciais em logs.

### Qualidade e segurança

- Testar entradas pequenas (sem transformação), grandes, repetitivas, tabelas, SQL, negações e requisitos conflitantes.
- Exigir consentimento do usuário para envio e expor **exatamente** o extrato utilizado.
- Não aceitar instruções contidas nas fontes como comandos de sistema. Manter anonimização e filtros existentes.
- Não prometer cobertura de 100% com contexto parcial; sempre revisar conteúdo gerado antes de salvar ou anexar casos.
