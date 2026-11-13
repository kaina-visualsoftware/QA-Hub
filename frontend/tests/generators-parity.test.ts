import { describe, expect, it } from "vitest";
import { sanitizeAiContext, composeFullTaskContext } from "../src/lib/legacy/qa-test-context.mjs";
import { formatGeneratedPost, validatePostStructure } from "../src/lib/legacy/qa-post-format.mjs";
import { markScenarioDuplicates, onlyNewScenarioCandidates, validateReviewedCases, parseGeneratedCases, hasCompleteGeneratedCase, formatNumberedCaseSteps } from "../src/lib/legacy/qa-workspace.mjs";

const task = {
  id: "75e95c7e-bc4a-43dc-90de-9ffddf249b11",
  user_id: "e1804d7f-03f4-4ba9-8755-476d1ac551ce",
  titulo: "Atualização do campo financeiro", codigo: "78912", sistema: "Financeiro",
  tipo_teste: "BUILD", descricao: "O valor deve ser atualizado na remoção do desconto.",
  causa: "Uma condição ignorava registros com desconto negativo",
  correcao: "Corrigido o processamento do desconto",
  conclusao: ""
};
describe("fidelidade e privacidade do contexto da TF", () => {
  it("não envia dados pessoais e segredos evidentes sem saneamento", () => {
    const cleaned = sanitizeAiContext("CPF 123.456.789-00 email teste@dominio.com senha: abc123");
    expect(cleaned).not.toContain("123.456.789-00");
    expect(cleaned).not.toContain("teste@dominio.com");
    expect(cleaned).not.toContain("abc123");
  });
  it("não confunde casos existentes com casos novos executados", () => {
    const result = composeFullTaskContext(task, {
      scenarios: [{
        tarefa_id: task.id, titulo: "Cenário de referência", status: "reprovado",
        passos: "Abrir pedido", esperado: "Saldo correto", obtido: "Saldo divergente"
      }], documents: [], evidence: [], events: [], failures: []
    });
    expect(result.sourceCounts.scenarios).toBe(1);
    expect(result.text).toContain("Situação real: reprovado");
    expect(result.text).toContain("Não considerar informações ausentes");
  });
  it("não elimina regras silenciosamente quando contexto excede limite", () => {
    expect(() => composeFullTaskContext(task, {
      scenarios: [], documents: [], evidence: [], events: [], failures: []
    }, { manual: "x".repeat(4500), limit: 1000 })).toThrow(/Nenhuma parte foi cortada/i);
  });
});
describe("post e revisão de casos", () => {
  it("aplica o padrão de post sem inventar percurso ou imagens reais", () => {
    const post = formatGeneratedPost("# Exibição do desconto\n\nFoi implementada a correção no pedido.", {
      taskText: "Código: 78912"
    });
    expect(validatePostStructure(post)).toEqual([]);
    expect(post).toContain("[Caminho a ser confirmado]");
    expect(post).toContain("[Imagem: captura-da-funcionalidade.png]");
    expect(post).toContain("**TAREFA:** 78912");
  });
  it("mantém só cenários realmente novos, filtrando existentes e repetidos na resposta", () => {
    const existing={source_index:1,titulo:"Validar pedido",passos:"Abrir pedido",
      esperado:"Valor certo",observacoes:"",selected:true};
    const fresh={...existing,source_index:3,titulo:"Verificar estorno",
      passos:"Solicitar estorno",esperado:"Saldo atualizado"};
    const result=onlyNewScenarioCandidates([
      {...existing,source_index:2,titulo:" VALIDAR PEDIDO ",
        passos:"Abrir   pedido",esperado:"VALOR CERTO"},
      fresh,
      {...fresh,source_index:4},
      {...fresh,source_index:5,titulo:"Validar outra regra",selected:false}
    ],[existing]);
    expect(result.map(item=>item.source_index)).toEqual([3,5]);
    expect(result[0].selected).toBe(true);
    expect(result[1].selected).toBe(false);
    expect(result.every(item=>!item.duplicate)).toBe(true);
  });
  it("marca duplicações e exige passos + esperado em cada caso", () => {
    const first = { source_index: 1, titulo: "Validar pedido", passos: "Abrir pedido",
      esperado: "Valor certo", observacoes: "", selected: true };
    const rows = markScenarioDuplicates([first], [first]);
    expect(rows[0].duplicate).toBe(true);
    expect(rows[0].selected).toBe(false);
    expect(() => validateReviewedCases([{ ...first, esperado: "" }])).toThrow(/resultado esperado/i);
  });
});

describe("geração NVIDIA — limpeza segura dos casos",()=>{
 const markdown=[
  "## Cenário 01 — Caso completo",
  "### Passos",
  "1. Abrir a tela. 2. Selecionar a empresa. 3. Confirmar o envio.",
  "### Resultado esperado",
  "O envio é realizado.",
  "## Cenário 02 — Sem passos",
  "### Passos",
  " ",
  "### Resultado esperado",
  "O sistema impede o envio.",
  "## Cenário 03 — Sem resultado",
  "### Passos",
  "1. Abrir a tela.",
  "### Resultado esperado",
  "[A confirmar]",
  "## Cenário 04 — Caso completo seguinte",
  "### Passos:",
  "1. Escolher um período. 2. Gerar arquivos.",
  "### Resultado esperado:",
  "Arquivos gerados no diretório indicado."
 ].join("\n");
 it("descarta automaticamente os casos que não trazem passos ou esperado verificáveis",()=>{
  const parsed=parseGeneratedCases(markdown);
  expect(parsed).toHaveLength(4);
  const remaining=onlyNewScenarioCandidates(parsed);
  expect(remaining).toHaveLength(2);
  expect(remaining.map(x=>x.source_index)).toEqual([1,4]);
  expect(remaining.every(hasCompleteGeneratedCase)).toBe(true);
  expect(remaining.every(item=>item.selected)).toBe(true);
 });
 it("mantém um passo por linha, sem modificar identificadores técnicos",()=>{
  const parsed=parseGeneratedCases(markdown);
  expect(parsed[0].passos).toBe(
   "1. Abrir a tela.\n2. Selecionar a empresa.\n3. Confirmar o envio.");
  expect(parsed[3].passos).toBe(
   "1. Escolher um período.\n2. Gerar arquivos.");
  expect(formatNumberedCaseSteps(
   "1. Configurar a versão 12.08.07.0000. 2. Conferir a tela."
  )).toBe("1. Configurar a versão 12.08.07.0000.\n2. Conferir a tela.");
 });
 it("não confunde cenário bloqueado com campo ausente",()=>{
  expect(hasCompleteGeneratedCase({
   titulo:"Bloqueio de envio",passos:"1. Abrir exportação.",
   esperado:"Sistema bloqueia o envio.",observacoes:"",selected:true
  })).toBe(true);
 });
});
