/**
 * Extract only scenarios explicitly delimited in a pasted QA report.
 * Supports checklist steps, numbered actions and action logs from completed
 * tests. Observed outcomes remain notes, not an automatic approval.
 */
export function extractExplicitScenarios(raw){
  if(typeof raw!=='string'||raw.length>200000)return [];
  const lines=raw.replace(/\r\n?/g,'\n').replace(/\\n/g,'\n').split('\n');
  const scenarioHeader=/^(?:#{1,6}\s*)?(?:\*\*)?(?:CEN[ÁA]RIO|CASO DE TESTE)\s*(?:N[º°.]?\s*)?(\d{1,3})\s*(?:[-–—:]|\.\s+)(.+?)(?:\*\*)?\s*$/i;
  const section=/^(?:#{1,6}\s*)?(?:\*\*)?(?:CEN[ÁA]RIOS? TESTADOS|CEN[ÁA]RIOS? EXECUTADOS|CASOS DE TESTE EXECUTADOS)\s*:?(?:\*\*)?$/i;
  const stopper=/^(?:#{1,6}\s*)?(?:\*\*)?(?:O QUE FOI TESTADO|VALIDA[CÇ][ÃA]O FINAL|CONCLUS[ÃA]O|QUAL [ÉE] O PROBLEMA|PROBLEMA IDENTIFICADO|CAUSA RAIZ|AN[ÁA]LISE DE VIABILIDADE|O QUE (?:O DESENVOLVEDOR )?ALTEROU|CORRE[CÇ][ÃA]O APLICADA|RESULTADO FINAL|EXPLICA[CÇ][ÃA]O|COMO FUNCIONA|TIPO DE TESTE|DADOS DA TF|RESUMO|DESENVOLVIMENTO)\s*[:?—-]*(?:\*\*)?$/i;
  const labels=/^(PASSOS(?: EXECUTADOS)?|ETAPAS|RESULTADO ESPERADO|ESPERADO|RESULTADO OBTIDO|RESULTADO OBSERVADO|OBTIDO|OBJETIVO(?: DO CEN[ÁA]RIO)?|OBSERVA[CÇ][ÕO]ES)\s*[:：]\s*(.*)$/i;
  const action=/^(?:\d{1,3}[.)]\s+|[-*•]\s+|\[\s*[xX ]\s*\]\s+|(?:Acessad[oa]|Aberto|Abert[oa]|Entrad[oa]|Selecionad[oa]|Utilizad[oa]|Informad[oa]|Preenchid[oa]|Clicad[oa]|Marcado|Desmarcado|Fechad[oa]|Reabert[oa]|Gerad[oa]|Anotad[oa]|Conferid[oa]|Verificad[oa]|Confirmad[oa]|Observad[oa]|Comparad[oa]|Com\s+o\s+mesmo\s+usu[áa]rio)\b)/i;
  const result=[];
  let current=null,mode='steps';
  function commit(){
    if(current&&current.passos.length&&current.titulo.length>2){
      const expected=current.esperado.join('\n').trim() ||
        (current.objetivo.length?current.objetivo.join(' ').replace(/^Validar\s+que\s+/i,''):'') ||
        (current.obtido.length?current.obtido[0].replace(/^(?:Confirmado|Verificado|Observado)\s+que\s+/i,''):'') ||
        ('Verificar o comportamento descrito: '+current.titulo+'.');
      result.push({
        ordem:result.length+1,titulo:current.titulo.slice(0,240),
        passos:current.passos.join('\n').slice(0,30000),
        esperado:expected.slice(0,30000),
        obtido:current.obtido.join('\n').slice(0,30000),
        objetivo:current.objetivo.join('\n').slice(0,20000),
        observacoes:current.observacoes.join('\n').slice(0,20000),
        status:'nao_executado'
      });
    }
    current=null;mode='steps';
  }
  for(const original of lines){
    const line=original.trim().replace(/^\*\*(.*?)\*\*$/,'$1');
    if(section.test(line)){commit();continue;}
    const header=line.match(scenarioHeader);
    if(header){
      commit();
      current={titulo:header[2].trim(),passos:[],esperado:[],obtido:[],objetivo:[],observacoes:[]};
      mode='steps';continue;
    }
    if(stopper.test(line)||/^#{1,6}\s+/.test(line)&&current){
      commit();continue;
    }
    if(!current||!line||/^[-—–]{3,}$/.test(line))continue;
    const match=line.match(labels);
    if(match){
      const field=match[1].toLocaleLowerCase('pt-BR');
      mode=field.startsWith('objetivo')?'objetivo':
        field.startsWith('observa')?'observacoes':
        field.includes('esperado')?'esperado':
        field.includes('obtido')||field.includes('observado')?'obtido':'steps';
      if(match[2])current[mode==='steps'?'passos':mode].push(match[2]);
      continue;
    }
    if(mode!=='steps'){current[mode].push(line);continue;}
    if(/\.(?:png|jpe?g|webp|pdf)$/i.test(line)&&!action.test(line))continue;
    if(!action.test(line))continue;
    const cleaned=line.replace(/\s*\d{8}-\d{6}-[a-f0-9-]+\.(?:png|jpe?g|webp)$/i,'').trim();
    // Completed test logs often state "Confirmado que ..." instead of an
    // expected-result heading. Keep this outcome separately as source evidence.
    if(/^(?:[-*•]\s*)?(?:Confirmad[oa]|Verificad[oa])\s+que\b/i.test(cleaned)){
      current.obtido.push(cleaned.replace(/^[-*•]\s*/,''));
      // A confirmation is also an explicit action recorded by the tester.
      current.passos.push(cleaned);
    }else if(/^[-*•]\s+.*\bdeve(?:r[áa])?\b/i.test(cleaned) && current.passos.length){
      current.esperado.push(cleaned.replace(/^[-*•]\s*/,''));
    }else current.passos.push(cleaned);
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
