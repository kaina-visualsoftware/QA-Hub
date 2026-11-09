import type { GeneratorMode } from "./stream";

export const generatorPresets = {
  teste: [
    {id:"essencial",label:"Cobertura principal",instructions:""},
    {id:"regressao",label:"Regressão",instructions:"Priorize casos de regressão, fluxos afetados, validações de integração e cenários que não devem sofrer alterações. Inclua critérios objetivos e resultado esperado verificável."},
    {id:"limites",label:"Erros e limites",instructions:"Inclua cenários negativos, validações de entrada, limites, situações sem dados e comportamentos de erro plausíveis, somente quando sustentados pelos requisitos da TF."}
  ],
  post: [
    {id:"essencial",label:"Post padrão",instructions:""},
    {id:"objetivo",label:"Post enxuto",instructions:"Seja conciso no texto e preserve obrigatoriamente título, implementação, comparação antes/depois, caminho quando aplicável e marcadores de imagem."},
    {id:"tecnico",label:"Post técnico",instructions:"Detalhe a mudança de comportamento e as condições de uso com linguagem técnica clara, sem inventar passos, parâmetros nem evidências. Preserve a estrutura obrigatória do post."}
  ]
} as const;

export const diagramPresets = [
  {id:"processo",label:"Fluxo principal",instructions:""},
  {id:"decisoes",label:"Decisões e alternativas",instructions:"Destaque condições, decisões e caminhos alternativos somente quando houver base no texto."},
  {id:"excecoes",label:"Falhas e exceções",instructions:"Destaque validações, cenários de erro e retorno ao fluxo principal quando essas etapas estiverem presentes na descrição."}
] as const;

export function generatorPresetInstruction(mode:GeneratorMode,id:string):string {
  return generatorPresets[mode].find(item=>item.id===id)?.instructions ?? "";
}
export function diagramPresetInstruction(id:string):string {
  return diagramPresets.find(item=>item.id===id)?.instructions ?? "";
}
export function combinedInstructions(mode:GeneratorMode,id:string,custom:string) {
  const pref=generatorPresetInstruction(mode,id);
  const uniqueness=mode==="teste"
    ? "EVITE REPETIÇÕES: compare com os cenários já cadastrados na TF e não gere casos equivalentes. Não repita casos dentro da própria resposta. Priorize somente situações novas sustentadas pelos requisitos, sem inventar variações artificiais."
    : "";
  const parts=[uniqueness,pref.trim(),custom.trim()].filter(Boolean);
  return parts.length?"PREFERÊNCIAS DO ANALISTA (não substituem os dados da TF):\n"+parts.join("\n"):"";
}
