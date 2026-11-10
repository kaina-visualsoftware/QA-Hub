# QA Hub — diagramas, formatos de posts e evidências de cenários

Data: 10/11/2026. Auditoria e implementação no CQP-KAINA-72.

## Experiência do usuário

### Diagramas
- Mesmo padrão dos posts: configurar e gerar, revisar a prévia, salvar explicitamente.
- A linha de etapas continua visível ao abrir o modal; foco do título não desloca a navegação.
- Checkbox de consentimento limitado a 18 × 18 px com regras específicas para evitar herdar dimensões de outros controles.
- Cobertura da TF compacta em celulares; opções avançadas podem ser recolhidas.
- Continua a exigir consentimento, validação Mermaid e salvamento humano, sem gravação automática.

### Posts
- Escolha entre **Markdown** (padrão) e **BBCode** *antes* de gerar com a NVIDIA.
- BBCode preserva título, destaques, separadores, comparação antes/depois, caminho, tarefa e justificativa.
- Marcadores de imagem não são convertidos automaticamente em URL inventada.
- Revisão e edição, cópia e gravação da versão escolhida permanecem na mesma etapa final.

### Casos de teste
- No modo guiado ou em lista, expandir **Colar captura ou visualizar imagens deste teste**.
- Clicar na área de colagem e usar **Ctrl+V** após capturar a tela, ou escolher PNG/JPG/WEBP.
- Prévia + observação textual, envio ao bucket privado e associação com o identificador do cenário.
- Publicação opcional por imagem, com confirmação. Sem opt-in, continua privada, mesmo com TF publicada.
- O QA pode retirar a autorização da imagem sem despublicar a TF.

### Biblioteca pública
- Resumo por cenário: aprovados, reprovados, bloqueados e pendentes.
- Cada cenário publicado tem status próprio, passos, esperado, resultado observado, observações e imagens explicitamente autorizadas.
- Galeria responsiva com legenda e ampliação. Não há download direto nem URL do bucket privado na projeção da API.

## Rollout de segurança

Aplicado ao projeto Supabase do QA Hub:
- `supabase/qa_public_evidence_optin.sql` (migração aditiva; coluna `publica` default false, política UPDATE só do dono, allowlist).
- `supabase/functions/qa-public-evidence/index.ts` (Edge Function **qa-public-evidence**, `verify_jwt=false`, acesso permitido somente após checagem no servidor a cada GET).
- A função pública de detalhes retorna somente `id, cenario_id, nome_original, descricao, mime_type` das imagens autorizadas e pertencentes ao dono da TF. Não expõe `user_id`, `objeto_path` ou credenciais.
- O bucket `qa-evidence-private` permanece privado. Não permitir `getPublicUrl()` para esses arquivos.
- Consultas autorizadas ao armazenamento usam chave de serviço **exclusivamente na Edge Function**, jamais no frontend.
- A exclusão/revogação de permissão é imediatamente observada no próximo acesso: cabeçalhos `no-store`.
- Não executar migração de publicação para `true` em arquivos existentes. Auditoria do banco confirmou inicialmente zero imagens autorizadas e bucket não público.

Limitações: não houve simulação ponta-a-ponta de imagem efetivamente pública usando uma conta de produção, para não publicar evidência real durante o teste. Os testes de UI usam fixtures sintéticas, e o endpoint real respondeu HTTP 400 para ID inválido e HTTP 404 para ID inexistente. Verificação adicional com usuário autorizado e captura sintética deve ocorrer em homologação.

## Validação

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `browser-ai-workbench.mjs` para modal post/diagramas e opção BBCode.
- `browser-public-evidence.mjs` para status, observações, galeria opt-in, ausência de chamadas diretas a Storage, 320/390/768/1366 px.
- `browser-qa-flow.mjs` para geração, edição e anexação de evidências.
- `browser-suites.mjs` para regressão geral; executar com build da publicação coerente com a fixture.
- Supabase Security Advisors: avisos em funções `SECURITY DEFINER` de leitura pública são intencionais e já preexistentes. O acesso é limitado ao campo `publica` e projeções explícitas. A auditoria também aponta configurações de proteção de senha e tabelas internas de uso de IA fora do escopo desta tarefa.

## Próximas oportunidades

Aprimorar thumbnails privadas com cache de memória curto, compor um relatório PDF público com imagens somente autorizadas, e compactar imagens de captura preservando legibilidade; isso exige testes de performance e revisão de privacidade.
