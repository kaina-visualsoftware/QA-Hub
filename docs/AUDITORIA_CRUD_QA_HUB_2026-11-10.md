# Auditoria de CRUD — QA Hub React
Data: 10/11/2026. Validação no CQP-KAINA-72 com Chromium e Supabase conectado.

## Regra de produto
Toda entidade editável que o usuário pode criar deve oferecer criação, consulta, edição e exclusão (ou um equivalente explicitamente seguro e justificado). Os dados só mudam após confirmação da API. Exclusões requerem confirmação com impacto, e ações de escrita ficam indisponíveis em contas sem permissão.

## Matriz da interface

| Registro | Criar | Consultar | Editar | Excluir / equivalente |
|---|---|---|---|---|
| TF | Wizard | Lista e resumo | Editor de TF | Excluir TF com confirmação |
| Cenário | Cadastrar / IA / biblioteca | Lista e Guiado | Editar no cartão ou modo Guiado | Excluir com impacto e preservação privada de anexos |
| Resultado de execução | Executar | Detalhe e histórico | Registrar outro resultado | Desfazer execução; eventos de histórico preservados |
| Modelo de cenário | Salvar na biblioteca | Buscar / ver roteiro | Editar modelo | Excluir somente o modelo privado |
| Requisito | Importar / cadastrar | Descrição, aceite, revisões | Editar + estado | Arquivar ou excluir com perda explicitada de vínculos e revisões |
| Diagrama | Criar por IA ou manual | Prévia / biblioteca | Editor Mermaid | Excluir diagrama |
| Referência | Criar | Listar, pesquisar e copiar | Editar na biblioteca / ferramentas | Excluir referência |
| Release vinculada | Vincular | Listar | Desvincular e vincular outra versão | Desvincular sem apagar release global |
| Equipe | Criar | Selecionar + membros | Renomear, membros e papéis | Excluir equipe |
| Convite | Convidar | Pendentes / histórico | Cancelar e reenviar | Cancelar ou liberar registro anterior |
| Comentário | Publicar | Conversa da TF | Editar o próprio | Excluir o próprio |
| Evidência textual | Registrar | Consultar | Editar texto, tipo ou vínculo | Excluir sem apagar logs de auditoria |
| Arquivo e captura | Enviar / colar | Prévia, download, publicar | Editar descrição e publicação | Excluir metadados e limpar objeto privado |
| Post e relatório | Gerar / escrever / salvar | Biblioteca | Criar uma nova versão editada | Excluir versão individual com confirmação |

## Exceções que preservam rastreabilidade
- Eventos de auditoria, execução histórica e revisões anteriores não oferecem edição nem exclusão arbitrária: são trilhas de evidência do processo.
- Fontes originais de requisitos/documentos versionados são imutáveis; novas versões são criadas em vez de substituir o arquivo original.
- Comparações persistem somente contadores e histórico; resultado de uma nova comparação constitui novo registro.
- Releases globais podem estar vinculadas a várias TFs; remover uma associação não apaga informações usadas por outras TFs.

## Cenários e imagens públicas
O banco usa `qa_evidencia_arquivos.cenario_id ON DELETE SET NULL`, e a publicação requer vínculo com cenário. Antes de excluir um cenário, o frontend revoga todas as permissões `publica=true`, confirma que nenhuma persiste e só então solicita a exclusão. Os arquivos ficam associados à TF de forma privada; os vínculos de requisitos e históricos de execução do cenário são removidos conforme as FKs existentes. Uma falha na revogação impede a exclusão.

Na exclusão direta de imagem, a ordem é: revogar publicação, remover metadados do banco, remover objeto do bucket privado pela política exclusiva de limpeza de órfãos. Erros da última etapa são mostrados sem alegar que o armazenamento foi limpo.

## Políticas e segurança
`supabase/qa_crud_owner_permissions.sql` adiciona permissões específicas, sem liberar `service_role` no navegador, sem UPDATE genérico de `user_id` ou `tarefa_id` e sem mutação por usuários anônimos. As policies de `authenticated` sempre validam o usuário proprietário. O texto de comentários só pode ser modificado pelo autor, dentro de TF acessível; o dono da TF não pode editar texto escrito por outra pessoa.

Foi feito teste da migração com `ROLLBACK` antes da execução definitiva, seguido de consulta ao catálogo `pg_policies` confirmando dez políticas, sem afetar registros existentes.

## Testes automatizados
- `frontend/tests/crud-evidence.test.ts`: valida propriedade e ordem de revogação/exclusão.
- `frontend/tests/crud-policy-and-workflow.test.ts`: verifica política de dono, revisão e ausência de prévia falsa no primeiro passo de posts.
- `frontend/tests/browser-scenario-crud.mjs`: cria fixture, edita cenário, encontra ações em Lista e Guiado e exclui após revogação de imagem pública, com capturas em 320/390/768/1366 px.
- `frontend/tests/browser-ai-workbench.mjs`: a etapa Configurar do post não renderiza o painel de prévia.
- `frontend/tests/browser-suites.mjs`: regressão das áreas React com mocks de Supabase/NVIDIA.

## Limites de homologação
As suítes de navegador usam usuários e dados simulados. A migração de permissões foi verificada no Supabase real, mas nenhuma TF ou evidência verdadeira foi modificada ou excluída nos testes. Leitores de tela físicos, políticas de equipe com contas reais e limpeza de objetos órfãos reais exigem homologação com dados sintéticos em uma conta de testes.
