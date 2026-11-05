# Compartilhamento e diagramas — QA Hub

## Visibilidade das TFs

- Cada nova tarefa é **Privada** por padrão, inclusive as existentes antes desta mudança.
- Na etapa de revisão, o campo **Quem pode ver esta TF?** permite selecionar **Pública** antes de salvar ou posteriormente.
- TF pública pode ser consultada, sem login, em `public.html?tf=<uuid>`; a página exibe dados do registro, cenários e diagramas Mermaid.
- TF privada continua acessível apenas ao autor e a administradores. A página pública é somente leitura: não mostra ações de editar, salvar ou excluir.
- O workspace autenticado mostra apenas as TFs da conta (e todas para administradores); a biblioteca pública é separada para evitar que outros usuários editem uma TF compartilhada.
- **Privacidade:** ao selecionar Pública, também ficam visíveis os textos de descrição, nomes, contexto de sistema, resultados de testes, cenários e diagramas. Revise informações internas e dados pessoais antes de publicar.
- Políticas RLS no Supabase autorizam `SELECT` apenas para `publica=true`, inclusive registros relacionados. Não concedem UPDATE/INSERT/DELETE ao papel anônimo.

## Diagramas Mermaid com IA

No editor da TF salva, abra **Diagramas > Novo diagrama**. É possível:
1. **Usar dados da TF**: envia à Edge Function a descrição, a análise, a correção, a conclusão e os cenários existentes para descrever o processo com suas decisões.
2. **Escrever ou colar texto**: utiliza uma descrição escrita especificamente para o fluxograma.
3. **Editar manualmente**: permite colar diretamente código Mermaid no campo existente, com prévia.

O serviço `qa-ai`, protegido por Supabase Auth, agora oferece `mode=diagram` e reutiliza os modelos gratuitos permitidos da NVIDIA Build e a chave configurada em segredo. O prompt pede `flowchart TD`, nomes simples, etapas e decisões fundamentadas somente nos dados fornecidos. Rejeita comandos executáveis, links e diretivas de inicialização. Quando o modelo falha em produzir fluxo válido, o cliente sugere um diagrama básico com base no texto; a revisão manual continua obrigatória.

O botão **Salvar diagrama** é separado da geração. Diagramas gerados não são salvos automaticamente.

## Zoom e navegação

Tanto a prévia quanto os diagramas salvos (inclusive em TF pública) oferecem **Ampliar**. A janela permite zoom +/−, 100%, ajustar à tela, roda do mouse, arrastar para mover, teclado (+, -, 0, setas) e fechamento por Escape. O SVG é renderizado com `securityLevel:'strict'`.

## Validações

- Migração `supabase/qa_public_visibility.sql` aplicada no projeto SIA.
- Teste de banco com papel `anon` confirmou zero registros privados visíveis e nenhuma permissão de atualização ou exclusão para visitantes.
- `tests/mermaid-ai.test.mjs`: prompt, parser Mermaid, fallback e cliente da função.
- `tests/ui-smoke.mjs`: edição, publicação, diagramas, zoom e biblioteca pública em diferentes resoluções usando Supabase simulado.
- Homologação com NVIDIA real depende da disponibilidade da API e da chave no segredo do Supabase. Testes sintéticos não substituem verificações com dados reais e leitores de tela.
