// Validate against the same Mermaid v12 parser that renders the preview.
// Model output is always treated as data; never evaluate returned code.
export function mermaidErrorMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"")
    .trim().slice(0,1200) || "Erro de sintaxe Mermaid sem detalhes.";
}
export async function ensureMermaidSyntax(code: string): Promise<void> {
  if(!code.trim() || code.length>16000)
    throw Error("O código Mermaid deve ter entre 1 e 16.000 caracteres.");
  const {default:mermaid}=await import("mermaid");
  mermaid.initialize({
    startOnLoad:false,securityLevel:"strict",theme:"neutral",maxTextSize:16000
  });
  const valid=await mermaid.parse(code);
  if(!valid)throw Error("O parser Mermaid não conseguiu validar este código.");
}
