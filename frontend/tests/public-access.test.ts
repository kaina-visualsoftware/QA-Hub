import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_TASK_COLUMNS, PUBLIC_DETAIL_COLUMNS, PUBLIC_SCENARIO_COLUMNS,
  PUBLIC_DIAGRAM_COLUMNS, publicTaskCardSchema, publicTaskDetailSchema,
  publicScenarioSchema, publicDiagramSchema
} from "../src/features/public/public-data";

const id = "11111111-1111-4111-8111-111111111111";
describe("whitelist da biblioteca pública", () => {
  it("lista somente os campos explicitamente publicados", () => {
    expect(PUBLIC_TASK_COLUMNS).toBe("id,titulo,codigo,tipo_teste,sistema,versao,executado_em");
    expect(PUBLIC_DETAIL_COLUMNS).not.toContain("user_id");
    expect(PUBLIC_DETAIL_COLUMNS).not.toContain("email");
    expect(PUBLIC_DETAIL_COLUMNS).not.toContain("base_teste");
    expect(PUBLIC_SCENARIO_COLUMNS).not.toContain("user_id");
    expect(PUBLIC_DIAGRAM_COLUMNS).toBe("id,titulo,conteudo");
  });
  it("ignora campos extras do banco, inclusive identificadores privados", () => {
    const raw = { id, titulo: "Descontos", codigo: "78912", tipo_teste: "BUILD",
      sistema: "Financeiro", versao: "12.00", executado_em: null,
      user_id: "segredo", email: "usuario@example.invalid" };
    const parsed = publicTaskCardSchema.parse(raw);
    expect(parsed).not.toHaveProperty("user_id");
    expect(parsed).not.toHaveProperty("email");
    const detail = publicTaskDetailSchema.parse({
      ...raw, status: "rascunho", descricao: "Texto compartilhado",
      acesso_interno: "jamais compartilhar"
    });
    expect(detail).not.toHaveProperty("acesso_interno");
  });
  it("cenários e diagramas publicados também restringem seus campos", () => {
    const scenario = publicScenarioSchema.parse({
      id, titulo: "Cenário", ordem: 1, passos: "Abrir", esperado: "Sucesso",
      obtido: "", observacoes: "", status: "nao_executado",
      token: "nunca"
    });
    expect(scenario).not.toHaveProperty("token");
    const diagram = publicDiagramSchema.parse({
      id, titulo: "Fluxo", conteudo: "flowchart LR\n A --> B", user_id: "privado"
    });
    expect(diagram).not.toHaveProperty("user_id");
  });
});

describe("contrato da projeção pública no servidor", () => {
  it("não faz SELECT de tabela para listar ou detalhar dados publicados", () => {
    const reactSource = readFileSync(new URL(
      "../src/features/public/public-data.ts", import.meta.url), "utf8");
    const legacySource = readFileSync(new URL(
      "../../public.js", import.meta.url), "utf8");
    expect(reactSource).toContain('supabase.rpc("qa_public_tasks_v1")');
    expect(reactSource).toContain('supabase.rpc("qa_public_task_v1"');
    expect(legacySource).toContain("db.rpc('qa_public_tasks_v1')");
    expect(legacySource).toContain("db.rpc('qa_public_task_v1'");
    expect(legacySource).not.toMatch(/db\.from\(['"]qa_(?:tarefas|cenarios|diagramas)['"]\)/);
  });
  it("restringe a função privilegiada a campos explícitos e a publica=true", () => {
    const sql = readFileSync(new URL(
      "../../supabase/qa_public_read_api.sql", import.meta.url), "utf8");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("where t.publica is true");
    expect(sql).toContain("where t.id = p_task_id and t.publica is true");
    expect(sql).not.toMatch(/'user_id'\s*,|'empresa'\s*,|'base_teste'\s*,|'testador'\s*,/);
  });
});
