# QA Hub — Plano de integração funcional e contexto único

**Estado:** proposta técnica, sem alterações em produção.  
**Data:** 05/11/2026.  
**Repositório:** `kaina-visualsoftware/QA-Hub`.  
**Dependência:** acesso e isolamento de dados continuam controlados por Supabase Auth + RLS.

## 1. Visão do produto

O QA Hub deve funcionar como **um espaço de trabalho orientado a uma TF**, não como uma coleção de geradores separados.

**Princípios obrigatórios**

1. **Uma única TF é a fonte de verdade.** Gerar um roteiro, post, resumo, diagrama ou evidência nunca cria uma segunda TF silenciosamente.
2. **A seleção da TF é explícita e persistente** durante a navegação. Pode ser feita na lista de TFs, em um seletor global ou pelo link contextual de uma TF.
3. **Gerar não é salvar nem validar.** IA produz um rascunho revisável; gravar, associar, publicar e marcar resultados exigem ações claras.
4. **Complementar não significa sobrescrever.** Campos já cadastrados são preservados. Propostas de atualização são apresentadas como diferenças para revisão.
5. **Rastreabilidade por origem.** Um cenário, post ou artefato sabe de qual TF e geração veio, quem revisou e quando.
6. **Nenhuma aprovação fictícia.** Cenários novos começam como `nao_executado`; a situação da TF não é promovida automaticamente.
7. **Privacidade desde o início.** TFs e artefatos privados por padrão; IA online só recebe campos informados ao usuário; códigos de acesso, senhas e XMLs completos não são transmitidos ou sincronizados automaticamente.
8. **Recuperabilidade.** Rascunhos, versões, backups, confirmação de conflitos e operações transacionais protegem dados existentes.

## 2. Diagnóstico realizado no código (05/11/2026)

- `qa.html` e `qa.js` já possuem navegação interna para seis ferramentas e links contextuais `#/ferramentas/{modo}?tf={uuid}`.
- A aba de uma TF persiste dados em `qa_tarefas`, cenários em `qa_cenarios` e diagramas em `qa_diagramas`.
- Os geradores ainda vivem em `geradores.html`, isolados visualmente em um iframe. O fluxo de TF oferece **Usar dados da TF**, mas ainda depende do clique e de montagem de texto.
- Os resultados gerados são guardados em `qa_generator_posts` / `qa_generator_tests` (ou `localStorage` na falha de sincronização). Não existe vínculo estruturado reutilizado pelo CRUD de cenários da TF no fluxo atual.
- O gerador de roteiros mantém estados de execução em um objeto `exec` associado ao markdown; `defExec()` inicializa cenários como **OK** antes de execução. Corrigir como prioridade P0 e interpretar cuidadosamente históricos antigos.
- O módulo de informações importantes salva localmente, inclusive campos de códigos/acessos. **Não migrar segredos para o banco** sem redesenho de segurança; preferir referências não confidenciais e não armazenar senhas em texto claro.
- Comparadores de texto/XML e release trabalham essencialmente com entradas avulsas: úteis, mas não contextualizadas no registro da TF.

**Problema estrutural:** a UI compartilha uma navegação, mas não compartilha modelo de contexto, serviços, revisão de alterações nem dados estruturados entre geradores e TFs.

## 3. Experiência de ponta a ponta

### 3.1 Fluxo principal — TF existente → casos salvos na mesma TF

