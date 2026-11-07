# QA Hub React — roteiro de homologação assistiva e de reflow

> Status: **pendente de execução humana**. Este documento descreve o protocolo,
> não registra aprovação. Não publicar a migração apenas porque o axe-core passou.

## Pré-condições

- Usar a SPA de prévia da PR #39, separada de \`main\`/produção.
- Conferir versão/commit testado, navegador, sistema operacional e resolução.
- Utilizar **dados sintéticos** de TF, cenários e diagramas. Não usar dados reais
  de clientes em links públicos ou em screenshots dos testes.
- Verificar primeiro os checks da GitHub Actions e executar
  \`frontend/tests/browser-accessibility.mjs\` com o site em preview.
- Para testes de permissão (anon / usuário / admin), usar ambiente Supabase de
  teste e contas autorizadas pela equipe; a suíte sintética não valida RLS real.

## Matriz de execução

| ID | Jornada e ação | Resultado de aceite | Registro |
|---|---|---|---|
| A01 | Login: teclado somente, Tab/Shift+Tab | Ordem acompanha layout e foco sempre visível; sem armadilhas | [ ] |
| A02 | Cadastro, troca login/registro e recuperação | Leitor anuncia formulário, rótulos, alertas e confirmações | [ ] |
| A03 | Workspace e criação de TF | Título, código, descrição e salvar são acessíveis por teclado | [ ] |
| A04 | Extração local de relatório | Prévia é anunciada; nada é aplicado ou anexado por padrão | [ ] |
| A05 | IA local opt-in e cancelamento | Consentimento explícito, progresso acessível, sem travar o teclado | [ ] |
| A06 | Abrir TF, buscar cenário e registrar falha | Modal foca campo observado; Tab/Shift+Tab circular; Escape fecha | [ ] |
| A07 | Modal do resultado: fechar/cancelar | Foco volta ao botão que abriu; execução não foi alterada | [ ] |
| A08 | Biblioteca pública anônima | Busca, itens e detalhe podem ser percorridos sem login | [ ] |
| A09 | Diagrama público: ampliar e fechar | Foco contido; Escape fecha; volta ao botão Ampliar | [ ] |
| A10 | Diagrama público: texto alternativo | Código-fonte Mermaid está acessível em conteúdo textual | [ ] |
| A11 | Reflow/zoom 200% | Sem sobreposição ou perda de conteúdo importante | [ ] |
| A12 | Reflow/zoom 400% (viewport CSS ~320px) | Sem rolagem horizontal no conteúdo geral; ferramentas complexas podem ter área de rolagem própria documentada | [ ] |
| A13 | Contraste alto/forced-colors e foco | Botões, estados e feedback continuam identificáveis sem depender só da cor | [ ] |
| A14 | TF pública/privada e alternância de contas | Dados protegidos não aparecem na biblioteca ou após logout | [ ] |

## Leitores de tela e dispositivos

Executar ao menos NVDA + Firefox ou Chrome (Windows), TalkBack + Chrome
(Android) e, se disponível, VoiceOver + Safari (iOS/macOS). Registrar
a tecnologia assistiva, versão e navegador para cada caso. Em qualquer
leitor: verificar nomes acessíveis, estado de botões/checkboxes, ordem de
leitura, avisos com \`role=status/alert\`, título da página, e retorno do
foco após fechar diálogos.

## Modelo do registro de evidências

Para cada ID, anotar: data/hora, ambiente, commit, plataforma, navegador,
zoom, leitor de tela, **aprovado / reprovado / bloqueado**, descrição do
comportamento, resultado esperado, diferença encontrada, screenshots ou
vídeo *sem dados sensíveis*, issue de correção e pessoa responsável.
Reprovações devem criar um bug e exigir nova execução.

## Condições para liberar a PR

1. Todos os checks automatizados React e legado verdes no commit de corte.
2. Evidência de homologação humana dos cenários A01–A14;
   exceções justificadas e aprovadas por responsável de QA.
3. Homologação separada com **duas contas Supabase reais de teste**,
   incluindo RLS/Storage, links privados/publicados, callback de Auth.
4. Ensaio de backup, plano de rollout/rollback e decisão formal de corte.
5. Homologação de inferência de IA local com pesos reais
   (desktop e celular), fallback CPU/WASM e limites de memória.

O teste do axe-core valida apenas regras automáticas e **não comprova
conformidade WCAG completa**; o orçamento de bundle também não substitui
métricas reais de rede, CPU/memória e Core Web Vitals.
