import { describe, expect, it } from "vitest";
import {
  needsObservationResetConfirmation, quickExecutionResult
} from "../src/features/executions/quick-result";

describe("execução rápida sem resultados contraditórios", () => {
  it("aprova um caso pendente sem inventar texto observado", () => {
    const previous = {status:"nao_executado",obtido:""};
    expect(quickExecutionResult(previous as never,"aprovado")).toEqual({
      status:"aprovado",obtido:""
    });
    expect(needsObservationResetConfirmation(previous as never,"aprovado")).toBe(false);
  });
  it("não reaproveita observação de falha na nova aprovação", () => {
    const failure = {status:"reprovado",obtido:"O desconto não foi zerado."};
    expect(quickExecutionResult(failure as never,"aprovado")).toEqual({
      status:"aprovado",obtido:""
    });
    expect(needsObservationResetConfirmation(failure as never,"aprovado")).toBe(true);
    const blocked = {status:"bloqueado",obtido:"Ambiente indisponível"};
    expect(quickExecutionResult(blocked as never,"aprovado").obtido).toBe("");
    expect(needsObservationResetConfirmation(blocked as never,"aprovado")).toBe(true);
  });
  it("mantém observação de uma aprovação que não mudou", () => {
    const approved = {status:"aprovado",obtido:"Verificado manualmente."};
    expect(quickExecutionResult(approved as never,"aprovado")).toEqual({
      status:"aprovado",obtido:"Verificado manualmente."
    });
    expect(needsObservationResetConfirmation(approved as never,"aprovado")).toBe(false);
  });
  it("desfazer execução zera observado e pede confirmação quando necessário", () => {
    const approved = {status:"aprovado",obtido:"Conforme esperado"};
    expect(quickExecutionResult(approved as never,"nao_executado")).toEqual({
      status:"nao_executado",obtido:""
    });
    expect(needsObservationResetConfirmation(approved as never,"nao_executado")).toBe(true);
    expect(needsObservationResetConfirmation({
      status:"aprovado",obtido:"  "
    } as never,"nao_executado")).toBe(false);
  });
});
