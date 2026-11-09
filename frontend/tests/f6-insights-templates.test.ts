import {describe,expect,it} from "vitest";
import {coveragePercent,monthLabel,qaInsightsSchema} from "../src/features/insights/insights-data";
import {reusableDraft} from "../src/features/scenario-library/scenario-model-data";
import type {Scenario} from "../src/lib/contracts";

describe("F6: inteligência de QA e modelos reutilizáveis",()=>{
  it("calcula cobertura atual sem divisões inválidas",()=>{
    expect(coveragePercent(0,0)).toBe(0);
    expect(coveragePercent(2,4)).toBe(50);
    expect(coveragePercent(10,3)).toBe(100);
    expect(coveragePercent(-1,3)).toBe(0);
  });
  it("valida agregados sem transformar execução pendente em aprovada",()=>{
    const value=qaInsightsSchema.parse({
      modules:[{modulo:"Vendas",tarefas:2,casos:4,executados:3,problemas:1}],
      versions:[{modulo:"Vendas",versao:"12.08",tarefas:2,
        aprovadas:0,casos:4,executados:3,problemas:1}],
      months:[{mes:"2026-11",alteracoes:4,aprovacoes:2,regressoes:1}],
      regressions:1,period_months:6
    });
    expect(value.versions[0].aprovadas).toBe(0);
    expect(value.modules[0].executados).toBe(3);
    expect(monthLabel("2026-11")).toContain("2026");
    expect(()=>qaInsightsSchema.parse({...value,regressions:-1})).toThrow();
  });
  it("copia apenas o roteiro; nunca o resultado ou evidências de execução",()=>{
    const source={
      id:"11111111-1111-4111-8111-111111111111",
      tarefa_id:"22222222-2222-4222-8222-222222222222",
      user_id:"33333333-3333-4333-8333-333333333333",
      ordem:3,titulo:"Desconto registrado",passos:"Abrir pedido",
      esperado:"Total correto",observacoes:"Usar valores fictícios",
      status:"reprovado",obtido:"Falhou com dados internos"
    } as Scenario;
    expect(reusableDraft(source)).toEqual({
      titulo:"Desconto registrado",passos:"Abrir pedido",
      esperado:"Total correto",observacoes:"Usar valores fictícios"
    });
  });
  it("recusa roteiros com passos e esperado vazios",()=>{
    expect(()=>reusableDraft({
      titulo:"Cenário inválido",passos:"",esperado:"Correto",observacoes:""
    })).toThrow();
  });
});
