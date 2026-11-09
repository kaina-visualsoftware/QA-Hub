import {describe,expect,it,vi} from "vitest";
import type {UseFormReturn} from "react-hook-form";
import type {TaskDraft} from "../src/lib/contracts";
import {normalizeDraft} from "../src/lib/legacy/qa-assistant.mjs";
import {
  applyTaskAiFields,freshTaskAiScenarios,onlyNewTaskAiSelections
} from "../src/features/tasks/task-ai";

describe("TF com IA: persistência e revisão",()=>{
  const draft=normalizeDraft({
    titulo:"Conferência de descontos",descricao:"Resumo reformulado pela IA",
    causa:"Rateio ignora percentuais negativos.",
    sistema:"Financeiro",codigo:"78912",tipo_teste:"BUILD",
    cenarios:[
      {titulo:"Remover desconto",passos:"Abrir pedido",esperado:"Total atualizado"},
      {titulo:" REMOVER DESCONTO ",passos:" Abrir   pedido ",esperado:"total atualizado"},
      {titulo:"Conferir conciliação",passos:"Consultar banco",esperado:"Baixa conferida"}
    ]
  });

  it("aplica o resumo da IA tanto na criação quanto na regeneração",()=>{
    const values:Record<string,string>={descricao:"Relatório original do QA"};
    const setValue=vi.fn((name:string,value:string)=>{values[name]=value;});
    const applied=applyTaskAiFields({
      setValue
    } as unknown as Pick<UseFormReturn<TaskDraft>,"setValue">,draft);
    expect(applied).toBeGreaterThanOrEqual(4);
    expect(values.titulo).toBe("Conferência de descontos");
    expect(values.causa).toContain("Rateio");
    expect(values.codigo).toBe("78912");
    expect(values.descricao).toBe("Resumo reformulado pela IA");
    expect(setValue).toHaveBeenCalledWith("titulo","Conferência de descontos",{
      shouldDirty:true,shouldTouch:true,shouldValidate:true
    });
  });

  it("marca sugestões novas e elimina repetições dentro da resposta da IA",()=>{
    const rows=freshTaskAiScenarios(draft);
    expect(rows).toHaveLength(2);
    expect(rows.map(item=>item.titulo)).toEqual([
      "Remover desconto","Conferir conciliação"
    ]);
    expect(rows.every(item=>item.selected)).toBe(true);
  });

  it("não reinsere cenários já registrados e mantém a escolha do QA",()=>{
    const rows=freshTaskAiScenarios(draft,[{
      titulo:"remover desconto",passos:"Abrir pedido",esperado:"Total atualizado"
    }],false);
    expect(rows).toHaveLength(1);
    expect(rows[0].titulo).toBe("Conferir conciliação");
    expect(rows[0].selected).toBe(false);
    const savedNow=onlyNewTaskAiSelections([
      {...rows[0],selected:true},
      {...rows[0],selected:true}
    ],[]);
    expect(savedNow).toHaveLength(1);
    expect(onlyNewTaskAiSelections(savedNow,[{
      titulo:"Conferir conciliação",passos:"Consultar banco",esperado:"Baixa conferida"
    }])).toHaveLength(0);
  });
  it("deduplica cenários mesmo quando IA muda passos, maiúsculas e numeração",()=>{
    const regenerated=normalizeDraft({cenarios:[{
      titulo:"CENÁRIO 8 — IMPACTO NO RESULTADO: VALORES DIFEREM COM E SEM DEVOLUÇÕES",
      passos:"Gerar o relatório duas vezes",esperado:"Conferir os valores"
    }]});
    const existing=[{
      titulo:"Impacto no resultado: valores diferem com e sem devoluções",
      passos:"Selecionar período e comparar resultados",esperado:"Valores diferentes"
    }];
    expect(freshTaskAiScenarios(regenerated,existing)).toHaveLength(0);
    expect(onlyNewTaskAiSelections([{
      titulo:"Cenário 8: Impacto no resultado: valores diferem com e sem devoluções",
      passos:"Revisar totais",esperado:"Totais corretos",observacoes:"",selected:true
    }],existing)).toHaveLength(0);
  });
});
