---
name: frontend-design
description: Planejar, criar e revisar interfaces web próprias do BlockDOM com estética intencional, acessibilidade, hierarquia visual clara e responsividade. Aplicar antes de criar ou alterar componentes React, layouts e estilos.
---

# Frontend Design — Aplicação ao BlockDOM

**Origem de referência:** [Anthropic — frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), disponibilizada sob Apache License 2.0. **Este arquivo contém diretrizes próprias adaptadas ao BlockDOM; não é uma cópia literal da skill externa.**

## Objetivo

Entregar interfaces específicas para uma ferramenta educacional de edição HTML/CSS por blocos, com linguagem compreensível por adolescentes de 14–17 anos, visual memorável sem excesso de efeitos e comportamento de produção comprovável. A prioridade é facilitar aprender, explorar, corrigir e continuar um projeto, não decorar um dashboard.

## Quando usar

- Criar ou redesenhar tela, componente React, editor, painel, navegação, indicador, modal ou estado vazio.
- Definir identidade visual, escala tipográfica, CSS tokens, padrões de interação ou animação.
- Revisar layout em telas compactas, densidade visual, legibilidade e consistência.
- Realizar crítica de UI/UX antes de considerar uma alteração visual pronta.

Não tratar escolhas estéticas como substitutas de testes, contrato funcional ou critérios da Constitution.

## Fluxo de design

### 1. Defina o uso real

Antes de desenhar, responda:

- Quem usa esta tela: aluno iniciante, professor ou outro papel futuro?
- Qual é a ação principal? Qual erro provável um iniciante cometerá?
- Quais informações e comandos são necessários agora?
- O que pertence a uma fase futura e não deve aparecer como recurso funcional?

Use conteúdo relacionado ao aprendizado de `header`, `p`, classes, seletores, valores CSS e prévia real. Evite placeholder genérico de SaaS.

### 2. Prepare uma direção visual curta

Registre um microplano antes de editar componentes:

- **Conceito:** uma frase que descreva a experiência da tela.
- **Paleta:** base, superfície, texto, foco, erro, atenção e categorias de blocos, com tokens nomeados; contraste verificado.
- **Tipografia:** família(s), escala e espaçamentos adequados para leitura de instruções, blocos e propriedades.
- **Composição:** hierarquia principal/secundária, largura e alinhamento, e comportamento de painéis para desktop e dispositivos compactos.
- **Interação:** estados de seleção, conexão compatível, hover, foco visível, execução, feedback, vazio e falha.

A direção deve ter relação concreta com o editor visual. Se poderia ser aplicada sem ajustes a qualquer painel administrativo, refine o conceito.

### 3. Construa com contenção

- Dê protagonismo ao **editor e à prévia**; elementos decorativos não podem retirar área útil nem desviar do fluxo.
- Use contraste de peso, escala, espaçamento e composição para indicar estrutura; evite cartões idênticos empilhados sem hierarquia.
- Reserve movimento para explicar alterações reais (conexão, execução, feedback) e respeite preferências de redução de movimento.
- Estabeleça tokens reutilizáveis para cores, distâncias, raios e estados; limite regras CSS globais.
- Escreva microcópias curtas e operacionais: nome do botão e confirmação devem descrever a mesma ação.
- Prefira recursos locais; não adicione fontes externas ou imagens remotas sem necessidade aprovada.
- Não dependa de ícones isolados ou cores para transmitir significado.

### 4. Valide cada viewport e interação

Verifique pelo menos:

- **1366×768:** workspaces HTML/CSS, prévia, toolbar e feedback utilizáveis.
- **768×1024:** transições de layout previsíveis, painéis alcançáveis e sem rolagem horizontal desnecessária.
- **390×844:** navegação entre abas, ação Executar, conteúdo e feedback sem corte.
- **Teclado:** ordem de foco, controles acionáveis, seleção e operação alternativa aos gestos centrais.
- **Leitor de tela:** rótulos, regiões, atualizações de feedback e relações claras.
- **Cenários:** carregamento, vazio, bloqueio de conexão, erro estrutural, CSS sem match, execução bem-sucedida e falha.
- **Qualidade:** capturas de tela/revisão visual real quando possível, testes apropriados, bundle e ausência de regressões.

Usar WCAG 2.2 AA como referência onde aplicável. Apontar limitações reais de acessibilidade de Blockly v13, sem alegar conformidade integral sem auditoria.

## Regras arquiteturais

- Camada UI recebe modelos e diagnósticos; regras de HTML/CSS pertencem ao domínio.
- Workspaces permanecem independentes, com associação semântica de CSS e HTML.
- A prévia é conteúdo não confiável em iframe restritivo; nenhum estilo justifica mudar permissões do sandbox ou política CSP.
- Evitar dependências só para alterar aparências; justificar bibliotecas de componentes e preservar o comportamento existente.
- Na POC, priorizar a execução correta em vez de adicionar novas páginas e recursos escolares.

## Critério para concluir uma alteração visual

Só declarar finalizada após apresentar: direção visual, componentes modificados, estados cobertos, verificação em viewport e teclado, testes executados com resultados, problemas conhecidos e eventuais divergências do plano.

**Referências:** https://github.com/anthropics/skills/tree/main/skills/frontend-design · https://github.com/finfin/awesome-frontend-skills
