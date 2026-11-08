export type ImportedTestResult={
 id:string;name:string;status:"aprovado"|"reprovado"|"bloqueado"|"nao_executado";
 observed:string;source:"JUnit"|"Playwright";
};
const MAX_BYTES=2*1024*1024;
const MAX_RESULTS=200;
function limit(results:ImportedTestResult[]){
 if(results.length===0)throw Error("Não foram encontrados resultados de testes.");
 if(results.length>MAX_RESULTS)throw Error("O arquivo contém mais de 200 resultados.");
 return results;
}
export async function readAutomatedResults(file:File):Promise<ImportedTestResult[]>{
 if(file.size===0||file.size>MAX_BYTES)throw Error("Use arquivo de até 2 MB.");
 const extension=file.name.split(".").at(-1)?.toLowerCase();
 if(extension!=="xml"&&extension!=="json")
  throw Error("Use XML JUnit ou JSON Playwright.");
 const source=await file.text();
 return extension==="xml"?parseJUnit(source):parsePlaywright(source);
}
export function parseJUnit(source:string):ImportedTestResult[]{
 if(source.length>MAX_BYTES||/<!\s*(?:DOCTYPE|ENTITY)\b|<\?\s*xml-stylesheet\b/i.test(source))
  throw Error("XML com entidades, DTD ou referências externas não é permitido.");
 if(typeof DOMParser==="undefined")throw Error("Leitura XML disponível somente no navegador.");
 const document=new DOMParser().parseFromString(source,"application/xml");
 if(document.querySelector("parsererror"))throw Error("XML inválido.");
 const nodes=Array.from(document.getElementsByTagName("testcase"));
 if(nodes.length>MAX_RESULTS)throw Error("Máximo de 200 cenários por arquivo.");
 return limit(nodes.map((node,index)=>{
  const name=[node.getAttribute("classname"),node.getAttribute("name")]
   .filter(Boolean).join(" › ")||"Teste "+(index+1);
  const failure=node.getElementsByTagName("failure")[0]||
   node.getElementsByTagName("error")[0];
  const skipped=node.getElementsByTagName("skipped")[0];
  const status=failure?"reprovado":skipped?"nao_executado":"aprovado";
  const note=(failure?.getAttribute("message")||failure?.textContent||
   skipped?.getAttribute("message")||
   (skipped?"Teste ignorado":"Teste concluído")).trim().slice(0,1600);
  return {id:"junit-"+index,name:name.slice(0,240),
   status,observed:note,source:"JUnit" as const};
 }));
}
export function parsePlaywright(source:string):ImportedTestResult[]{
 if(source.length>MAX_BYTES)throw Error("Arquivo muito grande.");
 let root:unknown;
 try{root=JSON.parse(source);}catch{throw Error("JSON inválido.");}
 if(!root||typeof root!=="object"||Array.isArray(root))
  throw Error("JSON não reconhecido.");
 const result:ImportedTestResult[]=[];
 function walk(suite:unknown){
  if(!suite||typeof suite!=="object"||Array.isArray(suite))return;
  const entry=suite as Record<string,unknown>;
  if(Array.isArray(entry.specs))for(const spec of entry.specs){
   if(!spec||typeof spec!=="object"||Array.isArray(spec))continue;
   const data=spec as Record<string,unknown>;
   if(!Array.isArray(data.tests))continue;
   for(const test of data.tests){
    if(!test||typeof test!=="object"||Array.isArray(test))continue;
    const item=test as Record<string,unknown>;
    const runs=Array.isArray(item.results)?item.results:[];
    const latest=runs.at(-1);
    const run=latest&&typeof latest==="object"&&!Array.isArray(latest)
      ?latest as Record<string,unknown>:{};
    const actual=run.status;
    if(!["passed","failed","timedOut","skipped","interrupted"].includes(String(actual)))
     continue;
    const status=actual==="passed"?"aprovado":
      actual==="skipped"?"nao_executado":
      actual==="interrupted"?"bloqueado":"reprovado";
    const title=String(data.title||"Teste").slice(0,240);
    const error=run.error&&typeof run.error==="object"
      ?String((run.error as Record<string,unknown>).message??""):"";
    result.push({id:"pw-"+result.length,name:title,
      status,observed:(error||"Resultado: "+String(actual)).slice(0,1600),
      source:"Playwright"});
    if(result.length>MAX_RESULTS)throw Error("Máximo de 200 cenários por arquivo.");
   }
  }
  if(Array.isArray(entry.suites))for(const nested of entry.suites)walk(nested);
 }
 walk(root);
 return limit(result);
}
export function githubIssueDraft(repo:string,title:string,body:string){
 const normalized=repo.trim();
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)||
  normalized.split("/").some(x=>x==="."||x===".."))
  throw Error("Informe um repositório no formato organização/repositório.");
 const url=new URL("https://github.com/"+normalized+"/issues/new");
 url.searchParams.set("title",title.slice(0,180));
 url.searchParams.set("body",body.slice(0,1400));
 return url.toString();
}
