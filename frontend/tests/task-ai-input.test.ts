import {afterEach,describe,it,expect,vi} from 'vitest';
import {supabase} from '../src/lib/supabase';
import {generateTaskAiDraft} from '../src/features/tasks/task-ai';
vi.mock('../src/lib/supabase',()=>({supabase:{functions:{invoke:vi.fn()}}}));
afterEach(()=>vi.restoreAllMocks());
describe('contexto longo da TF',()=>{
 it('envia o texto inteiro, além dos antigos limites de 20k e 80k',async()=>{
  const text='Condição de erro na emissão. '.repeat(4000)+' FIM DA TAREFA';
  const invoke=vi.spyOn(supabase.functions,'invoke').mockResolvedValue({data:{provider:'NVIDIA Build',draft:{titulo:'Análise completa',descricao:'Revisar a emissão'}},error:null});
  const result=await generateTaskAiDraft(text);
  expect(invoke.mock.calls[0][1]?.body).toEqual({text});
  expect(result.fields.titulo).toBe('Análise completa');
 });
});


describe('abertura de TF com requisito ou teste colado',()=>{
 it('recupera campos de requisito quando NVIDIA retorna fallback estruturado vazio',async()=>{
  const text=[
   'Requisitos:',
   '- Ao cadastrar um cliente estrangeiro, o sistema deve aplicar a máscara de telefone conforme o país selecionado.',
   '- A mudança não deve afetar o cadastro de clientes brasileiros.'
  ].join('\n');
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',fallback:true,draft:{}},error:null
  });
  const result=await generateTaskAiDraft(text);
  expect(result.extractionSource).toBe('local');
  expect(result.fields.titulo).toMatch(/Ao cadastrar um cliente estrangeiro/i);
  expect(result.fields.descricao).toMatch(/máscara de telefone/i);
  expect(result.fields.causa).toBeUndefined();
  expect(result.fields.correcao).toBeUndefined();
 });

 it('reconhece cenário, passos e resultado esperado de teste isolado',async()=>{
  const text=[
   'CENÁRIO 1 — Remover desconto negativo',
   'Passos:',
   '1. Abrir pedido 67866.',
   '2. Remover desconto pelo botão X.',
   'Resultado esperado: O valor do desconto deve ficar zerado.'
  ].join('\n');
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',fallback:true,draft:{}},error:null
  });
  const result=await generateTaskAiDraft(text);
  expect(result.fields.titulo).toMatch(/Remover desconto negativo/i);
  expect(result.fields.descricao).toMatch(/Roteiro de testes/i);
  expect(result.cenarios).toHaveLength(1);
  expect(result.cenarios[0].passos).toContain('Abrir pedido 67866');
  expect(result.cenarios[0].esperado).toMatch(/desconto deve ficar zerado/i);
  expect(result.cenarios[0].status).toBe('nao_executado');
 });

 it('complementa saída parcial da IA com dados explícitos, mantendo prioridade ao título da NVIDIA',async()=>{
  const text=[
   'Sistema: Financeiro',
   'CENÁRIO 1 — Remover desconto negativo',
   'Passos:',
   '1. Abrir pedido 67866.',
   '2. Remover desconto.',
   'Resultado esperado: O desconto não aparece mais.'
  ].join('\n');
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',draft:{titulo:'Testar remoção de descontos'}},error:null
  });
  const result=await generateTaskAiDraft(text);
  expect(result.extractionSource).toBe('nvidia');
  expect(result.fields.titulo).toBe('Testar remoção de descontos');
  expect(result.fields.sistema).toBe('Financeiro');
  expect(result.cenarios).toHaveLength(1);
 });

 it('não corta um texto grande silenciosamente se a NVIDIA não conseguir estruturar',async()=>{
  const text='Requisito: preservar o relatório integral. '.repeat(7000);
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',fallback:true,draft:{}},error:null
  });
  await expect(generateTaskAiDraft(text)).rejects.toThrow(/não estruturou os campos/i);
 });

 it('não mascara falhas reais de acesso à NVIDIA como extração bem-sucedida',async()=>{
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:null,error:{context:{json:async()=>({error:'rate_limited',message:'Limite por minuto atingido.'})}}
  } as never);
  await expect(generateTaskAiDraft('Requisito: o sistema deve emitir boletos.'))
   .rejects.toThrow(/Limite por minuto atingido/);
 });
});



