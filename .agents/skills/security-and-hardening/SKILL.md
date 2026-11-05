---
name: security-and-hardening
description: Revisar e proteger o BlockDOM contra entradas HTML/CSS/JSON não confiáveis, XSS, requisições externas, escape de sandbox, vazamento de dados, riscos de dependências e acesso indevido de alunos/professores.
---

# Security and Hardening — BlockDOM

**Origem:** https://github.com/addyosmani/agent-skills/tree/main/skills/security-and-hardening (orientação adaptada). Não instalar ferramentas externas automaticamente.

## Ativação obrigatória

Sempre que a tarefa envolver entrada de estudante, conteúdo HTML/CSS gerado, URLs/imagens, importação de arquivos, preview, novas dependências, API, autenticação, autorização, dados pessoais ou implantação.

## Regras do editor

- Tratar conteúdo do estudante e JSON importado como **não confiáveis**, mesmo quando o editor produz estrutura aparentemente correta.
- Compilar somente de modelo tipado e validado em runtime; não interpolar HTML/CSS arbitrário em `srcdoc`.
- Garantir escapamento contextual de texto/atributos e evitar fechamento de `style`, atributos de evento e URLs perigosas.
- Validar propriedades e valores CSS por gramática; não permitir `@import`, `url()` remoto, javascript:, data SVG arbitrário ou conteúdo executável.
- Manter `iframe sandbox=""` sem `allow-scripts`, `allow-same-origin`, navegação privilegiada ou formulários; CSP é defesa adicional, não substituto do sandbox.
- Testar em navegadores reais que a prévia não lê storage/cookies/DOM do host e não consegue acessar rede externa.
- Validar schema, quantidade, profundidade, tamanho, IDs e versão de snapshots; em falha, restaurar o estado pré-importação e reportar erro.
- Não usar dados pessoais de menores em testes, logs ou exemplos. A futura API deve conferir permissões no backend por usuário e por recurso.

## Auditoria de dependências e mudanças

Antes de instalar uma skill CLI ou biblioteca, revisar proveniência, licença, scripts, permissões, atualizações e necessidade. Não usar `--all` ou instalação global em massa por conveniência.

**Gate:** falha de isolamento, execução de script, acesso não autorizado ou perda de dados bloqueia aprovação. Registrar resultados e cenários adversariais efetivamente testados.
