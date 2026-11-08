import { describe, expect, it, vi } from "vitest";
import { ensureMermaidSyntax, mermaidErrorMessage } from "../src/features/diagrams/mermaid-validation";

const parser=vi.hoisted(()=>({initialize:vi.fn(),parse:vi.fn()}));
vi.mock("mermaid",()=>({default:parser}));

describe("Mermaid syntax gate",()=>{
  it("uses real Mermaid parse API with strict configuration",async()=>{
    parser.parse.mockResolvedValueOnce({diagramType:"flowchart"});
    await expect(ensureMermaidSyntax('flowchart LR\n A --> B')).resolves.toBeUndefined();
    expect(parser.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel:"strict",startOnLoad:false
    }));
    expect(parser.parse).toHaveBeenCalledWith('flowchart LR\n A --> B');
  });
  it("does not accept malformed input or parser rejection",async()=>{
    parser.parse.mockRejectedValueOnce(Error("Parse error on line 2"));
    await expect(ensureMermaidSyntax('flowchart LR\n A[Broken')).rejects.toThrow("line 2");
    parser.parse.mockResolvedValueOnce(false);
    await expect(ensureMermaidSyntax('flowchart LR\n A --> B')).rejects.toThrow("não conseguiu validar");
  });
  it("rejects empty or oversized diagrams and bounds displayed error",async()=>{
    await expect(ensureMermaidSyntax("")).rejects.toThrow("16.000");
    await expect(ensureMermaidSyntax("x".repeat(16001))).rejects.toThrow("16.000");
    expect(mermaidErrorMessage(Error("Syntax issue"))).toBe("Syntax issue");
    expect(mermaidErrorMessage(Error("x".repeat(2000))).length).toBe(1200);
  });
});