1. A pessoa abre uma TF existente, por exemplo `#67866`, ou a escolhe no seletor global **TF em foco**.
2. O cabeçalho contextual mostra título, código, BUILD/RELEASE, versão, módulo e situação; uma ação **Trocar TF** abre busca com filtros.
3. Clica **Gerar casos de teste**. O sistema compõe a entrada a partir da TF, da descrição técnica, requisitos inseridos e, opcionalmente, cenários já existentes. Antes do envio à IA online, exibe os campos que serão compartilhados e permite revisar/remover conteúdo.
4. A IA retorna **dados estruturados**, com uma versão textual para leitura. Cada caso tem título, objetivo, pré-condições, passos, resultado esperado, notas e referência à origem. Retornos não estruturados passam por parser com validação e revisão; nunca são aceitos diretamente como registros.
5. Abre uma **prévia de importação** com todos os casos: adicionar, ignorar, editar ou substituir um caso específico. Mostra possíveis duplicações por conteúdo, não só por número ou título.
6. Em **Adicionar à TF**, insere somente os casos aprovados na **mesma `tarefa_id`**, mantendo título, versão, causa, correção, análise, visibilidade e demais informações originais intocados.
7. Os novos registros ficam em `nao_executado`; a aba **Cenários** atualiza imediatamente e oferece **Iniciar execução**. Não gera outra TF.
8. Um botão **Voltar à TF** retorna ao mesmo registro e aba, mantendo contexto. O histórico da geração continua consultável com indicação de quais cenários foram importados.

**Exceção: sem TF selecionada.** Oferecer **Selecionar uma TF** ou **Criar rascunho de TF**. O rascunho preenche apenas campos identificáveis; exige título válido e confirmação antes de criar a TF. Os casos só podem ser associados após existir uma `tarefa_id`; nunca criar TF incompleta em segundo plano.

### 3.2 Fluxo inverso — nova TF a partir de material recebido

`Colar relatório -> interpretar campos e possíveis casos -> revisar dados da TF -> salvar rascunho -> revisar/gerar casos -> adicionar casos à TF -> executar -> relatório -> post / release`.

A extração local ou por IA sugere os valores, não substitui dados conhecidos nem define como `aprovado` algo que não foi testado. Se já existe TF com mesmo código/tipo/versão, oferecer vincular à existente antes de criar duplicata, sem assumir que códigos isolados são globalmente únicos.

### 3.3 Fluxo pós-execução

`Execução real de cenários -> registrar resultado, observado, evidências -> relatório consolidado -> post técnico -> associação à release`.

O relatório se constrói usando os status **reais** persistidos em `qa_cenarios`. Para cada cenário, exibir divergências entre esperado/obtido; exportar com versão e horário de geração. Exigir decisão explícita antes de alterar o status da TF.

## 4. Funções integradas (contrato por módulo)

| Módulo | Entrada principal | O que passa a compartilhar | Saída e destino |
| --- | --- | --- | --- |
| TF | Código, texto, contexto, BUILD/RELEASE | Fonte canônica, contexto ativo | `qa_tarefas` |
| Gerar casos | TF selecionada + requisitos opcionais | Prévia estruturada, deduplicação, revisão | Registros `qa_cenarios` da **mesma TF** e histórico da geração |
| Executar casos | Cenários vinculados | Passos, esperado, observado, status, responsável | Atualização dos mesmos `qa_cenarios` e evidências |
| Post de fórum | TF, correção, objetivo e resultados escolhidos | Post editável, histórico/versionamento, identificação da TF | Artefato vinculado à TF; copiar BBCode/Markdown |
| Diagrama | TF e cenários escolhidos | Fluxo coerente com processo, origem e versão | `qa_diagramas` da TF; nunca executar código arbitrário |
| Releases | Lista importada ou registros selecionados | Vínculo com TF por código + versão + revisão manual | Registro de release + associações a TFs + comunicado |
| Comparar textos | Dois conteúdos e TF opcional | Resultado/diff resumido, não textos confidenciais por padrão | Artefato/evidência vinculado opcionalmente à TF |
| Comparar XML | Dois XMLs e TF opcional | Diferenças por caminho, atributos, valor e namespaces | Resumo sanitizado, exportável ou vinculado opcionalmente |
| Informações importantes | Referências, FAQ e regras não sigilosas | Contexto por sistema/módulo e uso em precondições | Base de referências acessível sob permissão |
| Dashboard | TFs/cenários/releases/artefatos | Pendências, andamento, regressões e cobertura por módulo | Visão consolidada sem inferir execução |

**Releases:** a correspondência entre registros externos e TFs deve sugerir candidatos, apresentar critérios e pedir confirmação se houver ambiguidades. Um identificador SIA não é, por si, um UUID do QA Hub.

