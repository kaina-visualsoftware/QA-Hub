// The 20k budget belongs to QA Hub's existing diagram chunking pipeline,
// not to NVIDIA's task extraction API. Model context windows use tokens.
export function aiInputError(text,mode){
 if(typeof text!=='string'||!text.trim())return {error:'bad_request',message:'Informe o texto da tarefa.'};
 if((mode==='diagram'||mode==='diagram-summary')&&text.trim().length>20000)
  return {error:'too_long',message:'Cada parte do contexto de diagramas deve ter até 20.000 caracteres.'};
 return null;
}
