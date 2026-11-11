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

## Próximas fases recomendadas

### F2 — Compactação semântica em múltiplas passagens

- Dividir o texto em blocos por tópico e fronteiras de documento, preservando IDs, faixas da origem e vínculos de requisitos/cenários.
- Enviar os blocos sequencialmente para gerar **sumários estruturados por fonte**, não um único resumo solto. Cada regra, condição negativa, resultado, caminho e parâmetro deve referenciar o trecho que a originou.
- Consolidar os sumários sem criar requisitos novos e comparar as listas de IDs/critério/cenário **antes e depois**.
- Apresentar ao QA uma matriz de cobertura (origem analisada, omitida, inconsistente), com edição manual e revisão obrigatória.
- Respeitar a quota compartilhada de **15 requisições/minuto**, tempo máximo e cancelamento. Mostrar custo estimado em chamadas **antes** da execução; se atingir a quota, pausar o processo sem perder o que já foi revisado.
- Não armazenar textos ou resumos sensíveis em serviços externos adicionais. Caso seja necessário persistir progresso, usar recursos já protegidos por RLS com escopo de proprietário.

### F3 — Geração guiada por objetivo (busca por evidência)

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