**Posts:** associados à TF, mas não alteram o título, descrição ou conclusão de teste. Publicar/copiar é distinto de gerar/salvar rascunho.

**Comparadores:** não salvar XML bruto automaticamente (pode conter segredos ou dados de clientes). Guardar só diff ou metadados sanitizados quando solicitado.

**Referências e acessos:** separar biblioteca de conhecimento de credenciais. Desativar novas gravações de senha em texto claro no `localStorage`; oferecer orientação segura para migração manual de dados já guardados, sem enviá-los ao Supabase.

## 5. Arquitetura proposta

### 5.1 Contexto compartilhado da TF

Criar serviço único de contexto, por exemplo `qa-workspace.mjs`, com:

- `selectedTaskId`, `taskSnapshot`, `userId`, `revision`, `lastUpdatedAt`;
- `selectTask(id)`, `getTaskContext(id)`, `getScenarios(id)`, `saveGeneratedDraft(...)`, `attachGeneratedCases(...)`, `linkArtifact(...)`;
- estado transitório de geração, erros e rascunhos segregados por `userId + tarefaId + modo`;
- validação de existência/permissão no servidor, nunca apenas pelo parâmetro de URL;
- eventos internos após salvar (ex.: `qa:task-updated`, `qa:cases-attached`), para atualizar dashboard e abas sem refresh.

**Transição:** preservar temporariamente o iframe, com protocolo `postMessage` tipado, com `origin`, `source`, `requestId`, lista de ações permitidas e resposta de sucesso/erro. Não usar mensagens para executar SQL arbitrário. Gradualmente extrair os seis módulos em componentes nativos sob o shell principal; remover iframe somente após paridade comprovada.

### 5.2 Persistência mínima proposta

Manter `qa_tarefas`, `qa_cenarios` e `qa_diagramas` como fontes canônicas.

Evoluir com **migrações separadas e versionadas**:

1. Adicionar `tarefa_id uuid null` com FK para `qa_tarefas` aos históricos `qa_generator_posts` e `qa_generator_tests`, mediante inspeção do esquema real. Indexar `(tarefa_id, created_at)`.
2. Criar `qa_artefatos` para posts, resumos de comparação, relatórios e versões (tipo, conteúdo seguro, formato, status de revisão, `tarefa_id`, `user_id`, `created_at`, `updated_at`, `origin_generation_id`). Evitar armazenar credenciais.
3. Criar `qa_geracoes` como trilha de origem (TF, módulo, modelo quando aplicável, revisão, horário, prompt-versão, status, hashes/referências; não guardar payload confidencial desnecessariamente).
4. Criar `qa_releases` e `qa_release_tarefas` com chave composta única para associação, versão, origem da importação e confirmação do vínculo.
5. Adicionar metadados opcionais de origem/importação a `qa_cenarios` (p. ex. `origem_geracao_id`, identificador estável do item gerado); manter status reais na tabela de cenários.
6. Eventual `qa_referencias` somente para material **não secreto** com regras de acesso específicas. Não fazer upload automático de `h_lib` do navegador.

**Autorização:** RLS em cada tabela vinculada, inclusive checagem de permissão de leitura/escrita na TF pai; administradores seguem regras explícitas já existentes. Evitar que `user_id` de um artefato ou cenário de outro usuário seja alterado no cliente. Cada integração respeita TF pública versus privada, sem tornar artefatos privados públicos automaticamente.

**Gravação transacional:** uma RPC autenticada para anexar lote de cenários revisados. Deve verificar direitos, evitar duplicação por chave de origem/idempotência e gravar todos ou nenhum. Um reenvio após timeout não pode duplicar cenários.

**Histórico legado:** preservar os registros sem TF, oferecendo **Vincular a TF** por escolha humana. Nunca vincular por texto do título automaticamente; nunca converter "OK" herdado sem evidência de ação real em aprovação.

### 5.3 Contrato da IA e do parser

Padronizar geração como objeto `cases[]` com validação de esquema (titulo, passos, esperado, observacoes, origem, confianca opcional). Preservar renderização Markdown apenas como visualização/cópia.

