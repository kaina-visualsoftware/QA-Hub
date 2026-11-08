import { describe, expect, it } from "vitest";
import { nextAfterSaved, orderedGuideScenarios } from "../src/features/executions/guided-selection";
import type { Scenario } from "../src/lib/contracts";

function item(id: string, ordem: number, status: Scenario["status"]): Scenario {
  return { id, ordem, status } as Scenario;
}
const records = [
  item("b",2,"nao_executado"),
  item("d",4,"reprovado"),
  item("c",3,"nao_executado"),
  item("a",1,"aprovado")
];

describe("Guided execution navigation",()=>{
  it("sorts by case order and filters only real pending cases",()=>{
    expect(orderedGuideScenarios(records,"pending").map(c=>c.id)).toEqual(["b","c"]);
    expect(orderedGuideScenarios(records,"all").map(c=>c.id)).toEqual(["a","b","c","d"]);
  });
  it("moves to the next pending case without including a saved one",()=>{
    expect(nextAfterSaved(records,"b","pending")).toBe("c");
    expect(nextAfterSaved(records,"c","pending")).toBe("b");
  });
  it("recognizes final pending case without inventing a result",()=>{
    const final=[item("a",1,"aprovado"),item("b",2,"nao_executado")];
    expect(nextAfterSaved(final,"b","pending")).toBeNull();
    expect(final[1].status).toBe("nao_executado");
  });
  it("advances all mode without wrapping",()=>{
    expect(nextAfterSaved(records,"b","all")).toBe("c");
    expect(nextAfterSaved(records,"d","all")).toBe("d");
    expect(nextAfterSaved(records,"missing","all")).toBeNull();
  });
});
