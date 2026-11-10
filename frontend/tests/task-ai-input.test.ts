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
