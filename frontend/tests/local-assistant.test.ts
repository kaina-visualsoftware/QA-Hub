import { describe, expect, it } from "vitest";
import {
  extractLocalDraft, normalizeDraft, ASSIST_SCENARIO_LIMIT
} from "../src/lib/legacy/qa-assistant.mjs";

const report = [
  "TF #67866",
  "TÍTULO: Atualização de descontos negativos",
  "TIPO DE TESTE: [X] BUILD [ ] RELEASE",
  "VERSÃO: 12.08.08.0000",
  "",
  "O QUE FOI TESTADO:",
  "Remover desconto gravado em pedido.",
  "",
  "CENÁRIO 1 — Remover desconto do pedido",
  "PASSOS:",
  "- Abrir pedido 67866",
  "- Pressionar o botão remover",
  "RESULTADO ESPERADO: O campo desconto deve zerar."
].join("\n");
describe("extração local de TF (sem IA ou tráfego de rede)", () => {
  it("identifica campos comprováveis e cenários sem aprová-los", () => {
    const result = extractLocalDraft(report);
    expect(result.fields.codigo).toBe("67866");
    expect(result.fields.titulo).toBe("Atualização de descontos negativos");
    expect(result.fields.versao).toBe("12.08.08.0000");
    expect(result.fields.descricao).toMatch(/Remover desconto/);
    expect(result.cenarios).toHaveLength(1);
    expect(result.cenarios[0].status).toBe("nao_executado");
    expect(result.cenarios[0].passos).toMatch(/Abrir pedido/);
    expect(result.cenarios[0].esperado).toMatch(/deve zerar/);
  });
  it("transforma cenários já testados em passos, esperado e objetivo sem aprovar automaticamente",()=>{
    const pasted=[
      "TÍTULO: Persistência do checkbox de devolução",
      "CENÁRIOS TESTADOS:",
      "CENÁRIO 1 — Primeiro uso: checkbox desmarcado",
      "Utilizado um usuário sem histórico no relatório",
      "Acessado o menu Relatórios > Vendas > Resumos > Vendedor",
      "Confirmado que o checkbox abre desmarcado",
      "Objetivo: Validar que um usuário sem histórico vê o checkbox desmarcado.",
      "RESULTADO ESPERADO: O checkbox deve abrir desmarcado."
    ].join("\n");
    const parsed=extractLocalDraft(pasted);
    expect(parsed.cenarios).toHaveLength(1);
    const c=parsed.cenarios[0];
    expect(c.titulo).toBe("Primeiro uso: checkbox desmarcado");
    expect(c.passos.split("\n")).toEqual([
      "1. Utilizar um usuário sem histórico no relatório",
      "2. Acessar o menu Relatórios > Vendas > Resumos > Vendedor",
      "3. Verificar se o checkbox abre desmarcado"
    ]);
    expect(c.esperado).toBe("O checkbox deve abrir desmarcado.");
    expect(c.observacoes).toContain("Objetivo:\nValidar que um usuário sem histórico");
    expect(c.observacoes).toContain("Resultado observado na TF:");
    expect(c.status).toBe("nao_executado");
    expect(c.obtido).toBe("");
  });
  it("padroniza também os cenários da NVIDIA e preserva o objetivo explícito",()=>{
    const parsed=normalizeDraft({
      cenarios:[{
        titulo:"PRIMEIRO USO DO RELATÓRIO",
        passos:"1. ENTRAR COM UM USUÁRIO NOVO\n2. ACESSAR VENDAS > RESUMOS > VENDEDOR",
        esperado:"- O CHECKBOX DEVE APARECER DESMARCADO.",
        objetivo:"Validar o estado inicial do filtro",
        obtido:"O teste foi realizado e a tela abriu desmarcada.",
        observacoes:"Conferir também a versão do sistema"
      }]
    });
    const c=parsed.cenarios[0];
    expect(c.passos).toBe("1. Entrar com um usuário novo\n2. Acessar vendas > resumos > vendedor");
    expect(c.esperado).toBe("O checkbox deve aparecer desmarcado.");
    expect(c.observacoes).toContain("Objetivo:\nValidar o estado inicial do filtro");
    expect(c.observacoes).toContain("Resultado observado na TF:");
    expect(c.observacoes).toContain("Conferir também a versão");
    expect(c.status).toBe("nao_executado");
  });
  it("não confia em status nem campos arbitrários devolvidos por uma análise", () => {
    const result=normalizeDraft({
      titulo:"TF sem aprovação automática", segredo:"não armazenar",
      cenarios:[{titulo:"Primeiro cenário",passos:"Abrir",esperado:"Sucesso",
        status:"aprovado",obtido:"aprovado",user_id:"outro autor"}]
    });
    expect(result.fields).not.toHaveProperty("segredo");
    expect(result.cenarios[0].status).toBe("nao_executado");
    expect(result.cenarios[0]).not.toHaveProperty("user_id");
  });
  it("limita o volume e não gera cenários por inferência de narrativa solta", () => {
    expect(ASSIST_SCENARIO_LIMIT).toBe(50);
    expect(extractLocalDraft("O QUE FOI TESTADO:\nUm texto explicativo sem passos.")
      .cenarios).toHaveLength(0);
    expect(() => extractLocalDraft("X".repeat(30001))).toThrow(/30.000/);
  });
});
