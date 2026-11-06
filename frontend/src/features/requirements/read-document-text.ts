/**
 * Local extraction for requirement attachments. No network calls or remote OCR.
 * Both parsers are lazy-loaded only after an explicitly selected file.
 */
export interface ExtractedText { text: string; warning: string }
const MAX_TEXT = 30000;
const MAX_PAGES = 200;
const MAX_XML_SIZE = 10 * 1024 * 1024;
const MAX_ENTRIES = 1000;

function bounded(value: string, initialWarning = ""): ExtractedText {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= MAX_TEXT) return { text: normalized, warning: initialWarning };
  const warning = [
    initialWarning,
    "Prévia limitada a 30.000 caracteres; somente o trecho exibido será indexado. O arquivo original permanece completo."
  ].filter(Boolean).join(" ");
  return { text: normalized.slice(0, MAX_TEXT).trimEnd(), warning };
}

async function pdfText(bytes: Uint8Array): Promise<ExtractedText> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Send a copy; PDF.js may transfer its ArrayBuffer to a worker.
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    stopAtErrors: true
  });
  let pdf: Awaited<typeof loading.promise> | undefined;
  try {
    pdf = await loading.promise;
    if (pdf.numPages > MAX_PAGES) {
      throw Error("O PDF possui mais de 200 páginas. Divida o documento antes de anexar.");
    }
    const parts: string[] = [];
    let total = 0;
    let partial = false;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const content = await page.getTextContent();
        let fragment = "";
        for (const item of content.items) {
          if (typeof item !== "object" || !("str" in item)) continue;
          if (typeof item.str !== "string") continue;
          fragment += item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ");
          if (fragment.length + total > MAX_TEXT + 1000) {
            partial = true;
            break;
          }
        }
        if (fragment.trim()) {
          const text = "Página " + i + "\n" + fragment.trim();
          parts.push(text);
          total += text.length + 2;
        }
        if (total > MAX_TEXT || partial) {
          partial = true;
          break;
        }
      } finally {
        page.cleanup();
      }
    }
    const result = parts.join("\n\n");
    if (!result.trim()) {
      return {
        text: "",
        warning: "O PDF não contém texto selecionável. Pode ser digitalizado; OCR não está disponível. Anexe o original ou cole os requisitos manualmente."
      };
    }
    return bounded(result, partial
      ? "A extração foi interrompida após atingir o limite de prévia." : "");
  } finally {
    if (pdf) await pdf.destroy();
    else await loading.destroy();
  }
}

async function docxText(bytes: Uint8Array): Promise<ExtractedText> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  if (Object.keys(zip.files).length > MAX_ENTRIES) {
    throw Error("DOCX possui entradas demais para leitura segura.");
  }
  const entry = zip.file("word/document.xml");
  if (!entry || !zip.file("[Content_Types].xml")) {
    throw Error("Este arquivo não contém a estrutura DOCX esperada.");
  }
  const stats = entry as unknown as { _data?: { uncompressedSize?: number } };
  const uncompressedSize = stats._data?.uncompressedSize;
  if (uncompressedSize === undefined || uncompressedSize > MAX_XML_SIZE) {
    throw Error("Documento XML interno sem tamanho seguro ou acima de 10 MB.");
  }
  const xml = await entry.async("string");
  if (xml.length > MAX_XML_SIZE ||
      /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw Error("DOCX contém XML interno excessivo ou construções não permitidas.");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw Error("O arquivo possui XML interno inválido.");
  }
  const namespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const paragraphs = Array.from(document.getElementsByTagNameNS(namespace, "p"));
  const lines: string[] = [];
  let count = 0;
  let partial = false;
  for (const paragraph of paragraphs) {
    let line = "";
    for (const element of paragraph.getElementsByTagName("*")) {
      if (element.namespaceURI !== namespace) continue;
      if (element.localName === "t") line += element.textContent ?? "";
      if (element.localName === "tab") line += "\t";
      if (element.localName === "br") line += "\n";
      if (count + line.length > MAX_TEXT + 1000) {
        partial = true;
        break;
      }
    }
    if (line.trim()) {
      lines.push(line);
      count += line.length + 1;
    }
    if (partial || count > MAX_TEXT) {
      partial = true;
      break;
    }
  }
  if (!lines.length) {
    return {
      text: "", warning: "DOCX sem texto extraível. Preserve o original e forneça o texto manualmente."
    };
  }
  return bounded(lines.join("\n"), partial
    ? "A leitura foi interrompida após alcançar o limite de prévia." : "");
}

export async function extractDocumentText(bytes: Uint8Array,
  extension: "pdf" | "docx"): Promise<ExtractedText> {
  if (bytes.byteLength <= 0 || bytes.byteLength > 10 * 1024 * 1024) {
    throw Error("Arquivo vazio ou acima do limite de 10 MB.");
  }
  if (extension === "pdf") return pdfText(bytes);
  return docxText(bytes);
}
