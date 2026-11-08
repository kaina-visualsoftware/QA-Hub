# QA Hub — F3: evidências privadas e relatórios exportáveis

## Escopo entregue

A F3 preserva as evidências e relatórios anteriores e adiciona:

- Bucket **qa-evidence-private** no Supabase Storage, privado, com limite de 10 MiB e MIME restrito a PNG/JPG/WEBP/PDF/TXT.
- Metadados append-only em public.qa_evidencia_arquivos, associados ao proprietário, TF e cenário opcional. A API comum não tem permissão para UPDATE/DELETE.
- RLS na tabela e em storage.objects com caminhos separados por usuário, TF e UUID de arquivo.
- Auditoria por gatilho privado, registrando somente tipo e tamanho (não nome ou conteúdo).
- Upload com validação de tamanho, extensão, MIME informado e assinatura básica do conteúdo.
- Prévia local de imagens, PDFs e textos e download autenticado por Storage. O navegador não cria URLs públicas ou assinadas; prévias usam objetos blob temporários.
- PDF profissional gerado localmente, com metadados da TF, situação, indicadores, lista de nomes e descrições dos arquivos, conteúdo revisado, paginação e rodapé.
- Exportação Markdown e versões históricas permanecem intactas. Exportar PDF não salva uma versão nem altera resultados/status.

## Interface e fluxo

TF > Entregáveis > Evidências e auditoria: vincule um cenário, escolha um arquivo e insira uma descrição opcional. Adicionar observação ou link fica recolhido, sem remover o recurso antigo. Os arquivos têm Visualizar e Baixar. Auditoria segue somente leitura.

TF > Entregáveis > Relatório e documentos: revise o relatório e use Exportar PDF, Baixar Markdown ou Salvar versão. Também é possível exportar versões salvas em PDF sem modificar a versão original.

## Privacidade, segurança e limites

1. Somente o proprietário autorizado pela RLS pode consultar e adicionar anexos. A API valida o caminho e a TF.
2. Cada upload usa UUID novo e upsert falso. Se metadados não forem gravados, o cliente tenta apagar somente o objeto órfão; arquivos já referenciados por metadados imutáveis não podem ser apagados por essa política.
3. O bucket não é público; anon não tem SELECT na tabela. Os arquivos e URLs de acesso não aparecem dentro dos relatórios PDF.
4. Os arquivos não são analisados por antivírus. Remova dados pessoais e credenciais antes do envio. São aceitos apenas os cinco tipos indicados e até 10 MB por arquivo.
5. Uma cópia PDF baixada deixa de estar protegida pelas permissões do bucket; o usuário deve tratar a cópia conforme a confidencialidade do material.
6. Esta migração não altera evidências textuais nem registros históricos.

## SQL / produção

Script aditivo: supabase/qa_f3_private_evidence.sql.

Aplicado no projeto Supabase usado pelo QA Hub. Validações após aplicação:
- Bucket com public=false, limite de 10.485.760 bytes e MIME restrito;
- RLS habilitado na tabela nova;
- anon sem SELECT; authenticated com SELECT/INSERT e sem DELETE na tabela;
- políticas qa_f3_files_* e qa_f3_storage_* instaladas;
- nenhum dado anterior foi intencionalmente alterado ou removido.

## Testes e homologação

- TypeScript, ESLint, build Vite e 89 testes unitários, incluindo MIME falso, isolamento por TF, limpeza de órfão e PDF com múltiplas páginas.
- E2E sintético: upload, metadados, prévia, evidência textual antiga, exportação PDF e status da TF inalterado.
- Screenshots e axe-core WCAG em 320/390/768/1366 px, sem overflow horizontal.
- Regressão das fases F0/F1/F2, acessibilidade, autenticação e bloqueio de publicação.

Homologação humana pendente: subir e baixar arquivo com sessão real, testar RLS com duas contas diferentes, visualizar PDF no celular físico e avaliar TalkBack/NVDA. Os testes sintéticos não substituem esses procedimentos.
