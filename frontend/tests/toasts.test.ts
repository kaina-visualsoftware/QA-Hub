import {afterEach,describe,expect,it} from "vitest";
import {notify,useToastStore} from "../src/components/ui/Toasts";

afterEach(()=>useToastStore.getState().clear());

describe("notificações globais",()=>{
  it("exibe diferentes níveis sem duplicar mensagens imediatas",()=>{
    notify.success("  Operação salva.  ");
    notify.success("Operação salva.");
    notify.error("Falha de gravação");
    const items=useToastStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({tone:"error",message:"Falha de gravação"});
    expect(items[1]).toMatchObject({tone:"success",message:"Operação salva."});
  });
  it("mantém até quatro notificações e aceita fechamento individual",()=>{
    for(let i=0;i<6;i++)notify.info("Mensagem "+i);
    const state=useToastStore.getState();
    expect(state.items).toHaveLength(4);
    expect(state.items[0].message).toBe("Mensagem 5");
    state.dismiss(state.items[0].id);
    expect(useToastStore.getState().items).toHaveLength(3);
  });
  it("ignora texto vazio e permite limpar todas as notificações",()=>{
    notify.warning("  ");
    expect(useToastStore.getState().items).toHaveLength(0);
    notify.warning("Confira a situação.");
    useToastStore.getState().clear();
    expect(useToastStore.getState().items).toEqual([]);
  });
});
