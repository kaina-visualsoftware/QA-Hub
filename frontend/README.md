# QA Hub React — issue #37 (incremento inicial)

A pasta frontend/ contém a nova SPA e NÃO substitui o site público durante a
migração. O legado qa.html permanece ativo como fallback até a homologação.

## Desenvolvimento

Requer Node 22.12+. Execute na pasta frontend/: npm install, npm run dev,
npm run typecheck, npm run lint, npm test e npm run build.
A base Vite do build é /QA-Hub/. Valores públicos do Supabase reutilizam qa-config.js.
Variáveis VITE_ opcionais são descritas em .env.example; nunca incluir service_role,
sb_secret_ ou tokens de provedores no cliente.

O incremento traz Auth, listagem/busca de TFs, criação rápida, edição básica,
cenários, execução manual, edição/exclusão de registros e diagramas Mermaid nativos (lazy). Estados remotos usam TanStack Query; foco local,
Zustand; validação, Zod/React Hook Form. Nenhuma aprovação automática via IA.

Pendências: IA local e geração de diagramas por IA, funções administrativas e
páginas públicas, callbacks de produção, testes RLS com contas reais,
acessibilidade e desempenho. O lockfile versionado permite reproduzir a instalação com `npm ci`.

## Testes do primeiro incremento

O workflow React instala dependências, executa verificação TS estrita, ESLint,
Vitest e build. O smoke do navegador mede renderização de login, mudança de
modo e ausência de rolagem horizontal em 390/768/1366 px, sem acessar contas reais.
As suites de browser e de dados reais são verificações distintas.

Importações locais reutilizam qa-parser.mjs, exigem revisão de cenários
explícitos e não registram aprovação automática. Erro de anexação mostra alerta
após abrir a TF salva; não há transação atômica neste estágio.

## Geradores nativos e documentos

Ao abrir uma TF, use **Gerar casos com IA**, **Gerar post com IA** e
**Documentos / relatório**. A IA só processa dados após consentimento explícito;
o texto efetivamente enviado pode ser revisado antes do envio.
O backend usa a Edge Function `qa-generators` já publicada, sem chaves privadas
no navegador. Os requisitos aprovados e o contexto completo são consultados
para a TF proprietária; uma TF de outro usuário não pode ter conteúdo enviado
à IA mesmo quando visível a um administrador.
Os casos anexados nunca são marcados como executados.
Os documentos são versionados e permanecem privados por RLS.

O Vite dev usa a porta **8765** por compatibilidade com a lista de origens
permitidas pela Edge Function atual. O callback Auth precisa estar autorizado
se você testar cadastro/recuperação localmente.

## Requisitos, cobertura e fontes privadas

Na TF, abra **Requisitos e cobertura**. As abas permitem importar
especificações, revisar/aprovar/arquivar, relacionar cenários, exportar
cobertura CSV, anexar documentos privados e consultar snapshots das
gerações de IA. Apenas o proprietário tem acesso aos registros privados.

PDF e DOCX têm extração local com PDF.js e JSZip carregados sob demanda; TXT
e MD também são lidos localmente. Documentos digitalizados sem texto extraível
necessitam transcrição manual (não há OCR). A prévia tem limite de 30 mil
caracteres, com original completo preservado após confirmação do upload.
Nenhum arquivo é transmitido à IA por padrão.

## Evidências e auditoria no React

A TF agora possui **Evidências e auditoria**. Observações e URLs HTTPS podem ser
registradas e vinculadas a cenários por uma operação explícita; não é permitido
editar nem apagar evidências já cadastradas. A aba Auditoria mostra eventos
gerados pelos gatilhos do banco em modo somente leitura. Nenhuma senha, log
bruto ou captura binária é enviado ou armazenado nesse módulo.

## Releases e referências técnicas

A TF agora oferece **Releases e referências** em React, com associação explícita de
versões no formato `12.10.06.0000`, referências privadas da conta (checklists,
regras e notas, com validação contra credenciais) e histórico somente leitura dos
contadores de comparação. Para preservar a privacidade, os textos e XML originais
não são guardados nesses registros. A comparação visual e local está
disponível na aba Comparações.

## Comparador local de textos/XML e organizador de release

Na TF, abra **Releases e referências → Comparações** para comparar texto linha a linha
ou XML por hierarquia, namespaces, atributos e valores. A visualização é local,
com paginação e limite de 150 mil caracteres. DTD, entidades e referências de
stylesheet em XML são recusadas. Somente após confirmação explícita são gravados
os contadores `adicionados`, `removidos` e `alterados` na tabela `qa_artefatos`;
o texto/XML original nunca é enviado à base por este recurso.

Na aba **Releases**, o organizador local classifica a lista por status 11/12,
verifica comunicados autorizados e fornece versões copiáveis em texto e BBCode.
Nenhuma liberação ou vínculo de TF é inferido automaticamente da lista;
continua necessária a associação explícita pelo proprietário.

A extração local de PDF/DOCX foi exercitada no smoke Chromium com arquivos
sintéticos. A proteção de RLS, upload e download de originais com contas reais
ainda requer homologação antes do corte de produção.

## Áreas públicas e administrativas (migração em rascunho)

A biblioteca de TFs públicas está acessível pela rota da SPA `#/publicas`,
inclusive **sem autenticação**. O detalhe `#/publicas?tf=<UUID>` carrega
somente uma TF marcada `publica=true` e consulta apenas os campos
explicitamente selecionados do resumo, dos cenários e dos diagramas.
O desenho Mermaid é executado sob demanda com prévia isolada em iframe
sandbox, sem HTML de entrada inserido no documento da aplicação.

O autor pode publicar ou retirar uma TF pela própria página, depois de
confirmar o alcance de exposição: descrição, análise técnica, cenários,
resultados observados e diagramas passam a ser públicos. A mutação é
limitada por `id` e `user_id` e só confirma sucesso após retorno do banco.
O painel `#/admin` verifica `qa_admins` via RLS e somente carrega
a lista administrativa após autorização da conta; filtros por autor,
situação e busca são locais. A tela não gerencia convites nem modifica
políticas administrativas.

A publicação é opt-in e não existe no serviço publicado até o corte
da migração. Testes de autorização no navegador usam Supabase simulado:
não são equivalentes a um teste real de políticas RLS com duas contas.
