# Evolução do QA Hub a partir do prompt e do Geradores.html

## Origem e escopo

Referências fornecidas pelo usuário:
- `qa-hub-prompt.md`, seções 1–6 e apêndices A (posts) e B (roteiros de teste).
- `Geradores (3).html`, aplicativo de referência com as regras locais, execução de cenários, histórico e backup.

O QA Hub anterior já possuía TFs, cenários, diagramas, acesso público opcional, autenticação e geração auxiliar de TF/diagramas. A integração abaixo complementa o projeto: não substitui as telas existentes nem gera fatos não informados.

## Matriz de lacunas e implementação

| Requisito | Situação anterior | Entrega |
|---|---|---|
| Posts para fórum (Apêndice A) | Ausente | Módulo Posts; chamada NVIDIA via Supabase com streaming, prévia, Markdown e BBCode |
| Roteiros 8–20 cenários (Apêndice B) | Não havia gerador completo de roteiro | Módulo Casos de teste; roteiro com objetivos, pré-requisitos, passos, esperados, riscos hipotéticos e critérios |
| Painel de execução SIA | Cenários simples na TF, sem os controles do Geradores | Painel dedicado com status, OBS, copiado/não copiado, atalhos, renumeração e relatório |
| Organização de releases | Ausente | Módulo local do Geradores: versão, equipe, status 11/12 e relatório separado |
| Comparar comunicado | Ausente | Comparação determinística e saída BBCode, preservando texto não vinculado |
| Informações importantes | Ausente | Biblioteca local por categoria com prazos, senha oculta e busca; sem upload para IA/Supabase |
| Comparar textos | Ausente | Diff LCS local, limite 1.500 linhas |
| Comparar XML | Ausente | DOMParser local e comparação de caminho, namespaces, atributos e valores |
| Histórico e backup | Historico apenas de TFs | Histórico próprio de posts e roteiros, backup JSON, deduplicação e recuperação parcial |
| Ferramentas no menu | Só TFs e painel geral | Links diretos, rotas por fragmento e acesso pela TF salva |
| IA segura e free | Função `qa-ai` para TF e diagramas | Função separada `qa-generators`, apenas endpoints gratuitos permitidos no catálogo, com streaming, autenticação e limite compartilhado |

## Regras de produto e segurança

1. A IA **redige** posts e roteiros, mas não comprova a execução nem inventa resultados. A lista de *possíveis bugs* contém hipóteses para testar, não defeitos confirmados.
2. Texto, XML, listas de release, comunicações e informações importantes são processados no browser. Não são enviados à IA; histórico local de configurações é preservado.
3. `qa_generator_posts` e `qa_generator_tests` são tabelas de histórico por usuário com RLS e políticas explícitas de SELECT/INSERT/UPDATE/DELETE do proprietário. `anon` não tem acesso.
4. Códigos e senhas em **Informações importantes** permanecem no armazenamento local **sem criptografia**. Isso é informado na interface; senhas sensíveis devem ficar num gerenciador apropriado. Criptografia com senha mestra fica como evolução opcional, não como falsa promessa de segurança.
5. A ação de usar uma TF salva para gerar post ou roteiro é **explícita**: abre o gerador e exige o clique em `Usar dados da TF`; o envio à NVIDIA só ocorre quando o usuário clica em `Gerar`.
6. Modelo gratuito não significa cota ilimitada. Os modelos habilitados são `nvidia/nemotron-3.5-lightning-30b-a3b` e `z-ai/glm-5-3-flash`, conferidos pelo endpoint de modelos antes de uso. Caso indisponíveis, informar a falha, sem fingir ter gerado.
7. O backend registra apenas metadados de falha de provedor; não imprime a TF, as respostas ou o segredo da NVIDIA em logs.
8. O limite da função existente `qa_ai_claim_request()` é compartilhado pelos geradores e demais recursos de IA do QA Hub.

## Rotas e uso

No menu lateral do QA Hub existem links para `geradores.html#post`, `#teste`, `#release`, `#lib`, `#diff`, `#xml`. O `geradores.html` oferece também Início, histórico por tipo e cópias em Markdown/BBCode.

Na TF salva, há duas opções: **Gerar post com IA** e **Gerar roteiro com IA**. O URL abre uma nova aba, mantendo a TF no editor. A importação do conteúdo da TF ocorre somente após autorização pelo clique.

## Validação

- Testes estáticos: sintaxe e ausência de `claude.use`; preservação dos prompts fornecidos; rotas de navegação; isolamento dos módulos locais.
- Testes browser (Chromium 390 e 1366 px): post/roteiro gerados com SSE sintético (sem custos de NVIDIA), histórico, release, texto, XML e informação local.
- Testes de banco: `anon` não pode consultar o histórico; usuários autenticados possuem GRANT sem extrapolar as políticas RLS.
- Homologação real da qualidade dos textos gerados por NVIDIA depende de testes com tarefas reais e revisão humana. A verificação automatizada não comprova a qualidade semântica das respostas.

## Evoluções posteriores (não implementadas nesta entrega)

- Revisão assistiva completa e homologação dos roteiros com dados reais de QA.
- Criptografia local com senha mestra para registros sensíveis, caso a biblioteca de acessos seja mantida.
- Revisões de performance da comparação LCS com entradas próximas ao limite e testes de release com coleções de casos reais fornecidas pelo time.
