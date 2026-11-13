# Ferramentas solicitadas para agentes de desenvolvimento

Referências externas para considerar em futuras tarefas de desenvolvimento do QA Hub.
Estes repositórios **não são skills nativas instaladas no ChatGPT**: são ferramentas de
linha de comando, plugins ou bibliotecas que exigem configuração própria. Sua inclusão
nesta documentação não autoriza executar scripts externos, instalar dependências no
ambiente do usuário ou enviar dados de tarefas para serviços externos.

| Ferramenta | Repositório | Quando avaliar |
| --- | --- | --- |
| RTK | https://github.com/rtk-ai/rtk | Compactar saída de testes, builds e logs de agentes de programação |
| Context Mode | https://github.com/mksglu/context-mode | Gerenciar contexto de agentes locais e recuperar saídas de ferramentas |
| Headroom | https://github.com/headroomlabs-ai/headroom | Avaliar compressão de contexto para integrações de agentes e LLMs |
| Graphify | https://github.com/Graphify-Labs/graphify | Explorar grafos de código, relações e análise de dependências |

## Regra de adoção

1. Consultar estas quatro referências em tarefas futuras de engenharia e usar
   as que forem pertinentes e compatíveis com o ambiente disponível.
2. Antes de instalar ou integrar, revisar licença, versões, requisitos,
   segurança, privacidade e impactos sobre os dados do QA Hub.
3. Não substituir as stacks aprovadas nem acrescentar runtime, servidor,
   telemetria ou dependências de produção apenas para usar essas ferramentas.
4. Registrar o que foi efetivamente utilizado; não afirmar que uma ferramenta
   foi instalada ou executada sem evidência.
5. Não comprimir nem descartar evidências de QA ou resultados de teste:
   compactação de logs deve preservar os artefatos completos para auditoria.
