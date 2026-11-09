import {describe,expect,it,vi} from "vitest";
import type {UseFormReturn} from "react-hook-form";
import type {TaskDraft} from "../src/lib/contracts";
import {normalizeDraft,extractLocalDraft} from "../src/lib/legacy/qa-assistant.mjs";
import {
  cleanQaSourceText,formatQaSentenceCase,isCopiedInterfaceLine
} from "../src/lib/legacy/qa-text-cleaner.mjs";
import {applyTaskAiFields} from "../src/features/tasks/task-ai";

const copiedReport=[
  "QUAL É O PROBLEMA IDENTIFICADO?--",
  "CLIENTE QUER QUE O CHECKBOX CONSIDERA DEVOLUÇÃO VENDA LEMBRE O ESTADO.",
  "RELATÓRIOS > VENDAS > RESUMOS > VENDEDOR",
  "",
  "preview",
  "Google Drive",
  "Arquivo do Google Drive",
  "Download",
  "Abrir",
  "",
  "ANÁLISE DE VIABILIDADE",
  "A mudança deve preservar a preferência por usuário.",
  "Arquivo: 20261021-171338-evidencia.png",
  "FrmRelatoriosConfig.frm:13084",
  "GetFiltroDevolucaoVenda = 'DV'",
  "O download do relatório apresentou uma falha real.",
  "O usuário deve abrir o relatório para confirmar o filtro."
].join("\n");

describe("limpeza do conteúdo enviado à NVIDIA",()=>{
  it("remove apenas controles copiados isoladamente",()=>{
    const relevant=cleanQaSourceText(copiedReport);
    expect(relevant).not.toMatch(/^preview$|^google drive$|^arquivo do google drive$|^download$|^abrir$/im);
    expect(relevant).toContain("CLIENTE QUER QUE O CHECKBOX");
    expect(relevant).toContain("FrmRelatoriosConfig.frm:13084");
    expect(relevant).toContain("20261021-171338-evidencia.png");
    expect(relevant).toContain("GetFiltroDevolucaoVenda = 'DV'");
    expect(relevant).toContain("O download do relatório apresentou uma falha real.");
    expect(relevant).toContain("O usuário deve abrir o relatório");
  });

  it("não remove palavras de interface quando fazem parte da regra de teste",()=>{
    expect(isCopiedInterfaceLine("Download")).toBe(true);
    expect(isCopiedInterfaceLine("Abrir")).toBe(true);
    expect(isCopiedInterfaceLine("Abrir o relatório e validar o filtro")).toBe(false);
    expect(isCopiedInterfaceLine("Falha no Google Drive ao anexar evidências")).toBe(false);
    expect(cleanQaSourceText("Preview\nGoogle Drive\nDownload\nAbrir")).toBe("");
  });

  it("padroniza frases inteiras em caixa alta e preserva siglas e identificadores",()=>{
    expect(formatQaSentenceCase("GERADO UMA VENDA TAL")).toBe("Gerado uma venda tal");
    expect(formatQaSentenceCase(
      "SELECIONADO UM PERÍODO COM VENDAS DO TIPO DV (DEVOLUÇÕES)\n" +
      "CONFIRMADO QUE O CHECKBOX CONSIDERA DEVOLUÇÃO VENDA ABRE MARCADO"
    )).toBe(
      "Selecionado um período com vendas do tipo DV (devoluções)\n" +
      "Confirmado que o checkbox considera devolução venda abre marcado"
    );
    expect(formatQaSentenceCase("Consultar chkConsideraDevVenda.Value em telas.ini"))
      .toBe("Consultar chkConsideraDevVenda.Value em telas.ini");
    expect(formatQaSentenceCase("SELECT Vendas.Tipo FROM Vendas"))
      .toBe("SELECT Vendas.Tipo FROM Vendas");
  });

  it("limpa campos e cenários retornados pela IA antes de preencher a TF",()=>{
    const draft=normalizeDraft({
      titulo:"PERSISTÊNCIA DO CHECKBOX POR USUÁRIO E POR TERMINAL",
      descricao:"Cliente quer que o checkbox reabra com o estado salvo.",
      causa:"GOOGLE DRIVE\nPREVIEW\nO CONTROLE NÃO LEMBRA A PREFERÊNCIA POR USUÁRIO.",
      correcao:"REUTILIZADO O MECANISMO DE LEITURA DO TELAS.INI.",
      codigo:"192381",versao:"12.08.10.0000",tipo_teste:"BUILD",
      cenarios:[{
        titulo:"VALIDAR ESTADO PERSISTIDO DO CHECKBOX",
        passos:"Abrir\nACESSAR RELATÓRIOS > VENDAS > RESUMOS > VENDEDOR",
        esperado:"Download\nO CHECKBOX DEVE LEMBRAR O ÚLTIMO ESTADO.",
        observacoes:"Arquivo do Google Drive\nANEXAR EVIDÊNCIA REAL."
      }]
    });
    expect(draft.fields.titulo).toBe("Persistência do checkbox por usuário e por terminal");
    expect(draft.fields.causa).toBe("O controle não lembra a preferência por usuário.");
    expect(draft.fields.codigo).toBe("192381");
    expect(draft.fields.versao).toBe("12.08.10.0000");
    expect(draft.fields.tipo_teste).toBe("BUILD");
    expect(draft.cenarios[0].titulo).toBe("Validar estado persistido do checkbox");
    expect(draft.cenarios[0].passos).toBe("1. Acessar relatórios > vendas > resumos > vendedor");
    expect(draft.cenarios[0].esperado).toBe("O checkbox deve lembrar o último estado.");
    const values:Record<string,string>={};
    const setValue=vi.fn((key:string,value:string)=>{values[key]=value;});
    applyTaskAiFields({setValue} as unknown as Pick<UseFormReturn<TaskDraft>,"setValue">,
      draft);
    expect(values.titulo).toBe("Persistência do checkbox por usuário e por terminal");
    expect(values.causa).not.toContain("Google Drive");
    expect(values.descricao).toContain("Cliente quer que o checkbox");
    expect(values.descricao).not.toContain("Google Drive");
    expect(values.descricao).not.toMatch(/^preview$|^download$|^abrir$/im);
    expect(values.correcao).toContain("telas.ini");
  });

  it("também protege a extração sem IA de rótulos colados",()=>{
    const draft=extractLocalDraft(
      "TÍTULO: CONFERÊNCIA DO RELATÓRIO\nPreview\nGoogle Drive\nDownload\nAbrir\n"+
      "O QUE FOI TESTADO:\nCONFIRMADO QUE O FILTRO DV FUNCIONA."
    );
    expect(draft.fields.titulo).toBe("Conferência do relatório");
    expect(draft.fields.descricao).toBe("Confirmado que o filtro DV funciona.");
  });
});
