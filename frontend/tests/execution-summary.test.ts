import { describe, expect, it } from "vitest";
import {
  buildExecutionReport, buildTestedSummary, suggestedExecutionConclusion
} from "../src/lib/legacy/qa-phase2.mjs";

const task = {
  titulo:"Testar a correção",codigo:"67866",tipo_teste:"BUILD",
  sistema:"Financeiro",versao:"12.08",status:"em_teste",conclusao:""
};
const cases = [
  {titulo:"Desconto aplicado",status:"aprovado",passos:"Abrir pedido",
    esperado:"Desconto aplicado",obtido:"",observacoes:""},
  {titulo:"Desconto rejeitado",status:"reprovado",passos:"Alterar venda",
    esperado:"Desconto rejeitado",obtido:"Mensagem não apareceu",observacoes:""},
  {titulo:"Sem ambiente",status:"bloqueado",passos:"Abrir homologação",
    esperado:"Tela aberta",obtido:"Serviço indisponível",observacoes:""},
  {titulo:"Caso ainda não executado",status:"nao_executado",
    passos:"Executar atualização",esperado:"Sucesso",obtido:"",
    observacoes:"NÃO EXECUTADO"}
];

describe("resumo de QA fiel aos resultados persistidos", () => {
  it("sintetiza somente casos executados e não inventa observado", () => {
    const summary=buildTestedSummary(cases);
    expect(summary).toContain("Desconto aplicado");
    expect(summary).toContain("Desconto rejeitado");
    expect(summary).toContain("Sem ambiente");
    expect(summary).not.toContain("Caso ainda não executado");
    expect(summary).not.toContain("NÃO EXECUTADO");
    expect(summary).toContain("Aprovação registrada pelo QA, sem descrição do observado.");
    expect(summary).toContain("Mensagem não apareceu");
    expect(summary).toContain("Serviço indisponível");
    expect(summary).not.toContain("Desconto aplicado. Resultado observado: Sucesso");
  });
  it("não apresenta planejados como realizados", () => {
    const summary=buildTestedSummary([cases[3]]);
    expect(summary).toContain("Nenhum cenário possui execução registrada");
    expect(summary).not.toContain("Executar atualização");
    expect(suggestedExecutionConclusion([cases[3]])).toContain("Não há execução registrada");
  });
  it("não conclui a TF automaticamente com todos os casos aprovados", () => {
    const result=suggestedExecutionConclusion([
      {...cases[0], status:"aprovado"},
      {...cases[1], status:"aprovado"}
    ]);
    expect(result).toContain("2 aprovado(s)");
    expect(result).toContain("exige confirmação manual");
    expect(result).not.toContain("TF aprovada");
  });
  it("gera relatório completo, preservando pendências como pendências", () => {
    const report=buildExecutionReport(task,cases,new Date("2026-11-07T12:00:00Z"));
    expect(report).toContain("## O que foi testado");
    const overview=report.split("## O que foi testado")[1].split("## Conclusão sugerida")[0];
    expect(overview).not.toContain("Caso ainda não executado");
    expect(overview).toContain("Desconto rejeitado");
    expect(report).toContain("- Não executados: 1");
    expect(report).toContain("Há cenários pendentes");
    expect(report).toContain("## Cenário 04 — Caso ainda não executado");
    expect(report).toContain("**Status:** Não executado");
    expect(report).toContain("**Situação registrada da TF:** em_teste");
    expect(report).toContain("Aguardando conclusão do testador");
  });
  it("não permite listas inválidas nem itens de status desconhecido no resumo", () => {
    expect(() => buildTestedSummary(null as never)).toThrow("lista de cenários");
    expect(buildTestedSummary([
      {titulo:"status inválido",status:"sucesso",passos:"a",esperado:"b"},
      {titulo:"caso pendente",status:"nao_executado",passos:"c",esperado:"d"}
    ])).toContain("Nenhum cenário possui execução registrada");
  });
});
