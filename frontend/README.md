# QA Hub React — issue #37 (incremento inicial)

A pasta frontend/ contém a nova SPA e NÃO substitui o site público durante a
migração. O legado qa.html permanece ativo para IA, diagramas e relatórios.

## Desenvolvimento

Requer Node 22.12+. Execute na pasta frontend/: npm install, npm run dev,
npm run typecheck, npm run lint, npm test e npm run build.
A base Vite do build é /QA-Hub/. Valores públicos do Supabase reutilizam qa-config.js.
Variáveis VITE_ opcionais são descritas em .env.example; nunca incluir service_role,
sb_secret_ ou tokens de provedores no cliente.

O incremento traz Auth, listagem/busca de TFs, criação rápida, edição básica,
cenários, execução manual, edição/exclusão de registros e diagramas Mermaid nativos (lazy). Estados remotos usam TanStack Query; foco local,
Zustand; validação, Zod/React Hook Form. Nenhuma aprovação automática via IA.

Pendências: paridade de IA, histórico, documentos, geração de diagramas por IA,
requisitos, callbacks de produção, testes RLS com contas reais,
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

PDF/DOCX originais são armazenados, mas a extração de texto automática
ainda não está disponível nesta interface React. TXT e MD são lidos
localmente, antes do upload. Nenhum arquivo é transmitido à IA por padrão.

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
não são guardados nesses registros. A comparação visual e local ainda depende
da migração das ferramentas do legado.
