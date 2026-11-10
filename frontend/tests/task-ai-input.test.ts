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
