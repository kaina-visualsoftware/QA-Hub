# Documentações e ferramentas

A área **Documentações** fica no menu principal, separada de Ferramentas. A rota `#/documentacoes` permite consultar a própria biblioteca e a coleção pública. O endereço `#/documentacoes?doc=UUID` abre um documento e funciona sem login quando ele é público.

## Funcionalidades

- Criar, consultar, editar e excluir notas, manuais, soluções, documentação de tarefa e checklists.
- Busca por título/conteúdo e filtro por tipo.
- Editor Markdown de até 80 mil caracteres, com modo Escrever/Visualizar, títulos, tabelas, listas, links e blocos de código. O HTML é sanitizado antes da renderização.
- Vínculo opcional com uma TF do próprio autor. O vínculo não publica a TF nem muda a visibilidade do documento.
- Documentos novos são privados. Tornar público compartilha também todos os anexos; não existem permissões individuais por arquivo. A leitura pública omite o proprietário e só oferece o vínculo de TF quando essa tarefa também é pública.
- Anexos de até 50 MB: PNG/JPG/WebP/GIF, MP4/WebM/OGG, PDF, DOCX, XLSX, TXT/MD/CSV, SQL, JSON, XML, LOG e ZIP. Imagens, vídeos, PDFs e textos têm prévia; demais formatos têm download.
- Ao colar imagens ou selecionar/arrastar arquivos, o editor coloca `{{arquivo:UUID}}` na posição do cursor. Cada marcador é substituído pela mídia ou cartão de download no leitor. SQL de texto inserido é cercado por blocos Markdown de código. Arquivos SQL e texto curtos exibem prévia inline. Imagens têm zoom de 50% a 500% no visualizador; ZIP é baixado sem executá-lo.
- As documentações marcadas como públicas aparecem na biblioteca de TFs públicas sem login (`#/publicas`) e na lista de Documentações (`#/documentacoes`). Marcadores de arquivos permanecem privados quando a documentação não for publicada.
- Anexar vários arquivos e remover itens da seleção antes de salvar. Se um envio falhar depois do texto ser salvo, o formulário informa a situação e repete somente os anexos pendentes, sem criar outro documento.
- Exclusão da documentação remove seus anexos primeiro. Se uma etapa falhar, o erro é informado e a exclusão final não é confirmada.

Ferramentas passa a conter Releases e Comparações. A lista de release e a revisão do comunicado têm grupos de campos separados. Textos e XML continuam sendo processados localmente. Trocar de ferramenta ou de formato preserva os rascunhos enquanto a tela estiver aberta.

## Migração e implantação

Aplicar `supabase/qa_documentacoes.sql` e, em seguida, `supabase/qa_documentacoes_markdown.sql` antes de publicar este frontend, após as migrações existentes de referências (`qa_phase3_links.sql`, `qa_referencias_edit_policy.sql`) e tarefas.

A segunda migração ajusta `qa_referencias_sem_credenciais` para não bloquear esquemas SQL que citam nomes como `password` e `token`, mas continua recusando padrões de credenciais longas ou tokens conhecidos. Ela expande os tipos MIME do bucket privado. O autor deve remover credenciais reais antes de publicar.\n\nA primeira migração amplia `qa_referencias`, preservando IDs, conteúdo e categorias existentes. As notas antigas aparecem na nova biblioteca e continuam privadas. A migração é transacional e reaplicável. Ela cria a tabela de anexos, um bucket **privado** `qa-documentacoes`, as políticas de acesso e a RPC de leitura pública. Nenhuma chave privilegiada é utilizada no navegador e nenhuma Edge Function adicional é necessária.

Somente o autor pode modificar o documento ou gerenciar anexos. Leituras públicas de texto usam a RPC `qa_public_documentacoes_v1`; downloads usam Storage com RLS e conferem a publicação atual do documento. Não existem URLs assinadas persistentes. Tornar privado impede novos downloads por visitantes, mas não apaga cópias já baixadas.

O código da migração está preparado para revisão. A execução no Supabase de produção e a publicação do frontend são operações separadas.

## Verificação

- `npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build`, `node scripts/check-bundle-budget.mjs` na pasta frontend.
- `frontend/tests/browser-documentation.mjs`: CRUD, vínculo, privacidade, publicação/retirada, retry de upload, prévias de texto/imagem/vídeo e exclusão; axe e quatro larguras de tela.
- `frontend/tests/browser-profile-utilities.mjs`: Ferramentas redesenhadas, perfil, preferências, rascunhos de texto/XML, releases e consentimento de IA.
- `.github/workflows/qa-documentation-sql.yml`: PostgreSQL 17 isolado, migração reaplicável, preservação de notas, CRUD do autor, negação entre contas, leitura anônima, anexos e retirada da publicação.

Os testes usam dados sintéticos; não substituem homologação no projeto Supabase de destino.
