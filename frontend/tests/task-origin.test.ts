import { describe, expect, it } from "vitest";
import { isInternalVisualTask, taskListTitle, taskOriginLabel } from "../src/features/tasks/task-origin";

describe("classificação de origem das tarefas",()=>{
  it("classifica como INTERNA somente a empresa 6157 Visual Software",()=>{
    for(const value of ["6157 Visual Software"," 6157   Visual Software  ","6157 - visual software"]){
      expect(isInternalVisualTask(value)).toBe(true);
      expect(taskOriginLabel(value)).toBe("INTERNA");
    }
    for(const value of ["6157 Outra Empresa","6158 Visual Software","Visual Software","6157","",null,undefined]){
      expect(isInternalVisualTask(value)).toBe(false);
      expect(taskOriginLabel(value)).toBe("EXTERNA");
    }
  });
  it("insere a origem após BUG e mantém número e sprint existentes",()=>{
    expect(taskListTitle({titulo:"#201632 — BUG — SEM SPRINT",empresa:"6157 Visual Software"}))
      .toBe("#201632 — BUG (INTERNA) — SEM SPRINT");
    expect(taskListTitle({titulo:"#201632 — BUG — SEM SPRINT",empresa:"6157 Outro Cliente"}))
      .toBe("#201632 — BUG (EXTERNA) — SEM SPRINT");
  });
  it("substitui rótulos antigos e não duplica classificações",()=>{
    expect(taskListTitle({titulo:"#201632 — BUG (EXTERNA) — SEM SPRINT",empresa:"6157 Visual Software"}))
      .toBe("#201632 — BUG (INTERNA) — SEM SPRINT");
    expect(taskListTitle({titulo:"Melhoria de integração",empresa:null}))
      .toBe("Melhoria de integração (EXTERNA)");
  });
});
