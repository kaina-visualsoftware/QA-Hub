# TF-405 — Divergência em exemplo de consulta

| Recurso | Antes | Depois |
| --- | --- | --- |
| Pedido sintético | Total de 100,00 | Total permanece 100,00 |
| Status | Pendente | Pendente |

## Consulta de referência (não executar)
```sql
SELECT id, status, total FROM pedidos_exemplo WHERE id = 'DEMO-01';
```

## Critério
Não alterar saldo ao apenas visualizar o pedido.
