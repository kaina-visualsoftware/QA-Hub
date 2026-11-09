import {describe,expect,it} from "vitest";
import {isMissingModuleChunk} from "../src/features/diagrams/mermaid-validation";

describe("recuperação de módulos Mermaid após deploy",()=>{
  it("reconhece chunks antigos e erros de importação dinâmica",()=>{
    expect(isMissingModuleChunk(new TypeError(
      "Failed to fetch dynamically imported module: https://site/react/assets/mermaid.core-OLD.js"
    ))).toBe(true);
    expect(isMissingModuleChunk(new Error("Importing a module script failed."))).toBe(true);
    expect(isMissingModuleChunk(new Error("Loading chunk mermaid failed"))).toBe(true);
  });
  it("não confunde erros de sintaxe Mermaid com falha de publicação",()=>{
    expect(isMissingModuleChunk(new Error("Parse error on line 3"))).toBe(false);
    expect(isMissingModuleChunk("")).toBe(false);
  });
});
