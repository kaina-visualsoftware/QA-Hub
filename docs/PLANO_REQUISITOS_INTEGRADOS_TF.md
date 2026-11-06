# QA Hub — Planejamento de requisitos estruturados e arquivos vinculados à TF

**Status:** proposta técnica (não implementada).  
**Data:** 06/11/2026.  
**Escopo:** uma TF passa a concentrar também seus requisitos e respectivas fontes, reutilizados automaticamente em posts, roteiros, diagramas e demais geradores autorizados.

## 1. Diagnóstico do sistema existente

- A tabela atual \`qa_tarefas\` **não** possui requisitos como entidade própria. \`qa_documentos\` registra posts e relatórios, não especificações de requisitos.
- \`geradores.html\` disponibiliza um campo \`requisito\` livre ao gerar post ou roteiro; a chamada à Edge Function \`qa-generators\` envia \`{ mode, tarefa, requisito }\`.
- O campo \`requisito\` aceito pela Edge Function tem limite atual de **20.000 caracteres**. A TF tem limite de 30.000 caracteres no mesmo endpoint.
- \`qa-generator-review.mjs\` já recupera dados da TF para os geradores, mas somente como texto de tarefa; não existe carregamento estruturado de requisitos nem vínculo de arquivos.
- A área \`Informações importantes\` é independente e **não** deve receber automaticamente arquivos ou dados confidenciais de requisitos.
- Há RLS nas tabelas QA. Preservar seu modelo de proprietário e privilégios administrativos explicitamente autorizados.

## 2. Resultado esperado

Uma TF pode ter **zero, um ou vários documentos-fonte** e **zero ou vários requisitos estruturados**. O usuário poderá:

1. **Colar ou digitar** um texto de requisitos livremente.
2. **Anexar um arquivo** contendo a especificação de requisitos.
3. Obter uma **prévia estruturada** com classificação, código, título, descrição e critérios observáveis, todos apoiados em trechos do original.
4. Revisar, editar, descartar, reorganizar e aprovar os itens propostos **antes de salvar**.
5. Consultar seus requisitos sempre que abrir a mesma TF.
6. Ao selecionar essa TF em um gerador, ter seus requisitos aprovados carregados **automaticamente como contexto**, mas enviados à IA **somente quando clicar em Gerar**.
7. Consultar quais requisitos/versões foram usados em um post ou roteiro específico.

**Não** criar uma segunda TF, sobrescrever campos da tarefa ou tratar geração de requisitos como aprovação do teste.

## 3. Experiência de uso / navegação

Nova aba **Requisitos** na TF, ao lado de **Resumo** e **Cenários**. Seguir os cartões, campos, padding, bordas, estados vazios e abas responsivas já existentes no QA Hub.

### 3.1 Abordagem A: texto

- Botão **Adicionar requisitos** → opção **Colar texto**.
- Área de texto com dica: “Cole aqui regras, histórias, comportamento esperado, pré-condições e critérios de aceite”.
- Botão **Organizar requisitos** produz uma prévia, sem gravar automaticamente.
- O analisador detecta requisitos RF, RNF, regras de negócio RN, critérios de aceite CA e seções com títulos; quando não houver classificação explícita, propõe uma, sinalizada como **sugerida**.
- Itens apresentados como cartões editáveis: \`RF-001\`, título, descrição, tipo, prioridade (opcional), critérios de aceite, origem e trecho de referência.
- Ações: **Aceitar todos**, **Selecionar itens**, **Editar**, **Descartar**, **Salvar na TF**.
- Se um texto estiver ambíguo, exibir “Revisão necessária” e preservar o original. **Não inventar** regra de negócio, limites ou comportamento esperado.

### 3.2 Abordagem B: arquivo

- Botão **Anexar arquivo** na mesma aba; aceitar inicialmente **PDF com texto selecionável, DOCX, TXT e MD**.
- Extrair texto no cliente (bibliotecas mantidas/pinadas ou recursos nativos); preservar nome, tipo, hash e número de versão. Não enviar arquivo binário ao serviço NVIDIA.
- Mostrar prévia do texto extraído e do documento, origem das seções/páginas quando disponível.
- Se o documento for PDF digitalizado ou imagem sem texto, mostrar **“Não foi possível extrair texto”** e permitir colar manualmente. OCR pode ser avaliado como incremento separado, com consentimento explícito.
- O usuário aprova os itens detectados antes de gravá-los na TF. O arquivo original pode ser armazenado de forma privada e consultado depois.
- Limites sugeridos para a primeira implementação: arquivo de até **10 MB** e um máximo configurável de texto extraído; definir limites técnicos efetivos com testes e feedback de erro claros.
- Não executar macros, scripts ou elementos ativos embutidos. Inspecionar tipo real do arquivo, não confiar somente na extensão.

### 3.3 Visualização dentro da TF

- Cabeçalho: **Requisitos · 8 aprovados · 2 pendentes**.
- Lista com busca, filtro por tipo/status, ordem estável, arquivo de origem e última atualização.
- Ações: editar requisito, comparar versões, arquivar, anexar nova fonte, baixar original (se permitido).
- Estado vazio: “Esta TF ainda não possui requisitos. Cole um texto ou anexe um arquivo”.
- Caso a TF seja recém-criada, permitir preparar uma prévia em rascunho, mas persistir requisitos somente depois que a TF for salva.

## 4. Persistência proposta

Não colocar múltiplos requisitos em um único campo concatenado de \`qa_tarefas\`, nem alterar \`qa_documentos\` para misturar post e especificação.

| Entidade | Finalidade | Campos principais |
|---|---|---|
| \`qa_requisito_fontes\` | Texto digitado ou arquivo anexado à TF | \`id\`, \`tarefa_id\`, \`user_id\`, \`tipo_fonte\` (texto/arquivo), \`nome_arquivo\`, \`mime\`, \`storage_path\`, \`hash\`, \`texto_extraido\` (restrito), \`versao\`, \`created_at\` |
| \`qa_requisitos\` | Itens estruturados e revisados | \`id\`, \`tarefa_id\`, \`fonte_id\`, \`user_id\`, \`codigo\`, \`tipo\`, \`titulo\`, \`descricao\`, \`criterios_aceite\`, \`estado\` (rascunho/aprovado/arquivado), \`origem_trecho\`, \`ordem\`, timestamps |
| \`qa_requisito_revisoes\` | Histórico de conteúdo aprovado/editado | \`id\`, \`requisito_id\`, \`numero_versao\`, \`snapshot\`, \`editor_id\`, \`created_at\` |
| \`qa_geracao_requisitos\` | Rastreabilidade da geração | \`geracao_id\` ou \`documento_id\`, \`tarefa_id\`, \`requisito_id\`, \`revisao_id\`, \`incluido_em\` |

Usar chave e índice por \`tarefa_id\`. Impedir requisitos de apontarem para fonte de outra TF com FK composta, verificação transacional ou RPC adequada. Códigos RF-001/RNF-001/RN-001/CA-001 são **únicos dentro da TF**, nunca globais; evitar alterar IDs existentes ao reordenar.

Bucket **privado** no Supabase Storage, sugerido \`qa-requisitos\`, com caminho baseado no proprietário, TF e UUID do anexo. Políticas RLS de Storage e das tabelas impedem leitura cruzada; evitar URLs públicas. Mesmo que \`qa_tarefas.publica = true\`, os requisitos e anexos continuam **privados por padrão** até existir uma política explícita de publicação de requisitos.

Preferir nova versão imutável ao substituir um anexo; manter os requisitos editados e sua rastreabilidade. O arquivo original e o texto extraído não devem aparecer em logs da aplicação, eventos de auditoria ou mensagens de erro.

## 5. Organização do texto: contrato funcional

O organizador opera em duas camadas:

1. **Determinística:** seções, títulos, listas numeradas, padrões \`RF-xxx\`, \`RNF-xxx\`, \`Dado/Quando/Então\`, \`Como... quero...\`, tópicos e separadores.
2. **Assistida, opcional:** IA pode sugerir divisão/reescrita de trechos que não têm estrutura; destacar sugestões como propostas, mostrar os trechos de origem e exigir revisão do usuário. Se usar IA externa, solicitar consentimento específico e enviar só o texto selecionado.

Exemplo:

Texto-fonte: “Ao retirar um desconto, o total do pedido deve ser recalculado e o sistema precisa impedir percentuais negativos não permitidos.”

Prévia proposta (sujeita à aprovação):
- \`RF-001\` — Recalcular o total do pedido ao remover um desconto.
- \`RN-001\` — Impedir percentuais de desconto negativos quando não permitidos pela regra aplicável.

O organizador **não deve inventar** percentuais máximos, telas, status ou mensagens de erro ausentes do original. Critérios de aceite não explícitos aparecem como campos para completar, não como fatos confirmados.

Deduplicação por hash normalizado e comparação semântica sugerida; uma importação repetida apresenta **“já existe / atualizar versão / adicionar como novo”** antes de gravar.

## 6. Contexto automático nos geradores

**Contrato central sugerido:** \`resolveTfContext(taskId, options)\`.

Entrada:
- \`taskId\` (TF autenticada);
- \`types\` (RF/RNF/RN/CA);
- \`selectedRequirementIds\` (opcional);
- \`includeAttachments=false\` (apenas requisitos estruturados, não binários);
- \`extraRequirementText\` (texto adicional digitado no gerador).

Saída:
- \`taskText\` com os dados seguros da TF;
- \`requirementsText\` com códigos, títulos e descrições **aprovados**;
- \`requirementsMeta\` com IDs, revisão usada, origem e tamanho;
- \`warnings\` com itens não incluídos, limites ou ausência de requisitos.

### 6.1 Post

Ao abrir \`#/ferramentas/post?tf=<uuid>\`:
- Carregar automaticamente requisitos **aprovados** da TF, selecionados por padrão.
- Mostrar um cartão **Requisitos da TF · 8 incluídos**, com opções **Visualizar**, **Desmarcar** e **Adicionar requisito temporário**.
- O campo manual existente permanece como **“Complemento opcional”**, sem substituir os requisitos salvos.
- Ao clicar **Gerar post**, montar a requisição com TF + requisitos selecionados + complemento.
- Preservar versão exata usada na geração para auditoria; novas revisões na TF não reescrevem posts já salvos.

### 6.2 Roteiros de teste

Mesmo contexto para \`#/ferramentas/teste?tf=<uuid>\`. Cada caso gerado poderá guardar o(s) códigos de requisito que cobre (vínculo opcional revisado pelo testador), permitindo futura matriz **Requisito → Cenários → Execução**.

### 6.3 Diagramas e relatórios

- Diagramas: opção explícita **Incluir requisitos da TF** na montagem do contexto.
- Relatórios: listar requisitos cobertos/não cobertos quando houver rastreabilidade suficiente. **Não** declarar cobertura total somente porque existe um roteiro gerado.
- Referências globais de \`qa_referencias\` são independentes e não podem ser confundidas com requisitos de uma TF.

### 6.4 Limites, privacidade e mudança de TF

- Edge Function \`qa-generators\` aceita hoje até **20.000 caracteres em \`requisito\`**. Preparar seleção/resumo antes de chamar a função; avisar **quais requisitos ficaram de fora**, nunca truncar silenciosamente.
- Não enviar arquivos completos, credenciais, conteúdo bruto de anexos ou dados de outras TFs automaticamente para a NVIDIA.
- Incluir o texto selecionado **somente ao clicar Gerar**, com aviso de envio externo já utilizado no app.
- Ao mudar a **TF em foco**, descartar contextos anteriores em cache do gerador, sem apagar rascunhos não salvos sem aviso. Impedir conteúdo de TF A no post de TF B.
- Se não houver requisitos, gerar normalmente apenas com os dados da TF.
- Se o servidor ou Storage estiver indisponível, avisar e oferecer geração sem requisitos, **nunca afirmar que eles foram incluídos**.

## 7. Entregas em fases

### Fase R1 — Banco e aba Requisitos
- Criar tabelas, RLS, índices e testes de permissão.
- Aba integrada à TF com lista, edição, estados rascunho/aprovado e formulário de texto.
- Parser inicial de requisitos por estrutura/linhas; prévia e confirmação em lote.
- Suporte a TF nova como rascunho, com persistência apenas depois de salvar a TF.
- Critério: TF existente mantém todos os outros campos inalterados e importação de requisitos não cria outra TF.

### Fase R2 — Anexos e versionamento
- Bucket privado, validações, extração local de TXT/MD/DOCX/PDF com texto, prévia e tratamento de falhas.
- Anexo ligado à TF, controle de versões, deduplicação e referência ao trecho de origem.
- Testar documentos grandes, PDFs escaneados, arquivos inválidos e acesso negado entre contas.

### Fase R3 — Integração automática com geradores
- Serviço \`resolveTfContext\` comum, com seleção e previsão de tamanho.
- Posts e Roteiros incluem requisitos aprovados automaticamente; opção de desmarcar e complemento manual.
- Diagramas reutilizam os mesmos itens.
- Rastrear versões incluídas nas gerações sem vazar conteúdo sensível.
- Corrigir cache de mudança de TF e testar consumo do endpoint dentro do limite atual.

### Fase R4 — Rastreabilidade e qualidade
- Associação revisável requisito ↔ cenário e matriz de cobertura.
- Histórico/auditoria de mudanças, testes Playwright desktop/mobile, testes de isolamento RLS/Storage.
- Mensagens de estado vazio, erros, duplicidades e atualização de versão.
- Avaliar OCR e extração assistida com IA apenas após validar os formatos textuais.

## 8. Critérios de aceite (E2E)

1. Criar/abrir TF, colar 5 requisitos, revisar e salvar: mesma \`tarefa_id\`, 5 itens aprovados, nenhuma TF adicional.
2. Reabrir a TF após logout/login: requisitos preservados.
3. Importar um PDF/DOCX textual: extração revisável e arquivo original disponível somente ao usuário autorizado.
4. PDF digitalizado sem texto: explicação de que OCR ainda não está disponível; nenhum requisito inventado.
5. Repetir importação: reconhecer itens iguais e solicitar ação em vez de duplicar silenciosamente.
6. Gerar post para TF com requisitos: eles aparecem **já selecionados** no contexto e são usados na geração.
7. Gerar roteiro para a mesma TF: reutilizar requisitos, sem copiar manualmente o campo.
8. Trocar TF A por TF B: não transmitir requisitos de A.
9. Revogar seleção de um requisito: não incluir seu texto no corpo enviado.
10. Exceder limite de 20.000 caracteres: mostrar seleção, tamanho estimado e aviso de omissão; não truncar silenciosamente.
11. Revisar requisito após gerar um post: post anterior permanece referindo a versão usada.
12. Outra conta ou usuário anônimo não consegue listar/baixar arquivos ou requisitos privados da TF.
13. Layout da nova aba e cartões com o mesmo estilo das ferramentas nativas do QA Hub em 320, 390, 768 e 1366 px.

## 9. Definição de pronto e escopo

Pronto quando os fluxos texto/arquivo, aprovação, recuperação, uso automático por geradores, controle de versões e segurança estiverem demonstrados por CI + navegador + banco, com migrações versionadas e documentação.

**Fora do MVP:** OCR de arquivos digitalizados, extração de .DOC antigo, upload de macros/executáveis, extração de arquivos protegidos por senha, sincronização automática com o SIA, publicação pública de requisitos e cobertura automaticamente inferida como aprovada.

**Recomendação de ordem:** R1 → R2 → R3 → R4, com validação humana dos dados extraídos antes de liberar cada incremento. Esta PR documenta o plano; não altera nenhuma tela, banco ou fluxo em produção.
