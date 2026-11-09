import {describe,expect,it} from "vitest";
import {trashDate,trashSchema} from "../src/features/trash/trash-data";

describe("F7: lixeira recuperável",()=>{
  const user="11111111-1111-4111-8111-111111111111";
  const task="22222222-2222-4222-8222-222222222222";
  const scenario="33333333-3333-4333-8333-333333333333";
  it("valida IDs e separa TFs de cenários para restauração",()=>{
    const data=trashSchema.parse({
      tasks:[{id:task,titulo:"Homologação de descontos",
        codigo:"QA-7",sistema:"Financeiro",versao:"12.1",
        archived_at:"2026-11-09T12:00:00Z"}],
      scenarios:[{id:scenario,tarefa_id:task,titulo:"Desconto",
        tarefa_titulo:"Homologação de descontos",
        archived_at:"2026-11-09T12:10:00Z"}]
    });
    expect(data.tasks[0].id).toBe(task);
    expect(data.scenarios[0].tarefa_id).toBe(task);
    expect(data.scenarios[0].id).toBe(scenario);
    expect(data.tasks[0]).not.toHaveProperty("status");
    expect(data.scenarios[0]).not.toHaveProperty("obtido");
  });
  it("recusa IDs malformados e entrada inesperada",()=>{
    expect(()=>trashSchema.parse({tasks:[{id:"not-an-id",titulo:"Incorreto",
      archived_at:"2026-11-09T12:00:00Z"}],scenarios:[]})).toThrow();
    expect(()=>trashSchema.parse({tasks:[],scenarios:[{id:user,archived_at:null}]})).toThrow();
  });
  it("exibe uma data local ou um fallback seguro",()=>{
    expect(trashDate("2026-11-09T12:00:00Z")).toMatch(/2026/);
    expect(trashDate("not-a-date")).toBe("Data indisponível");
  });
});
