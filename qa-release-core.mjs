// Algorithms migrated verbatim from the legacy release tool to a native ES module.
// The legacy geradores.html remains available for compatibility; no UI globals used here.
const norm=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(),SK=new Set(["DE","DA","DO","DOS","DAS","E"]);
const has=(n,t)=>{const w=new Set(norm(n).split(/[^A-Z0-9]+/));return norm(t).split(/[^A-Z0-9]+/).filter(x=>x&&!SK.has(x)).every(x=>w.has(x))};
const mt=(n,team)=>n?team.find(t=>has(n,t))||"":"";
const tn=l=>{const r=[];for(const m of l.matchAll(/#(\d{4,7})(?!\d)|(?<![\d.,\/:#=_-])(\d{6})(?![\d.,\/:-])/g))r.push({n:m[1]||m[2],h:!!m[1]});return r};
const isStart=l=>/^\s*(?:[-*•]\s*|\[\*\]\s*)*(?:\[b\]\s*)?(?:#\d{4,7}(?!\d)|\d{6}(?![\d.,\/:-]))/i.test(l);
const typeOf=ls=>{for(const l of ls){if(!l.includes("\t"))continue;const c=l.split("\t").map(x=>x.trim()),i=c.findIndex(x=>/^\d{3}\s*-\s*\S/.test(x));if(i>=2&&c[i-2])return c[i-2].toUpperCase()}
 const T=/(?<![A-ZÀ-Ú])(BUG|MELHORIA|CUSTOMIZA[ÇC][ÃA]O)(?![A-ZÀ-Ú])/i;for(const l of ls)for(const c of l.split("\t"))if(T.test(c.trim())&&c.trim().length<16)return c.trim().toUpperCase();const m=ls.join("\n").match(T);return m?m[1].toUpperCase():""};
const isData=l=>l.includes("\t")&&(l.split("\t").some(x=>/^\d{3}\s*-\s*\S/.test(x.trim()))||/\b(BUG|MELHORIA)\b/i.test(l));
function fmtBB(out,ver,compat,sig){
 const strip=s=>s.replace(/\[\/?b\]/gi,"").replace(/\*\*/g,"").trim(),B=s=>"[b]"+s+"[/b]",L=out.split("\n");
 const v=/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(ver)?ver:((out.match(/\b\d{2}\.\d{2}\.\d{2}\.\d{4}\b/)||[])[0]||"");
 const ci=L.findIndex(l=>/^atenciosamente/i.test(strip(l))),clos=ci>=0?L.slice(ci+1).filter(x=>x.trim()):[];let body=ci>=0?L.slice(0,ci):L.slice();
 const cp=body.findIndex(l=>/^compatibilidades?\b/i.test(strip(l)));if(cp>=0)body=body.slice(0,cp);
 const secs=[];let cur=null,last=null;const sec=h=>{cur={h,it:[]};secs.push(cur);last=null};
 for(const l of body){const t=strip(l);if(!t||/^ol[áa](?![a-zà-ú])/i.test(t))continue;
  const m=t.replace(/^(?:[-*•]|\[\*\])\s*/,"").match(/^#?(\d{4,7})(?!\d)\s*[-–—:.]?\s*(.*)$/);
  if(tn(l).length&&m){if(!cur)sec("Inconsistências relatadas por clientes:");last={n:m[1],d:m[2]};cur.it.push(last);continue}
  if(last&&/^\s+\S/.test(l)&&!tn(l).length){last.d+=" "+t;continue}
  if(!tn(l).length&&(/:$/.test(t)||(/^\s*\[b\].*\[\/b\]\s*$/i.test(l)&&t.length<80))){sec(t);continue}
  if(!cur)sec("Inconsistências relatadas por clientes:");last=null;cur.it.push({raw:l})}
 const o=[v?"Olá! Versão "+B(v)+" do "+B("MyCommerce")+" disponível para atualizações!":"Olá!"];
 for(const s of secs){o.push("",B(s.h),"");s.it.forEach(x=>o.push(x.raw!==undefined?x.raw:B(x.n)+" - "+x.d))}
 const cl=compat.split("\n").map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*(\d+(?:\.\d+){1,3})\s*$/);return m&&m[1]?"Compatível com a versão "+B(m[2])+" do "+B(m[1]):B(x)});
 if(cl.length)o.push("",B("Compatibilidades:"),"",...cl);
 o.push("",B("Atenciosamente,"));const sg=sig.trim()?[sig.trim()]:clos;sg.forEach(x=>o.push(x));
 return o.join("\n")}
function cmpRel(auth,com){
 const AL=auth.replace(/\r/g,"").split("\n"),A=new Map(),dA=new Set();let recs=[],cur=null;
 for(const l of AL){if(isStart(l)){cur={n:tn(l)[0].n,lines:[l]};recs.push(cur)}else if(cur&&l.trim())cur.lines.push(l)}
 if(!recs.length)for(const l of AL)for(const x of tn(l))recs.push({n:x.n,lines:[l]});
 for(const r of recs){if(A.has(r.n))dA.add(r.n);else A.set(r.n,typeOf(r.lines))}
 if(!A.size)return{err:"A lista autorizada não tem números de tarefa (6 dígitos, com ou sem #)."};
 const lines=com.replace(/\r/g,"").split("\n"),bb=/\[\/?(?:b|i|u|list|size|color|url|img|quote|code|hr|center)(?:=[^\]]*)?\]|\[\*\]/i.test(com),md=!bb&&/^\s{0,3}#{1,6}\s|\*\*|^\s*[-*]\s/m.test(com);
 const out=[],kept=[],rem=[],rt=[],amb=[],div=[],cnt={};let sec="",skip=false,gap=false,remN="";
 const heading=l=>{const t=l.trim();return t&&t.length<90&&(/^(#{1,6}\s|\[size|\[b\]|\*\*)/i.test(t)||/^[A-ZÀ-Ú0-9 :\-–]{4,}$/.test(t))};
 const cont=l=>l.trim()&&/^(\s{2,}|\t)/.test(l);
 const bold=l=>(!bb&&!md)?l:l.replace(/(\[b\])?(#(\d{4,7})(?!\d)|(?<![\d.,\/:#=_-])(\d{6})(?![\d.,\/:-]))(\[\/b\])?/gi,(m,b1,tok,h,bare,b2,p,str)=>{const n=h||bare;if(!A.has(n)||b1||b2)return m;const pre=str.slice(0,p),open=bb?(pre.match(/\[b\]/gi)||[]).length>(pre.match(/\[\/b\]/gi)||[]).length:(pre.match(/\*\*/g)||[]).length%2===1;return open?m:(bb?"[b]"+tok+"[/b]":"**"+tok+"**")});
 const proc=l=>{const ns=tn(l);ns.forEach(x=>{cnt[x.n]=(cnt[x.n]||0)+1});
  const ok=ns.filter(x=>A.has(x.n)),no=ns.filter(x=>!A.has(x.n)),st=no.filter(x=>x.h||new RegExp("^\\s*(?:[-*•]\\s*|\\[\\*\\]\\s*)*(?:\\[b\\]\\s*)?"+x.n).test(l));
  if(!ok.length&&st.length){if(/\[\/?list\]/i.test(l)){amb.push("Linha com [list] e tarefa não liberada mantida; remova a tarefa manualmente: "+l.trim().slice(0,90));return l}st.forEach(x=>rem.push(x.n));rt.push(l);remN=st[0].n;return null}
  if(ok.length&&no.length)amb.push("Linha mistura tarefa liberada e não liberada (mantida): "+l.trim().slice(0,100));
  else if(!ok.length&&no.length)amb.push("Número sem # fora da lista, mantido (pode não ser tarefa): "+l.trim().slice(0,100));
  const ty=((l.match(/\b(BUG|MELHORIA)\b/i)||[])[1]||"").toUpperCase()||sec,src=(l.match(/\b(BUG|MELHORIA)\b/i)?"linha":"seção");
  ok.forEach(x=>{kept.push(x.n);const t=A.get(x.n);if(ty&&/^(BUG|MELHORIA)$/.test(t)&&ty!==t)div.push("#"+x.n+": comunicado "+ty+" ("+src+") × lista "+t)});
  return bold(l)};
 for(const l of lines){
  if(!tn(l).length){
   if(skip&&cont(l)){rt.push(l);gap=true;continue}
   if(skip&&l.trim()&&!heading(l)&&!/^\s*(\[hr\]|-{3,})/i.test(l))amb.push("Texto logo abaixo da tarefa #"+remN+" (removida) foi mantido; confira se pertence a ela: "+l.trim().slice(0,80));
   skip=false;
   if(!l.trim()&&gap&&out.length&&!out[out.length-1].trim())continue;
   if(heading(l))sec=/melhori/i.test(l)?"MELHORIA":/corre[çc]|bug|erro|falha/i.test(l)?"BUG":"";
   out.push(l);if(l.trim())gap=false;continue}
  skip=false;
  if((l.match(/\[\*\]/g)||[]).length>=2){let tail="";const k=[];for(const p of l.split(/(?=\[\*\])/)){const r=proc(p);if(r===null){tail+=(p.match(/\[\/list\]\s*$/i)||[""])[0]}else k.push(r)}const t=k.join("")+tail;if(/\[\*\]/.test(t)||t.trim()){out.push(t)}gap=true;continue}
  const r=proc(l);if(r===null){skip=true;gap=true}else{out.push(r);gap=false}}
 const miss=[...A.keys()].filter(n=>!cnt[n]),dups=Object.keys(cnt).filter(n=>cnt[n]>1);
 [...A].filter(([n,t])=>!t).forEach(([n])=>amb.push("#"+n+": classificação BUG/MELHORIA não identificada na lista"));
 const U=a=>[...new Set(a)],T=(t,a)=>t+" ("+a.length+"): "+(a.length?a.map(x=>/^\d+$/.test(x)?"#"+x:x).join(", "):"nenhuma");
 const rep=[T("Mantidas",U(kept)),T("Removidas por não estarem na lista",U(rem)),T("Na lista, mas ausentes no comunicado",miss),T("Duplicadas no comunicado",dups),T("Duplicadas na lista autorizada",[...dA]),"Divergências de classificação ("+div.length+"):"+(div.length?"\n- "+div.join("\n- "):" nenhuma"),"Ambiguidades ("+amb.length+"):"+(amb.length?"\n- "+amb.join("\n- "):" nenhuma")].join("\n");
 return{out:out.join("\n"),rep,rt}}
function parseRec(r,team){const txt=r.lines.join("\n"),n=tn(r.lines[0])[0]?"#"+tn(r.lines[0])[0].n:"",ty=typeOf(r.lines),at=[];
 const dl=r.lines.find(isData)||"",cols=dl.split("\t").map(x=>x.trim()),di=cols.findIndex(c=>/^\d{2}\/\d{2}\/\d{4}\s+\d/.test(c)),names=di>=0?cols.slice(di+1):[];
 let sp=mt(names[3],team),obs="";
 if(r.lines.length===1){obs=(txt.match(/\([^)]*\)\s*$/)||[""])[0].trim();if(/^\(\s*(BUG|MELHORIA)\s*\)$/i.test(obs))obs=""}
 if(!sp&&names[3]){sp=names[3];at.push(n+": "+sp+" não está na lista da equipe; mantido como veio")}if(!sp&&!names.length)sp=team.find(t=>has(txt,t))||"";
 if(!sp&&r.lines.length===1)sp=txt.replace(obs,"").replace(/\d{1,2}\/\d{1,2}\/\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?)?/g," ").replace(/#?\d{4,7}/,"").replace(/\(?\b(BUG|MELHORIA)\b\)?/i,"").replace(/^[\s\-*•—–|]+|[\s\-—–|]+$/g,"").replace(/\s*[—–|\t]+\s*/g," ").trim();
 if(!sp)sp="SEM SPRINT";if(!ty)at.push(n+": tipo (BUG/MELHORIA) não encontrado");
 return{n,ty,sp,obs,at}}


export function organizeRelease({version,raw,team='',defaultStatus='12'}){
  if(!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(String(version||'')))
    throw Error('Versão incompleta: use o formato 12.10.06.0000.');
  const members=team.split('\n').map(x=>x.trim()).filter(Boolean);
  let section=null;const records=[];
  for(const line of String(raw||'').split('\n')){
    const header=line.match(/^\s*status\s*(\d+)/i);
    if(header&&!/#\d/.test(line)){section=header[1];continue}
    if(isStart(line))records.push({st:section,lines:[line]});
    else if(records.length&&line.trim())records[records.length-1].lines.push(line);
  }
  if(!records.length)throw Error('Nenhuma tarefa (#número) encontrada.');
  const groups={12:[],11:[]},warnings=[];
  for(const record of records){
    const item=parseRec(record,members),status=record.st||defaultStatus;
    if(!groups[status]){
      warnings.push(item.n+': status '+status+' não é 11 nem 12; não incluída');
      continue;
    }
    groups[status].push('- '+item.n+' — '+(item.ty||'TIPO NÃO INFORMADO')+
      ' — '+(item.sp||'SPRINT NÃO INFORMADA')+(item.obs?' '+item.obs:''));
    warnings.push(...item.at);
  }
  return {
    text:'Tarefas da Release '+version+'\n\nStatus 12 (já estão em build)\n\n'+
      groups[12].join('\n')+'\n\nStatus 11 (Aguardando versão)\n\n'+groups[11].join('\n'),
    warnings,
    numbers:records.map(x=>tn(x.lines[0])[0]?.n).filter(Boolean)
  };
}
export function reviewRelease({raw,announcement,version='',compat='',signature=''}){
  const result=cmpRel(raw,announcement);
  if(result.err)throw Error(result.err);
  return {
    report:result.rep,
    cleaned:result.out,
    removed:result.rt.join('\n'),
    bbcode:fmtBB(result.out,version,compat,signature)
  };
}
export function compareTextLines(first,second){
  const a=String(first).replace(/\r/g,'').split('\n');
  const b=String(second).replace(/\r/g,'').split('\n');
  if(a.length>1500||b.length>1500)throw Error('Limite de 1.500 linhas por texto.');
  const changes=lcs(a,b),added=changes.filter(x=>x[0]==='+').length,
    removed=changes.filter(x=>x[0]==='-').length;
  return {changes,added,removed,changed:0};
}
export function compareXmlDocuments(first,second,ignoreSpacing=true){
  const inputs=[String(first).trim(),String(second).trim()];
  const maps=[{},{}];
  inputs.forEach((source,index)=>{
    if(source.length>150000)throw Error('XML excede 150.000 caracteres.');
    const xml=new DOMParser().parseFromString(source,'application/xml');
    const error=xml.querySelector('parsererror');
    if(!source||error)throw Error('XML '+(index?'B':'A')+' inválido: '+(error?.textContent.slice(0,120)||'conteúdo vazio'));
    fl(xml.documentElement,'/'+xml.documentElement.nodeName,maps[index],ignoreSpacing);
  });
  const out=[],A=maps[0],B=maps[1];
  for(const path of Object.keys(A)){
    if(!(path in B)){out.push('REMOVIDO  '+path);continue;}
    const a=A[path],b=B[path];
    if(a.ns!==b.ns)out.push('NAMESPACE '+path+': '+a.ns+' → '+b.ns);
    for(const attr of new Set([...Object.keys(a.a),...Object.keys(b.a)]))
      if(a.a[attr]!==b.a[attr])
        out.push('ATRIBUTO  '+path+'@'+attr+': '+(attr in a.a?a.a[attr]:'(ausente)')+' → '+(attr in b.a?b.a[attr]:'(ausente)'));
    if(a.tx!==b.tx)out.push('VALOR     '+path+': '+JSON.stringify(a.tx)+' → '+JSON.stringify(b.tx));
  }
  for(const path of Object.keys(B))if(!(path in A))out.push('ADICIONADO '+path);
  return {
    lines:out.slice(0,3000),total:out.length,
    added:out.filter(x=>x.startsWith('ADICIONADO ')).length,
    removed:out.filter(x=>x.startsWith('REMOVIDO ')).length,
    changed:out.filter(x=>!x.startsWith('ADICIONADO ')&&!x.startsWith('REMOVIDO ')).length
  };
}
