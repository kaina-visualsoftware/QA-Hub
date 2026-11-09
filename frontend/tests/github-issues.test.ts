import {afterEach,describe,expect,it,vi} from "vitest";
import {
  normalizeGithubRepo,githubIssueNumber,githubIssueUrl,checkPublicGithubIssue
} from "../src/features/integrations/github-issues";

afterEach(()=>vi.unstubAllGlobals());

describe("F5: vínculos seguros com issues GitHub",()=>{
  it("normaliza repositórios e números sem permitir URLs arbitrárias",()=>{
    expect(normalizeGithubRepo(" OpenAI/QA-Hub ")).toBe("openai/qa-hub");
    expect(githubIssueNumber("123")).toBe(123);
    expect(githubIssueUrl("openai/qa-hub",123))
      .toBe("https://github.com/openai/qa-hub/issues/123");
    for(const value of ["https://github.com/x/y","../x","x/..","x/.hidden","x/y/z","x/y?token=1"]){
      expect(()=>normalizeGithubRepo(value)).toThrow();
    }
    for(const value of ["0","-2","1.3","01","1?x=2","1000000000"])
      expect(()=>githubIssueNumber(value)).toThrow();
  });

  it("consulta apenas dados públicos mediante ação explícita",async()=>{
    const requested:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (url:string)=>{
      requested.push(url);
      return new Response(JSON.stringify({
        title:"Corrigir desconto",state:"open",
        html_url:"https://github.com/openai/qa-hub/issues/123"
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }));
    await expect(checkPublicGithubIssue("openai/qa-hub",123))
      .resolves.toEqual({
        title:"Corrigir desconto",state:"open",
        url:"https://github.com/openai/qa-hub/issues/123"
      });
    expect(requested).toEqual(["https://api.github.com/repos/openai/qa-hub/issues/123"]);
  });

  it("não finge disponibilidade para issues privadas ou limite de API",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response("{}",{status:404})));
    await expect(checkPublicGithubIssue("openai/qa-hub",1))
      .rejects.toThrow("privada");
  });

  it("não confunde pull requests ou referências redirecionadas com issues",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({
      title:"Uma mudança",state:"closed",
      html_url:"https://github.com/openai/qa-hub/pull/123",
      pull_request:{url:"https://api.github.com/repos/openai/qa-hub/pulls/123"}
    }),{status:200,headers:{"Content-Type":"application/json"}}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(checkPublicGithubIssue("openai/qa-hub",123))
      .rejects.toThrow("pull request");
  });
});
