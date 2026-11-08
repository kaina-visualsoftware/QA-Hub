import { describe, expect, it } from "vitest";
import {
  discardNewTaskDraft, loadNewTaskDraft, saveNewTaskDraft
} from "../src/features/tasks/local-draft";
import type { TaskDraft } from "../src/lib/contracts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const time = 1_783_000_000_000;
const form: TaskDraft = {
  titulo: "TF em elaboração", descricao: "Passo 1\nPasso 2",
  codigo: "67866", sistema: "Financeiro", versao: "12.08",
  tipo_teste: "BUILD"
};

function fakeStorage() {
  const items = new Map<string,string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); }
  };
}

describe("rascunho de TF local (opt-in)", () => {
  it("salva somente os seis campos essenciais e preserva quebras de linha", () => {
    const storage = fakeStorage();
    const withExtra = { ...form, base_teste:"interna", empresa:"não persistir",
      testador:"não persistir", observacoes:"não persistir" };
    expect(saveNewTaskDraft(A,withExtra,storage,time)).toBe(true);
    const recovered = loadNewTaskDraft(A,storage,time+1000);
    expect(recovered?.fields).toEqual(form);
    expect(recovered?.fields.descricao).toContain("\n");
    const stored = [...storage.items.values()][0];
    expect(stored).not.toContain("base_teste");
    expect(stored).not.toContain("não persistir");
  });
  it("não mistura rascunhos de duas contas e permite descarte individual", () => {
    const storage = fakeStorage();
    expect(saveNewTaskDraft(A,form,storage,time)).toBe(true);
    expect(loadNewTaskDraft(B,storage,time)).toBeNull();
    expect(saveNewTaskDraft(B,{...form,titulo:"Outra TF"},storage,time)).toBe(true);
    discardNewTaskDraft(A,storage);
    expect(loadNewTaskDraft(A,storage,time)).toBeNull();
    expect(loadNewTaskDraft(B,storage,time)?.fields.titulo).toBe("Outra TF");
  });
  it("invalida rascunho expirado e não aceita conteúdo manipulado", () => {
    const storage = fakeStorage();
    expect(saveNewTaskDraft(A,form,storage,time)).toBe(true);
    expect(loadNewTaskDraft(A,storage,time+24*60*60*1000+1)).toBeNull();
    expect(storage.items.size).toBe(0);
    expect(saveNewTaskDraft(A,form,storage,time)).toBe(true);
    const key=[...storage.items.keys()][0];
    storage.items.set(key,JSON.stringify({
      version:1,ownerId:B,savedAt:time,fields:form
    }));
    expect(loadNewTaskDraft(A,storage,time)).toBeNull();
    expect(storage.items.size).toBe(0);
    storage.items.set(key,"{incomplete-json");
    expect(loadNewTaskDraft(A,storage,time)).toBeNull();
  });
  it("falha fechado se storage ou conteúdo não estiver disponível", () => {
    const storage = fakeStorage();
    storage.setItem = () => { throw Error("quota exceeded"); };
    expect(saveNewTaskDraft(A,form,storage,time)).toBe(false);
    expect(saveNewTaskDraft("wrong-owner",form,storage,time)).toBe(false);
    expect(saveNewTaskDraft(A,{...form,descricao:"x".repeat(30001)},fakeStorage(),time))
      .toBe(false);
  });
});
