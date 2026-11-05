/**
 * Returns only clearly delimited, explicitly described test cases.
 * We do not infer scenarios from a narrative, a title, or LLM-generated lists.
 */
export function extractExplicitScenarios(raw){
  if(typeof raw!=='string'||raw.length>200000)return [];
  const lines=raw.replace(/\r\n?/g,'\n').replace(/\\n/g,'\n').split('\n');
  const scenarioHeader=/^(?:#{1,6}\s*)?(?:\*\*)?(?:CEN[ÁA]RIO|CASO DE TESTE)\s*(?:N[º°.]?\s*)?(\d{1,3})\s*(?:[-–—:]|\.\s+)\s*(.+?)(?:\*\*)?\s*$/i;
  const stopper=/^(?:#{1,6}\s*)?(?:\*\*)?(?:O QUE FOI TESTADO|VALIDA[CÇ][ÃA]O FINAL|CONCLUS[ÃA]O|OBSERVA[CÇ][ÕO]ES(?:\s+ADICIONAIS)?|OBS\s+ADD|QUAL [ÉE] O PROBLEMA|PROBLEMA IDENTIFICADO|CAUSA RAIZ|AN[ÁA]LISE DE VIABILIDADE|O QUE (?:O DESENVOLVEDOR )?ALTEROU|CORRE[CÇ][ÃA]O APLICADA|RESULTADO FINAL|OBJETIVO(?: DO TESTE)?|EXPLICA[CÇ][ÃA]O|COMO FUNCIONA|TIPO DE TESTE|DADOS DA TF|RESUMO)\b/i;
  const section=/^(?:#{1,6}\s*)?(?:\*\*)?(?:CEN[ÁA]RIOS? TESTADOS|CEN[ÁA]RIOS? EXECUTADOS|CASOS DE TESTE EXECUTADOS)\s*:?\s*(?:\*\*)?$/i;
  let current=null, mode='steps', active=false;
  const result=[];
  function commit(){
    if(current && current.evidence && current.passos.length && current.titulo.length>2){
      result.push({
        ordem:result.length+1,
        titulo:current.titulo.slice(0,240),
        passos:current.passos.join('\n').trim().slice(0,30000),
        esperado:current.esperado.join('\n').trim().slice(0,30000),
        obtido:current.obtido.join('\n').trim().slice(0,30000),
        observacoes:'',
        status:'nao_executado'
      });
    }
    current=null;mode='steps';
  }
  for(const original of lines){
    const line=original.trim();
    const normalized=line.replace(/^\*{2}/,'').replace(/\*{2}$/,'').trim();
    if(section.test(normalized)){commit();active=true;continue;}
    if(stopper.test(normalized)){
      commit();active=false;continue;
    }
    const heading=normalized.match(scenarioHeader);
    if(heading){
      commit();
      current={titulo:heading[2].trim(),passos:[],esperado:[],obtido:[],evidence:false};
      active=true;mode='steps';continue;
    }
    if(/^#{1,6}\s+/.test(line) && current){commit();active=false;continue;}
    if(!current || !active)continue;
    if(!line || /^[-—–]{3,}$/.test(line))continue;
    const label=normalized.match(/^(?:PASSOS(?: EXECUTADOS)?|ETAPAS|RESULTADO ESPERADO|ESPERADO|RESULTADO OBTIDO|RESULTADO OBSERVADO|OBTIDO)\s*[:：]\s*(.*)$/i);
    if(label){
      const tag=label[0].toUpperCase();
      mode=/(?:ESPERADO)/.test(tag)?'esperado':/(?:OBTIDO|OBSERVADO)/.test(tag)?'obtido':'steps';
      if(label[1]){
        if(mode==='steps'){current.passos.push(label[1]);current.evidence=true;}
        else current[mode].push(label[1]);
      }
      continue;
    }
    if(mode!=='steps'){current[mode].push(line);continue;}
    // Only genuine step lines count, not free-form explanatory paragraphs.
    if(/^(?:[-*•]\s+|\d{1,2}[.)]\s+|\[\s*[xX ]\s*\]\s+)/.test(line)){
      current.passos.push(line.replace(/^[-*•]\s+/, '- ').slice(0,2500));
      current.evidence=true;
    }
  }
  commit();
  return result.slice(0,50);
}

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
  result.cenarios=extractExplicitScenarios(raw).slice(0,100);
  if(!result.descricao&&!result.cenarios.length)throw Error('Nenhum cenário ou descrição identificados. Confira os títulos das seções.');
  const firstTitle=result.descricao.replace(/\s+/g,' ').slice(0,95) || 'Relatório de teste importado';
  result.titulo=firstTitle.length<3?'Relatório importado':firstTitle;
  return result;
}
