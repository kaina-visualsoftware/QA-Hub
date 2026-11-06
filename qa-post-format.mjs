// Ensure AI-generated posts have the same publication structure. Unknown
// facts are visibly marked for review; they must never be invented.
const compact=value=>String(value??'').replace(/\r\n?/g,'\n').trim();
const trimSeparators=value=>compact(value).replace(/^(?:---\s*\n)+/,'').replace(/(?:\n\s*---\s*)+$/,'').trim();
const placeholderImage='[Imagem: captura-da-funcionalidade.png]';
const pathFallback='[Caminho a ser confirmado]';
const taskFallback='[NÚMERO DA TAREFA A SER INSERIDO]';
const justificationFallback='[Justificativa a confirmar]';

export function taskNumberFromText(taskText='') {
  const match=compact(taskText).match(/(?:^|[\s#])(?:TAREFA|TF|C[oó]digo)(?:\s*(?:n[ºo°]\.?|n[uú]mero))?\s*[:#–-]?\s*#?(\d{4,7})(?!\d)/im);
  return match?.[1]||'';
}

export function formatGeneratedPost(markdown,{taskText=''}={}) {
  let body=compact(markdown);
  if(!body)throw Error('A IA não retornou conteúdo para o post.');
  body=body.replace(/^\s*\x60{3}(?:markdown|md)?\s*\n/i,'').replace(/\n\x60{3}\s*$/,'').trim();
  body=body.replace(/\[IMAGEM\]/gi,placeholderImage).replace(/\[CAMINHO DO MENU\]/gi,pathFallback);

  const titleMatch=body.match(/^#\s+(.+)$/m);
  let title=titleMatch?.[1]?.trim()||'FUNCIONALIDADE — TÍTULO A CONFIRMAR';
  title=title.replace(/\*\*/g,'').replace(/^T[IÍ]TULO\s*:\s*/i,'').trim();
  if(titleMatch)body=body.replace(titleMatch[0],'');

  const taskMetadata=body.match(/^\s*\*{0,2}TAREFA:\*{0,2}\s*(.+)$/im);
  const justificationMetadata=body.match(/^\s*\*{0,2}JUSTIFICATIVA:\*{0,2}\s*(.+)$/im);
  const task=taskNumberFromText(taskText) ||
    (taskMetadata?.[1]?.trim().match(/^\d{4,7}$/)?.[0]||'') ||
    taskFallback;
  const justification=justificationMetadata?.[1]?.trim()||justificationFallback;
  body=body.replace(/^\s*\*{0,2}(?:TAREFA|JUSTIFICATIVA):\*{0,2}[^\n]*$/gim,'').trim();

  const detailHeading=/^\s*(?:(?:#{1,4})\s*)?(?:\*\*)?Comportamento detalhado(?:\*\*)?\s*:?\s*$/im;
  const detailMatch=detailHeading.exec(body);
  let details=detailMatch?body.slice(detailMatch.index+detailMatch[0].length):'';
  let overview=detailMatch?body.slice(0,detailMatch.index):body;

  const imagePattern=/\[Imagem:\s*[^\]\n]{1,140}\]/gi;
  const images=[...overview.matchAll(imagePattern)].map(match=>match[0]);
  overview=overview.replace(imagePattern,'');
  const mainImage=images[0]||placeholderImage;
  const moreImages=images.slice(1).join('\n');

  let path=pathFallback,foundPath=false;
  const before=overview.split('\n'),remaining=[];
  for(let i=0;i<before.length;i++){
    const line=before[i].trim();
    if(/^(?:\*\*)?Caminho de acesso(?:\*\*)?\s*:?\s*(?:\*\*)?/i.test(line) ||
       /^Para acessar a funcionalidade, acesse\s*:/i.test(line)){
      foundPath=true;
      const sameLine=line.replace(/^(?:\*\*)?Caminho de acesso(?:\*\*)?\s*:\s*(?:\*\*)?/i,'')
        .replace(/^Para acessar a funcionalidade, acesse\s*:/i,'').trim();
      let next=sameLine;
      if(!next){
        let j=i+1;
        while(j<before.length&&!before[j].trim())j++;
        if(j<before.length){
          const candidate=before[j].trim();
          if(candidate===pathFallback){
            next=pathFallback;i=j;
          }else if(!/^\[Imagem:/i.test(candidate)){
            next=candidate;i=j;
          }
        }
      }
      if(next)path=next.replace(/^\*\*|\*\*$/g,'').trim();
      continue;
    }
    remaining.push(before[i]);
  }
  overview=trimSeparators(remaining.join('\n')).replace(/\n\s*---\s*\n/g,'\n\n').trim();
  const earlier=/\bAnteriormente\s*,?/i.exec(overview);
  let introduction=earlier?trimSeparators(overview.slice(0,earlier.index)):overview;
  let comparison=earlier?trimSeparators(overview.slice(earlier.index)):'';
  if(!introduction)introduction='[Descrição da implementação a confirmar a partir da tarefa.]';
  if(!comparison)
    comparison='Anteriormente, [Comportamento anterior a confirmar]. Agora, [Comportamento após a melhoria a confirmar].';
  else if(!/\bAgora\b|\bCom a nova funcionalidade\b/i.test(comparison))
    comparison+='\n\nAgora, [Comportamento após a melhoria a confirmar].';

  details=trimSeparators(details);
  if(moreImages)details=[details,moreImages].filter(Boolean).join('\n\n');
  if(!details)details='1. **Comportamento a detalhar**\n   [Detalhamento do comportamento a confirmar com os requisitos da tarefa.]';
  else if(!/^\s*\d+\.\s+/m.test(details))
    details='1. **Comportamento documentado**\n   '+details.replace(/\n\n/g,'\n\n   ');

  if(!foundPath)path=pathFallback;
  const cleanedPath=path.trim()||pathFallback;
  return [
    '# '+title.toUpperCase(),
    '---',
    introduction,
    comparison,
    '**Caminho de acesso:**',
    cleanedPath===pathFallback ? cleanedPath : '**'+cleanedPath.replace(/^\*\*|\*\*$/g,'')+'**',
    mainImage,
    '**Comportamento detalhado**',
    '---',
    details,
    '---',
    '**TAREFA:** '+task,
    '**JUSTIFICATIVA:** '+justification
  ].join('\n\n').replace(/\n{3,}/g,'\n\n').trim();
}

export function validatePostStructure(markdown){
  const post=compact(markdown),issues=[];
  if(!/^#\s+\S+/m.test(post))issues.push('Título');
  if(!/Anteriormente/i.test(post)||!/\bAgora\b|\bCom a nova funcionalidade\b/i.test(post))issues.push('Comparação Antes/Depois');
  if(!/\*\*Caminho de acesso:\*\*/i.test(post))issues.push('Caminho de acesso');
  if(!/\[Imagem:\s*[^\]\n]+\.png\]/i.test(post))issues.push('Marcador de imagem');
  if(!/\*\*Comportamento detalhado\*\*/i.test(post))issues.push('Comportamento detalhado');
  if(!/\*\*TAREFA:\*\*\s*(?:\d{4,7}|\[NÚMERO DA TAREFA A SER INSERIDO\])/i.test(post))issues.push('TAREFA');
  if(!/\*\*JUSTIFICATIVA:\*\*\s*\S+/i.test(post))issues.push('JUSTIFICATIVA');
  if(!/\*\*JUSTIFICATIVA:\*\*[^\n]*\s*$/i.test(post))issues.push('JUSTIFICATIVA ao final');
  return issues;
}
