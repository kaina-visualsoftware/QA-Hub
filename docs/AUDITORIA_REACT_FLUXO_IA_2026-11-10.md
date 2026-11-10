# Auditoria complementar do QA Hub React — fluxo de IA e interface

**Data:** 10/11/2026
**Ambiente:** CQP-KAINA-72, Windows, Node.js 24, Chromium automatizado com Playwright e backend Supabase simulado.
**Base:** React 19, Vite, Tailwind, HeroUI. Revisão da interface já migrada e da tela de geração de casos da Central de IA.

## Fontes e método

Diretrizes aplicadas: Impeccable (audit, Operate e craft-floor), Playwright E2E, acessibilidade WCAG e Web Quality Audit. A versão da skill Impeccable neste checkout não acompanha o executável opcional; os critérios foram aplicados diretamente por leitura dos arquivos e inspeção do Chromium.

Os dados dos testes são sintéticos. Nenhuma publicação, conta ou tarefa de produção foi alterada. As capturas visuais correspondentes são produzidas nos diretórios de artefatos de teste e anexadas pelos workflows GitHub Actions.

## Matriz das rotas verificadas

| Tela / estado | Abordagem |
| --- | --- |
| Login, cadastro e recuperação | Chromium + axe-core, 320/390/1366 px |
| Lista de tarefas e detalhes da TF | Chromium, overflow, foco e navegação por abas |
| Criação de TF e execução guiada | Fluxos E2E com mocks; persistência explícita |
| Cenários e geração com IA | SSE simulado, consentimento, cancelamento, revisão |
| Posts e diagramas | Modais, feedback, streaming e validação Mermaid |
| Arquivos, requisitos, evidências | Rotas React, modais, revisão e testes de fluxo |
| Ferramentas | Releases, comparações e informações de QA, 320/390/1366 px |
| Painel | Indicadores e responsividade, 320/390/1366 px |
| Perfil | Preferências, equipes e responsividade, 320/390/1366 px |
| Biblioteca pública | Listagem e detalhe, sem dados privados nas fixtures |
| Administração | Estado de falta de permissão; admin autorizado tem suite separada |
| Links antigos | Redirecionamentos de compatibilidade para React |

## Defeitos encontrados e corrigidos nesta rodada

1. **P2 — Status opaco da geração demorada.** O modal exibia fase e volume recebido, mas não indicava duração real. Adicionado relógio desde o início da requisição e contador de caracteres transmitidos. O relógio não representa porcentagem de conclusão.
2. **P2 — Ausência de diagnóstico de inatividade.** Quando o streaming deixa de emitir dados por oito segundos, a interface informa há quanto tempo não recebe trechos e esclarece que a solicitação continua ativa. Antes do primeiro trecho, a instrução muda depois de 12 segundos; o usuário pode cancelar sem gravar dados.
3. **P2 — Prévia parcial pouco prática em streaming contínuo.** A leitura acompanha o trecho mais recente somente se o usuário já está perto do final da área de texto. Quem rolar manualmente para cima não tem a posição forçada.
4. **P2 — Cronologia extensa em telas de 320 px.** A linha de processamento passou a ser uma lista vertical compacta no menor breakpoint, reduzindo a altura ocupada pelos quatro estados.
5. **P3 — Movimento reduzido com barra aparentemente completa.** A barra indeterminada deixa de animar, mas não passa a ocupar 100% da largura em `prefers-reduced-motion`, evitando sugerir conclusão inexistente.
6. **P1 — Contraste insuficiente durante a animação de notificações.** O axe-core encontrou contraste 3,67:1 no texto da notificação “Filtro aplicado” em 320 px enquanto o toast surgia com opacidade parcial (mínimo WCAG AA: 4,5:1). A transição global foi limitada a um pequeno deslocamento, preservando contraste integral desde o primeiro quadro. A suíte de busca, filtros e histórico foi reexecutada e passou nos quatro tamanhos testados.

Essas melhorias preservam o fluxo em três etapas já implementado: **Configurar → Gerar → Revisar e adicionar** (ou Revisar e salvar para posts).

## Verificações

- Build TypeScript/Vite: aprovado.
- ESLint: aprovado.
- 35 arquivos e 139 testes unitários React: aprovados.
- Auditoria de rotas com axe-core WCAG AA e overflow em 320/390/1366 px: aprovada nos estados exercitados.
- E2E do fluxo de IA com SSE simulado, consentimento, indicadores de etapa, revisão e capturas da transmissão em 320/390/768/1366 px: aprovado.
- E2E de buscas, filtros e histórico após correção de contraste: aprovado em quatro breakpoints.
- Suíte ampliada de navegador: **21/21 aprovadas** na segunda execução completa após a correção de contraste (20/21 na primeira rodada). Inclui login, QA, IA, diagramas, requisitos, evidências, colaboração, ferramentas, perfil, biblioteca pública e acessibilidade.

## Avaliação de qualidade (escopo automatizado e inspeção de código)

| Dimensão | Nota / 4 | Observação |
| --- | --- | --- |
| Acessibilidade | 3 | Sem falhas WCAG AA detectadas nos estados examinados; leitor de tela físico não testado |
| Desempenho | 2 | Build aprovou, mas mantém aviso de chunks > 500 kB; não foi feito perfil completo de Web Vitals |
| Temas e consistência | 2 | Linguagem visual relativamente coerente, mas ainda há cores literais no CSS de geração |
| Responsividade | 4 | Sem overflow detectado em três larguras, com prévia e estados compactos |
| Integridade de implementação | 3 | Separação por componente e comportamento de streaming verificável; há CSS histórico extenso |
| **Total** | **14 / 20** | **Bom, com itens técnicos de manutenção** |

As notas são uma avaliação da amostra verificada, não uma certificação geral de acessibilidade ou performance.

## Limitações e possíveis próximas etapas

- Integração NVIDIA com rede real, falhas reais e latências variáveis não testadas.
- Avaliação manual em celulares físicos, leitor de tela e zoom de texto ainda é necessária.
- Extrair gradualmente estilos literais dos componentes para tokens globais, sem reescrever toda a interface em um único PR.
- Avaliar divisão de bundles de Mermaid, PDF e outras funções pesadas em uma iniciativa específica, com medições antes/depois.
- Não remover rotas de callback antigos ainda utilizados por links de autenticação já enviados.
