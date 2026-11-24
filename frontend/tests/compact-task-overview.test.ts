import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {TaskOverview} from "../src/features/tasks/TaskWorkspaceSections";
import type {Task} from "../src/lib/contracts";

function overview(fields:Partial<Task>){
  const task={codigo:"TF-001",titulo:"Conferir pedidos",sistema:"MyCommerce",
    versao:"12.11.10.0001",tipo_teste:"BUILD",descricao:"",
    ambiente:"",base_teste:"",empresa:"",testador:"",
    explicacao:"",causa:"",correcao:"",conclusao:"",observacoes:"",
    ...fields} as Task;
  return renderToStaticMarkup(createElement(TaskOverview,{task}));
}
describe("layout compacto da TF",()=>{
  it("resumir a descrição extensa não apaga o conteúdo original",()=>{
    const description="Pedido com regras de frete, devoluções e faturamento. ".repeat(23);
    const html=overview({descricao:description,causa:"Duplicidade de rotinas."});
    expect(html).toContain("Resumo da TF");
    expect(html).toContain("Ler descrição completa");
    expect(html).toContain(description.trim());
    expect(html).toContain("Análise técnica");
    expect(html).toContain("Duplicidade de rotinas.");
  });
  it("não repete os dados já exibidos no cabeçalho e oculta seções vazias",()=>{
    const html=overview({descricao:"A venda deve manter o total unitário."});
    expect(html).toContain("A venda deve manter o total unitário.");
    expect(html).not.toContain("Ler descrição completa");
    expect(html).not.toContain("Análise técnica");
    expect(html).not.toContain("Dados complementares");
    expect(html).not.toContain("Sistema ou módulo");
  });
  it("mantém ambiente e testador acessíveis em detalhes complementares",()=>{
    const html=overview({ambiente:"Homologação",testador:"QA"});
    expect(html).toContain("Dados complementares");
    expect(html).toContain("Homologação");
    expect(html).toContain("Testador");
  });
});
