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

### F2.1/F3.1 — Revisão cruzada e regeneração isolada (11/11/2026)

- **Suspeitas de divergência**, não decisões: a aplicação compara fatos literalmente citados de diferentes partes e apresenta possíveis diferenças de valores, permissões/negações e situação. A comparação exige assunto similar ou um identificador comum. O confronto intencional **Anteriormente/Agora** não é tratado como contradição automaticamente.
- O QA revisa cada par com as duas citações e respectivas linhas e escolhe **priorizar A**, **priorizar B** ou **manter ambas como pendência**. Sem decisão, a geração semântica fica bloqueada. A seleção influencia somente o contexto transitório enviado ao modelo; **a documentação original não é editada**.
- Quando ambas permanecem, o contexto recebe um alerta de divergência não confirmada e orienta a IA a não afirmar qual versão é verdadeira.
- Em **posts**, é possível selecionar 12–9.000 caracteres diretamente na caixa de texto, solicitar uma redação alternativa e aplicar só naquela faixa, mantendo todo o texto restante, inclusive BBCode. A prévia lado a lado é obrigatória.
- Em **casos de teste**, cada cenário pode ser revisado individualmente; título, passos e resultado esperado da sugestão só substituem aquele caso após aprovação. Casos não enviados para revisão, seleção atual e identificador original permanecem.
- A nova Edge Function `qa-revisions` autentica com JWT, respeita a mesma quota de 15/min da NVIDIA, não salva texto no servidor e nunca modifica registros sem a confirmação posterior do QA. Alterações aceitas aparecem em um histórico **somente na sessão atual**. O salvamento definitivo continua na ação existente do usuário.

**Limitações:** a identificação automática de contradições é heurística e pode gerar falsos positivos ou deixar casos reais sem alerta. Uma divergência pode representar versões diferentes; só o QA pode decidir. A reescrita isolada ainda pode propor fatos incorretos: nada é aplicado automaticamente e a revisão humana continua obrigatória. O histórico desta fase é temporário, não uma auditoria persistente.

### Próximos aprimoramentos

- Comparação semântica entre versões com relacionamento explícito entre fontes, datas, parâmetros e permissões.
- Persistência opcional de decisões e alterações por usuário, com RLS e histórico de versões, sem armazenar credenciais.
- Validação de cobertura entre requisitos originais e casos efetivamente criados; regeneração incremental somente dos não cobertos.

### F2.1 — Consolidação semântica avançada (ampliação futura)

- Dividir o texto em blocos por tópico e fronteiras de documento, preservando IDs, faixas da origem e vínculos de requisitos/cenários.
- Enviar os blocos sequencialmente para gerar **sumários estruturados por fonte**, não um único resumo solto. Cada regra, condição negativa, resultado, caminho e parâmetro deve referenciar o trecho que a originou.
- Consolidar os sumários sem criar requisitos novos e comparar as listas de IDs/critério/cenário **antes e depois**.
- Apresentar ao QA uma matriz de cobertura (origem analisada, omitida, inconsistente), com edição manual e revisão obrigatória.
- Respeitar a quota compartilhada de **15 requisições/minuto**, tempo máximo e cancelamento. Mostrar custo estimado em chamadas **antes** da execução; se atingir a quota, pausar o processo sem perder o que já foi revisado.
- Não armazenar textos ou resumos sensíveis em serviços externos adicionais. Caso seja necessário persistir progresso, usar recursos já protegidos por RLS com escopo de proprietário.

### F3.2 — Auditoria persistente e geração direcionada por cobertura (11/11/2026)

**Implementação:**

1. Nova tabela privada `qa_ai_audit_trail` com RLS e chave estrangeira composta da TF/proprietário, apenas `SELECT` e `INSERT` para usuários autenticados não anônimos. Registros são append-only (sem UPDATE/DELETE). Preserva decisões do QA, solicitações incrementais e revisões aprovadas.
2. A auditoria armazena **somente hashes SHA-256, códigos de requisitos, tipo de evento, decisão e data**. Não guarda texto da TF, SQL, credenciais, imagens ou saída da NVIDIA.
3. O QA pode clicar em **Registrar versão atual**. Depois, **Carregar histórico e comparar versões** informa mudanças no contexto e em cada requisito aprovado em relação ao último registro. A comparação identifica alteração do conteúdo; não interpreta semanticamente a diferença nem garante que ela seja erro.
4. Decisões sobre possíveis divergências `prefer_left`, `prefer_right`, `keep_both` e `pending` são registradas **antes** de liberar a escolha na UI. A reversão de uma decisão também é registrada. Só a TF já cadastrada pode ter auditoria persistente; na criação de uma TF nova, a revisão antes do primeiro salvamento continua transitória.
5. Regenerações parciais aprovadas são registradas antes de substituir o trecho. A proposta anterior permanece disponível se a gravação da auditoria falhar.
6. Na revisão de **casos de teste**, uma matriz usa apenas requisitos **aprovados** e cenários **realmente vinculados** na tabela `qa_requisito_cenarios`, distinguindo sem vínculo, não executado, bloqueado, falha e validado. Comparação textual de títulos ou citações de IA não serve como prova de cobertura.
7. Selecione requisitos **sem cenários vinculados** e/ou **alterados desde o último registro** e use **Preparar casos apenas para a seleção**. O QA revisa o contexto focado e autoriza um novo envio à NVIDIA. As sugestões novas são anexadas ao rascunho, sem substituir outras edições e **sem criar vínculos ou executar/aprovar testes automaticamente**.
8. Há limites explícitos: até 100 requisitos aprovados por registro de versão, até 35 por geração focada e contratos de 30 mil caracteres de TF e 20 mil de requisitos. Exceder os limites gera erro, sem corte silencioso.

**Ordem de implantação:** aplicar `supabase/qa_ai_f32_audit.sql` no projeto SIA e validar RLS, grants, políticas e índices; depois publicar o frontend React. As Edge Functions `qa-ai`, `qa-context`, `qa-generators` e `qa-revisions` permanecem inalteradas.

**Limites conhecidos:** somente requisitos previamente aprovados com códigos válidos participam da matriz definitiva; outras regras extraídas de textos longos são hipóteses e precisam ser aprovadas como requisitos. A comparação de versões usa hashes de conteúdo (não destaca linhas alteradas). A auditoria é imutável e o usuário não pode editar registros anteriores; uma nova decisão cria um novo evento. O QA ainda precisa fazer a vinculação explícita dos casos aos requisitos e executar os testes.

### Futuras evoluções F3.3

- Mapear alterações entre fragmentos e versões por origem, com prévia da diferença em ambiente privado, sem duplicar textos sensíveis na auditoria.
- Oferecer vínculo sugerido entre novos cenários e requisitos com confirmação individual do QA, sem atribuir aprovação automática.
- Permitir filtros e exportação controlada do histórico privado, sem gerar dados confidenciais em logs.



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
