import type {ChunkOutcome,SemanticChunk,SemanticGoal,SemanticCategory,VerifiedFact}
 from "./semantic-context";

/** Provider-independent, literal-only source selection. This is NOT an AI summary.
 * No network, inference, persistent storage or synthetic expected results.
 * Original text and its exact source-line positions are retained by the plan.
 */
const norm=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
 .toLocaleUpperCase("pt-BR");
const secret=/\b(?:SENHA|PASSWORD|TOKEN|API[_ -]?KEY|CHAVE[_ -]?SECRETA|AUTHORIZATION|CPF|CNPJ|E-?MAIL)\b/i;
const onlyAttachment=/^(?:\d{8}[-_\w]+\.(?:png|jpe?g|webp|pdf|docx?)\s*)+$/i;
const category=(s:string):SemanticCategory=>{
 if(/\b(?:RESULTADO|CONCLUSAO|TESTAD[OA]|VALIDAD[OA]|APROVAD[OA]|REPROVAD[OA]|FALHOU)\b/.test(s))
  return "resultado";
 if(/\b(?:PARECER|REGRA|REQUISITO|PERCENTUAL|CALCULO|LIMITE|CRITERIO|FORMULA|NAO PODE)\b/.test(s))
  return "regra";
 if(/\b(?:CORRECAO|AGORA|DESENVOLVIMENTO|IMPLEMENTADO|VERSAO 2|REVISAO FINAL|ATUALIZADO)\b/.test(s))
  return "depois";
 if(/\b(?:ANTES|ANTERIORMENTE|COMPORTAMENTO ATUAL|ERRO ORIGINAL)\b/.test(s))
  return "antes";
 if(/\b(?:EXCECAO|CAIXA FECHADO|NAO PERMIT|NAO DEVE|SEM VALE)\b/.test(s))
  return "excecao";
 if(/\b(?:ESPERADO|ACEITE|RF\d+|RNF\d+)\b/.test(s))return "aceite";
 if(/R\$|\b\d+(?:[.,]\d+)?%/.test(s))return "dado";
 return "contexto";
};
const weight=(raw:string,position:number,total:number,goal:SemanticGoal)=>{
 const s=norm(raw);let score=0;
 if(/^(?:CONCLUSAO|RESULTADO|REGRA|DECISAO|PARECER|CORRECAO|REVISAO|REQUISITO|CENARIO|O QUE FOI TESTADO)/.test(s))
  score+=10;
 if(/(?:VERSAO FINAL|REGRA CORRETA|SUBSTITUIDO|CANCELADO|PARECER FISCAL|DECISAO DO PO|FOI CORRIGIDO|NAO SERA)/.test(s))
  score+=12;
 if(/\b(?:DEVE|SOMENTE|APENAS|NUNCA|NAO|EXCETO|INTEGRALMENTE|INCLUSIVO|SEM DESCONTO)\b/.test(s))
  score+=5;
 if(/\b(?:RF[- ]?\d+|RNF[- ]?\d+|REQ[- ]?\d+|CRITERIO|FORMULA|VALOR MINIMO)\b/.test(s))
  score+=5;
 if(/\b(?:VALE|VENDA|PEDIDO|FATURAMENTO|CAIXA|PRODUTOS|PERCENTUAL)\b/.test(s))
  score+=2;
 if(goal==="teste"&&/\b(?:PASSOS|TESTE|VALIDAD|ESPERADO)\b/.test(s))score+=3;
 if(goal==="post"&&/\b(?:ANTES|AGORA|CORRECAO|ALTERACAO)\b/.test(s))score+=3;
 if(/R\$|\d+(?:[.,]\d+)?%/.test(s))score+=1;
 if(position>=total*.66)score+=2;
 if(/\b(?:NAO EXISTE|NAO FOI|FORA DO ESCOPO)\b/.test(s))score+=2;
 if(/^(?:SELECT|UPDATE|ALTER TABLE|IF |END IF|BEGIN |INSERT |SET |[\d\s.:/-]+)$/.test(s))
  score-=20;
 return score;
};
export function extractLocalSemanticChunk(chunk:SemanticChunk,goal:SemanticGoal):ChunkOutcome{
 const lines=chunk.text.split("\n");
 const candidates:{line:number;quote:string;category:SemanticCategory;score:number;index:number}[]=[];
 for(let index=0;index<lines.length;index++){
  const line=lines[index].trim();
  if(line.length<10||secret.test(norm(line))||onlyAttachment.test(line))continue;
  // Do not infer meaning from clipped text. Both ends are literal substrings.
  const excerpts=line.length>420?
   [line.slice(0,420),line.slice(-420)]:[line];
  for(const quote of excerpts){
   if(quote.trim().length<10||!chunk.text.includes(quote))continue;
   candidates.push({line:chunk.startLine+index,quote,
    category:category(norm(quote)),score:weight(quote,index,lines.length,goal),index});
  }
 }
 const ranked=[...candidates].sort((a,b)=>b.score-a.score||b.index-a.index);
 const chosen=ranked.slice(0,6);
 const lastThird=ranked.find(c=>c.index>=lines.length*.66&&!chosen.includes(c));
 if(lastThird)chosen.push(lastThird);
 const final=candidates.at(-1);
 if(final&&!chosen.includes(final))chosen.push(final);
 const seen=new Set<string>();
 const facts:VerifiedFact[]=chosen.sort((a,b)=>a.index-b.index)
  .filter(x=>{const k=x.line+"|"+x.quote;if(seen.has(k))return false;seen.add(k);return true;})
  .map(x=>({source:chunk.source,chunkId:chunk.id,line:x.line,
   category:x.category,quote:x.quote,
   summary:"Trecho literal selecionado localmente; interpretação pendente de revisão do QA."}));
 return {id:chunk.id,facts,unverified:0,model:"Seleção local (sem NVIDIA)",method:"local"};
}
