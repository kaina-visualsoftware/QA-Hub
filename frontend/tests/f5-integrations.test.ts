import {describe,expect,it} from "vitest";
import {githubIssueDraft,parsePlaywright,parseJUnit} from "../src/features/integrations/test-results";

describe("F5: integrações explicitamente revisadas",()=>{
  it("gera rascunho GitHub HTTPS para repositório válido",()=>{
    const url=new URL(githubIssueDraft("acme/qa-hub","Testar fluxo",
      "TF #123: campos & detalhes"));
    expect(url.hostname).toBe("github.com");
    expect(url.pathname).toBe("/acme/qa-hub/issues/new");
    expect(url.searchParams.get("title")).toBe("Testar fluxo");
    expect(url.searchParams.get("body")).toContain("TF #123");
    for(const repo of ["../../evil","org/repo/issues","https://evil.com/repo",
      "foo//bar",". / repo","org/repo?token=x"]){
      expect(()=>githubIssueDraft(repo,"a","b")).toThrow();
    }
  });
  it("lê JSON Playwright sem inventar resultados",()=>{
    const values=parsePlaywright(JSON.stringify({
      suites:[{title:"Financeiro",specs:[
        {title:"Desconto recalculado",tests:[{results:[{status:"passed"}]}]},
        {title:"Erro de regra",tests:[{results:[{status:"failed",error:{message:"Expected 1, got 0"}}]}]},
        {title:"Ignorado",tests:[{results:[{status:"skipped"}]}]},
        {title:"Temporizado",tests:[{results:[{status:"timedOut"}]}]}
      ]}]
    }));
    expect(values.map(v=>v.status)).toEqual([
      "aprovado","reprovado","nao_executado","reprovado"]);
    expect(values[1].observed).toContain("Expected 1");
    expect(()=>parsePlaywright("{invalido")).toThrow("JSON inválido");
    expect(()=>parsePlaywright(JSON.stringify({other:true}))).toThrow("Não foram encontrados");
  });
  it("rejeita XML perigoso antes de iniciar o parser",()=>{
    expect(()=>parseJUnit('<!DOCTYPE root [<!ENTITY x SYSTEM "file:///etc/passwd">]><root/>'))
      .toThrow("não é permitido");
    expect(()=>parseJUnit("<testsuite/>")).toThrow("navegador");
  });
});