describe('indisponibilidade temporária da NVIDIA não bloqueia a abertura de TF',()=>{
 const source=[
  'QUAL É O PROBLEMA IDENTIFICADO?--',
  'Ao excluir o desconto do pedido 67866, o valor permanece inalterado.',
  'ANÁLISE DE VIABILIDADE:',
  'A rotina antiga ignora percentuais negativos dos kits.',
  'O QUE O DESENVOLVEDOR ALTEROU:',
  'A remoção agora considera os descontos negativos.'
 ].join('\\n');
 it('faz extração local para 503 ai_temporarily_unavailable de produção',async()=>{
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:null,error:{context:{
    status:503,json:async()=>({
      error:'ai_temporarily_unavailable',
      message:'A NVIDIA está temporariamente indisponível. O texto pode ser organizado localmente.'
    })
   }}
  } as never);
  const draft=await generateTaskAiDraft(source);
  expect(draft.extractionSource).toBe('local');
  expect(draft.fields.descricao).toMatch(/valor permanece inalterado/i);
  expect(draft.fields.causa).toMatch(/percentuais negativos/i);
  expect(draft.fields.correcao).toMatch(/considera os descontos negativos/i);
 });
 it('permite fallback local para 503 temporário sem JSON, sem inventar dados',async()=>{
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:null,error:{context:{status:503,json:async()=>{throw Error('No JSON');}}}
  } as never);
  const draft=await generateTaskAiDraft('Requisitos:\\n- O sistema deve validar a máscara de telefone do cliente estrangeiro.');
  expect(draft.extractionSource).toBe('local');
  expect(draft.fields.descricao).toMatch(/máscara de telefone/i);
 });
 it('continua mostrando erros de quota, autenticação, chave e controle de limite',async()=>{
  const spy=vi.spyOn(supabase.functions,'invoke');
  for(const detail of [
   {status:429,error:'rate_limited',message:'Cota atingida'},
   {status:401,error:'unauthorized',message:'Faça login'},
   {status:503,error:'nvidia_key_invalid',message:'Chave inválida'},
   {status:503,error:'rate_limit_not_ready',message:'Controle de limite indisponível'}
  ]){
   spy.mockResolvedValue({data:null,error:{context:{
    status:detail.status,json:async()=>detail
   }}} as never);
   await expect(generateTaskAiDraft(source)).rejects.toThrow(detail.message);
  }
 });
 it('não dá falso sucesso para texto sem extração local possível',async()=>{
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:null,error:{context:{status:503,json:async()=>({error:'ai_temporarily_unavailable'})}}
  } as never);
  const veryLong='Requisito: preservar todos os registros do pedido. '.repeat(5000);
  await expect(generateTaskAiDraft(veryLong)).rejects.toThrow(/texto integral/i);
 });
});


describe('blocos de relato técnico na abertura',()=>{
 it('separa problema, análise de viabilidade e alteração sem confundir causa com descrição',async()=>{
  const text=[
   'QUAL É O PROBLEMA IDENTIFICADO?--',
   'Ao remover o desconto, o valor permanece no pedido.',
   'ANÁLISE DE VIABILIDADE:',
   'A rotina ignora percentuais negativos dos kits.',
   'O QUE O DESENVOLVEDOR ALTEROU:',
   'A remoção passou a considerar descontos negativos.'
  ].join('\n');
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',fallback:true,draft:{}},error:null
  });
  const draft=await generateTaskAiDraft(text);
  expect(draft.fields.descricao).toMatch(/valor permanece no pedido/i);
  expect(draft.fields.descricao).not.toMatch(/rotina ignora/i);
  expect(draft.fields.causa).toMatch(/ignora percentuais negativos/i);
  expect(draft.fields.correcao).toMatch(/passou a considerar/i);
 });
});

describe('regressão de relatório extenso',()=>{
 it('recupera requisitos longos sem voltar ao limite de 30 mil caracteres',async()=>{
  const text='Requisito: o sistema deve manter o histórico de descontos do pedido. '.repeat(1400).trim();
  const invoke=vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',fallback:true,draft:{}},error:null
  });
  const draft=await generateTaskAiDraft(text);
  expect(invoke.mock.calls[0][1]?.body).toEqual({text});
  expect(draft.extractionSource).toBe('local');
  expect(draft.fields.descricao).toMatch(/histórico de descontos/i);
 });
});


describe('complementação segura de cenários incompletos',()=>{
 it('recupera resultado esperado explícito que a IA deixou em branco',async()=>{
  const text=[
   'CENÁRIO 1 — Remover desconto negativo',
   'Passos:',
   '1. Abrir pedido 67866.',
   '2. Remover desconto.',
   'Resultado esperado: O desconto não aparece mais.'
  ].join('\n');
  vi.spyOn(supabase.functions,'invoke').mockResolvedValue({
   data:{provider:'NVIDIA Build',draft:{cenarios:[{
    titulo:'Remover desconto negativo',passos:'Abrir pedido 67866',esperado:''
   }]}},error:null
  });
  const result=await generateTaskAiDraft(text);
  expect(result.extractionSource).toBe('nvidia');
  expect(result.cenarios).toHaveLength(1);
  expect(result.cenarios[0].esperado).toMatch(/desconto não aparece mais/i);
 });
});
