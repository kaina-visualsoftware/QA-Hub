# QA Hub — F5: colaboração e integrações

## Entregas

A F5 adiciona equipes, convites, vínculo privado de uma TF a uma equipe, responsabilidade por execução, comentários e importações de resultados automatizados. As mudanças ficam no menu Perfil e configurações > Gerenciar equipes e em TF > Entregáveis > Equipe e comentários. A interface mantém um único modal com as áreas Equipe, Conversa e Integrações, ocultando operações avançadas até o usuário solicitar.

## Papéis e autorização

- Proprietário da TF: gerencia equipe vinculada, responsável, cenários, situação, compartilhamento público e exclusões.
- Gestor de equipe: pode visualizar, comentar e registrar a execução nas TFs explicitamente compartilhadas com a equipe. Não pode excluir ou publicar uma TF de outro proprietário.
- QA membro: pode visualizar e comentar. Para registrar resultados, precisa estar explicitamente designado responsável na TF.
- Leitor: consulta a TF e seus comentários, sem escrever ou executar.

A equipe precisa ser criada pelo titular, e o convite é aceito ou recusado pelo destinatário autenticado cujo endereço corresponde a um e-mail confirmado no Supabase Auth. O aplicativo não envia automaticamente mensagens por e-mail; o criador deve avisar a pessoa para acessar Perfil > Gerenciar equipes. O gestor da equipe ajusta papel ou remove integrante, revogando o acesso. Convites aceitos ou recusados podem ser liberados pelo gestor para permitir novo convite após remoção.

Uma TF pode ser vinculada apenas pelo seu proprietário e somente a uma equipe de que ele seja titular. O vínculo é revogável sem publicar a TF. Arquivos privados anexados no Storage, prompts e bibliotecas pessoais de outros usuários não são compartilhados automaticamente.

No banco, as novas tabelas usam RLS, e os helpers de verificação de acesso ficam no schema privado qa_private. O papel de usuário não é derivado de user_metadata. O gatilho de UPDATE de cenário impede que gestores e QAs designados alterem qualquer campo que não seja status, resultado observado ou atualização de data; edições estruturais continuam reservadas ao proprietário ou administrador já autorizado. Comentários são registros sem UPDATE e sem acesso de escrita anônima.

## Integrações

### GitHub Issues

A partir da TF, é gerado um link HTTPS para revisar uma nova issue, com título e descrição preenchidos. O usuário confirma explicitamente antes de abrir o rascunho, pois o link transfere título e descrição da TF ao GitHub. Depois, também precisa confirmar manualmente a publicação na interface GitHub. Nenhum token ou OAuth é solicitado e não ocorre criação silenciosa de issue.

### JUnit e Playwright

Relatórios JUnit XML e Playwright JSON de até 2 MB são lidos localmente no navegador, limitados a 200 testes. XML com DTD, entidades ou referências externas é rejeitado. O QA associa manualmente um item a um cenário, escolhe o resultado e confirma o registro individualmente. O status geral da TF nunca é modificado automaticamente. O histórico F4 é gerado pelas alterações efetivamente salvas.

## Migrações e implantação

- supabase/qa_f5_collaboration.sql: seis novas tabelas protegidas por RLS, índices, políticas adicionais de leitura em TFs vinculadas, helpers no schema qa_private e três gatilhos de integridade.
- supabase/qa_f5_collaboration_policies.sql: aprimora as políticas do criador de equipe e a limpeza explícita de convites históricos. A mesma versão dessas regras foi incorporada à migração base para instalações novas.

As duas migrações aditivas já foram aplicadas ao Supabase usado pelo QA Hub. A aplicação não criou equipes ou vinculou tarefas reais de usuários. As operações existentes de dono/admin permanecem disponíveis, e o compartilhamento público da TF continua regido pela configuração de publicação anterior.

## Validação e limitações

- TypeScript, ESLint, Vitest, build Vite e suíte de navegador com backend sintético de duas contas.
- Testado: criação de equipe, convite, aceite, compartilhamento, QA não atribuído, comentário, atribuição, execução após atribuição, rascunho de GitHub Issue, importação local de JUnit confirmada, alteração para leitor, revogação do integrante, perda imediata de acesso ao recarregar, exclusão de convite histórico e reenvio.
- Acessibilidade e layout em 320, 390, 768 e 1366 px, com ausência de overflow horizontal e checagem WCAG automatizada.

Homologação humana ainda necessária: testar com duas contas reais e endereços de e-mail confirmados, leitor de telas, celular físico, e análise de permissões autenticadas ponta a ponta no Supabase (mock de navegador não substitui esse teste). Não há e-mails automáticos, sincronização bidirecional com GitHub nem associação de testes automática por nome.
