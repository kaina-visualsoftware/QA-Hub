// Parser puro e testável. Nenhum conteúdo é enviado à rede durante a interpretação.
export function parseReport(raw) {
  if(raw.length > 200000) throw Error('O relatório deve ter até 200.000 caracteres.');
  const text=raw.replace(/\r\n?/g,'\n').replace(/\\\n/g,'\n');
  const lines=text.split('\n');
  const result={descricao:'',conclusao:'',observacoes:'',tipo_teste:/\[\s*[xX]\s*\]\s*RELEASE/i.test(text)?'RELEASE':'BUILD',cenarios:[],funcionando:null,erro_reproduzido:null};
  let mode='';
  const sections={descricao:[],conclusao:[],observacoes:[]};
  let current=null;
  for(const original of lines){
    const line=original.trim();
    if(/^[-—–]{3,}$/.test(line)||!line) {if(current)current.passos.push('');continue;}
    if(/^TIPO DE TESTE\s*:/i.test(line)){mode='';continue;}
    if(/^O QUE FOI TESTADO\s*:/i.test(line)){mode='descricao';const rest=line.split(/:/).slice(1).join(':').trim();if(rest)sections.descricao.push(rest);continue;}
    if(/^CEN[ÁA]RIOS TESTADOS\s*:/i.test(line)){mode='cenarios';continue;}
    const match=line.match(/^CEN[ÁA]RIO\s+(\d+)\s*[-–—:]\s*(.*)$/i);
    if(match){mode='cenarios';current={ordem:Number(match[1]),titulo:match[2]||'Cenário '+match[1],passos:[]};result.cenarios.push(current);continue;}
    if(/^VALIDA[CÇ][ÃA]O FINAL\s*:/i.test(line)){mode='validacao';current=null;continue;}
    if(/^CONCLUS[ÃA]O\s*:/i.test(line)){mode='conclusao';current=null;const rest=line.split(/:/).slice(1).join(':').trim();if(rest)sections.conclusao.push(rest);continue;}
    if(/^OBS(?:ERVA[CÇ][ÕO]ES)?\s*ADD\s*:/i.test(line)){mode='observacoes';current=null;const rest=line.split(/:/).slice(1).join(':').trim();if(rest)sections.observacoes.push(rest);continue;}
    if(mode==='cenarios'&&current){current.passos.push(line.replace(/^\\-\s*/,'- '));continue;}
    if(sections[mode])sections[mode].push(line);
  }
  for(const key of Object.keys(sections))result[key]=sections[key].join('\n').trim();
  const validation=text.match(/VALIDA[CÇ][ÃA]O FINAL\s*:\s*([\s\S]*?)(?:CONCLUS[ÃA]O\s*:|$)/i)?.[1]||'';
  const flag=(label)=>{
    const segment=validation.match(new RegExp(label+'\\s*\\?\\s*([^\\n]+)','i'))?.[1]||'';
    return /\[\s*x\s*\]\s*SIM/i.test(segment)?true:/\[\s*x\s*\]\s*N[ÃA]O/i.test(segment)?false:null;
  };
  result.funcionando=flag('FUNCIONANDO CORRETAMENTE');
  result.erro_reproduzido=flag('ERRO REPRODUZIDO');
  result.cenarios=result.cenarios.slice(0,100).map(s=>({...s,passos:s.passos.join('\n').trim(),status:'nao_executado'}));
  if(!result.descricao&&!result.cenarios.length)throw Error('Nenhum cenário ou descrição identificados. Confira os títulos das seções.');
  const firstTitle=result.descricao.replace(/\s+/g,' ').slice(0,95) || 'Relatório de teste importado';
  result.titulo=firstTitle.length<3?'Relatório importado':firstTitle;
  return result;
}