Uma resposta da IA é proposta, não execução. Rejeitar resultados vazios, truncados ou inválidos e mostrar erros sem perda de rascunho. Campos opcionais ausentes ficam vazios; jamais preencher "testado"/"aprovado" por suposição.

## 6. UX / informação contextual

No topo das telas do QA Hub, acima dos módulos pertinentes:

```
TF EM FOCO   #67866 — Desconto não removido no pedido    [Trocar TF]
BUILD • 12.08.08.0000 • Vendas • Em teste               [Abrir TF]
```

Na TF, adicionar abas/atalhos contextuais alinhados à ordem de trabalho:

`Resumo | Cenários | Execução | Diagramas | Documentos | Histórico`

Um painel "Próximas ações" é contextual: **Gerar cenários** quando não existem; **Executar pendentes** quando há casos não executados; **Consolidar relatório** após registros; **Gerar post** e **Associar release** quando oportuno. O usuário pode ignorar sugestões; ações não devem executar automaticamente.

Prévia de casos: selecionar todos/nenhum, editar inline, indicar duplicatas, exibir quantidade e revisão antes de **Adicionar à TF**. Em conclusão, mensagem precisa: "8 cenários adicionados à TF #67866; 2 ignorados", com link para aba de cenários.

Interface: estado de loading/erro/vazio, responsiva 320px a desktop, foco visível, teclado, sem popups ou abas externas para ações internas. A navegação deve preservar texto ainda não salvo ou perguntar antes de descartá-lo.

## 7. Backlog de execução em fases

### Fase P0 — Integridade e base compartilhada (primeiro incremento)

- [ ] **QA-I01** — Corrigir inicialização de execução do gerador: todo caso novo é `nao_executado`; revisar como históricos antigos com "OK" serão identificados sem falsificar execução.
- [ ] **QA-I02** — Criar o seletor **TF em foco**, com busca por código/título/versão e compartilhamento do UUID nas ferramentas.
- [ ] **QA-I03** — Criar contexto único de TF (leitura, permissões, cache invalidação, proteção contra alterações não salvas) para o shell e geradores.
- [ ] **QA-I04** — Adaptar gerador de casos para saída estruturada + parser tolerante + prévia de seleção, edição e duplicatas.
- [ ] **QA-I05** — Criar a ação **Adicionar cenários à TF existente**, em lote, idempotente e transacional; atualizar a aba e o dashboard.
- [ ] **QA-I06** — Preservar integralmente dados preexistentes da TF; somente campos aprovados pelo usuário podem ser alterados.
- [ ] **QA-I07** — Ação de criação de TF via rascunho, quando não houver TF selecionada, com validação obrigatória e sem criação automática.
- [ ] **QA-I08** — Testes P0 de vínculo correto, não duplicação, estados, RLS e navegação.

**Entrega demonstrável:** abrir uma TF completa -> gerar roteiro -> selecionar 8 casos -> anexar à mesma TF -> recarregar -> TF intacta e 8 cenários como não executados.

### Fase P1 — Documentos, diagramas e relatórios

- [ ] **QA-I09** — Posts vinculados à TF com rascunhos/versionamento, histórico e exportação, sem modificar TF.
- [ ] **QA-I10** — Diagramas a partir de TF + cenários e vínculo de origem, com revisão humana.
- [ ] **QA-I11** — Execução integrada dos casos em `qa_cenarios`, substituindo `exec` markdown para cenários vinculados.
- [ ] **QA-I12** — Relatório consolidado baseado exclusivamente em resultados reais, com revisão, copiar/exportar.
- [ ] **QA-I13** — Tela contextual de Documentos/Histórico de uma TF e navegação para as saídas.

**Entrega demonstrável:** 1 TF -> casos executados -> relatório -> post revisado -> documentos recuperáveis após novo login.

### Fase P2 — Releases, comparações, referências

- [ ] **QA-I14** — Releases e junção com TFs por correspondência verificada; tratamento de ambiguidades.
- [ ] **QA-I15** — Diff/XML gera resumo opcionalmente associado à TF; não salva material bruto por padrão.
- [ ] **QA-I16** — Biblioteca reutilizável de requisitos, procedimentos e precondições **sem segredos** por módulo.
- [ ] **QA-I17** — Dashboard com métricas de cobertura/pendências por TF, módulo e release.
- [ ] **QA-I18** — Buscar e filtrar artefatos e relações sem atravessar permissões.

### Fase P3 — Consolidação da arquitetura e escala

- [ ] **QA-I19** — Extrair módulos do iframe para módulos/componentes nativos, preservando URLs antigas.
- [ ] **QA-I20** — Importar/vincular históricos legados sob revisão, com backup e dry run.
- [ ] **QA-I21** — Evidências privadas, trilha de auditoria, comparação histórica de execuções e exportação formal.
- [ ] **QA-I22** — Paginação e indicadores escaláveis, testes completos em browsers e acessibilidade.

## 8. Testes e critérios de aceite

1. Ao selecionar uma TF e gerar 10 casos, **não** nasce outra `qa_tarefas`; o `tarefa_id` dos casos é o UUID selecionado.
2. Código, título, tipo, status, módulo, versão, descrição, causa, correção, conclusão e visibilidade originais são preservados byte a byte, salvo revisão explícita.
3. Nenhum caso novo é criado como aprovado; reportar/colar não significa executar.
4. Se a pessoa selecionou 7 de 10 casos, exatamente 7 são persistidos na ordem correta.
5. Se a IA retornar casos repetidos ou um lote for reenviado, o sistema permite revisão e não duplica registros aceitos.
6. Se a gravação falhar, **nenhum caso parcial** é inserido e a prévia permanece para nova tentativa.
7. Usuário A não consegue anexar casos, documentos ou releases à TF privada de B; administrador segue política formal.
8. O post e o diagrama gerados permanecem vinculados à TF certa, sem modificar seu cadastro; versões anteriores são acessíveis.
9. Resultado/relatório usa status reais; uma geração repetida não redefine observado, aprovação ou conclusão já registrados.
10. Comparações/XML não são enviadas à IA nem armazenadas remotamente sem ação/consentimento informado.
11. Histórico e rascunhos não vazam entre contas nem persistem no browser após logout em sessão compartilhada, conforme política de retenção definida.
12. Testes de navegação: desktop 1366×768, tablet 768×1024, celular 390×844 e 320×568; teclado, foco e ausência de barras horizontais.
13. Links diretos `#/ferramentas/{modo}?tf=...` e `geradores.html#...` continuam funcionais após autenticação e redirecionamento.
14. CI inclui testes de parser, banco/SQL (incluindo RLS e RPC), serviço de contexto, Chromium E2E e cenários de falha de rede/IA.

## 9. Execução e riscos

**Ordem:** não redesenhar todas as telas primeiro. Entregar P0 de ponta a ponta e homologar. Depois P1, P2 e P3. Cada fase em PRs pequenos por domínio com rollback simples.

**Antes de cada migração:** inventário dos esquemas de produção, backup consistente, verificação de RLS, migrations idempotentes e ambiente de teste. Nenhum SQL deste plano foi executado em produção.

**Riscos a controlar:**

- Importar texto gerado como verdade estruturada sem revisão;
- Criar TF duplicada por código de origem ambíguo;
- Converter flags legadas "OK" em aprovações sem teste real;
- Misturar material sigiloso de clientes em posts públicos ou payloads da IA;
- Salvar senhas e acessos em localStorage ou sincronizá-los indevidamente;
- Falhar parcialmente na criação de cenários;
- Perder texto ao trocar de ferramenta, TF ou conta;
- Quebrar rotas antigas ou permissão RLS em nova entidade.

## 10. Definição de concluído

Uma fase só é considerada concluída quando os critérios de aceite estão automatizados onde possível, houve demonstração no navegador, a origem de cada dado é identificável, o fluxo não cria duplicatas, não perde informações da TF, respeita RLS e teve homologação humana documentada. Em particular, **uma interface visualmente integrada sem persistência integrada não satisfaz P0**.
